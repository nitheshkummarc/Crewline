// Print WCAG contrast ratios for every text and background token pair; exits 1 if any pair is below its floor.
// Usage: node scripts/contrast.mjs  (values mirror src/styles/tokens.css)

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Return the WCAG contrast ratio of two hex colors. */
export const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const THEMES = {
  light: {
    canvas: '#eef0f3', surface: '#ffffff', 'surface-2': '#f5f6f8',
    ink: '#111317', 'ink-2': '#4f5761', control: '#7b828b', plate: '#111317', 'plate-ink': '#ffffff',
    focus: '#1d5bff', ok: '#13723a', warn: '#9a5300', bad: '#c0271c',
  },
  dark: {
    canvas: '#0d0f12', surface: '#161a1f', 'surface-2': '#1d2228',
    ink: '#f2f3f5', 'ink-2': '#a7aeb7', control: '#6f7882', plate: '#f2f3f5', 'plate-ink': '#0d0f12',
    focus: '#6b97ff', ok: '#4ade80', warn: '#fbbf24', bad: '#ff7a6b',
  },
};
const BANDS = {
  orange: '#ff8a3d', sky: '#3ec5f0', lime: '#a3e635', sun: '#ffd23f',
  rose: '#ff7aa2', mint: '#34d6b0', azure: '#6f9bff', coral: '#ff6b5b',
};
const BAND_INK = '#111317';

const pairs = [];
for (const [theme, t] of Object.entries(THEMES)) {
  for (const bg of ['canvas', 'surface', 'surface-2']) {
    for (const fg of ['ink', 'ink-2', 'ok', 'warn', 'bad']) pairs.push([`${theme} ${fg}`, t[fg], `${bg}`, t[bg], 4.5]);
    pairs.push([`${theme} control border`, t.control, bg, t[bg], 3]);
    pairs.push([`${theme} focus ring`, t.focus, bg, t[bg], 3]);
    pairs.push([`${theme} primary plate`, t.plate, bg, t[bg], 3]);
  }
  pairs.push([`${theme} plate text`, t['plate-ink'], 'plate', t.plate, 4.5]);
  for (const tag of ['ok', 'warn', 'bad']) pairs.push([`${theme} tag text (surface) on ${tag}`, t.surface, tag, t[tag], 4.5]);
}
pairs.push(['night panel text', '#f2f3f5', 'night', '#111317', 4.5], ['night panel secondary', '#c4c9d0', 'night', '#111317', 4.5]);
for (const [name, hex] of Object.entries(BANDS)) pairs.push([`band text on ${name}`, BAND_INK, name, hex, 4.5]);

let failed = false;
for (const [fg, fgHex, bg, bgHex, floor] of pairs) {
  const r = ratio(fgHex, bgHex);
  const ok = r >= floor;
  failed ||= !ok;
  if (!ok || process.argv.includes('--all')) console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(5)}  ${fg} on ${bg} (floor ${floor})`);
}
console.log(failed ? 'contrast check FAILED' : `contrast check ok (${pairs.length} pairs)`);
process.exit(failed ? 1 : 0);
