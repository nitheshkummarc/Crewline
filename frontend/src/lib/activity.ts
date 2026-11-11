// Live activity feed: turns team events into readable items and keeps the last ones in a small external store.
import type { TeamEvent } from '../api/types';

export type ActivityKind = 'created' | 'joined' | 'full' | 'left' | 'finalized' | 'reopened' | 'deleted';

export interface ActivityItem {
  seq: number;
  kind: ActivityKind;
  teamId: string;
  teamName: string;
  seats: string | null;
  at: number;
}

export const FEED_LIMIT = 30;

/** Return a feed item for a team event, or null for events that are not news (profile edits, invite changes). */
export function activityFromEvent(event: TeamEvent, previousName: string | null, at: number = Date.now()): ActivityItem | null {
  const team = event.team;
  const name = team?.name ?? previousName ?? 'A team';
  const seats = team ? `${team.member_count}/${team.max_size}` : null;
  const base = { seq: event.seq, teamId: event.team_id, teamName: name, seats, at };
  switch (event.action) {
    case 'team_created':
      return { ...base, kind: 'created' };
    case 'member_joined_via_code':
    case 'request_accepted':
      return { ...base, kind: team && team.member_count >= team.max_size ? 'full' : 'joined' };
    case 'member_left':
    case 'member_removed':
      return { ...base, kind: 'left' };
    case 'team_finalized':
      return { ...base, kind: 'finalized' };
    case 'team_reopened':
      return { ...base, kind: 'reopened' };
    case 'team_deleted':
      return { ...base, kind: 'deleted' };
    default:
      return null;
  }
}

/** One line of text for a feed item. */
export function activityText(item: ActivityItem): string {
  switch (item.kind) {
    case 'created': return `${item.teamName} was created`;
    case 'joined': return `${item.teamName} filled a seat`;
    case 'full': return `${item.teamName} is now full`;
    case 'left': return `A seat opened in ${item.teamName}`;
    case 'finalized': return `${item.teamName} was finalized`;
    case 'reopened': return `${item.teamName} reopened`;
    case 'deleted': return `${item.teamName} was deleted`;
  }
}

type Listener = () => void;
let items: ActivityItem[] = [];
const listeners = new Set<Listener>();

/** The activity store, read with useSyncExternalStore. */
export const activityStore = {
  /** Add an item at the top, ignoring a sequence number already seen. */
  push(item: ActivityItem): void {
    if (items.some((existing) => existing.seq === item.seq)) return;
    items = [item, ...items].slice(0, FEED_LIMIT);
    listeners.forEach((listener) => listener());
  },
  /** Remove every item (logout, tests). */
  clear(): void {
    items = [];
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot: (): ActivityItem[] => items,
};
