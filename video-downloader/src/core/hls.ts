import type { HlsSignals, Variant } from './types';
import { resolveUrl } from './url';

export interface HlsKey {
  method: string;
  uri?: string;
  iv?: string;
}
export interface HlsSegment {
  url: string;
  duration: number;
  sequence: number;
  key?: HlsKey;
}
export interface HlsMaster {
  type: 'master';
  variants: Variant[];
  signals: HlsSignals;
}
export interface HlsMedia {
  type: 'media';
  segments: HlsSegment[];
  mapUrl?: string;
  durationSec: number;
  isLive: boolean;
  hasByteRange: boolean;
  /** Chiffrement non supporté (SAMPLE-AES, DRM…). AES-128 est supporté. */
  unsupportedEncryption: boolean;
  signals: HlsSignals;
}

export function parseAttributes(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out[m[1]] = m[3] !== undefined ? m[3] : m[2];
  return out;
}

function signalsOf(lines: string[]): HlsSignals {
  let hasDateRange = false;
  let hasScte35 = false;
  let discontinuities = 0;
  for (const l of lines) {
    if (l.startsWith('#EXT-X-DATERANGE')) {
      hasDateRange = true;
      if (/SCTE35-(OUT|IN|CMD)/.test(l)) hasScte35 = true;
    } else if (l.startsWith('#EXT-X-CUE-OUT') || l.startsWith('#EXT-X-SCTE35') || l.startsWith('#EXT-OATCLS-SCTE35')) {
      hasScte35 = true;
    } else if (l.startsWith('#EXT-X-DISCONTINUITY') && !l.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE')) {
      discontinuities++;
    }
  }
  return { hasDateRange, hasScte35, discontinuities };
}

export function isHlsPlaylist(text: string): boolean {
  return text.trimStart().startsWith('#EXTM3U');
}

export function parseHls(text: string, baseUrl: string): HlsMaster | HlsMedia {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const signals = signalsOf(lines);
  return lines.some((l) => l.startsWith('#EXT-X-STREAM-INF')) ? parseMaster(lines, baseUrl, signals) : parseMedia(lines, baseUrl, signals);
}

function parseMaster(lines: string[], baseUrl: string, signals: HlsSignals): HlsMaster {
  const audioGroups = new Map<string, string>(); // group-id → uri
  for (const l of lines) {
    if (!l.startsWith('#EXT-X-MEDIA:')) continue;
    const a = parseAttributes(l.slice('#EXT-X-MEDIA:'.length));
    if (a.TYPE === 'AUDIO' && a.URI && a['GROUP-ID'] && (a.DEFAULT === 'YES' || !audioGroups.has(a['GROUP-ID']))) {
      audioGroups.set(a['GROUP-ID'], resolveUrl(a.URI, baseUrl));
    }
  }
  const variants: Variant[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
    const a = parseAttributes(lines[i].slice('#EXT-X-STREAM-INF:'.length));
    const uri = lines.slice(i + 1).find((l) => !l.startsWith('#'));
    if (!uri) continue;
    const [w, h] = (a.RESOLUTION ?? '').split('x').map(Number);
    const bandwidth = Number(a.BANDWIDTH || a['AVERAGE-BANDWIDTH']) || undefined;
    variants.push({
      id: String(variants.length),
      label: h ? `${h}p` : bandwidth ? `${Math.round(bandwidth / 1000)} kb/s` : 'Qualité ' + (variants.length + 1),
      width: w || undefined,
      height: h || undefined,
      bandwidth,
      url: resolveUrl(uri, baseUrl),
      audioUrl: a.AUDIO ? audioGroups.get(a.AUDIO) : undefined,
    });
  }
  variants.sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bandwidth ?? 0) - (a.bandwidth ?? 0));
  return { type: 'master', variants, signals };
}

function parseMedia(lines: string[], baseUrl: string, signals: HlsSignals): HlsMedia {
  const segments: HlsSegment[] = [];
  let sequence = 0;
  let key: HlsKey | undefined;
  let pendingDuration = 0;
  let mapUrl: string | undefined;
  let isLive = true;
  let hasByteRange = false;
  let unsupportedEncryption = false;

  for (const l of lines) {
    if (l.startsWith('#EXT-X-MEDIA-SEQUENCE:')) sequence = Number(l.split(':')[1]) || 0;
    else if (l.startsWith('#EXT-X-ENDLIST')) isLive = false;
    else if (l.startsWith('#EXT-X-PLAYLIST-TYPE:VOD')) isLive = false;
    else if (l.startsWith('#EXT-X-BYTERANGE')) hasByteRange = true;
    else if (l.startsWith('#EXT-X-MAP:')) {
      const a = parseAttributes(l.slice('#EXT-X-MAP:'.length));
      if (a.URI) mapUrl = resolveUrl(a.URI, baseUrl);
      if (a.BYTERANGE) hasByteRange = true;
    } else if (l.startsWith('#EXT-X-KEY:')) {
      const a = parseAttributes(l.slice('#EXT-X-KEY:'.length));
      if (a.METHOD === 'NONE') key = undefined;
      else if (a.METHOD === 'AES-128' && a.URI) key = { method: 'AES-128', uri: resolveUrl(a.URI, baseUrl), iv: a.IV };
      else {
        unsupportedEncryption = true;
        key = undefined;
      }
    } else if (l.startsWith('#EXTINF:')) pendingDuration = parseFloat(l.slice(8)) || 0;
    else if (!l.startsWith('#')) {
      segments.push({ url: resolveUrl(l, baseUrl), duration: pendingDuration, sequence: sequence + segments.length, key });
      pendingDuration = 0;
    }
  }
  const durationSec = segments.reduce((s, x) => s + x.duration, 0);
  return { type: 'media', segments, mapUrl, durationSec, isLive, hasByteRange, unsupportedEncryption, signals };
}
