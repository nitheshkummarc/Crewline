// Print WCAG contrast ratios for every text and background token pair; exits 1 if any pair is below its floor.
// Usage: node scripts/contrast.mjs [--all]  (values mirror src/styles/tokens.css)
//
// Contents:
//   lum: Return the relative luminance of a hex color.
//   ratio: Return the WCAG contrast ratio of two hex colors.

/** Return the relative luminance of a hex color. */
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
    canvas: '#edf2f6', surface: '#ffffff', 'surface-2': '#f2f6f9',
    ink: '#0e1c2b', 'ink-2': '#455a6c', control: '#768a9c',
    focus: '#0a66c2', ok: '#13723a', warn: '#9a5300', bad: '#c0271c', plate: '#0f2a44', 'plate-ink': '#ffffff',
  },
  dark: {
    canvas: '#0a1520', surface: '#11202e', 'surface-2': '#182a3b',
    ink: '#eef4f8', 'ink-2': '#a3b6c6', control: '#6b8397',
    focus: '#4cc3e6', ok: '#4ade80', warn: '#fbbf24', bad: '#ff7a6b', plate: '#4cc3e6', 'plate-ink': '#0a1520',
  },
};
// Fixed in both themes: the navy brand shell and the orange primary action.
const SHELL = { shell: '#0f2a44', 'shell-2': '#183b5c', 'shell-ink': '#eef5fb', 'shell-ink-2': '#b0c6da' };
const BRAND = { brand: '#ff7a2f', 'brand-ink': '#0e1c2b', 'brand-edge': '#b24a0e' };
const BANDS = {
  orange: '#ff8a3d', sky: '#3ec5f0', lime: '#a3e635', sun: '#ffd23f',
  rose: '#ff7aa2', mint: '#34d6b0', azure: '#4fa8ff', coral: '#ff6b5b',
};
const BAND_INK = '#0e1c2b';

const pairs = [];
for (const [theme, t] of Object.entries(THEMES)) {
  for (const bg of ['canvas', 'surface', 'surface-2']) {
    for (const fg of ['ink', 'ink-2', 'ok', 'warn', 'bad']) pairs.push([`${theme} ${fg}`, t[fg], bg, t[bg], 4.5]);
    pairs.push([`${theme} control border`, t.control, bg, t[bg], 3]);
    pairs.push([`${theme} focus ring`, t.focus, bg, t[bg], 3]);
    // The button boundary is its darker edge on light grounds and its bright fill on dark grounds.
    pairs.push([`${theme} primary button boundary`, theme === 'light' ? BRAND['brand-edge'] : BRAND.brand, bg, t[bg], 3]);
  }
  for (const tag of ['ok', 'warn', 'bad']) pairs.push([`${theme} tag text (surface) on ${tag}`, t.surface, tag, t[tag], 4.5]);
  pairs.push([`${theme} selected text`, t['plate-ink'], 'plate', t.plate, 4.5]);
  for (const bg of ['canvas', 'surface']) pairs.push([`${theme} selected fill`, t.plate, bg, t[bg], 3]);
}
pairs.push(['primary text', BRAND['brand-ink'], 'brand', BRAND.brand, 4.5]);
for (const bg of ['shell', 'shell-2']) {
  pairs.push([`shell text on ${bg}`, SHELL['shell-ink'], bg, SHELL[bg], 4.5]);
  pairs.push([`shell secondary on ${bg}`, SHELL['shell-ink-2'], bg, SHELL[bg], 4.5]);
  pairs.push([`primary button on ${bg}`, BRAND.brand, bg, SHELL[bg], 3]);
}
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
