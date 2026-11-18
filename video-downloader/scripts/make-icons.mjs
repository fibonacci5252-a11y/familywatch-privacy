// Génère public/icon/{16,32,48,96,128}.png depuis un SVG. Usage : NODE_PATH=$(npm root -g) node scripts/make-icons.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#2563eb"/><path d="M64 26v50m0 0-20-20m20 20 20-20" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><rect x="30" y="92" width="68" height="12" rx="6" fill="#fff"/></svg>`;
const b = await chromium.launch();
for (const s of [16, 32, 48, 96, 128]) {
  const p = await b.newPage({ viewport: { width: s, height: s } });
  await p.setContent(`<body style="margin:0"><img width=${s} height=${s} src="data:image/svg+xml;utf8,${encodeURIComponent(svg)}">`);
  await p.screenshot({ path: `public/icon/${s}.png`, omitBackground: true });
}
await b.close();
