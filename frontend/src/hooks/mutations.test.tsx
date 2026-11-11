// T-WEB-01: optimistic accept (a join through a request) rolls back on 409 team_full and announces the conflict.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { JoinRequest, TeamDetail } from '../api/types';
import { LiveRegionProvider } from '../components/LiveRegion';
import { keys } from '../lib/keys';
import { stubFetch, teamDetail } from '../test/fixtures';
import { useAcceptRequest } from './mutations';

const request: JoinRequest = {
  id: 'r1', team_id: 'bbbbbbbb-0000-4000-8000-000000000001', team_name: 'Null Pointers', user_id: 'u9', display_name: 'Cy',
  message: null, status: 'pending', created_at: '2026-11-11T10:00:00Z', decided_at: null,
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const team = teamDetail({ member_count: 3 });
  client.setQueryData(keys.team(team.id), team);
  client.setQueryData(keys.teamRequests(team.id), [request]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}><LiveRegionProvider>{children}</LiveRegionProvider></QueryClientProvider>
  );
  return { client, team, wrapper };
}

describe('T-WEB-01 optimistic accept', () => {
  it('patches at once, rolls back on 409 team_full, and says someone took the last seat', async () => {
    const { client, team, wrapper } = setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = stubFetch([
      ['POST', /\/api\/requests\/r1\/accept$/, 409, { error: { code: 'team_full', message: 'Team is full', request_id: 'x' } }],
      ['GET', /\/api\/teams\//, 200, team],
    ]);
    const original = fetchMock.getMockImplementation();
    if (!original) throw new Error('stubFetch has no implementation');
    fetchMock.mockImplementation(async (...args) => {
      await gate;
      return original(...args);
    });

    const { result } = renderHook(() => useAcceptRequest(team.id), { wrapper });
    act(() => result.current.mutate('r1'));

    await waitFor(() => expect(client.getQueryData<TeamDetail>(keys.team(team.id))?.member_count).toBe(4));
    expect(client.getQueryData<JoinRequest[]>(keys.teamRequests(team.id))).toEqual([]);

    release();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData<TeamDetail>(keys.team(team.id))?.member_count).toBe(3);
    await waitFor(() => expect(screen.getByTestId('live-region')).toHaveTextContent('Someone took the last seat.'));
  });

  it('keeps the server result on success', async () => {
    const { client, team, wrapper } = setup();
    const accepted = { ...team, member_count: 4, version: 2 };
    stubFetch([['POST', /\/accept$/, 200, accepted], ['GET', /\/api\/teams\//, 200, accepted]]);
    const { result } = renderHook(() => useAcceptRequest(team.id), { wrapper });
    act(() => result.current.mutate('r1'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData<TeamDetail>(keys.team(team.id))?.version).toBe(2);
  });
});
