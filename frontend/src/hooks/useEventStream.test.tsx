// T-WEB-07: the event stream refetches on open, patches the board and the caller's team by version, and keeps tombstones.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MyStatus } from '../api/types';
import { LiveRegionProvider } from '../components/LiveRegion';
import { keys } from '../lib/keys';
import { isTombstoned } from '../lib/merge';
import { HID, team } from '../test/fixtures';
import { FakeEventSource } from '../test/setup';
import type { TeamsBoardData } from './queries';
import { useEventStream } from './useEventStream';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, enabled: false } } });
  const mine = team({ id: 'mine', version: 2, member_count: 2 });
  const other = team({ id: 'other', version: 5, created_at: '2026-11-11T08:00:00Z' });
  client.setQueryData<TeamsBoardData>(keys.teamsBoard(HID), { pages: [{ items: [mine, other], next_cursor: null }], pageParams: [null] });
  client.setQueryData<MyStatus>(keys.myStatus(HID), { registered: true, looking: false, team: mine, pending_requests: [] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}><LiveRegionProvider>{children}</LiveRegionProvider></QueryClientProvider>
  );
  const hook = renderHook(() => useEventStream(HID), { wrapper });
  const source = FakeEventSource.instances[0];
  if (!source) throw new Error('no EventSource opened');
  return { client, hook, source, mine, other };
}

const board = (client: QueryClient) => client.getQueryData<TeamsBoardData>(keys.teamsBoard(HID))?.pages[0]?.items ?? [];

describe('T-WEB-07 event stream', () => {
  it('opens one stream for the hackathon and refetches everything on open', () => {
    const { client, hook, source } = setup();
    const spy = vi.spyOn(client, 'invalidateQueries');
    expect(source.url).toBe(`/api/events?hackathon_id=${HID}`);
    act(() => source.open());
    expect(hook.result.current).toBe('live');
    expect(spy).toHaveBeenCalledWith({ queryKey: keys.hackathonScope(HID) });
  });

  it('applies a newer team event to the board and the caller status, and announces it', async () => {
    const { client, source, mine } = setup();
    act(() => source.emit('team', { seq: 1, action: 'member_joined_via_code', team_id: 'mine', version: 3, team: { ...mine, version: 3, member_count: 3 } }));
    expect(board(client).find((t) => t.id === 'mine')?.member_count).toBe(3);
    expect(client.getQueryData<MyStatus>(keys.myStatus(HID))?.team?.member_count).toBe(3);
    await waitFor(() => expect(screen.getByTestId('live-region')).toHaveTextContent('Your team now has 3 of 4 seats taken.'));
  });

  it('ignores an older event and removes a deleted team with a tombstone', () => {
    const { client, source, other } = setup();
    act(() => source.emit('team', { seq: 2, action: 'team_updated', team_id: 'other', version: 4, team: { ...other, version: 4, name: 'Old' } }));
    expect(board(client).find((t) => t.id === 'other')?.name).toBe('Null Pointers');
    act(() => source.emit('team', { seq: 3, action: 'team_deleted', team_id: 'other', version: 6, team: null }));
    expect(board(client).map((t) => t.id)).toEqual(['mine']);
    expect(isTombstoned('other', 5)).toBe(true);
  });

  it('refreshes people and requests on their events', () => {
    const { client, source } = setup();
    const spy = vi.spyOn(client, 'invalidateQueries');
    act(() => source.emit('people', { seq: 4, action: 'participant_updated' }));
    act(() => source.emit('request', { seq: 5, action: 'request_created', team_id: 'mine', request_id: 'r1' }));
    expect(spy).toHaveBeenCalledWith({ queryKey: keys.peopleBoard(HID) });
    expect(spy).toHaveBeenCalledWith({ queryKey: keys.teamRequests('mine') });
    expect(spy).toHaveBeenCalledWith({ queryKey: keys.myRequests(HID) });
  });
});
