// Print WCAG contrast ratios for every text and background token pair; exits 1 if any pair is below its floor.
// Usage: node scripts/contrast.mjs

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

const board = { board: '#0b0c0d', flap: '#181a1c' };
const dark = { room: '#111315', raised: '#1a1d20' };
const light = { room: '#e6e8e9', raised: '#f6f7f7' };
const pairs = [
  ...Object.entries(board).flatMap(([bg, b]) => [
    ['paint', '#f4f2ec', bg, b, 4.5], ['paint-2', '#9ea3a8', bg, b, 4.5], ['flap-edge', '#6f767d', bg, b, 3],
    ['lamp-amber', '#ffb21e', bg, b, 4.5], ['lamp-green', '#4fd67e', bg, b, 4.5], ['lamp-red', '#ff6a5c', bg, b, 4.5],
    ['skill-data', '#7fd3e6', bg, b, 4.5], ['skill-ops', '#e3cf9a', bg, b, 4.5], ['skill-people', '#f2a7b8', bg, b, 4.5],
  ]),
  ...Object.entries(dark).flatMap(([bg, b]) => [
    ['ink', '#eceae4', `dark ${bg}`, b, 4.5], ['ink-2', '#a3a8ad', `dark ${bg}`, b, 4.5],
    ['amber', '#ffb21e', `dark ${bg}`, b, 4.5], ['green', '#4fd67e', `dark ${bg}`, b, 4.5],
    ['red', '#ff6a5c', `dark ${bg}`, b, 4.5], ['line', '#343a3f', `dark ${bg}`, b, 1.3], ['control', '#6f767d', `dark ${bg}`, b, 3],
  ]),
  ...Object.entries(light).flatMap(([bg, b]) => [
    ['ink', '#151719', `light ${bg}`, b, 4.5], ['ink-2', '#4c5257', `light ${bg}`, b, 4.5],
    ['amber', '#8a5200', `light ${bg}`, b, 4.5], ['green', '#17693a', `light ${bg}`, b, 4.5],
    ['red', '#b3261e', `light ${bg}`, b, 4.5], ['line', '#c9cdd0', `light ${bg}`, b, 1.3], ['control', '#7a8086', `light ${bg}`, b, 3],
  ]),
  ['primary plate text (dark room, board)', '#0b0c0d', 'paint', '#f4f2ec', 4.5],
  ['primary plate on dark room', '#f4f2ec', 'dark room', '#111315', 3],
  ['primary plate text (light room)', '#f4f2ec', 'light plate', '#151719', 4.5],
  ['primary plate on light room', '#151719', 'light room', '#e6e8e9', 3],
  ['board button text', '#f4f2ec', 'board', '#0b0c0d', 4.5],
  ['board button border', '#6f767d', 'board', '#0b0c0d', 3],
  ['focus ring dark', '#ffb21e', 'dark room', '#111315', 3],
  ['focus ring light', '#8a5200', 'light room', '#e6e8e9', 3],
];

let failed = false;
for (const [fg, fgHex, bg, bgHex, floor] of pairs) {
  const r = ratio(fgHex, bgHex);
  const ok = r >= floor;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(5)}  ${fg} on ${bg} (floor ${floor})`);
}
process.exit(failed ? 1 : 0);
