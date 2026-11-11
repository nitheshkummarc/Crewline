// Event stream hook: patches cached board and team data from SSE events, feeds the activity store, refetches on every (re)connect.
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { eventsUrl } from '../api/endpoints';
import type { JoinRequest, MyStatus, RequestEvent, TeamDetail, TeamEvent, TeamSummary } from '../api/types';
import { useAnnounce } from '../components/LiveRegion';
import { keys } from '../lib/keys';
import { activityFromEvent, activityStore } from '../lib/activity';
import { mergeBoardPage, mergeTeam, recordTombstone } from '../lib/merge';
import type { TeamsBoardData } from './queries';

export type StreamStatus = 'connecting' | 'live' | 'reconnecting';

const RECONNECT_MS = [2000, 5000, 10000, 30000];

/** Refetch everything that belongs to one hackathon and every open team page. */
export function refetchAll(client: QueryClient, hid: string): void {
  void client.invalidateQueries({ queryKey: keys.hackathonScope(hid) });
  void client.invalidateQueries({ queryKey: keys.teams() });
}

/** Apply one `team` event to the board pages, the team detail and the caller's status. Returns an announcement or null. */
export function applyTeamEvent(client: QueryClient, hid: string, event: TeamEvent): string | null {
  const { team_id: teamId, team } = event;
  if (team === null) recordTombstone(teamId, event.version);

  client.setQueryData<TeamsBoardData>(keys.teamsBoard(hid), (data) => data && {
    ...data,
    pages: data.pages.map((page, index) => ({
      ...page,
      items: mergeBoardPage(page.items, teamId, team, index === 0, index === data.pages.length - 1 && page.next_cursor === null),
    })),
  });

  const detail = client.getQueryData<TeamDetail>(keys.team(teamId));
  if (detail && (team === null || team.version > detail.version)) {
    if (team) client.setQueryData<TeamDetail>(keys.team(teamId), { ...detail, ...team });
    // Members are not in the event; refetch the detail (a deleted team refetches as 404).
    void client.invalidateQueries({ queryKey: keys.team(teamId), exact: true });
    if (event.action === 'request_accepted') void client.invalidateQueries({ queryKey: keys.teamRequests(teamId) });
    if (event.action === 'invite_regenerated') void client.invalidateQueries({ queryKey: keys.invite(teamId) });
    void client.invalidateQueries({ queryKey: keys.audit(teamId) });
  }

  const status = client.getQueryData<MyStatus>(keys.myStatus(hid));
  const myRequests = client.getQueryData<JoinRequest[]>(keys.myRequests(hid)) ?? [];
  const waitingOnTeam = myRequests.some((request) => request.team_id === teamId && request.status === 'pending')
    || (status?.pending_requests ?? []).some((request) => request.team_id === teamId);
  if (waitingOnTeam) {
    void client.invalidateQueries({ queryKey: keys.myStatus(hid) });
    void client.invalidateQueries({ queryKey: keys.myRequests(hid) });
  }
  if (!status?.team || status.team.id !== teamId) return null;
  if (team === null || event.action === 'member_removed' || event.action === 'member_left') {
    void client.invalidateQueries({ queryKey: keys.myStatus(hid) });
    void client.invalidateQueries({ queryKey: keys.suggestions(hid) });
  }
  if (team === null) return 'Your team was deleted.';
  const before = status.team;
  client.setQueryData<MyStatus>(keys.myStatus(hid), { ...status, team: mergeTeam<TeamSummary>(before, team) });
  if (team.version <= before.version) return null;
  if (team.member_count !== before.member_count) {
    void client.invalidateQueries({ queryKey: keys.suggestions(hid) });
    return `Your team now has ${team.member_count} of ${team.max_size} seats taken.`;
  }
  if (team.status !== before.status) return team.status === 'finalized' ? 'Your team was finalized.' : 'Your team was reopened.';
  return null;
}

/** Return the cached name of a team (board pages or team detail), or null if it is not cached. */
export function knownTeamName(client: QueryClient, hid: string, teamId: string): string | null {
  const detail = client.getQueryData<TeamDetail>(keys.team(teamId));
  if (detail) return detail.name;
  const board = client.getQueryData<TeamsBoardData>(keys.teamsBoard(hid));
  return board?.pages.flatMap((page) => page.items).find((team) => team.id === teamId)?.name ?? null;
}

/** Apply one `request` event: refresh that team's request list and the caller's own requests. */
export function applyRequestEvent(client: QueryClient, hid: string, event: RequestEvent): void {
  void client.invalidateQueries({ queryKey: keys.teamRequests(event.team_id) });
  void client.invalidateQueries({ queryKey: keys.myRequests(hid) });
  void client.invalidateQueries({ queryKey: keys.myStatus(hid) });
}

const parse = <T,>(message: MessageEvent<string>): T | null => {
  try {
    return JSON.parse(message.data) as T;
  } catch {
    return null;
  }
};

/** Open one EventSource for the hackathon; refetch on open, merge team events, handle people, request and resync. */
export function useEventStream(hid: string | undefined): StreamStatus {
  const client = useQueryClient();
  const announce = useAnnounce();
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const announceRef = useRef(announce);
  announceRef.current = announce;

  useEffect(() => {
    if (!hid) return undefined;
    let source: EventSource | null = null;
    let retryTimer: number | undefined;
    let attempt = 0;
    let stopped = false;

    const connect = () => {
      source = new EventSource(eventsUrl(hid));
      source.onopen = () => {
        attempt = 0;
        setStatus('live');
        // No Last-Event-ID replay (ADR-018): every open refetches.
        refetchAll(client, hid);
      };
      source.onerror = () => {
        if (stopped || !source) return;
        setStatus('reconnecting');
        if (source.readyState === EventSource.CLOSED) {
          // The browser gave up (HTTP error such as 429 or 401); retry with backoff.
          source.close();
          const delay = RECONNECT_MS[Math.min(attempt, RECONNECT_MS.length - 1)] ?? 30000;
          attempt += 1;
          retryTimer = window.setTimeout(connect, delay);
          if (attempt === 2) void client.invalidateQueries({ queryKey: keys.me() });
        }
      };
      source.addEventListener('team', (message) => {
        const event = parse<TeamEvent>(message as MessageEvent<string>);
        if (!event) return;
        // Read the name before applying: a deletion event carries no team snapshot.
        const item = activityFromEvent(event, knownTeamName(client, hid, event.team_id));
        if (item) activityStore.push(item);
        const text = applyTeamEvent(client, hid, event);
        if (text) announceRef.current(text);
      });
      source.addEventListener('people', () => {
        void client.invalidateQueries({ queryKey: keys.peopleBoard(hid) });
        void client.invalidateQueries({ queryKey: keys.suggestions(hid) });
      });
      source.addEventListener('request', (message) => {
        const event = parse<RequestEvent>(message as MessageEvent<string>);
        if (event) applyRequestEvent(client, hid, event);
      });
      source.addEventListener('resync', () => refetchAll(client, hid));
    };

    setStatus('connecting');
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      source?.close();
    };
  }, [client, hid]);

  return status;
}
