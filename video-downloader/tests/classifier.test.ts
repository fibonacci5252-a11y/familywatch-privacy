import { describe, expect, it } from 'vitest';
import { classify } from '../src/core/classifier';
import type { DomInfo } from '../src/core/types';

const page = 'https://news.example.com/article';
const dom = (o: Partial<DomInfo> = {}): DomInfo => ({ src: '', width: 1280, height: 720, muted: false, autoplay: false, hasControls: true, visible: true, classHints: 'player', ...o });

describe('classify', () => {
  it('long film with controls on the main player → content', () => {
    const r = classify({ url: 'https://cdn.example.com/film.mp4', frameUrl: page, pageUrl: page, durationSec: 5400, dom: dom(), isLargestOnPage: true });
    expect(r.label).toBe('content');
  });
  it('known ad domain, short, muted autoplay → ad', () => {
    const r = classify({ url: 'https://s.doubleclick.net/vast/ad.mp4', frameUrl: page, pageUrl: page, durationSec: 15, dom: dom({ muted: true, autoplay: true, hasControls: false, width: 300, height: 169 }) });
    expect(r.label).toBe('ad');
    expect(r.reasons.join()).toContain('domaine publicitaire');
  });
  it('ad served from the same domain is caught by SCTE-35 + short duration + preroll hint', () => {
    const r = classify({ url: 'https://cdn.example.com/p/roll.m3u8', frameUrl: page, pageUrl: page, durationSec: 20, hls: { hasScte35: true, hasDateRange: true, discontinuities: 2 }, dom: dom({ classHints: 'video-preroll ad' }) });
    expect(r.label).toBe('ad');
  });
  it('short clip with no other signal stays uncertain', () => {
    const r = classify({ url: 'https://cdn.example.com/clip.mp4', frameUrl: page, pageUrl: page, durationSec: 30 });
    expect(r.label).toBe('unknown');
  });
  it('much shorter than main media pushes toward ad', () => {
    const a = classify({ url: 'https://x.test/a.mp4', frameUrl: page, pageUrl: page, durationSec: 80 });
    const b = classify({ url: 'https://x.test/a.mp4', frameUrl: page, pageUrl: page, durationSec: 80, longestOtherDurationSec: 1800 });
    expect(b.score).toBeGreaterThan(a.score);
  });
  it('user marks override heuristics', () => {
    const r = classify({ url: 'https://cdn.example.com/x.mp4', frameUrl: page, pageUrl: page, durationSec: 20, userContentDomains: ['cdn.example.com'] });
    expect(r.label).toBe('content');
    const s = classify({ url: 'https://cdn.example.com/x.mp4', frameUrl: page, pageUrl: page, userAdDomains: ['cdn.example.com'] });
    expect(s.label).toBe('ad');
  });
});
