// Spam clicks: every click's answer, and proof from the database that the person joined once.
//
// Contents:
//   Phase: One way of clicking: a chip per click and what the database holds afterwards.
//   SpamView: Both ways of spamming the join button.
import clsx from 'clsx';
import type { SpamPhase, SpamResult } from '../../api/types';
import { Proof } from './RaceView';

/** One way of clicking: a chip per click and what the database holds afterwards. */
function Phase({ title, explain, phase, committedLabel, otherLabel }:
  { title: string; explain: string; phase: SpamPhase; committedLabel: string; otherLabel: string }) {
  return (
    <section aria-label={title} className="card flex flex-col gap-4 p-5">
      <header className="flex flex-col gap-1">
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="text-sm text-ink-2">{explain}</p>
      </header>
      <ol className="flex flex-wrap gap-2" aria-label={`${phase.clicks.length} clicks`}>
        {phase.clicks.map((click) => {
          const committed = !click.replayed && click.status === 200;
          return (
            <li key={click.click} title={`Click ${click.click}: ${click.status} after ${click.finished_ms} ms`}
              className={clsx('flex min-w-[72px] flex-col items-center gap-[2px] rounded border px-2 py-1 text-[12px]',
                committed ? 'border-ok bg-[color-mix(in_srgb,var(--ok)_12%,var(--surface))]' : 'border-line bg-surface-2')}>
              <span className="num font-bold">#{click.click} · {click.status}</span>
              <span className={committed ? 'font-semibold text-ok' : 'text-ink-2'}>{committed ? committedLabel : otherLabel}</span>
            </li>
          );
        })}
      </ol>
      <Proof wide={false} rows={[
        { label: `Memberships for ${phase.user}`, value: phase.facts.memberships, expect: 1 },
        { label: 'Join events in the audit log', value: phase.facts.join_events, expect: 1 },
        { label: 'Stored answers (committed changes only)', value: phase.facts.stored_keys, expect: 1 },
      ]} />
    </section>
  );
}

/** Both ways of spamming the join button. */
export function SpamView({ result }: { result: SpamResult }) {
  const sameIdentical = result.same_key.clicks.every((click) => click.same_body);
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Phase title="Double click: the same Idempotency-Key every time" phase={result.same_key}
        committedLabel="joined" otherLabel="same answer"
        explain={`The first click claims the key and commits. Every other click waits on that key row, then gets the stored answer back${sameIdentical ? ', byte for byte the same' : ''}. Nothing runs twice.`} />
      <Phase title="Spam: a new key on every click" phase={result.new_keys}
        committedLabel="joined" otherLabel="already in"
        explain="Each click is a new request. The first takes the seat; the rest find the person already in the team and get 200 with nothing changed. UNIQUE (hackathon_id, user_id) blocks a second membership whatever the timing." />
    </div>
  );
}
