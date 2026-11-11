// Hackathon board: your status and one primary action, teams with search and filters, people, live activity, team peek.
import * as Tabs from '@radix-ui/react-tabs';
import { Eye, Radio, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { Skill, TeamSummary } from '../api/types';
import { ActivityFeed } from '../components/ActivityFeed';
import { BoardToolbar, SearchBox } from '../components/BoardToolbar';
import { Button } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { HeroBanner, HeroFact } from '../components/HeroBanner';
import { EmptyState, LoadError, SkeletonCards } from '../components/LoadState';
import { PeopleGrid, SuggestionList } from '../components/People';
import { RequestDialog } from '../components/RequestDialog';
import { LiveDot } from '../components/Seats';
import { TeamGrid } from '../components/TeamCard';
import { useCreateRequest, useWithdrawRequest } from '../hooks/mutations';
import { useHackathon, useMeta, useMyRequests, useMyStatus, usePeopleBoard, useSuggestions, useTeamsBoard } from '../hooks/queries';
import { useActivity } from '../hooks/useActivity';
import { useShell } from '../hooks/useShell';
import { filterFromParams, filterPeople, filterTeams, filterToParams, isFiltering, type TeamFilter } from '../lib/filter';
import { SKILLS } from '../lib/skills';
import { BoardPeek } from './BoardPeek';
import { MyRequests, StatusPanel } from './BoardStatus';

const TAB = 'press inline-flex min-h-touch items-center gap-2 rounded px-4 text-[15px] font-semibold text-ink-2 hover:text-ink data-[state=active]:bg-plate data-[state=active]:text-plate-ink';

/** True if a key press targets a text field (then "/" types a slash). */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** The board page for one hackathon. */
export default function BoardPage() {
  const { hid = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = ['people', 'activity'].includes(params.get('tab') ?? '') ? (params.get('tab') as string) : 'teams';
  const view = params.get('view') === 'ranked' ? 'ranked' : 'all';
  const filter = useMemo(() => filterFromParams(params), [params]);
  const { stream } = useShell();
  const hackathon = useHackathon(hid);
  const status = useMyStatus(hid);
  const meta = useMeta();
  const teams = useTeamsBoard(hid);
  const registered = status.data?.registered ?? false;
  const people = usePeopleBoard(hid, tab === 'people' && view === 'all');
  const suggestions = useSuggestions(hid, tab === 'people' && view === 'ranked' && registered);
  const myRequests = useMyRequests(hid, registered);
  const createRequest = useCreateRequest(hid);
  const withdraw = useWithdrawRequest(hid);
  const activity = useActivity();
  const [asking, setAsking] = useState<TeamSummary | null>(null);
  const [peek, setPeek] = useState<TeamSummary | null>(null);
  const [peopleQuery, setPeopleQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && !typing(event.target)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (status.error) return <LoadError error={status.error} onRetry={() => void status.refetch()} />;

  const myTeam = status.data?.team ?? null;
  const pending = new Map((myRequests.data ?? []).filter((r) => r.status === 'pending').map((r) => [r.team_id, r]));
  const canAsk = registered && !myTeam;
  const loaded = teams.data?.pages.flatMap((page) => page.items) ?? [];
  const shown = filterTeams(loaded, filter);
  const skills = (meta.data?.skills ?? SKILLS) as readonly Skill[];
  const setParam = (key: string, value: string) => setParams((p) => { p.set(key, value); return p; }, { replace: true });
  const setFilter = (next: TeamFilter) => setParams((p) => filterToParams(next, p), { replace: true });

  const cardActions = (team: TeamSummary) => {
    const request = pending.get(team.id);
    return (
      <>
        <Button size="sm" variant="ghost" onClick={() => setPeek(team)} aria-label={`Peek at ${team.name}`}>
          <Eye size={16} aria-hidden="true" /> Peek
        </Button>
        {request ? (
          <Button size="sm" variant="secondary" busy={withdraw.isPending && withdraw.variables === request.id} busyLabel="Withdrawing"
            onClick={() => withdraw.mutate(request.id)} aria-label={`Withdraw request to ${team.name}`}>Withdraw request</Button>
        ) : canAsk ? (
          <Button size="sm" variant="secondary" onClick={() => { createRequest.reset(); setAsking(team); }} aria-label={`Ask to join ${team.name}`}>
            Ask to join
          </Button>
        ) : null}
      </>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <HeroBanner titleId="page-title" title={hackathon.data?.name ?? 'Team board'}
        facts={<>
          <span className="inline-flex min-h-[36px] items-center rounded bg-surface px-3 text-ink shadow-1"><LiveDot status={stream} /></span>
          {hackathon.data && <HeroFact>Teams of {hackathon.data.min_team_size} to {hackathon.data.max_team_size}</HeroFact>}
          {hackathon.data && <HeroFact>Invite codes last {hackathon.data.invite_ttl_hours} h</HeroFact>}
          {teams.isSuccess && <HeroFact>{loaded.length}{teams.hasNextPage ? '+' : ''} teams with open seats</HeroFact>}
        </>}>
        <p className="max-w-[60ch] text-shell-ink2">Find a team that needs your skills, or fill the seats of yours. Every seat, team and request changes here the moment anyone acts.</p>
      </HeroBanner>

      <StatusPanel hid={hid} status={status.data} loading={status.isPending} />
      <ErrorNotice error={withdraw.error} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Tabs.Root value={tab} onValueChange={(next) => setParam('tab', next)} className="flex min-w-0 flex-col gap-4">
          <Tabs.List aria-label="Board" className="flex gap-1 self-start rounded-md border border-line bg-surface p-1 shadow-1">
            <Tabs.Trigger value="teams" className={TAB}>Teams</Tabs.Trigger>
            <Tabs.Trigger value="people" className={TAB}><Users size={16} aria-hidden="true" />People</Tabs.Trigger>
            <Tabs.Trigger value="activity" className={`${TAB} xl:hidden`}><Radio size={16} aria-hidden="true" />Live</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="teams" className="flex flex-col gap-4 outline-none">
            <BoardToolbar filter={filter} options={skills} onChange={setFilter} searchRef={searchRef} />
            {teams.isSuccess && isFiltering(filter) && (
              <p className="text-sm text-ink-2">{shown.length} of {loaded.length} loaded teams match.{teams.hasNextPage ? ' Load more teams to search further.' : ''}</p>
            )}
            {teams.isPending && <SkeletonCards count={6} label="Loading teams" />}
            {teams.error && <LoadError error={teams.error} onRetry={() => void teams.refetch()} />}
            {teams.isSuccess && loaded.length === 0 && (
              <EmptyState title="No team has an open seat right now">This board updates live. Create a team and it shows up here for everyone.</EmptyState>
            )}
            {teams.isSuccess && loaded.length > 0 && shown.length === 0 && (
              <EmptyState title="No loaded team matches">Change the search or skills, or load more teams.</EmptyState>
            )}
            {shown.length > 0 && <TeamGrid teams={shown} myTeamId={myTeam?.id ?? null} renderActions={cardActions} />}
            {teams.hasNextPage && (
              <Button variant="secondary" className="self-center" busy={teams.isFetchingNextPage} busyLabel="Loading"
                onClick={() => void teams.fetchNextPage()}>Load more teams</Button>
            )}
          </Tabs.Content>

          <Tabs.Content value="people" className="flex flex-col gap-4 outline-none">
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="People view" className="flex gap-2">
                <Button variant="secondary" aria-pressed={view === 'all'} onClick={() => setParam('view', 'all')}>Everyone looking</Button>
                <Button variant="secondary" aria-pressed={view === 'ranked'} onClick={() => setParam('view', 'ranked')} disabled={!registered}>
                  Best matches for {myTeam ? 'your team' : 'you'}
                </Button>
              </div>
              {view === 'all' && <SearchBox value={peopleQuery} onChange={setPeopleQuery} label="Search people by name" placeholder="Search people" />}
            </div>
            {view === 'all' ? (
              <>
                {people.isPending && <SkeletonCards count={6} label="Loading people" />}
                {people.error && <LoadError error={people.error} onRetry={() => void people.refetch()} />}
                {people.isSuccess && people.data.pages[0]?.items.length === 0 && (
                  <EmptyState title="Nobody is looking right now">People appear here when they turn on "Show me on the People board".</EmptyState>
                )}
                {people.data && <PeopleGrid people={filterPeople(people.data.pages.flatMap((page) => page.items), peopleQuery, [])} />}
                {people.hasNextPage && (
                  <Button variant="secondary" className="self-center" busy={people.isFetchingNextPage} busyLabel="Loading"
                    onClick={() => void people.fetchNextPage()}>Load more people</Button>
                )}
              </>
            ) : (
              <>
                {suggestions.isPending && <SkeletonCards count={4} grid={false} label="Ranking people" />}
                {suggestions.error && <LoadError error={suggestions.error} onRetry={() => void suggestions.refetch()} />}
                {suggestions.data && (
                  <p className="text-sm text-ink-2">
                    Ranked by the roles {myTeam ? 'your team is' : 'you are'} missing
                    {suggestions.data.context.missing_roles.length > 0 ? ` (${suggestions.data.context.missing_roles.join(', ')})` : ''},
                    working-hour overlap and profile completeness. Each bar shows how the score adds up.
                  </p>
                )}
                {suggestions.data?.items.length === 0 && <EmptyState title="Nobody to rank yet">Suggestions come from people who are looking.</EmptyState>}
                {suggestions.data && suggestions.data.items.length > 0 && <SuggestionList items={suggestions.data.items} />}
              </>
            )}
          </Tabs.Content>

          <Tabs.Content value="activity" className="outline-none xl:hidden">
            <ActivityFeed items={activity} />
          </Tabs.Content>
        </Tabs.Root>

        <aside aria-labelledby="activity-title" className="hidden xl:block">
          <div className="sticky top-8 flex flex-col gap-3">
            <h2 id="activity-title" className="flex items-center gap-2 font-bold"><Radio size={18} aria-hidden="true" />Live activity</h2>
            <ActivityFeed items={activity} />
          </div>
        </aside>
      </div>

      {registered && <MyRequests requests={myRequests.data ?? []} withdraw={withdraw} />}

      <BoardPeek team={peek} mine={peek?.id === myTeam?.id} canAsk={canAsk} pending={peek ? pending.has(peek.id) : false}
        onClose={() => setPeek(null)} onAsk={(team) => { setPeek(null); createRequest.reset(); setAsking(team); }} />
      <RequestDialog teamName={asking?.name ?? null} busy={createRequest.isPending} error={createRequest.error}
        onClose={() => setAsking(null)}
        onSend={(message) => asking && createRequest.mutate({ teamId: asking.id, message }, { onSuccess: () => setAsking(null) })} />
    </div>
  );
}
