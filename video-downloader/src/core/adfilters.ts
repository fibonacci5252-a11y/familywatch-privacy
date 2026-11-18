import { hostOf, matchesDomain } from './url';

/**
 * Domaines de serveurs publicitaires vidéo connus (échantillon de départ).
 * TODO phase 3 : compiler EasyList/EasyPrivacy dans un fichier généré par
 * `scripts/update-filters.ts` et le charger ici.
 */
export const AD_DOMAINS: readonly string[] = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'imasdk.googleapis.com',
  'adservice.google.com',
  'moatads.com',
  'adnxs.com',
  'adsrvr.org',
  'smartadserver.com',
  'spotxchange.com',
  'springserve.com',
  'teads.tv',
  'outbrain.com',
  'taboola.com',
  'criteo.com',
  'serving-sys.com',
  'innovid.com',
  'freewheel.tv',
  'fwmrm.net',
  'advertising.com',
  'adform.net',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'tremorhub.com',
  'btrll.com',
];

const AD_PATH = /(\/|[._-])(vast|vpaid|preroll|pre-roll|midroll|adserver|adserving|ad-break)([/._?-]|$)/i;

export function isAdHost(url: string, extra: readonly string[] = []): boolean {
  const host = hostOf(url);
  return !!host && (matchesDomain(host, AD_DOMAINS) || matchesDomain(host, extra));
}

export function hasAdPath(url: string): boolean {
  try {
    return AD_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
}
