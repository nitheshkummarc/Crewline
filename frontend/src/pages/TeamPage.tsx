// Team page: hero in the team's band color, members and leader tools, invite and actions on the side.
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import type { Member } from '../api/types';
import { Button, ButtonLink } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorNotice } from '../components/ErrorNotice';
import { ActionBar } from '../components/Layout';
import { EmptyState, LoadError, SkeletonCards } from '../components/LoadState';
import { RequestDialog } from '../components/RequestDialog';
import { LiveDot, SeatTabs, StateTag } from '../components/Seats';
import { SkillList } from '../components/Skills';
import { MemberList } from '../components/TeamParts';
import { useCreateRequest, useFinalizeTeam, useLeaveTeam, useRemoveMember, useReopenTeam, useWithdrawRequest } from '../hooks/mutations';
import { useMe, useMyRequests, useMyStatus, useTeam } from '../hooks/queries';
import { useCurrentHackathon, useShell } from '../hooks/useShell';
import { missingRoles } from '../lib/skills';
import { bandStyle } from '../lib/teamColor';
import { teamConfirmCopy, type Confirm } from './teamConfirm';
import { AuditSection, InviteSection, RequestsSection, Section, SettingsSection, SuggestionsSection } from './TeamSections';

/** The page for one team. */
export default function TeamPage() {
  const { tid = '' } = useParams();
  const navigate = useNavigate();
  const me = useMe();
  const team = useTeam(tid);
  const hid = team.data?.hackathon_id ?? '';
  useCurrentHackathon(hid);
  const { stream } = useShell();
  const status = useMyStatus(hid);
  const myRequests = useMyRequests(hid, Boolean(status.data?.registered));
  const leave = useLeaveTeam(hid, tid);
  const remove = useRemoveMember(tid);
  const finalize = useFinalizeTeam(tid);
  const reopen = useReopenTeam(tid);
  const ask = useCreateRequest(hid);
  const withdraw = useWithdrawRequest(hid);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [asking, setAsking] = useState(false);

  if (team.isPending || me.isPending) return <SkeletonCards count={2} grid={false} label="Loading team" />;
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
  const needs = missingRoles(data.skills);
  const copy = teamConfirmCopy({
    confirm, team: data, isLeader, leave, finalize, reopen, remove,
    onLeft: () => navigate(`/h/${hid}`, { replace: true }),
    onClose: () => setConfirm(null),
  });

  return (
    <div className="flex flex-col gap-8">
      <Link to={`/h/${hid}`} className="inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> Board
      </Link>

      <section aria-labelledby="page-title" style={bandStyle(data.id)} className="band relative overflow-hidden rounded-lg p-6 shadow-2 md:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <StateTag team={data} mine={isMember} />
          {isLeader && <span className="rounded-sm bg-band-ink px-2 py-[2px] text-[12px] font-bold uppercase tracking-wide text-[var(--band)]">You lead this team</span>}
          <span className="ml-auto rounded-sm bg-surface px-2 py-1 text-ink"><LiveDot status={stream} /></span>
        </div>
        <h1 id="page-title" className="display mt-4 text-[34px] leading-[40px] md:text-[52px] md:leading-[58px]">{data.name}</h1>
        <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3">
          <SeatTabs taken={data.member_count} size={data.max_size} large onBand />
          <p className="num text-lg font-semibold">{data.member_count} of {data.max_size} seats taken</p>
          <p className="opacity-80">Minimum {data.min_size} to finalize</p>
        </div>
        <div className="mt-5 grid gap-4 rounded-md bg-surface p-4 text-ink shadow-1 md:grid-cols-2">
          <div className="flex flex-col gap-2"><span className="label">Has</span><SkillList skills={data.skills} label="Team skills" empty="No skills listed yet" /></div>
          <div className="flex flex-col gap-2"><span className="label">Needs</span><SkillList skills={needs} need label="Missing core roles" empty="All core roles covered" /></div>
        </div>
      </section>

      {!isMember && (
        <div className="flex flex-col gap-3">
          <ActionBar>
            {pending ? (
              <Button variant="secondary" busy={withdraw.isPending} busyLabel="Withdrawing" onClick={() => withdraw.mutate(pending.id)}>Withdraw your request</Button>
            ) : canAsk ? (
              <Button variant="primary" onClick={() => { ask.reset(); setAsking(true); }}>Ask to join</Button>
            ) : (
              <ButtonLink to={hid ? `/h/${hid}` : '/'} variant="secondary">Back to the board</ButtonLink>
            )}
          </ActionBar>
          <ErrorNotice error={withdraw.error} />
          {!canAsk && !pending && (
            <p className="text-ink-2">
              {!forming ? 'This team is finalized and not taking members.' : open === 0 ? 'Every seat is taken.'
                : status.data?.team ? 'You are already in a team in this hackathon.' : 'Register for this hackathon on its board to ask to join.'}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section id="members-title" title={`Members (${data.members.length})`}>
            <MemberList members={data.members} meId={meId} canRemove={isLeader} removingId={remove.isPending ? remove.variables ?? null : null}
              onRemove={(member: Member) => { remove.reset(); setConfirm({ remove: member }); }} />
          </Section>
          {isLeader && <RequestsSection team={data} />}
          {isMember && forming && open > 0 && <SuggestionsSection hackathonId={hid} />}
          {isMember && <AuditSection team={data} />}
        </div>
        {isMember && (
          <aside className="flex flex-col gap-8" aria-label="Invite and team actions">
            <InviteSection team={data} isLeader={isLeader} />
            {isLeader && <SettingsSection team={data} />}
            <Section id="actions-title" title="Team actions">
              <div className="card flex flex-col gap-3 p-4">
                {isLeader && forming && (
                  <>
                    <Button variant={open === 0 ? 'primary' : 'secondary'} disabled={data.member_count < data.min_size}
                      onClick={() => { finalize.reset(); setConfirm('finalize'); }}>Finalize team</Button>
                    {data.member_count < data.min_size && <p className="text-sm text-ink-2">Finalize needs at least {data.min_size} members.</p>}
                  </>
                )}
                {isLeader && !forming && <Button variant="secondary" onClick={() => { reopen.reset(); setConfirm('reopen'); }}>Reopen team</Button>}
                <hr className="border-line" />
                <Button variant="danger" onClick={() => { leave.reset(); setConfirm('leave'); }}>Leave team</Button>
              </div>
            </Section>
          </aside>
        )}
      </div>

      {copy && (
        <ConfirmDialog open onOpenChange={(next) => { if (!next) setConfirm(null); }} title={copy.title} body={copy.body}
          confirmLabel={copy.label} busyLabel={copy.busyLabel} busy={copy.busy} error={copy.error}
          onConfirm={copy.run} tone={confirm === 'finalize' || confirm === 'reopen' ? 'neutral' : 'danger'} />
      )}
      <RequestDialog teamName={asking ? data.name : null} busy={ask.isPending} error={ask.error} onClose={() => setAsking(false)}
        onSend={(message) => ask.mutate({ teamId: data.id, message }, { onSuccess: () => setAsking(false) })} />
    </div>
  );
}
