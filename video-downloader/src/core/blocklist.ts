import { hostOf, matchesDomain } from './url';

/**
 * Sites dont les conditions interdisent le téléchargement et pour lesquels le
 * Chrome Web Store rejette les extensions. L'extension reste inactive dessus.
 */
export const BLOCKED_SITES: readonly string[] = [
  'youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'googlevideo.com',
  'netflix.com',
  'primevideo.com',
  'disneyplus.com',
  'max.com',
  'hbomax.com',
  'hulu.com',
  'peacocktv.com',
  'paramountplus.com',
  'canalplus.com',
  'mycanal.fr',
];

export function isBlockedSite(url: string): boolean {
  return matchesDomain(hostOf(url), BLOCKED_SITES);
}
