// Team band colors: each team gets one of 8 band colors, picked from its id so every client shows the same color.
//
// Contents:
//   bandIndex: Return a stable band index (0 to 7) for a team id (FNV-1a hash).
//   bandColor: Return the CSS value of a team's band color.
//   bandStyle: Return a style object that sets --band for `.band` and band-colored children.
//   initials: Return up to two initials for a display name.

export const BAND_COUNT = 8;

/** Return a stable band index (0 to 7) for a team id (FNV-1a hash). */
export function bandIndex(teamId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < teamId.length; i += 1) {
    hash ^= teamId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % BAND_COUNT;
}

/** Return the CSS value of a team's band color. */
export const bandColor = (teamId: string): string => `var(--band-${bandIndex(teamId)})`;

/** Return a style object that sets --band for `.band` and band-colored children. */
export const bandStyle = (teamId: string) => ({ ['--band' as string]: bandColor(teamId) });

/** Return up to two initials for a display name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : parts[0]?.[1] ?? '';
  return (first + second).toUpperCase();
}
