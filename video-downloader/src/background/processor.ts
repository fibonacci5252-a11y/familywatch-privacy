import { browser } from 'wxt/browser';
import { runJob } from '../core/runner';
import type { DownloadJob, JobProgress } from '../core/types';
import type { JobEvent, OffscreenRequest } from '../core/messages';

/**
 * Hôte d'exécution des téléchargements :
 *  - Chromium (Chrome/Edge) : document offscreen (survit à l'arrêt du service worker)
 *  - Firefox : directement dans la page de fond, maintenue éveillée pendant le job
 */
const offscreenApi = (browser as any).offscreen as
  | { createDocument(o: object): Promise<void>; hasDocument?: () => Promise<boolean> }
  | undefined;

const aborts = new Map<string, AbortController>();
let keepAlive: ReturnType<typeof setInterval> | undefined;

async function ensureOffscreen() {
  const has = await (browser.runtime as any).getContexts?.({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (has?.length) return;
  await offscreenApi!.createDocument({
    url: 'offscreen.html',
    reasons: ['BLOBS'],
    justification: 'Assembler les segments vidéo et créer le fichier à télécharger.',
  });
}

export async function startJob(job: DownloadJob, candidateId: string, emit: (e: JobEvent) => void) {
  if (offscreenApi) {
    await ensureOffscreen();
    const msg: OffscreenRequest = { target: 'offscreen', type: 'run', job, candidateId };
    await browser.runtime.sendMessage(msg);
    return;
  }
  // Firefox : exécution directe
  const ctrl = new AbortController();
  aborts.set(job.id, ctrl);
  keepAlive ??= setInterval(() => void browser.runtime.getPlatformInfo(), 20_000);
  try {
    const { blob, filename } = await runJob(job, {
      signal: ctrl.signal,
      onProgress: (p) => emit({ type: 'job-progress', jobId: job.id, candidateId, ...p }),
    });
    emit({ type: 'job-done', jobId: job.id, candidateId, blobUrl: URL.createObjectURL(blob), filename });
  } catch (e) {
    emit({ type: 'job-error', jobId: job.id, candidateId, message: e instanceof Error ? e.message : String(e) });
  } finally {
    aborts.delete(job.id);
    if (!aborts.size && keepAlive) {
      clearInterval(keepAlive);
      keepAlive = undefined;
    }
  }
}

export function cancelJob(jobId: string) {
  if (offscreenApi) {
    const msg: OffscreenRequest = { target: 'offscreen', type: 'cancel', jobId };
    void browser.runtime.sendMessage(msg).catch(() => undefined);
  } else aborts.get(jobId)?.abort();
}

export function revokeBlob(blobUrl: string) {
  if (offscreenApi) {
    const msg: OffscreenRequest = { target: 'offscreen', type: 'revoke', blobUrl };
    void browser.runtime.sendMessage(msg).catch(() => undefined);
  } else URL.revokeObjectURL(blobUrl);
}

export type { JobProgress };
