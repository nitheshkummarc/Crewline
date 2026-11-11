// T-WEB-10 and T-WEB-11: activity items from team events, the feed store, and stable team band colors.
import { afterEach, describe, expect, it } from 'vitest';
import type { TeamEvent } from '../api/types';
import { team } from '../test/fixtures';
import { FEED_LIMIT, activityFromEvent, activityStore, activityText } from './activity';
import { BAND_COUNT, bandIndex, initials } from './teamColor';

const event = (action: string, overrides: Partial<TeamEvent> = {}): TeamEvent => ({
  seq: 1, action, team_id: 't1', version: 2, team: team({ id: 't1', name: 'Null Pointers', member_count: 2, max_size: 4 }), ...overrides,
});

/** Return the activity item for an event, failing the test when there is none. */
function itemFor(e: TeamEvent, previousName: string | null) {
  const item = activityFromEvent(e, previousName);
  if (!item) throw new Error(`no activity item for ${e.action}`);
  return item;
}

afterEach(() => activityStore.clear());

describe('T-WEB-10 activity feed', () => {
  it('turns team events into readable items and skips non-news events', () => {
    expect(activityText(itemFor(event('team_created'), null))).toBe('Null Pointers was created');
    expect(activityFromEvent(event('member_joined_via_code'), null)).toMatchObject({ kind: 'joined', seats: '2/4' });
    const full = event('request_accepted', { team: team({ id: 't1', name: 'Null Pointers', member_count: 4, max_size: 4 }) });
    expect(activityText(itemFor(full, null))).toBe('Null Pointers is now full');
    expect(activityText(itemFor(event('member_left'), null))).toBe('A seat opened in Null Pointers');
    expect(activityFromEvent(event('member_profile_updated'), null)).toBeNull();
    expect(activityFromEvent(event('invite_regenerated'), null)).toBeNull();
  });

  it('names a deleted team from the cached name, or says "A team"', () => {
    expect(activityText(itemFor(event('team_deleted', { team: null }), 'Old Crew'))).toBe('Old Crew was deleted');
    expect(activityText(itemFor(event('team_deleted', { team: null }), null))).toBe('A team was deleted');
  });

  it('keeps the newest items first, ignores a repeated sequence number, and caps the list', () => {
    for (let seq = 1; seq <= FEED_LIMIT + 5; seq += 1) activityStore.push({ ...itemFor(event('team_created'), null), seq });
    activityStore.push({ ...itemFor(event('team_created'), null), seq: FEED_LIMIT + 5 });
    const items = activityStore.snapshot();
    expect(items).toHaveLength(FEED_LIMIT);
    expect(items[0]?.seq).toBe(FEED_LIMIT + 5);
  });
});

describe('T-WEB-11 team colors', () => {
  it('gives the same team the same color everywhere and spreads teams over the palette', () => {
    expect(bandIndex('6a435808-d557-4928-8d91-75fa36b35cfc')).toBe(bandIndex('6a435808-d557-4928-8d91-75fa36b35cfc'));
    const used = new Set(Array.from({ length: 200 }, (_, i) => bandIndex(`team-${i}`)));
    expect(used.size).toBe(BAND_COUNT);
  });

  it('builds initials from a display name', () => {
    expect(initials('Ana Rao')).toBe('AR');
    expect(initials('ben')).toBe('BE');
    expect(initials('  ')).toBe('?');
  });
});
