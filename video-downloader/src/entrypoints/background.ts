import { browser } from 'wxt/browser';
import { isBlockedSite } from '../core/blocklist';
import type { ContentMessage, JobEvent, PopupRequest, VideosResponse } from '../core/messages';
import type { DownloadJob, JobProgress } from '../core/types';
import { hostOf, sanitizeFilename } from '../core/url';
import { startDetector, updateFrame, reclassify } from '../background/detector';
import { addRefererRule, clearStaleRules, removeRefererRule } from '../background/headers';
import { cancelJob, revokeBlob, startJob } from '../background/processor';
import { clearTab, getPrefs, readTab, savePrefs, withTab } from '../background/registry';

export default defineBackground(() => {
  const jobs = new Map<string, JobProgress>(); // par candidateId (mémoire : perdu si le worker redémarre)
  const jobCandidate = new Map<string, string>();
  const blobByDownload = new Map<number, { jobId: string; blobUrl: string }>();

  void clearStaleRules();

  async function updateBadge(tabId: number) {
    const rec = await readTab(tabId);
    const n = Object.values(rec.candidates).filter((c) => c.classification.label !== 'ad').length;
    await browser.action.setBadgeText({ tabId, text: n ? String(n) : '' });
    await browser.action.setBadgeBackgroundColor({ tabId, color: '#2563eb' });
  }

  startDetector((tabId) => void updateBadge(tabId));

  browser.tabs.onRemoved.addListener((id) => void clearTab(id));
  // Nouvelle page dans l'onglet → on repart de zéro (pas besoin de la permission webNavigation).
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'loading' && info.url) void clearTab(tabId).then(() => updateBadge(tabId));
  });

  // --- Événements des jobs (offscreen ou exécution directe Firefox) ---
  function onJobEvent(e: JobEvent) {
    if (e.type === 'job-progress') {
      jobs.set(e.candidateId, e);
    } else if (e.type === 'job-done') {
      void saveFile(e);
    } else if (e.type === 'job-error') {
      jobs.delete(e.candidateId);
      void removeRefererRule(e.jobId);
    }
  }

  async function saveFile(e: Extract<JobEvent, { type: 'job-done' }>) {
    try {
      const id = await browser.downloads.download({ url: e.blobUrl, filename: e.filename, saveAs: false });
      blobByDownload.set(id, { jobId: e.jobId, blobUrl: e.blobUrl });
      void browser.runtime.sendMessage({ type: 'job-saved', jobId: e.jobId, candidateId: e.candidateId } satisfies JobEvent).catch(() => undefined);
    } catch (err) {
      void browser.runtime
        .sendMessage({ type: 'job-error', jobId: e.jobId, candidateId: e.candidateId, message: String(err) } satisfies JobEvent)
        .catch(() => undefined);
    } finally {
      jobs.delete(e.candidateId);
      void removeRefererRule(e.jobId);
    }
  }

  browser.downloads.onChanged.addListener((delta) => {
    const entry = blobByDownload.get(delta.id);
    if (entry && (delta.state?.current === 'complete' || delta.state?.current === 'interrupted')) {
      revokeBlob(entry.blobUrl);
      blobByDownload.delete(delta.id);
    }
  });

  browser.runtime.onMessage.addListener((raw: any, sender, sendResponse) => {
    // Événements de job émis par l'offscreen : même routage que l'exécution directe.
    if (raw?.type === 'job-progress' || raw?.type === 'job-done' || raw?.type === 'job-error') {
      onJobEvent(raw as JobEvent);
      return;
    }
    if (raw?.type === 'dom-videos' || raw?.type === 'frame-drm' || raw?.type === 'ad-signal') {
      const msg = raw as ContentMessage;
      const tabId = sender.tab?.id;
      if (tabId == null) return;
      const frameId = sender.frameId ?? 0;
      void updateFrame(tabId, frameId, (f) => {
        if (msg.type === 'dom-videos') f.videos = msg.videos;
        else if (msg.type === 'frame-drm') f.drm = true;
        else f.adSignalAt = Date.now();
      }, msg.frameUrl).then(() => updateBadge(tabId));
      return;
    }
    handlePopup(raw as PopupRequest).then(sendResponse);
    return true; // réponse asynchrone
  });

  async function handlePopup(req: PopupRequest): Promise<unknown> {
    switch (req.type) {
      case 'get-videos': {
        const tab = await browser.tabs.get(req.tabId);
        const blocked = !!tab.url && isBlockedSite(tab.url);
        const rec = await readTab(req.tabId);
        const candidates = blocked ? [] : Object.values(rec.candidates).sort((a, b) => a.classification.score - b.classification.score);
        return { blocked, candidates, jobs: Object.fromEntries(jobs) } satisfies VideosResponse;
      }
      case 'download': {
        const c = (await readTab(req.tabId)).candidates[req.candidateId];
        const variant = c?.variants.find((v) => v.id === req.variantId);
        if (!c || !variant || c.unsupportedReason || c.drm) return { ok: false };
        const job: DownloadJob = {
          id: crypto.randomUUID(),
          kind: c.kind,
          variant,
          pageUrl: c.pageUrl,
          filenameBase: sanitizeFilename(`${c.pageTitle || hostOf(c.pageUrl)} - ${variant.label}`),
        };
        jobCandidate.set(job.id, c.id);
        jobs.set(c.id, { jobId: job.id, candidateId: c.id, phase: 'download', done: 0, total: 0 });
        await addRefererRule(job.id, [variant.url, variant.audioUrl ?? ''], c.pageUrl);
        void startJob(job, c.id, onJobEvent);
        return { ok: true, jobId: job.id };
      }
      case 'cancel':
        cancelJob(req.jobId);
        for (const [cid, p] of jobs) if (p.jobId === req.jobId) jobs.delete(cid);
        void removeRefererRule(req.jobId);
        return { ok: true };
      case 'mark': {
        const rec = await readTab(req.tabId);
        const c = rec.candidates[req.candidateId];
        if (!c) return { ok: false };
        const host = hostOf(c.url);
        const prefs = await getPrefs();
        prefs.adDomains = prefs.adDomains.filter((d) => d !== host);
        prefs.contentDomains = prefs.contentDomains.filter((d) => d !== host);
        (req.as === 'ad' ? prefs.adDomains : prefs.contentDomains).push(host);
        await savePrefs(prefs); // stockage local uniquement, jamais envoyé
        await withTab(req.tabId, (r) => reclassify(r.candidates, r.frames));
        await updateBadge(req.tabId);
        return { ok: true };
      }
    }
  }
});
