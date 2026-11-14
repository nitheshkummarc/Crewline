// Query hooks: one per read endpoint, keyed by lib/keys.ts; board and team data merge by version.
//
// Contents:
//   mergeBoardData: Merge a refetched teams board with the cached one so an older snapshot never overwrites a
//       newer event.
//   mergeTeamDetail: Keep a cached team detail when it is newer than the refetched one.
//   useMe: The signed-in user; error 401 means signed out.
//   useMeta: Skill taxonomy and core roles from the server.
//   useFormToken: A fresh bot-check token per form render; never reused across visits.
//   useHackathons: Every hackathon.
//   useHackathon: One hackathon.
//   useMyStatus: The caller's registration, looking flag, team and pending requests in one hackathon (idle while
//       hid is unknown).
//   useTeamsBoard: Teams board with cursor pages; live events patch it in place.
//   usePeopleBoard: People board with cursor pages; refetched on `people` events.
//   useSuggestions: Ranked teammate suggestions for the caller's team, or for the caller alone.
//   useMyRequests: The caller's join requests in one hackathon (all statuses).
//   useTeam: One team with members; a deleted team (tombstone) reads as not found.
//   useTeamRequests: Pending requests of a team (leader only).
//   useInvite: The invite code of a team (members only).
//   useTeamAudit: Team audit log, newest first, with cursor pages (members only).
import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { ApiError } from '../api/client';
import type { Page, PublicUser, TeamDetail, TeamSummary } from '../api/types';
import { keys } from '../lib/keys';
import { isTombstoned, mergeFetchedPage } from '../lib/merge';

export type TeamsBoardData = InfiniteData<Page<TeamSummary>, string | null>;

const noRetryOn4xx = (failures: number, error: Error) =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2;

/** Merge a refetched teams board with the cached one so an older snapshot never overwrites a newer event. */
export function mergeBoardData(old: unknown, fresh: unknown): unknown {
  const next = fresh as TeamsBoardData;
  const prev = old as TeamsBoardData | undefined;
  const cached = prev?.pages.flatMap((page) => page.items);
  return { ...next, pages: next.pages.map((page) => ({ ...page, items: mergeFetchedPage(page.items, cached) })) };
}

/** Keep a cached team detail when it is newer than the refetched one. */
export function mergeTeamDetail(old: unknown, fresh: unknown): unknown {
  const prev = old as TeamDetail | undefined;
  const next = fresh as TeamDetail;
  return prev && prev.id === next.id && prev.version > next.version ? prev : next;
}

/** The signed-in user; error 401 means signed out. */
export const useMe = () =>
  useQuery({ queryKey: keys.me(), queryFn: api.me, retry: noRetryOn4xx, staleTime: 60_000 });

/** Skill taxonomy and core roles from the server. */
export const useMeta = () => useQuery({ queryKey: keys.meta(), queryFn: api.meta, staleTime: Infinity });

/** A fresh bot-check token per form render; never reused across visits. */
export const useFormToken = (form: 'login' | 'signup') =>
  useQuery({
    queryKey: keys.formToken(form),
    queryFn: async () => ({ ...(await api.formToken()), receivedAt: Date.now() }),
    staleTime: 60 * 60_000,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

/** Every hackathon. */
export const useHackathons = () => useQuery({ queryKey: keys.hackathons(), queryFn: api.listHackathons });

/** One hackathon. */
export const useHackathon = (hid: string) =>
  useQuery({ queryKey: keys.hackathon(hid), queryFn: () => api.getHackathon(hid), retry: noRetryOn4xx, staleTime: 300_000,
    enabled: hid !== '' });

/** The caller's registration, looking flag, team and pending requests in one hackathon (idle while hid is unknown). */
export const useMyStatus = (hid: string) =>
  useQuery({ queryKey: keys.myStatus(hid), queryFn: () => api.myStatus(hid), retry: noRetryOn4xx, enabled: hid !== '' });

/** Teams board with cursor pages; live events patch it in place. */
export const useTeamsBoard = (hid: string, enabled = true) =>
  useInfiniteQuery({
    queryKey: keys.teamsBoard(hid),
    queryFn: ({ pageParam }) => api.teamsBoard(hid, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    structuralSharing: mergeBoardData,
    enabled: enabled && hid !== '',
  });

/** People board with cursor pages; refetched on `people` events. */
export const usePeopleBoard = (hid: string, enabled = true) =>
  useInfiniteQuery<Page<PublicUser>, Error, InfiniteData<Page<PublicUser>, string | null>, readonly unknown[], string | null>({
    queryKey: keys.peopleBoard(hid),
    queryFn: ({ pageParam }) => api.peopleBoard(hid, pageParam),
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor,
    enabled: enabled && hid !== '',
  });

/** Ranked teammate suggestions for the caller's team, or for the caller alone. */
export const useSuggestions = (hid: string, enabled = true) =>
  useQuery({ queryKey: keys.suggestions(hid), queryFn: () => api.suggestions(hid), enabled: enabled && hid !== '', retry: noRetryOn4xx });

/** The caller's join requests in one hackathon (all statuses). */
export const useMyRequests = (hid: string, enabled = true) =>
  useQuery({ queryKey: keys.myRequests(hid), queryFn: () => api.myRequests(hid), enabled: enabled && hid !== '' });

/** One team with members; a deleted team (tombstone) reads as not found. */
export const useTeam = (tid: string) =>
  useQuery({
    queryKey: keys.team(tid),
    queryFn: () => api.getTeam(tid),
    retry: noRetryOn4xx,
    structuralSharing: mergeTeamDetail,
    select: (team) => (isTombstoned(team.id, team.version) ? null : team),
  });

/** Pending requests of a team (leader only). */
export const useTeamRequests = (tid: string, enabled: boolean) =>
  useQuery({ queryKey: keys.teamRequests(tid), queryFn: () => api.teamRequests(tid), enabled, retry: noRetryOn4xx });

/** The invite code of a team (members only). */
export const useInvite = (tid: string, enabled: boolean) =>
  useQuery({ queryKey: keys.invite(tid), queryFn: () => api.getInvite(tid), enabled, retry: noRetryOn4xx });

/** Team audit log, newest first, with cursor pages (members only). */
export const useTeamAudit = (tid: string, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: keys.audit(tid),
    queryFn: ({ pageParam }) => api.teamAudit(tid, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    enabled,
    retry: noRetryOn4xx,
  });
