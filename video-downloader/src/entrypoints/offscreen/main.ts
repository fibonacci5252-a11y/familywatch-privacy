import { browser } from 'wxt/browser';
import { runJob } from '../../core/runner';
import type { JobEvent, OffscreenRequest } from '../../core/messages';

// Document offscreen (Chromium uniquement) : télécharge, assemble, expose un blob: URL.
const aborts = new Map<string, AbortController>();
const send = (e: JobEvent) => void browser.runtime.sendMessage(e).catch(() => undefined);

browser.runtime.onMessage.addListener((raw: unknown) => {
  const msg = raw as OffscreenRequest;
  if (msg?.target !== 'offscreen') return;
  if (msg.type === 'cancel') aborts.get(msg.jobId)?.abort();
  else if (msg.type === 'revoke') URL.revokeObjectURL(msg.blobUrl);
  else if (msg.type === 'run') {
    const { job, candidateId } = msg;
    const ctrl = new AbortController();
    aborts.set(job.id, ctrl);
    runJob(job, {
      signal: ctrl.signal,
      onProgress: (p) => send({ type: 'job-progress', jobId: job.id, candidateId, ...p }),
    })
      .then(({ blob, filename }) => send({ type: 'job-done', jobId: job.id, candidateId, blobUrl: URL.createObjectURL(blob), filename }))
      .catch((e) => send({ type: 'job-error', jobId: job.id, candidateId, message: e instanceof Error ? e.message : String(e) }))
      .finally(() => aborts.delete(job.id));
  }
});
