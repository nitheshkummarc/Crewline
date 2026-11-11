// Team page: header with live seats, members, and the actions the caller is allowed to take.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import type { Member } from '../api/types';
import { FlapText, Lamp, SeatStrip } from '../components/Board';
import { Button, ButtonLink } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorNotice } from '../components/ErrorNotice';
import { ActionBar } from '../components/Layout';
import { EmptyState, LoadError, SkeletonRows } from '../components/LoadState';
import { RequestDialog } from '../components/RequestDialog';
import { SkillList } from '../components/Skills';
import { MemberList } from '../components/TeamParts';
import { useCreateRequest, useFinalizeTeam, useLeaveTeam, useRemoveMember, useReopenTeam, useWithdrawRequest } from '../hooks/mutations';
import { useMe, useMyRequests, useMyStatus, useTeam } from '../hooks/queries';
import { useEventStream } from '../hooks/useEventStream';
import { missingRoles } from '../lib/skills';
import { AuditSection, InviteSection, RequestsSection, Section, SettingsSection, SuggestionsSection } from './TeamSections';

type Confirm = 'leave' | 'finalize' | 'reopen' | { remove: Member } | null;

/** The page for one team. */
export default function TeamPage() {
  const { tid = '' } = useParams();
  const navigate = useNavigate();
  const me = useMe();
  const team = useTeam(tid);
  const hid = team.data?.hackathon_id ?? '';
  useEventStream(hid || undefined);
  const status = useMyStatus(hid);
  const myRequests = useMyRequests(hid, Boolean(hid) && Boolean(status.data?.registered));
  const leave = useLeaveTeam(hid, tid);
  const remove = useRemoveMember(tid);
  const finalize = useFinalizeTeam(tid);
  const reopen = useReopenTeam(tid);
  const ask = useCreateRequest(hid);
  const withdraw = useWithdrawRequest(hid);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [asking, setAsking] = useState(false);

  if (team.isPending || me.isPending) return <SkeletonRows rows={4} label="Loading team" />;
  if ((team.error instanceof ApiError && team.error.status === 404) || team.data === null) {
    return (
      <EmptyState title="This team no longer exists">
        The last member left, so the team was deleted. <Link to="/" className="underline underline-offset-[3px]">Back to hackathons</Link>.
      </EmptyState>
    );
  }
  if (team.error || !team.data || !me.data) return <LoadError error={team.error} onRetry={() => void team.refetch()} />;

  const data = team.data;
  const meId = me.data.id;
  const isMember = data.members.some((member) => member.user_id === meId);
  const isLeader = data.leader_id === meId;
  const open = data.max_size - data.member_count;
  const forming = data.status === 'forming';
  const pending = (myRequests.data ?? []).find((r) => r.team_id === data.id && r.status === 'pending');
  const canAsk = !isMember && forming && open > 0 && Boolean(status.data?.registered) && !status.data?.team && !pending;
  const others = data.members.length - 1;

  const confirmCopy = (() => {
    if (confirm === 'leave') {
      return {
        title: 'Leave this team?',
        body: others === 0 ? 'You are the last member, so the team is deleted.'
          : isLeader ? 'Leadership passes to the member who joined earliest.' : 'Your seat opens for someone else.',
        label: 'Leave team', busyLabel: 'Leaving', busy: leave.isPending, error: leave.error,
        run: () => leave.mutate(undefined, { onSuccess: () => navigate(`/h/${hid}`, { replace: true }) }),
      };
    }
    if (confirm === 'finalize') {
      return {
        title: 'Finalize the team?', body: `No one can join while it is finalized. You can reopen it later. It needs at least ${data.min_size} members.`,
        label: 'Finalize', busyLabel: 'Finalizing', busy: finalize.isPending, error: finalize.error,
        run: () => finalize.mutate(undefined, { onSuccess: () => setConfirm(null) }),
      };
    }
    if (confirm === 'reopen') {
      return {
        title: 'Reopen the team?', body: 'The team takes members again and shows on the board while seats are open.',
        label: 'Reopen', busyLabel: 'Reopening', busy: reopen.isPending, error: reopen.error,
        run: () => reopen.mutate(undefined, { onSuccess: () => setConfirm(null) }),
      };
    }
    if (confirm && typeof confirm === 'object') {
      const member = confirm.remove;
      return {
        title: `Remove ${member.display_name}?`, body: 'Their seat opens at once. They can ask to join again.',
        label: 'Remove', busyLabel: 'Removing', busy: remove.isPending, error: remove.error,
        run: () => remove.mutate(member.user_id, {
          onSuccess: () => {
            setConfirm(null);
            window.setTimeout(() => document.getElementById('members-title')?.focus(), 0);
          },
        }),
      };
    }
    return null;
  })();

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="page-title" className="flex flex-col gap-4 rounded-md bg-board p-4 text-paint md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Lamp tone={forming ? (open === 1 ? 'amber' : 'off') : 'red'} label={forming ? (open > 0 ? `${open} open` : 'Full') : 'Finalized'}
            className="cells text-[12px] text-paint-2" />
          {isMember && <Lamp tone="green" label={isLeader ? 'You lead this team' : 'Your team'} className="cells text-[12px] text-paint-2" />}
        </div>
        <h1 id="page-title" className="cells text-[28px] leading-8 md:text-[36px] md:leading-10"><FlapText value={data.name} /></h1>
        <div className="flex flex-wrap items-center gap-4">
          <SeatStrip taken={data.member_count} size={data.max_size} mine={isMember} />
          <FlapText value={`${data.member_count} of ${data.max_size} seats taken`} className="cells text-[14px]" />
          <span className="text-sm text-paint-2">Minimum {data.min_size} to finalize</span>
        </div>
        <SkillList skills={data.skills} full label="Team skills" />
        {missingRoles(data.skills).length > 0 && (
          <p className="text-sm text-paint-2">Missing core roles: {missingRoles(data.skills).join(', ')}</p>
        )}
      </section>

      {!isMember && (
        <ActionBar>
          {pending ? (
            <Button variant="secondary" busy={withdraw.isPending} busyLabel="Withdrawing" onClick={() => withdraw.mutate(pending.id)}>
              Withdraw your request
            </Button>
          ) : canAsk ? (
            <Button variant="primary" onClick={() => { ask.reset(); setAsking(true); }}>Ask to join</Button>
          ) : (
            <ButtonLink to={hid ? `/h/${hid}` : '/'} variant="secondary">Back to the board</ButtonLink>
          )}
        </ActionBar>
      )}
      <ErrorNotice error={withdraw.error} />
      {!isMember && !canAsk && !pending && (
        <p className="text-room-ink2">
          {!forming ? 'This team is finalized and not taking members.' : open === 0 ? 'Every seat is taken.'
            : status.data?.team ? 'You are already in a team in this hackathon.' : 'Register for this hackathon on its board to ask to join.'}
        </p>
      )}

      <Section id="members-title" title={`Members (${data.members.length})`}>
        <MemberList members={data.members} meId={meId} canRemove={isLeader} removingId={remove.isPending ? remove.variables ?? null : null}
          onRemove={(member) => { remove.reset(); setConfirm({ remove: member }); }} />
      </Section>

      {isLeader && <RequestsSection team={data} />}
      {isMember && <InviteSection team={data} isLeader={isLeader} />}
      {isMember && forming && open > 0 && <SuggestionsSection hackathonId={hid} />}
      {isLeader && <SettingsSection team={data} />}

      {isMember && (
        <Section id="actions-title" title="Team actions">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {isLeader && forming && (
              <Button variant={open === 0 ? 'primary' : 'secondary'} disabled={data.member_count < data.min_size}
                onClick={() => { finalize.reset(); setConfirm('finalize'); }}>Finalize team</Button>
            )}
            {isLeader && !forming && <Button variant="danger" onClick={() => { reopen.reset(); setConfirm('reopen'); }}>Reopen team</Button>}
            <Button variant="danger" className="sm:ml-auto" onClick={() => { leave.reset(); setConfirm('leave'); }}>Leave team</Button>
          </div>
          {isLeader && forming && data.member_count < data.min_size && (
            <p className="text-sm text-room-ink2">Finalize needs at least {data.min_size} members.</p>
          )}
        </Section>
      )}

      {isMember && <AuditSection team={data} />}

      {confirmCopy && (
        <ConfirmDialog open onOpenChange={(next) => { if (!next) setConfirm(null); }} title={confirmCopy.title} body={confirmCopy.body}
          confirmLabel={confirmCopy.label} busyLabel={confirmCopy.busyLabel} busy={confirmCopy.busy} error={confirmCopy.error}
          onConfirm={confirmCopy.run} tone={confirm === 'finalize' ? 'primary' : 'danger'} />
      )}
      <RequestDialog teamName={asking ? data.name : null} busy={ask.isPending} error={ask.error} onClose={() => setAsking(false)}
        onSend={(message) => ask.mutate({ teamId: data.id, message }, { onSuccess: () => setAsking(false) })} />
    </div>
  );
}
