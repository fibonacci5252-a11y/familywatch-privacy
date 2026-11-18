import type { Variant } from './types';

export interface DashInfo {
  variants: Variant[];
  durationSec?: number;
  isLive: boolean;
  drm: boolean;
}

/**
 * Analyse légère d'un MPD par expressions régulières : le service worker n'a
 * pas de DOMParser. Suffisant pour lister les qualités ; l'assemblage des
 * segments DASH est prévu en phase 2.
 */
export function parseMpd(xml: string, manifestUrl: string): DashInfo {
  const isLive = /<MPD\b[^>]*\btype="dynamic"/.test(xml);
  const drm = /<ContentProtection\b/i.test(xml) && /(widevine|playready|fairplay|edef8ba9|9a04f079|94ce86fb)/i.test(xml);
  const dur = /mediaPresentationDuration="PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?"/.exec(xml);
  const durationSec = dur ? (Number(dur[1] ?? 0) * 3600 + Number(dur[2] ?? 0) * 60 + Number(dur[3] ?? 0)) || undefined : undefined;

  const videos: Variant[] = [];
  const audios: { bandwidth: number; id: string }[] = [];
  const setRe = /<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/g;
  let s: RegExpExecArray | null;
  while ((s = setRe.exec(xml))) {
    const setAttrs = attrs(s[1]);
    const repRe = /<Representation\b([^>]*?)\/?>/g;
    let r: RegExpExecArray | null;
    while ((r = repRe.exec(s[2]))) {
      const a = { ...setAttrs, ...attrs(r[1]) };
      const mime = a.mimeType ?? a.contentType ?? '';
      const bandwidth = Number(a.bandwidth) || 0;
      if (mime.includes('audio')) audios.push({ bandwidth, id: a.id });
      else if (mime.includes('video') || a.width) {
        const height = Number(a.height) || undefined;
        videos.push({
          id: String(videos.length),
          label: height ? `${height}p` : `${Math.round(bandwidth / 1000)} kb/s`,
          width: Number(a.width) || undefined,
          height,
          bandwidth: bandwidth || undefined,
          url: manifestUrl,
          representationId: a.id,
        });
      }
    }
  }
  videos.sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bandwidth ?? 0) - (a.bandwidth ?? 0));
  return { variants: videos, durationSec, isLive, drm };
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z:]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1]] = m[2];
  return out;
}
