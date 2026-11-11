// Hackathon board: your status and one primary action, live Teams and People tabs, your requests.
import * as Switch from '@radix-ui/react-switch';
import * as Tabs from '@radix-ui/react-tabs';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { TeamSummary } from '../api/types';
import { Lamp, SeatStrip } from '../components/Board';
import { Button, ButtonLink } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { ActionBar } from '../components/Layout';
import { EmptyState, LoadError, SkeletonRows } from '../components/LoadState';
import { PeopleBoard, SuggestionList } from '../components/People';
import { RequestDialog } from '../components/RequestDialog';
import { TeamBoard } from '../components/TeamBoard';
import { useCreateRequest, useRegister, useSetLooking, useWithdrawRequest } from '../hooks/mutations';
import { useMyRequests, useMyStatus, usePeopleBoard, useSuggestions, useTeamsBoard } from '../hooks/queries';
import { useEventStream, type StreamStatus } from '../hooks/useEventStream';
import { relativeTime } from '../lib/time';

const STREAM_LAMP: Record<StreamStatus, { tone: 'green' | 'amber'; label: string }> = {
  live: { tone: 'green', label: 'Live' },
  connecting: { tone: 'amber', label: 'Connecting' },
  reconnecting: { tone: 'amber', label: 'Reconnecting' },
};

const TAB = 'cells min-h-touch border-b-2 border-transparent px-1 text-[14px] text-room-ink2 data-[state=active]:border-room-ink data-[state=active]:text-room-ink';

/** The board page for one hackathon. */
export default function BoardPage() {
  const { hid = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'people' ? 'people' : 'teams';
  const view = params.get('view') === 'ranked' ? 'ranked' : 'all';
  const stream = useEventStream(hid);
  const status = useMyStatus(hid);
  const teams = useTeamsBoard(hid);
  const people = usePeopleBoard(hid, tab === 'people' && view === 'all');
  const registered = status.data?.registered ?? false;
  const suggestions = useSuggestions(hid, tab === 'people' && view === 'ranked' && registered);
  const myRequests = useMyRequests(hid, registered);
  const register = useRegister(hid);
  const looking = useSetLooking(hid);
  const createRequest = useCreateRequest(hid);
  const withdraw = useWithdrawRequest(hid);
  const [asking, setAsking] = useState<TeamSummary | null>(null);

  if (status.error) return <LoadError error={status.error} onRetry={() => void status.refetch()} />;

  const myTeam = status.data?.team ?? null;
  const pending = new Map((myRequests.data ?? []).filter((r) => r.status === 'pending').map((r) => [r.team_id, r]));
  const canAsk = registered && !myTeam;
  const allTeams = teams.data?.pages.flatMap((page) => page.items) ?? [];
  const lamp = STREAM_LAMP[stream];

  const setTab = (next: string) => setParams((p) => { p.set('tab', next); return p; }, { replace: true });
  const setView = (next: string) => setParams((p) => { p.set('view', next); return p; }, { replace: true });

  const rowAction = (team: TeamSummary) => {
    const request = pending.get(team.id);
    if (request) {
      return (
        <Button variant="board" busy={withdraw.isPending && withdraw.variables === request.id}
          busyLabel="Withdrawing" onClick={() => withdraw.mutate(request.id)} aria-label={`Withdraw request to ${team.name}`}>
          Withdraw request
        </Button>
      );
    }
    if (!canAsk) return null;
    return (
      <Button variant="board" onClick={() => { createRequest.reset(); setAsking(team); }}
        aria-label={`Ask to join ${team.name}`}>
        Ask to join
      </Button>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="page-title" className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 id="page-title" className="page-title">Team board</h1>
          <Lamp tone={lamp.tone} label={lamp.label} className="cells text-[12px] text-room-ink2" />
        </div>
        {status.isPending ? null : !registered ? (
          <ActionBar>
            <Button variant="primary" busy={register.isPending} busyLabel="Registering" onClick={() => register.mutate()}>
              Register for this hackathon
            </Button>
          </ActionBar>
        ) : myTeam ? (
          <ActionBar><ButtonLink to={`/teams/${myTeam.id}`} variant="primary">Open your team</ButtonLink></ActionBar>
        ) : (
          <ActionBar>
            <ButtonLink to={`/h/${hid}/teams/new`} variant="primary">Create a team</ButtonLink>
            <ButtonLink to={`/h/${hid}/join`} variant="secondary">Join with a code</ButtonLink>
          </ActionBar>
        )}
      </section>
      <ErrorNotice error={register.error ?? looking.error ?? withdraw.error} />

      {registered && (
        <section aria-label="Your status" className="flex flex-col gap-3 rounded-md border border-room-line p-4 md:flex-row md:items-center md:justify-between">
          {myTeam ? (
            <p className="flex flex-wrap items-center gap-3">
              <span>You are in</span>
              <Link to={`/teams/${myTeam.id}`} className="cells underline underline-offset-[3px]">{myTeam.name}</Link>
              <SeatStrip taken={myTeam.member_count} size={myTeam.max_size} mine />
              <span className="cells text-[13px] text-room-ink2">{myTeam.member_count}/{myTeam.max_size}</span>
            </p>
          ) : (
            <p className="text-room-ink2">You are not in a team yet. Create one, join with a code, or ask a team below.</p>
          )}
          {!myTeam && (
            <div className="flex min-h-touch items-center gap-3">
              <Switch.Root id="looking-switch" checked={status.data?.looking ?? false} disabled={looking.isPending}
                onCheckedChange={(checked) => looking.mutate(checked)}
                className="press relative h-7 w-12 shrink-0 rounded border border-room-control bg-room-raised data-[state=checked]:border-room-green">
                <Switch.Thumb className="block h-5 w-5 translate-x-[3px] rounded-sm bg-room-ink2 transition-transform duration-150 data-[state=checked]:translate-x-[23px] data-[state=checked]:bg-room-green" />
              </Switch.Root>
              <label htmlFor="looking-switch">Show me on the People board</label>
            </div>
          )}
        </section>
      )}

      <Tabs.Root value={tab} onValueChange={setTab} className="flex flex-col gap-4">
        <Tabs.List aria-label="Board" className="flex gap-6 border-b border-room-line">
          <Tabs.Trigger value="teams" className={TAB}>Teams with seats</Tabs.Trigger>
          <Tabs.Trigger value="people" className={TAB}>People looking</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="teams" className="flex flex-col gap-3 outline-none">
          {teams.isPending && <SkeletonRows label="Loading teams" />}
          {teams.error && <LoadError error={teams.error} onRetry={() => void teams.refetch()} />}
          {teams.isSuccess && allTeams.length === 0 && (
            <EmptyState title="No team has an open seat right now">This list updates live. Create a team and it shows up here for everyone.</EmptyState>
          )}
          {allTeams.length > 0 && <TeamBoard teams={allTeams} myTeamId={myTeam?.id ?? null} renderAction={rowAction} />}
          {teams.hasNextPage && (
            <Button variant="secondary" className="self-start" busy={teams.isFetchingNextPage} busyLabel="Loading"
              onClick={() => void teams.fetchNextPage()}>Show more teams</Button>
          )}
        </Tabs.Content>
        <Tabs.Content value="people" className="flex flex-col gap-3 outline-none">
          <div role="group" aria-label="People view" className="flex gap-2">
            <Button variant="secondary" aria-pressed={view === 'all'} onClick={() => setView('all')}>Everyone looking</Button>
            <Button variant="secondary" aria-pressed={view === 'ranked'} onClick={() => setView('ranked')} disabled={!registered}>
              Best matches for {myTeam ? 'your team' : 'you'}
            </Button>
          </div>
          {view === 'all' ? (
            <>
              {people.isPending && <SkeletonRows label="Loading people" />}
              {people.error && <LoadError error={people.error} onRetry={() => void people.refetch()} />}
              {people.isSuccess && people.data.pages[0]?.items.length === 0 && (
                <EmptyState title="Nobody is looking right now">People appear here when they turn on "Show me on the People board".</EmptyState>
              )}
              {people.data && <PeopleBoard people={people.data.pages.flatMap((page) => page.items)} />}
              {people.hasNextPage && (
                <Button variant="secondary" className="self-start" busy={people.isFetchingNextPage} busyLabel="Loading"
                  onClick={() => void people.fetchNextPage()}>Show more people</Button>
              )}
            </>
          ) : (
            <>
              {suggestions.isPending && <SkeletonRows label="Ranking people" />}
              {suggestions.error && <LoadError error={suggestions.error} onRetry={() => void suggestions.refetch()} />}
              {suggestions.data && (
                <p className="text-sm text-room-ink2">
                  Ranked by roles {myTeam ? 'your team is' : 'you are'} missing
                  {suggestions.data.context.missing_roles.length > 0 ? ` (${suggestions.data.context.missing_roles.join(', ')})` : ''},
                  working-hour overlap and profile completeness.
                </p>
              )}
              {suggestions.data?.items.length === 0 && <EmptyState title="Nobody to rank yet">Suggestions come from people who are looking.</EmptyState>}
              {suggestions.data && suggestions.data.items.length > 0 && <SuggestionList items={suggestions.data.items} />}
            </>
          )}
        </Tabs.Content>
      </Tabs.Root>

      {registered && (myRequests.data?.length ?? 0) > 0 && (
        <section aria-labelledby="requests-title" className="flex flex-col gap-3">
          <h2 id="requests-title" className="caps-heading">Your requests</h2>
          <ul className="divide-y divide-room-line rounded-md border border-room-line">
            {myRequests.data?.map((request) => (
              <li key={request.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <span>
                  <Link to={`/teams/${request.team_id}`} className="cells underline underline-offset-[3px]">{request.team_name}</Link>
                  <span className="ml-3 text-sm text-room-ink2">{relativeTime(request.created_at)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <Lamp tone={request.status === 'accepted' ? 'green' : request.status === 'pending' ? 'amber' : 'off'}
                    label={request.status} className="cells text-[12px]" />
                  {request.status === 'pending' && (
                    <Button variant="quiet" busy={withdraw.isPending && withdraw.variables === request.id} busyLabel="Withdrawing"
                      onClick={() => withdraw.mutate(request.id)} aria-label={`Withdraw request to ${request.team_name}`}>Withdraw</Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RequestDialog teamName={asking?.name ?? null} busy={createRequest.isPending} error={createRequest.error}
        onClose={() => setAsking(null)}
        onSend={(message) => asking && createRequest.mutate({ teamId: asking.id, message }, { onSuccess: () => setAsking(null) })} />
    </div>
  );
}
