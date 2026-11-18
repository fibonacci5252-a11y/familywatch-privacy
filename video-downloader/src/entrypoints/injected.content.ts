// Exécuté dans le monde MAIN de la page : seul endroit où l'on peut observer
// l'API EME (DRM) et les requêtes VAST/IMA faites par les lecteurs publicitaires.
export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  matchAboutBlank: true,
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const post = (data: Record<string, unknown>) => window.postMessage({ __vd: true, ...data }, '*');
    const AD_REQ = /(vast|vpaid|doubleclick|googlesyndication|imasdk|adserver|\/ads?\/|preroll)/i;

    // DRM : toute demande de clé EME marque la frame comme protégée.
    try {
      const orig = navigator.requestMediaKeySystemAccess?.bind(navigator);
      if (orig) {
        navigator.requestMediaKeySystemAccess = (...args) => {
          post({ type: 'drm' });
          return orig(...args);
        };
      }
    } catch {
      /* la page a verrouillé navigator : on ignore */
    }

    // Publicité : requêtes fetch/XHR typiques des SDK vidéo publicitaires.
    try {
      const origFetch = window.fetch;
      window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (AD_REQ.test(url)) post({ type: 'ad-signal', url });
        return origFetch.call(this, input as RequestInfo, init);
      } as typeof fetch;
      const origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
        if (AD_REQ.test(String(url))) post({ type: 'ad-signal', url: String(url) });
        return (origOpen as any).call(this, method, url, ...rest);
      } as typeof XMLHttpRequest.prototype.open;
    } catch {
      /* ignoré */
    }
  },
});
