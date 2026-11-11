// Team cards on the board: a band header in the team's color, seat tabs, skills and missing roles, actions.
import { AnimatePresence, m } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { TeamSummary } from '../api/types';
import { missingRoles } from '../lib/skills';
import { bandStyle } from '../lib/teamColor';
import { SeatTabs, StateTag } from './Seats';
import { SkillList } from './Skills';

const CARD_MOTION = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] as const },
};

interface CardProps {
  team: TeamSummary;
  mine: boolean;
  actions?: ReactNode;
}

/** One team: band header with the name and state, seat tabs, skills it has and roles it still needs. */
export function TeamCard({ team, mine, actions }: CardProps) {
  const needs = missingRoles(team.skills);
  const open = team.max_size - team.member_count;
  return (
    <article style={bandStyle(team.id)} aria-labelledby={`team-${team.id}`}
      className={`card card-lift flex h-full flex-col overflow-hidden ${mine ? 'ring-2 ring-ok' : ''}`}>
      <header className="band flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <h3 id={`team-${team.id}`} className="display min-w-0 text-[19px] leading-6">
          <Link to={`/teams/${team.id}`} className="block truncate hover:underline">{team.name}</Link>
        </h3>
        <StateTag team={team} mine={mine} />
      </header>
      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 pt-4">
        <div className="flex items-end justify-between gap-3">
          <SeatTabs taken={team.member_count} size={team.max_size} />
          <span className="num text-sm text-ink-2"><span className="text-lg font-bold text-ink">{team.member_count}</span>/{team.max_size} · {open} open</span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="label">Has</span>
          <SkillList skills={team.skills} label={`Skills in ${team.name}`} empty="No skills listed yet" />
        </div>
        {needs.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="label">Needs</span>
            <SkillList skills={needs} need label={`Roles ${team.name} still needs`} />
          </div>
        )}
        {actions && <div className="mt-auto flex flex-wrap gap-2 pt-1">{actions}</div>}
      </div>
    </article>
  );
}

interface GridProps {
  teams: TeamSummary[];
  myTeamId: string | null;
  renderActions?: (team: TeamSummary) => ReactNode;
}

/** The teams board as a card grid; cards animate in and out as live events arrive. */
export function TeamGrid({ teams, myTeamId, renderActions }: GridProps) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3" aria-label="Teams with open seats">
      <AnimatePresence initial={false} mode="popLayout">
        {teams.map((team) => (
          <m.li key={team.id} layout {...CARD_MOTION}>
            <TeamCard team={team} mine={team.id === myTeamId} actions={renderActions?.(team)} />
          </m.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
