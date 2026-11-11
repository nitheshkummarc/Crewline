// Team page parts: member cards, pending requests, invite card with copy and QR code, history timeline.
import { Check, Copy, Crown, QrCode, Link as LinkIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import type { AuditEvent, Invite, JoinRequest, Member } from '../api/types';
import { formatZone, relativeTime, timeUntil } from '../lib/time';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { localTime } from './People';
import { SkillList } from './Skills';

interface MemberListProps {
  members: Member[];
  meId: string;
  canRemove: boolean;
  removingId: string | null;
  onRemove: (member: Member) => void;
}

/** Team members as cards with the leader marked; the leader sees a remove button for everyone else. */
export function MemberList({ members, meId, canRemove, removingId, onRemove }: MemberListProps) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Members">
      {members.map((member) => (
        <li key={member.user_id} id={`member-${member.user_id}`} tabIndex={-1} className="card flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <Avatar id={member.user_id} name={member.display_name} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate font-semibold">
                {member.display_name}
                {member.user_id === meId && <span className="text-sm font-normal text-ink-2">(you)</span>}
              </p>
              <p className="truncate text-sm text-ink-2">{formatZone(member.timezone)} · <span className="num">{localTime(member.timezone)}</span></p>
            </div>
            {member.is_leader && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-plate px-2 py-[2px] text-[12px] font-bold uppercase tracking-wide text-plate-ink">
                <Crown size={12} aria-hidden="true" /> Leader
              </span>
            )}
          </div>
          <SkillList skills={member.skills} label={`Skills of ${member.display_name}`} />
          {canRemove && member.user_id !== meId && (
            <Button variant="danger" size="sm" className="self-start" busy={removingId === member.user_id} busyLabel="Removing"
              onClick={() => onRemove(member)} aria-label={`Remove ${member.display_name}`}>
              Remove
            </Button>
          )}
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
    <ul className="flex flex-col gap-3" aria-label="Pending requests">
      {requests.map((request) => (
        <li key={request.id} id={`request-${request.id}`} tabIndex={-1} className="card flex flex-col gap-3 p-4 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Avatar id={request.user_id} name={request.display_name} />
            <div className="min-w-0">
              <p className="font-semibold">{request.display_name} <span className="text-sm font-normal text-ink-2">· {relativeTime(request.created_at)}</span></p>
              {request.message && <p className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-sm">"{request.message}"</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={teamFull || busyId !== null} busy={busyId === request.id} busyLabel="Accepting"
              onClick={() => onAccept(request)} aria-label={`Accept ${request.display_name}`} title={teamFull ? 'The team is full' : undefined}>
              <Check size={16} aria-hidden="true" /> Accept
            </Button>
            <Button variant="ghost" disabled={busyId !== null} onClick={() => onDecline(request)} aria-label={`Decline ${request.display_name}`}>
              Decline
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The invite code with copy buttons, a scannable QR code of the join link, and its expiry; members only. */
export function InviteCard({ invite, hackathonId, primary = false }: { invite: Invite; hackathonId: string; primary?: boolean }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [showQr, setShowQr] = useState(false);
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
    <div className="card flex flex-col gap-4 p-5">
      <p className="num select-all text-center font-mono text-[28px] font-bold tracking-[0.14em]" aria-label={`Invite code ${code.split('').join(' ')}`}>
        {code}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant={primary ? 'primary' : 'secondary'} onClick={() => void copy('code')}>
          {copied === 'code' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied === 'code' ? 'Copied' : 'Copy code'}
        </Button>
        <Button variant="secondary" onClick={() => void copy('link')}>
          {copied === 'link' ? <Check size={16} aria-hidden="true" /> : <LinkIcon size={16} aria-hidden="true" />}
          {copied === 'link' ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      <Button variant="ghost" size="sm" aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
        <QrCode size={16} aria-hidden="true" /> {showQr ? 'Hide QR code' : 'Show QR code to scan'}
      </Button>
      {showQr && (
        <div role="img" aria-label={`QR code for the join link of code ${code}`} className="mx-auto rounded-md bg-paper p-3">
          <QRCodeSVG value={link} size={176} level="M" aria-hidden="true" />
        </div>
      )}
      <p className="text-center text-sm text-ink-2">Expires in {timeUntil(invite.expires_at)}. Anyone with the code can join while a seat is open.</p>
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

/** Team audit events as a timeline, newest first: who did what and when. */
export function AuditTimeline({ events, names }: { events: AuditEvent[]; names: Map<string, string> }) {
  return (
    <ol className="relative flex flex-col gap-4 border-l-2 border-line pl-5">
      {events.map((event) => (
        <li key={event.seq} className="relative text-sm">
          <span aria-hidden="true" className="absolute -left-[27px] top-[6px] h-3 w-3 rounded-avatar border-2 border-surface bg-control" />
          <span className="font-semibold">{event.actor_id ? names.get(event.actor_id) ?? 'A former member' : 'System'}</span>{' '}
          {ACTION_TEXT[event.action] ?? event.action.replace(/_/g, ' ')}
          <time dateTime={event.created_at} className="ml-2 text-ink-2">{relativeTime(event.created_at)}</time>
        </li>
      ))}
    </ol>
  );
}
