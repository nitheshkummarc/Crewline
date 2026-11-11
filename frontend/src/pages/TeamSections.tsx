// Team page sections that own their data: requests (leader), invite, settings (leader), suggestions, audit.
import * as Switch from '@radix-ui/react-switch';
import { useRef, useState, type FormEvent } from 'react';
import type { JoinRequest, TeamDetail } from '../api/types';
import { errorCode } from '../lib/errors';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorNotice } from '../components/ErrorNotice';
import { TextField } from '../components/Field';
import { EmptyState, LoadError, SkeletonCards } from '../components/LoadState';
import { SuggestionList } from '../components/People';
import { AuditTimeline, InviteCard, RequestList } from '../components/TeamParts';
import { useAcceptRequest, useDeclineRequest, useRegenerateInvite, useUpdateTeam } from '../hooks/mutations';
import { useInvite, useSuggestions, useTeamAudit, useTeamRequests } from '../hooks/queries';
import { LIMITS, teamNameSchema, validate } from '../lib/validation';

/** A titled section of the team page. */
export function Section({ id, title, aside, children }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} tabIndex={-1} className="text-lg font-bold outline-none">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Pending requests with accept and decline; focus moves to the next request or the heading after each decision. */
export function RequestsSection({ team }: { team: TeamDetail }) {
  const requests = useTeamRequests(team.id, true);
  const accept = useAcceptRequest(team.id);
  const decline = useDeclineRequest(team.id);
  const [busyId, setBusyId] = useState<string | null>(null);
  const full = team.member_count >= team.max_size;

  const moveFocus = (decided: JoinRequest) => {
    const list = requests.data ?? [];
    const index = list.findIndex((r) => r.id === decided.id);
    const next = list[index + 1] ?? list[index - 1];
    window.setTimeout(() => {
      const target = next ? document.getElementById(`request-${next.id}`) : document.getElementById('requests-title');
      target?.focus();
    }, 0);
  };
  const decide = (request: JoinRequest, action: 'accept' | 'decline') => {
    setBusyId(request.id);
    const mutation = action === 'accept' ? accept : decline;
    moveFocus(request);
    mutation.mutate(request.id, {
      onSettled: () => setBusyId(null),
      onError: (error) => {
        if (errorCode(error) === 'request_not_pending') void requests.refetch();
      },
    });
  };

  return (
    <Section id="requests-title" title="Requests to join">
      {full && team.status === 'forming' && <p className="text-sm text-ink-2">The team is full. Accept is off until a seat opens.</p>}
      <ErrorNotice error={accept.error ?? decline.error} />
      {requests.isPending && <SkeletonCards count={1} grid={false} label="Loading requests" />}
      {requests.error && <LoadError error={requests.error} onRetry={() => void requests.refetch()} />}
      {requests.data?.length === 0 && <EmptyState title="No requests waiting">Requests appear here live when someone asks to join.</EmptyState>}
      {requests.data && requests.data.length > 0 && (
        <RequestList requests={requests.data} teamFull={full || team.status !== 'forming'} busyId={busyId}
          onAccept={(r) => decide(r, 'accept')} onDecline={(r) => decide(r, 'decline')} />
      )}
    </Section>
  );
}

/** Invite code for members; the leader can replace it after a confirmation. */
export function InviteSection({ team, isLeader }: { team: TeamDetail; isLeader: boolean }) {
  const invite = useInvite(team.id, true);
  const regenerate = useRegenerateInvite(team.id);
  const [confirming, setConfirming] = useState(false);
  return (
    <Section id="invite-title" title="Invite code">
      {invite.isPending && <SkeletonCards count={1} grid={false} label="Loading invite code" />}
      {invite.error && <LoadError error={invite.error} onRetry={() => void invite.refetch()} />}
      {invite.data && (
        <InviteCard invite={invite.data} hackathonId={team.hackathon_id}
          primary={team.status === 'forming' && team.member_count < team.max_size} />
      )}
      {isLeader && (
        <Button variant="ghost" size="sm" className="self-center" onClick={() => { regenerate.reset(); setConfirming(true); }}>
          Replace the code
        </Button>
      )}
      <ConfirmDialog open={confirming} onOpenChange={setConfirming} title="Replace the invite code?"
        body="The current code stops working at once. Anyone you already sent it to needs the new one."
        confirmLabel="Replace code" busyLabel="Replacing" busy={regenerate.isPending} error={regenerate.error}
        onConfirm={() => regenerate.mutate(undefined, { onSuccess: () => setConfirming(false) })} />
    </Section>
  );
}

/** Leader settings: rename and whether the team shows on the board. */
export function SettingsSection({ team }: { team: TeamDetail }) {
  const update = useUpdateTeam(team.id);
  const [name, setName] = useState(team.name);
  const [nameError, setNameError] = useState<string | undefined>();
  const lastSaved = useRef(team.name);
  if (lastSaved.current !== team.name) {
    lastSaved.current = team.name;
    setName(team.name);
  }
  const rename = (event: FormEvent) => {
    event.preventDefault();
    const result = validate(teamNameSchema, { name });
    setNameError(result.errors?.name);
    if (result.data && result.data.name !== team.name) update.mutate({ name: result.data.name });
  };
  return (
    <Section id="settings-title" title="Team settings">
      <form noValidate onSubmit={rename} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <TextField label="Team name" value={name} maxLength={LIMITS.teamNameMax + 10} error={nameError}
            onChange={(event) => setName(event.target.value)} />
        </div>
        <Button type="submit" variant="secondary" busy={update.isPending && update.variables?.name !== undefined} busyLabel="Saving">
          Rename
        </Button>
      </form>
      <div className="flex min-h-touch items-center gap-3">
        <Switch.Root id="team-looking-switch" checked={team.looking} disabled={update.isPending} onCheckedChange={(looking) => update.mutate({ looking })}
          className="press relative h-7 w-12 shrink-0 rounded-md border border-control bg-control data-[state=checked]:border-ok data-[state=checked]:bg-ok">
          <Switch.Thumb className="block h-5 w-5 translate-x-[3px] rounded bg-surface shadow-1 transition-transform duration-150 data-[state=checked]:translate-x-[23px]" />
        </Switch.Root>
        <label htmlFor="team-looking-switch">List the team on the board while seats are open</label>
      </div>
      <ErrorNotice error={update.error} />
    </Section>
  );
}

/** Ranked people who would fill the team's missing roles. */
export function SuggestionsSection({ hackathonId }: { hackathonId: string }) {
  const suggestions = useSuggestions(hackathonId);
  return (
    <Section id="suggestions-title" title="People who fill your gaps">
      {suggestions.isPending && <SkeletonCards count={2} grid={false} label="Ranking people" />}
      {suggestions.error && <LoadError error={suggestions.error} onRetry={() => void suggestions.refetch()} />}
      {suggestions.data?.items.length === 0 && <EmptyState title="Nobody to rank yet">Suggestions come from people who are looking.</EmptyState>}
      {suggestions.data && suggestions.data.items.length > 0 && (
        <>
          <p className="text-sm text-ink-2">Share your invite code with them, or ask them to request a seat.</p>
          <SuggestionList items={suggestions.data.items.slice(0, 4)} />
        </>
      )}
    </Section>
  );
}

/** The team's audit log with paging. */
export function AuditSection({ team }: { team: TeamDetail }) {
  const audit = useTeamAudit(team.id, true);
  const names = new Map(team.members.map((member) => [member.user_id, member.display_name]));
  const events = audit.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Section id="audit-title" title="Team history">
      {audit.isPending && <SkeletonCards count={2} grid={false} label="Loading team history" />}
      {audit.error && <LoadError error={audit.error} onRetry={() => void audit.refetch()} />}
      {events.length > 0 && <AuditTimeline events={events} names={names} />}
      {audit.hasNextPage && (
        <Button variant="secondary" className="self-start" busy={audit.isFetchingNextPage} busyLabel="Loading"
          onClick={() => void audit.fetchNextPage()}>Show older entries</Button>
      )}
    </Section>
  );
}
