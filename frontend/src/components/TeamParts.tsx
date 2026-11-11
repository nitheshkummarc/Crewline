// Team page parts: member list, pending requests, invite code box, audit log.
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import type { AuditEvent, Invite, JoinRequest, Member } from '../api/types';
import { formatZone, relativeTime, timeUntil } from '../lib/time';
import { Button } from './Button';
import { Lamp } from './Board';
import { SkillList } from './Skills';

interface MemberListProps {
  members: Member[];
  meId: string;
  canRemove: boolean;
  removingId: string | null;
  onRemove: (member: Member) => void;
}

/** Team members with the leader marked; the leader sees a remove button for everyone else. */
export function MemberList({ members, meId, canRemove, removingId, onRemove }: MemberListProps) {
  return (
    <ul className="divide-y divide-flap-seam overflow-hidden rounded-md bg-board" aria-label="Members">
      {members.map((member) => (
        <li key={member.user_id} id={`member-${member.user_id}`} tabIndex={-1}
          className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-center">
          <span className="flex items-center gap-3">
            <span className="cells truncate text-[15px] text-paint">{member.display_name}</span>
            {member.is_leader && <Lamp tone="green" label="Leader" className="cells text-[12px] text-paint-2" />}
            {member.user_id === meId && <span className="cells text-[12px] text-paint-2">You</span>}
          </span>
          <span className="text-sm text-paint-2">{formatZone(member.timezone)}</span>
          <SkillList skills={member.skills} full label={`Skills of ${member.display_name}`} />
          <span className="md:justify-self-end">
            {canRemove && member.user_id !== meId && (
              <Button variant="danger" busy={removingId === member.user_id} busyLabel="Removing"
                onClick={() => onRemove(member)} aria-label={`Remove ${member.display_name}`}>
                Remove
              </Button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface RequestListProps {
  requests: JoinRequest[];
  teamFull: boolean;
  busyId: string | null;
  onAccept: (request: JoinRequest) => void;
  onDecline: (request: JoinRequest) => void;
}

/** Pending join requests, oldest first, with accept (disabled while the team is full) and decline. */
export function RequestList({ requests, teamFull, busyId, onAccept, onDecline }: RequestListProps) {
  return (
    <ul className="divide-y divide-room-line rounded-md border border-room-line" aria-label="Pending requests">
      {requests.map((request) => (
        <li key={request.id} id={`request-${request.id}`} tabIndex={-1} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{request.display_name}</p>
            {request.message && <p className="mt-1 text-sm text-room-ink2">"{request.message}"</p>}
            <p className="mt-1 text-sm text-room-ink2">Asked {relativeTime(request.created_at)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={teamFull || busyId !== null} busy={busyId === request.id}
              busyLabel="Accepting" onClick={() => onAccept(request)}
              aria-label={`Accept ${request.display_name}`} title={teamFull ? 'The team is full' : undefined}>
              Accept
            </Button>
            <Button variant="quiet" disabled={busyId !== null} onClick={() => onDecline(request)}
              aria-label={`Decline ${request.display_name}`}>
              Decline
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The invite code with a copy button, a share link and its expiry; members only. `primary` makes copy the page's main action. */
export function InviteCodeBox({ invite, hackathonId, primary = false }: { invite: Invite; hackathonId: string; primary?: boolean }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  // The API already returns the code formatted as XXXXX-XXXXX (api.md).
  const code = invite.code;
  const link = `${window.location.origin}/h/${hackathonId}/join?code=${code}`;
  const copy = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? code : link);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-md bg-board p-4 text-paint">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flap-tile cells px-3 py-2 text-[22px] leading-7 tracking-[0.12em]" aria-label={`Invite code ${code.split('').join(' ')}`}>
          {code}
        </span>
        <Button variant={primary ? 'primary' : 'board'} onClick={() => void copy('code')}>
          {copied === 'code' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied === 'code' ? 'Copied' : 'Copy code'}
        </Button>
        <Button variant="board" onClick={() => void copy('link')}>
          {copied === 'link' ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      <p className="text-sm text-paint-2">Expires in {timeUntil(invite.expires_at)}. Anyone with the code can join while a seat is open.</p>
    </div>
  );
}

const ACTION_TEXT: Record<string, string> = {
  team_created: 'created the team',
  team_updated: 'changed the team settings',
  member_joined_via_code: 'joined with the invite code',
  request_accepted: 'accepted a join request',
  request_created: 'asked to join',
  request_declined: 'declined a join request',
  request_withdrawn: 'withdrew a join request',
  request_stale: 'a request went stale',
  member_left: 'left the team',
  member_removed: 'removed a member',
  leader_promoted: 'became leader',
  team_finalized: 'finalized the team',
  team_reopened: 'reopened the team',
  team_deleted: 'deleted the team',
  invite_regenerated: 'replaced the invite code',
  member_profile_updated: 'updated their profile',
};

/** Team audit events, newest first: who did what and when. */
export function AuditList({ events, names }: { events: AuditEvent[]; names: Map<string, string> }) {
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {events.map((event) => (
        <li key={event.seq} className="grid grid-cols-[84px_minmax(0,1fr)] gap-3">
          <time dateTime={event.created_at} className="cells text-[12px] text-room-ink2">{relativeTime(event.created_at)}</time>
          <span>
            <span className="font-semibold">{event.actor_id ? names.get(event.actor_id) ?? 'A former member' : 'System'}</span>{' '}
            {ACTION_TEXT[event.action] ?? event.action.replace(/_/g, ' ')}
          </span>
        </li>
      ))}
    </ol>
  );
}
