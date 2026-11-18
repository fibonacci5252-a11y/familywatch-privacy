import muxjs from 'mux.js';
import { parseHls, type HlsMedia, type HlsSegment } from './hls';
import type { DownloadJob, JobProgress } from './types';

export interface RunHooks {
  signal: AbortSignal;
  onProgress: (p: Pick<JobProgress, 'phase' | 'done' | 'total'>) => void;
}

export class UnsupportedError extends Error {}

const VIDEO_EXT = /\.(mp4|m4v|webm|mov|mkv|ogv)(?:$|\?)/i;

/** Exécutable dans un offscreen document (Chromium) ou dans la page de fond (Firefox). */
export async function runJob(job: DownloadJob, hooks: RunHooks): Promise<{ blob: Blob; filename: string }> {
  switch (job.kind) {
    case 'direct':
      return downloadDirect(job, hooks);
    case 'hls':
      return downloadHls(job, hooks);
    default:
      throw new UnsupportedError("Le téléchargement DASH sera disponible dans une prochaine version.");
  }
}

async function downloadDirect(job: DownloadJob, { signal, onProgress }: RunHooks) {
  const res = await fetch(job.variant.url, { signal });
  if (!res.ok || !res.body) throw new Error(`Erreur HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const chunks: Uint8Array[] = [];
  let done = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    chunks.push(value);
    done += value.length;
    onProgress({ phase: 'download', done, total });
  }
  const mime = res.headers.get('content-type')?.split(';')[0] || 'video/mp4';
  const ext = VIDEO_EXT.exec(new URL(job.variant.url).pathname + '?')?.[1]?.toLowerCase() ?? (mime.includes('webm') ? 'webm' : 'mp4');
  return { blob: new Blob(chunks as BlobPart[], { type: mime }), filename: `${job.filenameBase}.${ext}` };
}

async function downloadHls(job: DownloadJob, { signal, onProgress }: RunHooks) {
  if (job.variant.audioUrl) {
    throw new UnsupportedError('Piste audio séparée : assemblage prévu avec ffmpeg.wasm (phase 2).');
  }
  const text = await (await fetchOk(job.variant.url, signal)).text();
  const pl = parseHls(text, job.variant.url);
  if (pl.type !== 'media') throw new Error('Playlist HLS inattendue.');
  assertSupported(pl);

  const total = pl.segments.length + (pl.mapUrl ? 1 : 0);
  let done = 0;
  const tick = () => onProgress({ phase: 'download', done: ++done, total });

  const keys = new Map<string, CryptoKey>();
  const initBytes = pl.mapUrl ? new Uint8Array(await (await fetchOk(pl.mapUrl, signal)).arrayBuffer()) : undefined;
  if (initBytes) tick();

  const parts = await pool(pl.segments, 5, signal, async (seg) => {
    const bytes = await fetchSegment(seg, keys, signal);
    tick();
    return bytes;
  });

  const isFmp4 = !!initBytes || pl.segments.some((s) => /\.(m4s|mp4|cmfv|cmfa)(\?|$)/i.test(s.url));
  if (isFmp4) {
    const blobParts = (initBytes ? [initBytes, ...parts] : parts) as BlobPart[];
    return { blob: new Blob(blobParts, { type: 'video/mp4' }), filename: `${job.filenameBase}.mp4` };
  }

  // MPEG-TS → MP4 (remux local, sans ré-encodage)
  onProgress({ phase: 'mux', done: 0, total: parts.length });
  const out: Uint8Array[] = [];
  const transmuxer = new muxjs.mp4.Transmuxer();
  let first = true;
  transmuxer.on('data', (seg) => {
    if (first) {
      out.push(seg.initSegment);
      first = false;
    }
    out.push(seg.data);
  });
  parts.forEach((p, i) => {
    transmuxer.push(p);
    if (i % 20 === 0) onProgress({ phase: 'mux', done: i, total: parts.length });
  });
  transmuxer.flush();
  if (!out.length) throw new Error('Remux impossible : segments MPEG-TS invalides.');
  return { blob: new Blob(out as BlobPart[], { type: 'video/mp4' }), filename: `${job.filenameBase}.mp4` };
}

function assertSupported(pl: HlsMedia) {
  if (pl.isLive) throw new UnsupportedError('Flux en direct : non supporté.');
  if (pl.unsupportedEncryption) throw new UnsupportedError('Flux protégé (DRM) : téléchargement impossible.');
  if (pl.hasByteRange) throw new UnsupportedError('HLS avec BYTERANGE : non supporté pour le moment.');
  if (!pl.segments.length) throw new Error('Playlist HLS vide.');
}

async function fetchOk(url: string, signal: AbortSignal, attempts = 3): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal });
      if (res.ok) return res;
      last = new Error(`HTTP ${res.status} sur ${new URL(url).pathname}`);
    } catch (e) {
      if (signal.aborted) throw e;
      last = e;
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  throw last;
}

async function fetchSegment(seg: HlsSegment, keys: Map<string, CryptoKey>, signal: AbortSignal): Promise<Uint8Array> {
  const data = new Uint8Array(await (await fetchOk(seg.url, signal)).arrayBuffer());
  if (!seg.key?.uri) return data;
  let key = keys.get(seg.key.uri);
  if (!key) {
    const raw = await (await fetchOk(seg.key.uri, signal)).arrayBuffer();
    key = await crypto.subtle.importKey('raw', raw, 'AES-CBC', false, ['decrypt']);
    keys.set(seg.key.uri, key);
  }
  const iv = seg.key.iv ? hexToBytes(seg.key.iv) : sequenceIv(seg.sequence);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv as BufferSource }, key, data as BufferSource));
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace(/^0x/i, '').padStart(32, '0');
  return Uint8Array.from(h.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}
function sequenceIv(seq: number): Uint8Array {
  const iv = new Uint8Array(16);
  new DataView(iv.buffer).setUint32(12, seq);
  return iv;
}

async function pool<T, R>(items: T[], concurrency: number, signal: AbortSignal, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      signal.throwIfAborted();
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
