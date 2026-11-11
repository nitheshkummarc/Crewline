// Team peek: a sheet with a team's members and needs, opened from a board card without leaving the board.
import { ArrowRight } from 'lucide-react';
import type { TeamSummary } from '../api/types';
import { Avatar } from '../components/Avatar';
import { Button, ButtonLink } from '../components/Button';
import { LoadError } from '../components/LoadState';
import { SeatTabs, StateTag } from '../components/Seats';
import { Sheet } from '../components/Sheet';
import { SkillList } from '../components/Skills';
import { useTeam } from '../hooks/queries';
import { missingRoles } from '../lib/skills';
import { bandStyle } from '../lib/teamColor';
import { formatZone } from '../lib/time';

interface Props {
  team: TeamSummary | null;
  mine: boolean;
  canAsk: boolean;
  pending: boolean;
  onAsk: (team: TeamSummary) => void;
  onClose: () => void;
}

/** Members of the peeked team (loaded when the sheet opens). */
function PeekMembers({ teamId }: { teamId: string }) {
  const detail = useTeam(teamId);
  if (detail.isPending) {
    return <div role="status" aria-label="Loading members" className="flex flex-col gap-3">{[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded-md bg-surface-2" />)}</div>;
  }
  if (detail.error || !detail.data) return <LoadError error={detail.error} onRetry={() => void detail.refetch()} />;
  return (
    <ul className="flex flex-col gap-3" aria-label="Members">
      {detail.data.members.map((member) => (
        <li key={member.user_id} className="flex items-center gap-3">
          <Avatar id={member.user_id} name={member.display_name} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{member.display_name}{member.is_leader && <span className="ml-2 text-[12px] font-bold uppercase text-ink-2">Leader</span>}</span>
            <span className="block truncate text-sm text-ink-2">{formatZone(member.timezone)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The peek sheet for one team. */
export function BoardPeek({ team, mine, canAsk, pending, onAsk, onClose }: Props) {
  return (
    <Sheet open={team !== null} onOpenChange={(open) => { if (!open) onClose(); }} style={team ? bandStyle(team.id) : undefined}
      title={team?.name ?? ''} description={team ? `${team.member_count} of ${team.max_size} seats taken` : undefined}
      header={team && <div className="mt-4 flex items-center justify-between"><SeatTabs taken={team.member_count} size={team.max_size} large onBand /><StateTag team={team} mine={mine} /></div>}>
      {team && (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3" aria-labelledby="peek-members"><h3 id="peek-members" className="label">Members</h3><PeekMembers teamId={team.id} /></section>
          <section className="flex flex-col gap-2" aria-labelledby="peek-has"><h3 id="peek-has" className="label">Has</h3><SkillList skills={team.skills} /></section>
          {missingRoles(team.skills).length > 0 && (
            <section className="flex flex-col gap-2" aria-labelledby="peek-needs"><h3 id="peek-needs" className="label">Needs</h3><SkillList skills={missingRoles(team.skills)} need /></section>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            {canAsk && !pending && <Button variant="secondary" onClick={() => onAsk(team)}>Ask to join</Button>}
            {pending && <p className="text-sm text-ink-2">Your request is waiting for the leader.</p>}
            <ButtonLink to={`/teams/${team.id}`} variant="ghost">Open team page <ArrowRight size={16} aria-hidden="true" /></ButtonLink>
          </div>
        </div>
      )}
    </Sheet>
  );
}
