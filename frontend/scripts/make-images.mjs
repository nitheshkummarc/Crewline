// Render public/favicon-32.png, public/apple-touch-icon.png and public/og-image.png from favicon.svg and an HTML card.
// Usage: node scripts/make-images.mjs  (needs Chrome or `npx playwright install chromium`)
//
// Contents:
//   shoot: Screenshot an HTML string at the given size into public/.
//   icon: HTML page that shows the favicon SVG at the given size.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/favicon.svg'), 'utf8');
// Embedded as a data URL: a page made with setContent may not load file:// fonts.
const fontFile = join(root, 'node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2');
const font = `data:font/woff2;base64,${readFileSync(fontFile).toString('base64')}`;

const card = `<!doctype html><html><head><style>
@font-face { font-family: Archivo; src: url('${font}') format('woff2'); font-weight: 100 900; font-stretch: 62% 125%; }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; background: #111317; color: #f2f3f5; font-family: Archivo, sans-serif;
  padding: 72px 80px; display: flex; flex-direction: column; justify-content: space-between; }
.mark { display: flex; align-items: center; gap: 14px; font-stretch: 118%; font-weight: 760; font-size: 36px; }
.seats { display: flex; gap: 5px; } .seats i { width: 18px; height: 32px; border-radius: 4px; display: block; }
.seats i:nth-child(1) { background: #ff8a3d; } .seats i:nth-child(2) { background: #3ec5f0; }
.seats i:last-child { border: 3px dashed #f2f3f5; }
h1 { font-stretch: 118%; font-weight: 760; font-size: 72px; line-height: 78px; letter-spacing: -0.015em; max-width: 1040px; }
.row { display: flex; gap: 10px; align-items: center; }
.row b { width: 46px; height: 64px; border-radius: 6px; display: block; }
.row b:nth-child(1) { background: #ff8a3d; } .row b:nth-child(2) { background: #a3e635; } .row b:nth-child(3) { background: #ff7aa2; }
.row b.open { border: 4px dashed #f2f3f5; }
.row span { font-weight: 620; font-size: 30px; color: #c4c9d0; margin-left: 18px; }
</style></head><body>
<div class="mark"><div class="seats"><i></i><i></i><i></i></div>Crewline</div>
<h1>Form a hackathon team. One seat, one winner, no double joins.</h1>
<div class="row"><b></b><b></b><b></b><b class="open"></b><span>Last seat open. Exactly one person gets it.</span></div>
</body></html>`;

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
/** Screenshot an HTML string at the given size into public/. */
const shoot = async (html, width, height, file) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].map((f) => f.status); });
  if (fonts.some((status) => status !== 'loaded')) throw new Error(`font did not load for ${file}: ${fonts}`);
  await page.screenshot({ path: join(root, 'public', file), omitBackground: false });
  await page.close();
};
/** HTML page that shows the favicon SVG at the given size. */
const icon = (size) => `<!doctype html><html><body style="margin:0;background:#111317">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
await shoot(icon(32), 32, 32, 'favicon-32.png');
await shoot(icon(180), 180, 180, 'apple-touch-icon.png');
await shoot(card, 1200, 630, 'og-image.png');
await browser.close();
console.log('wrote favicon-32.png, apple-touch-icon.png, og-image.png');
