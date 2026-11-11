// T-WEB-03 and T-WEB-04: version merge of events and snapshots, tombstones for deleted teams.
import { describe, expect, it } from 'vitest';
import { mergeBoardData } from '../hooks/queries';
import { team } from '../test/fixtures';
import { isTombstoned, mergeBoardPage, mergeFetchedPage, mergeTeam, onBoard, recordTombstone } from './merge';

const a = team({ id: 'a', version: 3, created_at: '2026-11-11T10:00:00Z' });
const b = team({ id: 'b', version: 1, created_at: '2026-11-11T09:00:00Z' });

describe('T-WEB-03 mergeTeam and board pages', () => {
  it('keeps the higher version', () => {
    expect(mergeTeam(a, { ...a, version: 2, name: 'old' })).toBe(a);
    expect(mergeTeam(a, { ...a, version: 4, name: 'new' }).name).toBe('new');
    expect(mergeTeam(undefined, a)).toBe(a);
  });

  it('patches in place, removes on null, ignores an older event', () => {
    const page = [a, b];
    expect(mergeBoardPage(page, 'b', { ...b, version: 2, member_count: 3 }, true).map((t) => t.member_count)).toEqual([2, 3]);
    expect(mergeBoardPage(page, 'a', null, true)).toEqual([b]);
    expect(mergeBoardPage(page, 'a', { ...a, version: 2, name: 'stale' }, true)).toBe(page);
  });

  it('removes a team that is full, finalized or not looking, and inserts a new one in board order', () => {
    expect(mergeBoardPage([a, b], 'a', { ...a, version: 4, member_count: 4 }, true)).toEqual([b]);
    expect(mergeBoardPage([a, b], 'b', { ...b, version: 2, status: 'finalized' }, true)).toEqual([a]);
    expect(mergeBoardPage([a, b], 'b', { ...b, version: 2, looking: false }, false)).toEqual([a]);
    const fresh = team({ id: 'c', created_at: '2026-11-11T11:00:00Z' });
    expect(mergeBoardPage([a, b], 'c', fresh, true).map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(mergeBoardPage([a, b], 'c', fresh, false).map((t) => t.id)).toEqual(['a', 'b']);
    const older = team({ id: 'd', created_at: '2026-11-11T07:00:00Z' });
    expect(mergeBoardPage([a, b], 'd', older, true).map((t) => t.id)).toEqual(['a', 'b']);
    expect(mergeBoardPage([a, b], 'd', older, true, true).map((t) => t.id)).toEqual(['a', 'b', 'd']);
    expect(mergeBoardPage([], 'd', older, true, true).map((t) => t.id)).toEqual(['d']);
    expect(onBoard(team({ member_count: 4 }))).toBe(false);
  });

  it('keeps a newer cached event when an older snapshot is refetched', () => {
    const cached = [{ ...a, version: 5, member_count: 3 }];
    expect(mergeFetchedPage([a], cached)).toEqual(cached);
  });
});

describe('T-WEB-04 tombstones', () => {
  it('a refetch that still contains a deleted team does not restore it', () => {
    recordTombstone('a', 4);
    expect(isTombstoned('a', 3)).toBe(true);
    expect(isTombstoned('a', 5)).toBe(false);
    const fetched = { pages: [{ items: [a, b], next_cursor: null }], pageParams: [null] };
    const merged = mergeBoardData(undefined, fetched) as typeof fetched;
    expect(merged.pages[0]?.items.map((t) => t.id)).toEqual(['b']);
  });

  it('a late event with a lower version does not re-insert a deleted team', () => {
    recordTombstone('a', 4);
    expect(mergeBoardPage([b], 'a', { ...a, version: 3 }, true)).toEqual([b]);
  });
});
