// Seats as tear-off tabs in the team's band color, a live dot, and status tags.
//
// Contents:
//   SeatTabs: One tab per seat: band color when taken (band ink on a band surface), dashed when open; the last
//       open seat is marked.
//   teamState: The state of a team for the caller.
//   StateTag: A small tag for a team's state.
//   LiveDot: A pulsing dot and label for the live connection.
import clsx from 'clsx';
import type { TeamSummary } from '../api/types';

/** One tab per seat: band color when taken (band ink on a band surface), dashed when open; the last open seat is marked. */
export function SeatTabs({ taken, size, large = false, onBand = false }: { taken: number; size: number; large?: boolean; onBand?: boolean }) {
  const open = size - taken;
  return (
    <span role="img" aria-label={`${taken} of ${size} seats taken${open === 1 ? ', last seat open' : ''}`}
      className="inline-flex items-end gap-1">
      {Array.from({ length: size }, (_, index) => {
        const filled = index < taken;
        const last = !filled && open === 1;
        return (
          <span key={`${index}-${filled ? 'f' : 'o'}`}
            className={clsx('rounded-sm', large ? 'h-9 w-6' : 'h-6 w-4',
              filled ? 'seat-fill border border-[color-mix(in_srgb,var(--band-ink)_25%,transparent)]'
                : onBand ? 'border-2 border-dashed border-band-ink' : 'border-2 border-dashed border-control',
              last && !onBand && 'border-warn')}
            style={filled ? { background: onBand ? 'var(--band-ink)' : 'var(--band)' } : undefined} />
        );
      })}
    </span>
  );
}

export type TeamState = 'yours' | 'last-seat' | 'open' | 'full' | 'finalized';

/** The state of a team for the caller. */
export function teamState(team: TeamSummary, mine: boolean): TeamState {
  if (mine) return 'yours';
  if (team.status === 'finalized') return 'finalized';
  const open = team.max_size - team.member_count;
  if (open === 0) return 'full';
  return open === 1 ? 'last-seat' : 'open';
}

const TAG: Record<TeamState, string> = {
  yours: 'bg-ok text-surface',
  'last-seat': 'bg-warn text-surface',
  open: 'bg-surface text-ink',
  full: 'bg-surface-2 text-ink-2',
  finalized: 'bg-surface-2 text-ink-2',
};

/** A small tag for a team's state. */
export function StateTag({ team, mine }: { team: TeamSummary; mine: boolean }) {
  const state = teamState(team, mine);
  const open = team.max_size - team.member_count;
  const text = { yours: 'Your team', 'last-seat': 'Last seat', open: `${open} open`, full: 'Full', finalized: 'Finalized' }[state];
  return <span className={clsx('inline-flex h-6 items-center rounded-sm px-2 text-[12px] font-bold uppercase tracking-wide', TAG[state])}>{text}</span>;
}

/** A pulsing dot and label for the live connection. */
export function LiveDot({ status }: { status: 'connecting' | 'live' | 'reconnecting' }) {
  const live = status === 'live';
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold">
      <span aria-hidden="true" className="relative inline-flex h-[10px] w-[10px]">
        {live && <span className="live-ping absolute inset-0 rounded-avatar bg-live" />}
        <span className={clsx('relative h-[10px] w-[10px] rounded-avatar', live ? 'bg-live' : 'bg-warn')} />
      </span>
      <span className={live ? 'text-ok' : 'text-warn'}>{live ? 'Live' : status === 'connecting' ? 'Connecting' : 'Reconnecting'}</span>
    </span>
  );
}
