// Version-based merging of live events and refetched snapshots, with tombstones for deleted teams.
//
// Contents:
//   recordTombstone: Record that a team was deleted at a version; keeps the highest version seen.
//   isTombstoned: True if a snapshot is older than (or as old as) the team's deletion.
//   clearTombstones: Forget every tombstone (tests, logout).
//   mergeTeam: Keep the higher version of two snapshots of the same team.
//   onBoard: True if a team belongs on the teams board: forming, looking and not full (api.md, Board).
//   newestFirst: Board order: newest team first, then by id.
//   mergeBoardPage: Patch, insert or remove one team in a board page. `incoming` null means deleted. A team
//       already in the page keeps its position (columns never move); a new team is inserted in board order only
//       when it falls inside the page's range: the first page also takes newer teams, and the last page (no next
//       cursor) also takes older ones.
//   mergeFetchedPage: Merge a refetched board page with the cached one: per team the higher version wins,
//       tombstoned teams are dropped, and a newer cached snapshot that left the board stays out.
import type { TeamSummary } from '../api/types';

const deaths = new Map<string, number>();

/** Map of deleted team id to its deletion version (read-only view). */
export const tombstones: ReadonlyMap<string, number> = deaths;

/** Record that a team was deleted at a version; keeps the highest version seen. */
export function recordTombstone(teamId: string, version: number): void {
  deaths.set(teamId, Math.max(version, deaths.get(teamId) ?? -1));
}

/** True if a snapshot is older than (or as old as) the team's deletion. */
export function isTombstoned(teamId: string, version: number): boolean {
  const death = deaths.get(teamId);
  return death !== undefined && version <= death;
}

/** Forget every tombstone (tests, logout). */
export function clearTombstones(): void {
  deaths.clear();
}

/** Keep the higher version of two snapshots of the same team. */
export function mergeTeam<T extends TeamSummary>(cached: T | undefined, incoming: T): T {
  if (!cached || incoming.version > cached.version) return incoming;
  return cached;
}

/** True if a team belongs on the teams board: forming, looking and not full (api.md, Board). */
export function onBoard(team: TeamSummary): boolean {
  return team.status === 'forming' && team.looking && team.member_count < team.max_size;
}

/** Board order: newest team first, then by id. */
const newestFirst = (a: TeamSummary, b: TeamSummary) =>
  b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);

/**
 * Patch, insert or remove one team in a board page.
 * `incoming` null means deleted. A team already in the page keeps its position (columns never move);
 * a new team is inserted in board order only when it falls inside the page's range: the first page also takes
 * newer teams, and the last page (no next cursor) also takes older ones.
 */
export function mergeBoardPage(items: TeamSummary[], teamId: string, incoming: TeamSummary | null,
                               isFirstPage: boolean, isLastPage = false): TeamSummary[] {
  const index = items.findIndex((team) => team.id === teamId);
  const existing = index >= 0 ? items[index] : undefined;
  if (incoming === null) return existing ? items.filter((team) => team.id !== teamId) : items;
  if (isTombstoned(incoming.id, incoming.version)) return existing ? items.filter((t) => t.id !== teamId) : items;
  if (existing && existing.version >= incoming.version) return items;
  if (!onBoard(incoming)) return existing ? items.filter((team) => team.id !== teamId) : items;
  if (existing) return items.map((team) => (team.id === teamId ? incoming : team));
  // Insert only inside this page's range; a team before the first item belongs to an earlier page,
  // one after the last item to a page that is not loaded yet (it arrives with that page's fetch).
  const first = items[0];
  const last = items[items.length - 1];
  const afterStart = isFirstPage || (first !== undefined && newestFirst(first, incoming) <= 0);
  const beforeEnd = isLastPage || (last !== undefined && newestFirst(incoming, last) <= 0);
  if (!afterStart || !beforeEnd) return items;
  return [...items, incoming].sort(newestFirst);
}

/**
 * Merge a refetched board page with the cached one: per team the higher version wins,
 * tombstoned teams are dropped, and a newer cached snapshot that left the board stays out.
 */
export function mergeFetchedPage(fresh: TeamSummary[], cached: TeamSummary[] | undefined): TeamSummary[] {
  const known = new Map((cached ?? []).map((team) => [team.id, team]));
  const result: TeamSummary[] = [];
  for (const team of fresh) {
    if (isTombstoned(team.id, team.version)) continue;
    const merged = mergeTeam(known.get(team.id), team);
    if (onBoard(merged)) result.push(merged);
  }
  return result;
}
