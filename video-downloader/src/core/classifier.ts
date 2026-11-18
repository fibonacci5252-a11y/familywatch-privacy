import { hasAdPath, isAdHost } from './adfilters';
import { hostOf } from './url';
import type { Classification, DomInfo, HlsSignals } from './types';

export interface ClassifierInput {
  url: string;
  frameUrl: string;
  pageUrl: string;
  durationSec?: number;
  hls?: HlsSignals;
  dom?: DomInfo;
  /** Durée du plus long média détecté sur la page (hors ce candidat). */
  longestOtherDurationSec?: number;
  /** vrai si le <video> associé est le plus grand de sa frame. */
  isLargestOnPage?: boolean;
  /** Signal VAST/IMA vu dans la frame peu avant ce candidat. */
  recentAdSignal?: boolean;
  /** Domaines marqués « pub » / « contenu » par l'utilisateur. */
  userAdDomains?: readonly string[];
  userContentDomains?: readonly string[];
}

export const AD_THRESHOLD = 60;
export const CONTENT_THRESHOLD = 35;
const BASE_SCORE = 25;
const AD_CLASS_HINT = /(^|[\s_-])(ad|ads|advert|advertisement|preroll|pre-roll|sponsor|sponsored|promo|vast|ima)([\s_-]|$)/;

/**
 * Score de « probabilité de publicité » : somme de signaux pondérés.
 * ≥ 60 → pub · ≤ 35 → contenu · entre les deux → incertain.
 */
export function classify(input: ClassifierInput): Classification {
  let score = BASE_SCORE;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(`${points > 0 ? '+' : ''}${points} ${reason}`);
  };

  const host = hostOf(input.url);
  const user = (list?: readonly string[]) => !!list?.some((d) => host === d || host.endsWith('.' + d));
  if (user(input.userContentDomains)) add(-100, 'domaine marqué « contenu » par vous');
  if (user(input.userAdDomains)) add(100, 'domaine marqué « pub » par vous');

  if (isAdHost(input.url)) add(60, 'domaine publicitaire connu');
  if (hasAdPath(input.url)) add(25, "chemin d'URL publicitaire (vast, preroll…)");
  if (input.frameUrl !== input.pageUrl && isAdHost(input.frameUrl)) add(40, 'iframe publicitaire');
  if (input.recentAdSignal) add(15, 'requête VAST/IMA observée dans la frame');

  if (input.hls?.hasScte35) add(25, 'marqueurs SCTE-35 (insertion de pub)');
  if (input.hls?.hasDateRange) add(10, 'EXT-X-DATERANGE');

  const d = input.durationSec;
  if (d != null && d > 0) {
    if (d <= 35) add(15, `durée courte (${Math.round(d)} s)`);
    else if (d <= 65) add(8, `durée assez courte (${Math.round(d)} s)`);
    else if (d >= 300) add(-20, `longue durée (${Math.round(d / 60)} min)`);
    else if (d >= 120) add(-12, `durée moyenne (${Math.round(d / 60)} min)`);
    const longest = input.longestOtherDurationSec;
    if (longest && d < longest * 0.25) add(15, 'beaucoup plus court que le média principal');
  }

  const dom = input.dom;
  if (dom) {
    if (dom.muted && dom.autoplay && !dom.hasControls) add(15, 'muet + autoplay + sans contrôles');
    else if (dom.hasControls) add(-10, 'lecteur avec contrôles');
    if (dom.width * dom.height > 0 && dom.width * dom.height < 250 * 140) add(10, 'très petit lecteur');
    if (!dom.visible) add(5, 'lecteur masqué');
    if (AD_CLASS_HINT.test(dom.classHints)) add(15, 'classe/id DOM publicitaire');
  }
  if (input.isLargestOnPage) add(-15, 'plus grand lecteur de la page');

  score = Math.max(0, Math.min(100, score));
  const label = score >= AD_THRESHOLD ? 'ad' : score <= CONTENT_THRESHOLD ? 'content' : 'unknown';
  return { label, score, reasons };
}
