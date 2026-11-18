import { describe, expect, it } from 'vitest';
import { parseHls } from '../src/core/hls';
import { parseMpd } from '../src/core/dash';
import { isBlockedSite } from '../src/core/blocklist';

const master = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="fr",DEFAULT=YES,URI="audio/fr.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,AUDIO="aud"
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080
hi/index.m3u8`;

const media = `#EXTM3U
#EXT-X-MEDIA-SEQUENCE:7
#EXT-X-KEY:METHOD=AES-128,URI="k.key"
#EXTINF:6.0,
a.ts
#EXTINF:4.5,
b.ts
#EXT-X-ENDLIST`;

describe('HLS', () => {
  it('master playlist → variants sorted by quality, resolved URLs, audio group', () => {
    const m = parseHls(master, 'https://v.test/vod/master.m3u8');
    if (m.type !== 'master') throw new Error();
    expect(m.variants.map((v) => v.label)).toEqual(['1080p', '360p']);
    expect(m.variants[0].url).toBe('https://v.test/vod/hi/index.m3u8');
    expect(m.variants[1].audioUrl).toBe('https://v.test/vod/audio/fr.m3u8');
  });
  it('media playlist → segments, duration, AES-128 key, VOD', () => {
    const m = parseHls(media, 'https://v.test/vod/hi/index.m3u8');
    if (m.type !== 'media') throw new Error();
    expect(m.segments).toHaveLength(2);
    expect(m.durationSec).toBeCloseTo(10.5);
    expect(m.isLive).toBe(false);
    expect(m.segments[1].sequence).toBe(8);
    expect(m.segments[0].key?.uri).toBe('https://v.test/vod/hi/k.key');
    expect(m.unsupportedEncryption).toBe(false);
  });
  it('flags live, SAMPLE-AES and ad markers', () => {
    const m = parseHls('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="x"\n#EXT-X-CUE-OUT:15\n#EXT-X-DISCONTINUITY\n#EXTINF:5,\na.ts', 'https://v.test/p.m3u8');
    if (m.type !== 'media') throw new Error();
    expect(m.isLive).toBe(true);
    expect(m.unsupportedEncryption).toBe(true);
    expect(m.signals).toMatchObject({ hasScte35: true, discontinuities: 1 });
  });
});

describe('DASH', () => {
  it('lists video qualities and detects DRM / live', () => {
    const xml = `<MPD type="static" mediaPresentationDuration="PT1H2M3S"><Period>
      <AdaptationSet mimeType="video/mp4"><Representation id="v1" bandwidth="500000" width="640" height="360"/><Representation id="v2" bandwidth="2000000" width="1280" height="720"/></AdaptationSet>
      <AdaptationSet mimeType="audio/mp4"><Representation id="a1" bandwidth="128000"/></AdaptationSet></Period></MPD>`;
    const i = parseMpd(xml, 'https://v.test/m.mpd');
    expect(i.variants.map((v) => v.label)).toEqual(['720p', '360p']);
    expect(i.durationSec).toBe(3723);
    expect(i.drm).toBe(false);
    expect(parseMpd(xml.replace('type="static"', 'type="dynamic"'), 'x').isLive).toBe(true);
  });
});

describe('blocklist', () => {
  it('blocks YouTube and subdomains, not look-alikes', () => {
    expect(isBlockedSite('https://www.youtube.com/watch?v=1')).toBe(true);
    expect(isBlockedSite('https://notyoutube.com/')).toBe(false);
    expect(isBlockedSite('https://example.com/')).toBe(false);
  });
});
