// Board status panel (register, your team, or create and join with the looking switch) and the caller's requests.
//
// Contents:
//   StatusPanel: The caller's place in the hackathon with the page's one primary action.
//   MyRequests: The caller's join requests with their status and withdraw for pending ones.
import * as Switch from '@radix-ui/react-switch';
import type { UseMutationResult } from '@tanstack/react-query';
import { ArrowRight, KeyRound, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { JoinRequest, MyStatus } from '../api/types';
import { Button, ButtonLink } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { ActionBar } from '../components/Layout';
import { SeatTabs } from '../components/Seats';
import { useRegister, useSetLooking } from '../hooks/mutations';
import { bandStyle } from '../lib/teamColor';
import { relativeTime } from '../lib/time';

/** The caller's place in the hackathon with the page's one primary action. */
export function StatusPanel({ hid, status, loading }: { hid: string; status: MyStatus | undefined; loading: boolean }) {
  const register = useRegister(hid);
  const looking = useSetLooking(hid);
  if (loading || !status) return <div className="h-28 animate-pulse rounded-lg bg-surface-2" role="status" aria-label="Loading your status" />;

  if (!status.registered) {
    return (
      <section aria-label="Your status" className="card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-lg font-bold">You are not registered for this hackathon yet</p>
          <p className="text-ink-2">Register to create a team, join one, or show up on the People board.</p>
        </div>
        <ErrorNotice error={register.error} />
        <ActionBar>
          <Button variant="primary" busy={register.isPending} busyLabel="Registering" onClick={() => register.mutate()}>Register for this hackathon</Button>
        </ActionBar>
      </section>
    );
  }

  const team = status.team;
  if (team) {
    return (
      <section aria-label="Your status" style={bandStyle(team.id)} className="card overflow-hidden md:flex">
        <div className="band flex flex-1 flex-col gap-3 p-5">
          <p className="label !text-band-ink opacity-80">Your team</p>
          <Link to={`/teams/${team.id}`} className="display text-[26px] leading-8 hover:underline">{team.name}</Link>
          <div className="flex items-center gap-4"><SeatTabs taken={team.member_count} size={team.max_size} large onBand />
            <span className="num font-semibold">{team.member_count} of {team.max_size} seats taken</span></div>
        </div>
        <div className="flex items-center p-5">
          <ActionBar><ButtonLink to={`/teams/${team.id}`} variant="primary">Open your team <ArrowRight size={16} aria-hidden="true" /></ButtonLink></ActionBar>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Your status" className="card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col gap-3">
        <p className="text-lg font-bold">You are not in a team yet</p>
        <div className="flex min-h-touch items-center gap-3">
          <Switch.Root id="looking-switch" checked={status.looking} disabled={looking.isPending}
            onCheckedChange={(checked) => looking.mutate(checked)}
            className="press relative h-7 w-12 shrink-0 rounded-md border border-control bg-control data-[state=checked]:border-ok data-[state=checked]:bg-ok">
            <Switch.Thumb className="block h-5 w-5 translate-x-[3px] rounded bg-surface shadow-1 transition-transform duration-150 data-[state=checked]:translate-x-[23px]" />
          </Switch.Root>
          <label htmlFor="looking-switch">Show me on the People board so teams can find me</label>
        </div>
        <ErrorNotice error={looking.error} />
      </div>
      <ActionBar>
        <ButtonLink to={`/h/${hid}/teams/new`} variant="primary"><Plus size={16} aria-hidden="true" /> Create a team</ButtonLink>
        <ButtonLink to={`/h/${hid}/join`} variant="secondary"><KeyRound size={16} aria-hidden="true" /> Join with a code</ButtonLink>
      </ActionBar>
    </section>
  );
}

const STATUS_TONE: Record<JoinRequest['status'], string> = {
  pending: 'bg-warn text-surface', accepted: 'bg-ok text-surface', declined: 'bg-surface-2 text-ink-2',
  withdrawn: 'bg-surface-2 text-ink-2', stale: 'bg-surface-2 text-ink-2',
};

/** The caller's join requests with their status and withdraw for pending ones. */
export function MyRequests({ requests, withdraw }: { requests: JoinRequest[]; withdraw: UseMutationResult<JoinRequest, Error, string, unknown> }) {
  if (requests.length === 0) return null;
  return (
    <section aria-labelledby="requests-title" className="flex flex-col gap-3">
      <h2 id="requests-title" className="text-lg font-bold">Your requests</h2>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {requests.map((request) => (
          <li key={request.id} style={bandStyle(request.team_id)} className="card flex items-center gap-3 overflow-hidden pr-3">
            <span aria-hidden="true" className="band h-full w-2 self-stretch" />
            <span className="min-w-0 flex-1 py-3">
              <Link to={`/teams/${request.team_id}`} className="block truncate font-semibold hover:underline">{request.team_name}</Link>
              <span className="text-sm text-ink-2">{relativeTime(request.created_at)}</span>
            </span>
            <span className={`rounded-sm px-2 py-[2px] text-[12px] font-bold uppercase ${STATUS_TONE[request.status]}`}>{request.status}</span>
            {request.status === 'pending' && (
              <Button size="sm" variant="ghost" busy={withdraw.isPending && withdraw.variables === request.id} busyLabel="Withdrawing"
                onClick={() => withdraw.mutate(request.id)} aria-label={`Withdraw request to ${request.team_name}`}>Withdraw</Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
