// Mutation hooks: one Idempotency-Key per user action, optimistic accept and leave with rollback, one error path.
import { useMutation, useQueryClient, type QueryKey, type UseMutationOptions } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { newIdempotencyKey } from '../api/client';
import type { JoinRequest, MyStatus, ProfilePatch, TeamDetail, TeamPatch } from '../api/types';
import { useAnnounce } from '../components/LiveRegion';
import { messageFor } from '../lib/errors';
import { keys } from '../lib/keys';

type Snapshot = Array<[QueryKey, unknown]>;

/**
 * Wrap useMutation with the shared rules: no automatic mutation retries (the client retries with the same key),
 * every error is announced once in the live region, and `refresh` keys are invalidated after the server answers.
 */
function useApiMutation<TData, TVars, TContext = Snapshot>(
  options: UseMutationOptions<TData, Error, TVars, TContext> & { refresh?: (vars: TVars) => QueryKey[] },
) {
  const client = useQueryClient();
  const announce = useAnnounce();
  const { refresh, onError, onSettled, ...rest } = options;
  return useMutation<TData, Error, TVars, TContext>({
    retry: false,
    ...rest,
    onError: (...args) => {
      announce(messageFor(args[0]));
      onError?.(...args);
    },
    onSettled: (...args) => {
      for (const key of refresh?.(args[2]) ?? []) void client.invalidateQueries({ queryKey: key });
      onSettled?.(...args);
    },
  });
}

/** Save the snapshots of some queries so an optimistic patch can be rolled back. */
function snapshot(client: ReturnType<typeof useQueryClient>, queryKeys: QueryKey[]): Snapshot {
  return queryKeys.map((key) => [key, client.getQueryData(key)]);
}

function restore(client: ReturnType<typeof useQueryClient>, saved: Snapshot | undefined): void {
  for (const [key, value] of saved ?? []) client.setQueryData(key, value);
}

/** Register for a hackathon. */
export function useRegister(hid: string) {
  return useApiMutation({
    mutationFn: () => api.register(hid, { key: newIdempotencyKey() }),
    refresh: () => [keys.myStatus(hid), keys.peopleBoard(hid)],
  });
}

/** Show or hide the caller on the People board. */
export function useSetLooking(hid: string) {
  const client = useQueryClient();
  return useApiMutation({
    mutationFn: (looking: boolean) => api.setLooking(hid, looking, { key: newIdempotencyKey() }),
    onSuccess: (status) => client.setQueryData(keys.myStatus(hid), status),
    refresh: () => [keys.peopleBoard(hid), keys.suggestions(hid)],
  });
}

/** Create a team; the caller becomes its leader. */
export function useCreateTeam(hid: string) {
  const client = useQueryClient();
  return useApiMutation({
    mutationFn: (name: string) => api.createTeam(hid, name, { key: newIdempotencyKey() }),
    onSuccess: (team) => client.setQueryData(keys.team(team.id), team),
    refresh: () => [keys.myStatus(hid), keys.teamsBoard(hid), keys.suggestions(hid)],
  });
}

/** Join the team that owns an invite code. The target team is unknown until the server resolves the code, so no optimistic patch. */
export function useJoinByCode(hid: string | undefined) {
  const client = useQueryClient();
  return useApiMutation({
    mutationFn: (code: string) => api.joinByCode(code, { key: newIdempotencyKey() }),
    onSuccess: (team) => client.setQueryData(keys.team(team.id), team),
    refresh: () => (hid ? [keys.hackathonScope(hid)] : [keys.hackathons()]),
  });
}

/** Send a join request to a team. */
export function useCreateRequest(hid: string) {
  return useApiMutation({
    mutationFn: ({ teamId, message }: { teamId: string; message: string | null }) =>
      api.createRequest(teamId, message, { key: newIdempotencyKey() }),
    refresh: () => [keys.myRequests(hid), keys.myStatus(hid)],
  });
}

/** Withdraw one of the caller's pending requests. */
export function useWithdrawRequest(hid: string) {
  return useApiMutation({
    mutationFn: (requestId: string) => api.withdrawRequest(requestId, { key: newIdempotencyKey() }),
    refresh: () => [keys.myRequests(hid), keys.myStatus(hid)],
  });
}

/** Accept a request (leader): optimistic seat and list patch, rollback and refetch on error. */
export function useAcceptRequest(teamId: string) {
  const client = useQueryClient();
  const announce = useAnnounce();
  return useApiMutation<TeamDetail, string>({
    mutationFn: (requestId) => api.acceptRequest(requestId, { key: newIdempotencyKey() }),
    onMutate: async (requestId) => {
      const affected = [keys.team(teamId), keys.teamRequests(teamId)];
      await Promise.all(affected.map((key) => client.cancelQueries({ queryKey: key, exact: true })));
      const saved = snapshot(client, affected);
      client.setQueryData<TeamDetail>(keys.team(teamId), (team) => team && { ...team, member_count: team.member_count + 1 });
      client.setQueryData<JoinRequest[]>(keys.teamRequests(teamId), (list) => list?.filter((r) => r.id !== requestId));
      return saved;
    },
    onError: (_error, _vars, saved) => restore(client, saved),
    onSuccess: (team) => {
      client.setQueryData(keys.team(teamId), team);
      announce(`Accepted. The team now has ${team.member_count} of ${team.max_size} seats taken.`);
    },
    refresh: () => [keys.team(teamId), keys.teamRequests(teamId)],
  });
}

/** Decline a request (leader). */
export function useDeclineRequest(teamId: string) {
  const client = useQueryClient();
  return useApiMutation({
    mutationFn: (requestId: string) => api.declineRequest(requestId, { key: newIdempotencyKey() }),
    onSuccess: (declined) =>
      client.setQueryData<JoinRequest[]>(keys.teamRequests(teamId), (list) => list?.filter((r) => r.id !== declined.id)),
    refresh: () => [keys.teamRequests(teamId)],
  });
}

/** Leave a team: the caller's status shows no team at once; rollback on error. */
export function useLeaveTeam(hid: string, teamId: string) {
  const client = useQueryClient();
  return useApiMutation({
    mutationFn: () => api.leaveTeam(teamId, { key: newIdempotencyKey() }),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: keys.myStatus(hid), exact: true });
      const saved = snapshot(client, [keys.myStatus(hid)]);
      client.setQueryData<MyStatus>(keys.myStatus(hid), (status) => status && { ...status, team: null });
      return saved;
    },
    onError: (_error, _vars, saved) => restore(client, saved),
    onSuccess: (result) => {
      if (result.team) client.setQueryData(keys.team(teamId), result.team);
      else client.removeQueries({ queryKey: keys.team(teamId) });
    },
    refresh: () => [keys.hackathonScope(hid)],
  });
}

/** Remove a member (leader). */
export function useRemoveMember(teamId: string) {
  const client = useQueryClient();
  return useApiMutation({
    mutationFn: (userId: string) => api.removeMember(teamId, userId, { key: newIdempotencyKey() }),
    onSuccess: (team) => client.setQueryData(keys.team(teamId), team),
    refresh: () => [keys.team(teamId)],
  });
}

/** Finalize a team (leader). */
export function useFinalizeTeam(teamId: string) {
  const client = useQueryClient();
  return useApiMutation({
    mutationFn: () => api.finalizeTeam(teamId, { key: newIdempotencyKey() }),
    onSuccess: (team) => client.setQueryData(keys.team(teamId), team),
    refresh: () => [keys.team(teamId)],
  });
}

/** Reopen a finalized team (leader). */
export function useReopenTeam(teamId: string) {
  const client = useQueryClient();
  return useApiMutation({
    mutationFn: () => api.reopenTeam(teamId, { key: newIdempotencyKey() }),
    onSuccess: (team) => client.setQueryData(keys.team(teamId), team),
    refresh: () => [keys.team(teamId)],
  });
}

/** Rename a team or change whether it is looking (leader). */
export function useUpdateTeam(teamId: string) {
  const client = useQueryClient();
  return useApiMutation({
    mutationFn: (patch: TeamPatch) => api.updateTeam(teamId, patch, { key: newIdempotencyKey() }),
    onSuccess: (team) => client.setQueryData(keys.team(teamId), team),
    refresh: () => [keys.team(teamId)],
  });
}

/** Replace the invite code (leader); the old code stops working. */
export function useRegenerateInvite(teamId: string) {
  const client = useQueryClient();
  return useApiMutation({
    mutationFn: () => api.regenerateInvite(teamId, { key: newIdempotencyKey() }),
    onSuccess: (invite) => client.setQueryData(keys.invite(teamId), invite),
    refresh: () => [keys.audit(teamId)],
  });
}

/** Update the caller's name, skills or time zone. */
export function useUpdateProfile() {
  const client = useQueryClient();
  return useApiMutation({
    mutationFn: (patch: ProfilePatch) => api.updateMe(patch, { key: newIdempotencyKey() }),
    onSuccess: (user) => client.setQueryData(keys.me(), user),
    refresh: () => [keys.teams()],
  });
}

/** Log out and clear every cached query. */
export function useLogout() {
  const client = useQueryClient();
  return useApiMutation({
    mutationFn: () => api.logout(),
    onSettled: () => client.clear(),
  });
}
