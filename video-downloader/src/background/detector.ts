import { browser } from 'wxt/browser';
import { classify } from '../core/classifier';
import { isBlockedSite } from '../core/blocklist';
import { parseMpd } from '../core/dash';
import { isHlsPlaylist, parseHls } from '../core/hls';
import type { DomInfo, FrameState, VideoCandidate, VideoKind } from '../core/types';
import { hashId, normalizeUrl } from '../core/url';
import { getPrefs, readTab, withTab } from './registry';

const SEGMENT_EXT = /\.(ts|m4s|aac|m4a|vtt|webvtt|cmfv|cmfa|key)(\?|$)/i;
const MANIFEST_TYPES = /(mpegurl|dash\+xml)/i;
const MIN_DIRECT_BYTES = 200 * 1024; // ignore bouts de flux et miniatures animées
const AD_SIGNAL_WINDOW_MS = 30_000;

function kindOf(url: string, contentType: string): VideoKind | null {
  if (/mpegurl/i.test(contentType) || /\.m3u8(\?|$)/i.test(url)) return 'hls';
  if (/dash\+xml/i.test(contentType) || /\.mpd(\?|$)/i.test(url)) return 'dash';
  if (SEGMENT_EXT.test(url) || /video\/mp2t/i.test(contentType)) return null;
  if (/^video\//i.test(contentType) || /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(url)) return 'direct';
  return null;
}

export function startDetector(onChange: (tabId: number) => void) {
  browser.webRequest.onHeadersReceived.addListener(
    (d) => {
      if (d.tabId < 0 || d.statusCode >= 400) return;
      const h = (n: string) => d.responseHeaders?.find((x) => x.name.toLowerCase() === n)?.value ?? '';
      const kind = kindOf(d.url, h('content-type'));
      if (!kind) return;
      const length = Number(h('content-length')) || 0;
      // 206 : lecture progressive d'un MP4 ; la taille totale est dans content-range.
      const total = Number(/\/(\d+)$/.exec(h('content-range'))?.[1]) || length;
      if (kind === 'direct' && total && total < MIN_DIRECT_BYTES) return;
      void ingest(d.tabId, d.frameId, d.url, kind, (d as { documentUrl?: string; originUrl?: string }).documentUrl ?? (d as { originUrl?: string }).originUrl ?? '').then((changed) => changed && onChange(d.tabId));
    },
    { urls: ['<all_urls>'], types: ['media', 'xmlhttprequest', 'other'] },
    ['responseHeaders'],
  );
}

async function ingest(tabId: number, frameId: number, url: string, kind: VideoKind, frameUrl: string): Promise<boolean> {
  const tab = await browser.tabs.get(tabId).catch(() => undefined);
  const pageUrl = tab?.url ?? frameUrl;
  if (!pageUrl || isBlockedSite(pageUrl)) return false;

  const id = hashId(kind + normalizeUrl(url));
  if ((await readTab(tabId)).candidates[id]) return false;

  const base: VideoCandidate = {
    id,
    tabId,
    frameId,
    pageUrl,
    pageTitle: tab?.title,
    frameUrl: frameUrl || pageUrl,
    kind,
    url,
    variants: [{ id: '0', label: 'Qualité unique', url }],
    drm: false,
    classification: { label: 'unknown', score: 0, reasons: [] },
    seenAt: Date.now(),
  };
  try {
    await enrich(base);
  } catch {
    base.unsupportedReason ??= 'Manifeste illisible (accès refusé ou format inattendu).';
  }
  return withTab(tabId, async (rec) => {
    if (rec.candidates[id]) return false;
    rec.candidates[id] = base;
    await reclassify(rec.candidates, rec.frames);
    return true;
  });
}

/** Lit le manifeste HLS/DASH pour en extraire qualités, durée et signaux. */
async function enrich(c: VideoCandidate): Promise<void> {
  if (c.kind === 'direct') return;
  const res = await fetch(c.url);
  const text = await res.text();
  if (c.kind === 'hls') {
    if (!isHlsPlaylist(text)) throw new Error('not hls');
    const pl = parseHls(text, c.url);
    c.hls = pl.signals;
    if (pl.type === 'master') {
      c.variants = pl.variants;
    } else {
      c.durationSec = pl.durationSec;
      c.variants = [{ id: '0', label: 'Qualité unique', url: c.url }];
      if (pl.isLive) c.unsupportedReason = 'Flux en direct : non supporté.';
      else if (pl.unsupportedEncryption) {
        c.drm = true;
        c.unsupportedReason = 'Flux protégé (DRM) : téléchargement impossible.';
      }
    }
    if (!c.variants.length) c.unsupportedReason ??= 'Aucune qualité trouvée.';
  } else {
    const info = parseMpd(text, c.url);
    c.variants = info.variants.length ? info.variants : c.variants;
    c.durationSec = info.durationSec;
    c.drm = info.drm;
    c.unsupportedReason = info.drm
      ? 'Contenu protégé (DRM) : téléchargement impossible.'
      : info.isLive
        ? 'Flux en direct : non supporté.'
        : 'DASH : assemblage prévu en phase 2.';
  }
}

export async function reclassify(candidates: Record<string, VideoCandidate>, frames: Record<number, FrameState>): Promise<void> {
  const prefs = await getPrefs();
  const list = Object.values(candidates);
  for (const c of list) {
    const frame = frames[c.frameId];
    const dom = pickDom(c, frame);
    c.dom = dom;
    c.drm ||= !!frame?.drm;
    if (frame?.drm && !c.unsupportedReason) c.unsupportedReason = 'Contenu protégé (DRM) : téléchargement impossible.';
    const durations = list.filter((o) => o.id !== c.id).map((o) => o.durationSec ?? o.dom?.durationSec ?? 0);
    const biggest = frame?.videos.reduce<DomInfo | undefined>((m, v) => (!m || v.width * v.height > m.width * m.height ? v : m), undefined);
    c.classification = classify({
      url: c.url,
      frameUrl: c.frameUrl,
      pageUrl: c.pageUrl,
      durationSec: c.durationSec ?? dom?.durationSec,
      hls: c.hls,
      dom,
      longestOtherDurationSec: Math.max(0, ...durations),
      isLargestOnPage: !!dom && !!biggest && dom === biggest && (frame?.videos.length ?? 0) > 1,
      recentAdSignal: !!frame?.adSignalAt && Math.abs(c.seenAt - frame.adSignalAt) < AD_SIGNAL_WINDOW_MS,
      userAdDomains: prefs.adDomains,
      userContentDomains: prefs.contentDomains,
    });
  }
}

/** Associe un candidat à son <video> : par URL exacte, sinon (flux MSE/blob) le plus grand de la frame. */
function pickDom(c: VideoCandidate, frame?: FrameState): DomInfo | undefined {
  if (!frame?.videos.length) return undefined;
  const exact = frame.videos.find((v) => v.src && normalizeUrl(v.src) === normalizeUrl(c.url));
  if (exact) return exact;
  const blobs = frame.videos.filter((v) => !v.src || v.src.startsWith('blob:'));
  return blobs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

export async function updateFrame(tabId: number, frameId: number, patch: (f: FrameState) => void, frameUrl: string) {
  await withTab(tabId, async (rec) => {
    const f = (rec.frames[frameId] ??= { frameUrl, videos: [], drm: false });
    patch(f);
    // Un <video src="….mp4"> sans requête observée (cache) est ajouté directement.
    for (const v of f.videos) {
      if (!v.src || v.src.startsWith('blob:') || v.src.startsWith('data:')) continue;
      const tab = await browser.tabs.get(tabId).catch(() => undefined);
      if (!tab?.url || isBlockedSite(tab.url)) return;
      const kind = kindOf(v.src, '');
      if (!kind) continue;
      const id = hashId(kind + normalizeUrl(v.src));
      rec.candidates[id] ??= {
        id, tabId, frameId, pageUrl: tab.url, pageTitle: tab.title, frameUrl, kind, url: v.src,
        variants: [{ id: '0', label: 'Qualité unique', url: v.src }],
        drm: false, classification: { label: 'unknown', score: 0, reasons: [] }, seenAt: Date.now(),
      };
    }
    await reclassify(rec.candidates, rec.frames);
  });
}
