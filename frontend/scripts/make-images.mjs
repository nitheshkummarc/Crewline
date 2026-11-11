// Render public/favicon-32.png, public/apple-touch-icon.png and public/og-image.png from favicon.svg and an HTML card.
// Usage: node scripts/make-images.mjs  (needs Chrome or `npx playwright install chromium`)
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
body { width: 1200px; height: 630px; background: #0b0c0d; color: #f4f2ec; font-family: Archivo, sans-serif;
  padding: 72px 80px; display: flex; flex-direction: column; justify-content: space-between; }
.mark { display: flex; align-items: center; gap: 14px; font-stretch: 75%; font-weight: 650; font-size: 34px; letter-spacing: 0.12em; text-transform: uppercase; }
.seats { display: flex; gap: 5px; } .seats i { width: 18px; height: 32px; border-radius: 3px; background: #f4f2ec; display: block; }
.seats i:last-child { background: #ffb21e; }
h1 { font-stretch: 75%; font-weight: 700; font-size: 84px; line-height: 88px; text-transform: uppercase; letter-spacing: 0.01em; max-width: 980px; }
.row { display: flex; gap: 10px; align-items: center; }
.row b { width: 46px; height: 64px; border-radius: 4px; background: #f4f2ec; display: block; position: relative; }
.row b.open { background: #181a1c; border: 2px solid #ffb21e; }
.row span { font-stretch: 75%; font-weight: 650; font-size: 30px; letter-spacing: 0.06em; color: #9ea3a8; margin-left: 18px; text-transform: uppercase; }
</style></head><body>
<div class="mark"><div class="seats"><i></i><i></i><i></i></div>Crewline</div>
<h1>Form a hackathon team. One seat, one winner, no double joins.</h1>
<div class="row"><b></b><b></b><b></b><b class="open"></b><span>Last seat open</span></div>
</body></html>`;

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const shoot = async (html, width, height, file) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].map((f) => f.status); });
  if (fonts.some((status) => status !== 'loaded')) throw new Error(`font did not load for ${file}: ${fonts}`);
  await page.screenshot({ path: join(root, 'public', file), omitBackground: false });
  await page.close();
};
const icon = (size) => `<!doctype html><html><body style="margin:0;background:#0b0c0d">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
await shoot(icon(32), 32, 32, 'favicon-32.png');
await shoot(icon(180), 180, 180, 'apple-touch-icon.png');
await shoot(card, 1200, 630, 'og-image.png');
await browser.close();
console.log('wrote favicon-32.png, apple-touch-icon.png, og-image.png');
