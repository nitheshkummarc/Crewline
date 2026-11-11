// Teams board: one row per team with fixed columns; rows slide in and out, values flip in place.
import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { TeamSummary } from '../api/types';
import { missingRoles } from '../lib/skills';
import { FlapText, Lamp, SeatStrip } from './Board';
import { SkillList } from './Skills';

const ROW_MOTION = {
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: 24 },
  transition: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] as const },
};

/** The lamp for a team row: your team, last seat, or seats open. */
export function seatLamp(team: TeamSummary, mine: boolean): { tone: 'green' | 'amber' | 'off'; label: string } {
  const open = team.max_size - team.member_count;
  if (mine) return { tone: 'green', label: 'Your team' };
  if (open === 1) return { tone: 'amber', label: 'Last seat' };
  return { tone: 'off', label: `${open} open` };
}

interface RowProps {
  team: TeamSummary;
  mine: boolean;
  action?: ReactNode;
}

/** One team on the board: name, seat strip, skills, missing roles, and an optional action. */
export function TeamRow({ team, mine, action }: RowProps) {
  const lamp = seatLamp(team, mine);
  const needs = missingRoles(team.skills);
  return (
    <div className={clsx('grid gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_140px_minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center md:py-[14px]',
      mine ? 'text-paint' : 'text-paint-2')}>
      <div className="flex min-w-0 items-center justify-between gap-3 md:block">
        <Link to={`/teams/${team.id}`} className={clsx('cells block truncate text-[15px] leading-5 hover:underline md:text-base',
          mine ? 'text-paint' : 'text-paint hover:text-paint')}>
          <FlapText value={team.name} />
        </Link>
        <Lamp tone={lamp.tone} label={lamp.label} className="cells shrink-0 text-[12px] md:mt-1" />
      </div>
      <div className="flex items-center gap-3">
        <SeatStrip taken={team.member_count} size={team.max_size} mine={mine} />
        <FlapText value={`${team.member_count}/${team.max_size}`} className="cells text-[13px]" />
      </div>
      <div className="min-w-0"><SkillList skills={team.skills} label={`Skills in ${team.name}`} /></div>
      <div className="cells min-w-0 text-[12px] leading-4">
        {needs.length > 0 ? <span>Needs {needs.join(', ')}</span> : <span>Core roles covered</span>}
      </div>
      <div className="flex justify-start md:justify-end">{action}</div>
    </div>
  );
}

interface BoardProps {
  teams: TeamSummary[];
  myTeamId: string | null;
  renderAction?: (team: TeamSummary) => ReactNode;
}

/** The teams board list with a column header on wide screens. */
export function TeamBoard({ teams, myTeamId, renderAction }: BoardProps) {
  return (
    <div className="overflow-hidden rounded-md bg-board">
      <div aria-hidden="true" className="cells hidden grid-cols-[minmax(0,1.6fr)_140px_minmax(0,1.3fr)_minmax(0,1fr)_auto] gap-x-4 border-b border-flap-seam px-4 py-2 text-[11px] text-paint-2 md:grid">
        <span>Team</span><span>Seats</span><span>Skills</span><span>Needs</span><span className="w-[1px]" />
      </div>
      <ul className="divide-y divide-flap-seam">
        <AnimatePresence initial={false}>
          {teams.map((team) => (
            <m.li key={team.id} layout={false} {...ROW_MOTION}>
              <TeamRow team={team} mine={team.id === myTeamId} action={renderAction?.(team)} />
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
