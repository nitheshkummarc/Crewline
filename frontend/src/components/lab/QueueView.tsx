// Request queue: the order join requests reach the leader, and what happens when the leader accepts the first two.
//
// Contents:
//   QueueView: The leader's queue after a burst of requests, with the two decisions.
import clsx from 'clsx';
import type { QueueResult } from '../../api/types';
import { Proof, Stat } from './RaceView';

/** The leader's queue after a burst of requests, with the two decisions. */
export function QueueView({ result }: { result: QueueResult }) {
  const decided = new Map(result.decisions.map((d) => [d.request_id, d]));
  return (
    <div className="flex flex-col gap-6">
      <div className="card grid grid-cols-2 gap-5 p-5 md:grid-cols-4">
        <Stat value={String(result.created.ok)} label="requests created" tone="ok" />
        <Stat value={String(result.created.failed)} label="failed to create" tone={result.created.failed ? 'bad' : undefined} />
        <Stat value={String(result.created.busy_retries)} label="retries after 503 busy" tone="warn" />
        <Stat value={`${result.facts.member_count}/${result.facts.max_size}`} label="seats after the decisions" />
      </div>
      <section aria-labelledby="queue-title" className="card flex flex-col gap-3 p-5">
        <h3 id="queue-title" className="text-lg font-bold">What the leader sees, oldest first</h3>
        <p className="text-sm text-ink-2">
          Requests are ordered by when each one committed. The leader accepts the first: the team becomes full. Accepting the
          second returns 409 team_full; that request stays pending and accept is turned off while the team is full.
        </p>
        <ol className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-2">
          {result.queue.map((row) => {
            const decision = decided.get(row.request_id);
            const accepted = decision?.status === 200;
            const refused = decision && !accepted;
            return (
              <li key={row.request_id} className={clsx('grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded border px-3 py-2',
                accepted ? 'border-ok' : refused ? 'border-bad' : 'border-line')}>
                <span className="num font-bold text-ink-2">#{row.position}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{row.name}</span>
                  <span className="num text-[13px] text-ink-2">+{row.after_first_ms.toFixed(2)} ms after the first</span>
                </span>
                <span className={clsx('text-sm font-semibold', accepted ? 'text-ok' : refused ? 'text-bad' : 'text-ink-2')}>
                  {accepted ? 'Accepted: last seat' : refused ? `Accept: ${decision.status} ${decision.code ?? ''}` : 'Pending'}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
      <Proof rows={[
        { label: 'Seats taken (member_count)', value: result.facts.member_count, expect: result.team.max_size },
        { label: 'Membership rows', value: result.facts.memberships, expect: result.facts.member_count },
      ]} />
    </div>
  );
}
