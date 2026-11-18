import type { DomInfo, DownloadJob, JobProgress, VideoCandidate } from './types';

// content script → background
export type ContentMessage =
  | { type: 'dom-videos'; frameUrl: string; videos: DomInfo[] }
  | { type: 'frame-drm'; frameUrl: string }
  | { type: 'ad-signal'; frameUrl: string; url: string };

// popup → background
export type PopupRequest =
  | { type: 'get-videos'; tabId: number }
  | { type: 'download'; tabId: number; candidateId: string; variantId: string }
  | { type: 'cancel'; jobId: string }
  | { type: 'mark'; candidateId: string; tabId: number; as: 'ad' | 'content' };

export interface VideosResponse {
  blocked: boolean;
  candidates: VideoCandidate[];
  jobs: Record<string, JobProgress>; // par candidateId
}

// background ↔ offscreen (Chromium) — le `target` évite les confusions de routage
export type OffscreenRequest =
  | { target: 'offscreen'; type: 'run'; job: DownloadJob; candidateId: string }
  | { target: 'offscreen'; type: 'cancel'; jobId: string }
  | { target: 'offscreen'; type: 'revoke'; blobUrl: string };

export type JobEvent =
  | ({ type: 'job-progress' } & JobProgress)
  | { type: 'job-done'; jobId: string; candidateId: string; blobUrl: string; filename: string }
  | { type: 'job-error'; jobId: string; candidateId: string; message: string }
  | { type: 'job-saved'; jobId: string; candidateId: string };
