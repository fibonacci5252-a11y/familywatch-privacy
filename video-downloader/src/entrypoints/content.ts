import { browser } from 'wxt/browser';
import type { ContentMessage } from '../core/messages';
import type { DomInfo } from '../core/types';

// Content script (monde isolé) : observe les <video> de la frame et relaie
// les signaux du script MAIN vers le service worker.
export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  matchAboutBlank: true,
  runAt: 'document_idle',
  main() {
    const send = (m: ContentMessage) => void browser.runtime.sendMessage(m).catch(() => undefined);
    let last = '';
    let timer: ReturnType<typeof setTimeout> | undefined;

    function collectVideos(root: ParentNode, out: HTMLVideoElement[] = [], depth = 0): HTMLVideoElement[] {
      root.querySelectorAll('video').forEach((v) => out.push(v));
      if (depth < 3) {
        root.querySelectorAll('*').forEach((el) => {
          if (el.shadowRoot) collectVideos(el.shadowRoot, out, depth + 1);
        });
      }
      return out;
    }

    function hintsOf(el: Element): string {
      const parts: string[] = [];
      for (let n: Element | null = el, i = 0; n && i < 4; n = n.parentElement, i++) {
        parts.push(`${n.id} ${typeof n.className === 'string' ? n.className : ''}`);
      }
      return parts.join(' ').toLowerCase().slice(0, 300);
    }

    function infoOf(v: HTMLVideoElement): DomInfo {
      const r = v.getBoundingClientRect();
      const style = getComputedStyle(v);
      return {
        src: v.currentSrc || v.src || '',
        width: Math.round(r.width),
        height: Math.round(r.height),
        muted: v.muted,
        autoplay: v.autoplay,
        hasControls: v.controls || !!v.closest('[class*="control"], [class*="player"]')?.querySelector('[class*="control"]'),
        visible: r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
        durationSec: Number.isFinite(v.duration) ? v.duration : undefined,
        classHints: hintsOf(v),
      };
    }

    function scan() {
      const videos = collectVideos(document).map(infoOf);
      const sig = JSON.stringify(videos);
      if (sig === last) return;
      last = sig;
      send({ type: 'dom-videos', frameUrl: location.href, videos });
    }
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(scan, 500);
    };

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    for (const ev of ['loadedmetadata', 'play', 'durationchange', 'volumechange']) {
      document.addEventListener(ev, schedule, { capture: true });
    }
    scan();

    window.addEventListener('message', (e) => {
      if (e.source !== window || !e.data?.__vd) return;
      if (e.data.type === 'drm') send({ type: 'frame-drm', frameUrl: location.href });
      else if (e.data.type === 'ad-signal') send({ type: 'ad-signal', frameUrl: location.href, url: String(e.data.url) });
    });
  },
});
