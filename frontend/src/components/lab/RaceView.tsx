// Last-seat race results: the seat strip, one dot per person in finish order, finish timeline, and database proof.
//
// Contents:
//   kind: Outcome of one attempt for coloring.
//   Stat: A big number with a label.
//   Proof: Database facts read after the run, each checked against what it should equal; `wide` uses two columns.
//   RaceView: The race: who won, how everyone else was answered, and what the database holds afterwards.
import clsx from 'clsx';
import { m } from 'motion/react';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import type { RaceResult } from '../../api/types';
import { Button } from '../Button';

const DOT = {
  win: 'bg-ok ring-4 ring-[color-mix(in_srgb,var(--ok)_30%,transparent)]',
  full: 'bg-bad',
  other: 'bg-warn',
} as const;

/** Outcome of one attempt for coloring. */
const kind = (status: number, code: string | null) => (status === 200 ? 'win' : code === 'team_full' ? 'full' : 'other');

/** A big number with a label. */
export function Stat({ value, label, tone }: { value: string; label: string; tone?: 'ok' | 'bad' | 'warn' }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={clsx('num display text-[34px] leading-10', tone === 'ok' && 'text-ok', tone === 'bad' && 'text-bad', tone === 'warn' && 'text-warn')}>{value}</span>
      <span className="text-sm text-ink-2">{label}</span>
    </div>
  );
}

/** Database facts read after the run, each checked against what it should equal; `wide` uses two columns. */
export function Proof({ rows, wide = true }: { rows: Array<{ label: string; value: number; expect: number }>; wide?: boolean }) {
  return (
    <ul className={clsx('grid grid-cols-1 gap-2', wide && 'md:grid-cols-2')} aria-label="Read back from the database">
      {rows.map((row) => {
        const ok = row.value === row.expect;
        return (
          <li key={row.label} className="flex items-center justify-between gap-3 rounded bg-surface-2 px-3 py-2">
            <span className="text-sm">{row.label}</span>
            <span className={clsx('num inline-flex shrink-0 items-center gap-1 font-bold', ok ? 'text-ok' : 'text-bad')}>
              {ok ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
              {row.value}
              <span className="sr-only">{ok ? 'as expected' : `expected ${row.expect}`}</span>
              {!ok && <span className="text-sm font-normal">(expected {row.expect})</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The race: who won, how everyone else was answered, and what the database holds afterwards. */
export function RaceView({ result }: { result: RaceResult }) {
  const [replay, setReplay] = useState(0);
  const ordered = [...result.attempts].sort((a, b) => a.finished_ms - b.finished_ms);
  const winner = ordered.find((a) => a.status === 200);
  const longest = Math.max(...ordered.map((a) => a.finished_ms), 1);
  const step = Math.min(18, 1400 / Math.max(1, ordered.length));
  const { summary, facts, team } = result;
  return (
    <div className="flex flex-col gap-6">
      <div className="card grid grid-cols-2 gap-5 p-5 md:grid-cols-4">
        <Stat value={String(summary.winners)} label="got the last seat" tone="ok" />
        <Stat value={String(summary.team_full)} label={'told "Someone took the last seat."'} tone="bad" />
        <Stat value={String(summary.busy_retries)} label="retries after 503 busy (same key)" tone="warn" />
        <Stat value={`${result.elapsed_ms.toFixed(0)} ms`} label={`for all ${result.attempts.length} answers`} />
      </div>

      <section aria-labelledby="dots-title" className="card flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="dots-title" className="text-lg font-bold">Everyone pressed join at the same instant</h3>
          <Button size="sm" variant="ghost" onClick={() => setReplay((n) => n + 1)}>Replay in finish order</Button>
        </div>
        <p className="text-sm text-ink-2">
          One dot per person, lit in the order their answer came back. {winner ? `${winner.racer} was answered first with the seat` : 'Nobody won'};
          every other request waited on the same team row, re-checked it after the commit, and matched nothing.
        </p>
        <ul key={replay} className="flex flex-wrap gap-[6px]" aria-label="Attempts in finish order">
          {ordered.map((attempt, index) => (
            <m.li key={attempt.racer} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: (index * step) / 1000, duration: 0.18 }}
              title={`${attempt.racer}: ${attempt.status}${attempt.code ? ` ${attempt.code}` : ''} after ${attempt.finished_ms} ms`}
              className={clsx('h-4 w-4 rounded-avatar', DOT[kind(attempt.status, attempt.code)], attempt.retries > 0 && attempt.status !== 200 && 'outline outline-2 outline-warn')}>
              <span className="sr-only">{attempt.racer}: {attempt.status} {attempt.code ?? 'joined'}</span>
            </m.li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-4 text-sm text-ink-2">
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-avatar bg-ok" />200 joined</span>
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-avatar bg-bad" />409 team_full</span>
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-avatar outline outline-2 outline-warn" />waited on 503 busy, retried</span>
        </div>
      </section>

      <section aria-labelledby="timeline-title" className="card flex flex-col gap-3 p-5">
        <h3 id="timeline-title" className="text-lg font-bold">When each answer came back</h3>
        <ol className="flex max-h-[360px] flex-col gap-1 overflow-y-auto pr-2">
          {ordered.map((attempt) => (
            <li key={attempt.racer} className="grid grid-cols-[96px_minmax(0,1fr)_72px] items-center gap-3 text-[13px]">
              <span className={clsx('truncate', attempt.status === 200 && 'font-bold text-ok')}>{attempt.racer}</span>
              <span className="relative h-3 rounded-sm bg-surface-2">
                <span className={clsx('absolute inset-y-0 rounded-sm', attempt.status === 200 ? 'bg-ok' : 'bg-control')}
                  style={{ left: `${(attempt.started_ms / longest) * 100}%`, width: `${Math.max(1, ((attempt.finished_ms - attempt.started_ms) / longest) * 100)}%` }} />
              </span>
              <span className="num text-right text-ink-2">{attempt.finished_ms.toFixed(1)} ms</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="proof-title" className="card flex flex-col gap-3 p-5">
        <h3 id="proof-title" className="text-lg font-bold">Read back from the database after the race</h3>
        <Proof rows={[
          { label: 'Seats taken (member_count)', value: facts.member_count, expect: team.max_size },
          { label: 'Membership rows', value: facts.memberships, expect: facts.member_count },
          { label: 'Join events in the audit log (2 before the race, 1 winner)', value: facts.join_events, expect: team.taken_before },
          { label: 'People who got a seat', value: summary.winners, expect: team.max_size - team.taken_before },
        ]} />
      </section>
    </div>
  );
}
