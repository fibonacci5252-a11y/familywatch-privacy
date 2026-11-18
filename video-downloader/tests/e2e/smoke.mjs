// Test de bout en bout : charge l'extension (build Chromium) dans Chromium,
// sert des vidéos de test (MP4, HLS-TS, « pub » courte) et vérifie détection,
// classification et téléchargement HLS → MP4.
// Usage : node tests/e2e/smoke.mjs <dossier-de-travail>   (requiert ffmpeg)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // `npm i -D playwright` ou NODE_PATH=$(npm root -g)
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const work = resolve(process.argv[2] ?? './.e2e');
const ext = resolve('.output/chrome-mv3');
mkdirSync(join(work, 'hls/hi'), { recursive: true });
mkdirSync(join(work, 'hls/lo'), { recursive: true });
mkdirSync(join(work, 'vast'), { recursive: true });
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);
const src = (s, d) => ['-f', 'lavfi', '-i', `testsrc2=size=${s}:rate=25:duration=${d}`, '-f', 'lavfi', '-i', `sine=frequency=440:duration=${d}`];
if (!existsSync(join(work, 'main.mp4'))) {
  ff(...src('1280x720', 8), '-c:v', 'libx264', '-b:v', '3M', '-c:a', 'aac', join(work, 'main.mp4'));
  ff(...src('320x180', 5), '-c:v', 'libx264', '-c:a', 'aac', join(work, 'vast/ad.mp4'));
  ff(...src('1280x720', 6), '-c:v', 'libx264', '-c:a', 'aac', '-f', 'hls', '-hls_time', '2', '-hls_list_size', '0', '-hls_playlist_type', 'vod', '-hls_segment_filename', join(work, 'hls/hi/s%d.ts'), join(work, 'hls/hi/index.m3u8'));
  ff(...src('640x360', 6), '-c:v', 'libx264', '-c:a', 'aac', '-f', 'hls', '-hls_time', '2', '-hls_list_size', '0', '-hls_playlist_type', 'vod', '-hls_segment_filename', join(work, 'hls/lo/s%d.ts'), join(work, 'hls/lo/index.m3u8'));
}
const files = {
  '/': ['text/html', `<!doctype html><title>Page de test</title>
    <video id=m src="/main.mp4" controls width=960 height=540 preload=auto></video>
    <div class="ad-slot"><video src="/vast/ad.mp4" muted autoplay loop width=300 height=169 preload=auto></video></div>
    <script>fetch('/hls/master.m3u8').then(r=>r.text())</script>`],
  '/hls/master.m3u8': ['application/vnd.apple.mpegurl', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360\nlo/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720\nhi/index.m3u8\n'],
};
const types = { '.mp4': 'video/mp4', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t' };
const server = createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (files[p]) { res.setHeader('content-type', files[p][0]); return res.end(files[p][1]); }
  const f = join(work, p);
  if (existsSync(f) && statSync(f).isFile()) { const b = readFileSync(f); res.setHeader('content-type', types[extname(f)] ?? 'application/octet-stream'); res.setHeader('content-length', b.length); return res.end(b); }
  res.statusCode = 404; res.end();
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const ctx = await chromium.launchPersistentContext(join(work, 'profile'), {
  channel: 'chromium', headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const extId = new URL(sw.url()).host;
const page = await ctx.newPage();
await page.goto(base);
await page.waitForTimeout(3500);

const ui = await ctx.newPage();
await ui.goto(`chrome-extension://${extId}/popup.html`);
const tabId = await ui.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url?.startsWith(u))?.id, base);
const { candidates } = await ui.evaluate((id) => chrome.runtime.sendMessage({ type: 'get-videos', tabId: id }), tabId);
console.log('Candidats :');
for (const c of candidates) console.log(` - ${c.kind.padEnd(6)} ${new URL(c.url).pathname.padEnd(22)} → ${c.classification.label.padEnd(8)} (score ${c.classification.score}) variantes: ${c.variants.map((v) => v.label).join(', ')}`);

const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) process.exitCode = 1; };
const by = (s) => candidates.find((c) => c.url.includes(s));
ok(by('/main.mp4')?.classification.label !== 'ad', 'vidéo principale non classée pub');
ok(by('/vast/ad.mp4')?.classification.label === 'ad', 'vidéo « pub » classée pub');
const hls = by('/hls/master.m3u8');
ok(hls?.variants.map((v) => v.label).join() === '720p,360p', 'HLS : qualités 720p/360p listées');

if (hls) {
  await ui.evaluate((a) => chrome.runtime.sendMessage({ type: 'download', ...a }), { tabId, candidateId: hls.id, variantId: hls.variants.find((v) => v.label === '360p').id });
  let dl;
  for (let i = 0; i < 40 && !dl; i++) {
    await page.waitForTimeout(500);
    dl = (await ui.evaluate(() => chrome.downloads.search({ state: 'complete' })))[0];
  }
  ok(!!dl, 'téléchargement HLS terminé');
  if (dl) {
    console.log('Fichier :', dl.filename, dl.fileSize, 'octets');
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', dl.filename]).toString());
    console.log('ffprobe :', JSON.stringify(info.streams));
    ok(info.streams.some((s) => s.codec_name === 'h264' && s.height === 360), 'MP4 valide, H.264 360p');
  }
}
await ctx.close(); server.close();
