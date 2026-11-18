export type VideoKind = 'direct' | 'hls' | 'dash';
export type AdLabel = 'content' | 'ad' | 'unknown';

export interface Variant {
  id: string;
  label: string; // ex. « 1080p », « 2500 kb/s »
  width?: number;
  height?: number;
  bandwidth?: number;
  url: string; // playlist média (HLS) ou fichier (direct)
  audioUrl?: string; // piste audio séparée (nécessite un assemblage)
  representationId?: string; // DASH
}

/** Informations sur un élément <video> mesurées par le content script. */
export interface DomInfo {
  src: string;
  width: number;
  height: number;
  muted: boolean;
  autoplay: boolean;
  hasControls: boolean;
  visible: boolean;
  durationSec?: number;
  classHints: string;
}

export interface HlsSignals {
  hasDateRange: boolean;
  hasScte35: boolean;
  discontinuities: number;
}

export interface Classification {
  label: AdLabel;
  score: number; // 0 = contenu sûr · 100 = publicité sûre
  reasons: string[];
}

export interface VideoCandidate {
  id: string;
  tabId: number;
  frameId: number;
  pageUrl: string;
  pageTitle?: string;
  frameUrl: string;
  kind: VideoKind;
  url: string;
  variants: Variant[];
  durationSec?: number;
  drm: boolean;
  /** Raison pour laquelle le téléchargement n'est pas possible (v1). */
  unsupportedReason?: string;
  hls?: HlsSignals;
  dom?: DomInfo;
  classification: Classification;
  seenAt: number;
}

export interface FrameState {
  frameUrl: string;
  videos: DomInfo[];
  drm: boolean;
  adSignalAt?: number;
}

export interface DownloadJob {
  id: string;
  kind: VideoKind;
  variant: Variant;
  pageUrl: string;
  filenameBase: string;
}

export interface JobProgress {
  jobId: string;
  candidateId: string;
  phase: 'download' | 'mux';
  done: number;
  total: number; // 0 = inconnu
}
