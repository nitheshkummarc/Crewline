// Walkthrough: the real SQL statements of one join, in order, with timing and what each one guarantees.
import clsx from 'clsx';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import type { WalkPart, WalkthroughResult } from '../../api/types';

const TONE = {
  ok: { border: 'border-ok', text: 'text-ok', Icon: CheckCircle2 },
  replay: { border: 'border-focus', text: 'text-focus', Icon: RotateCcw },
  bad: { border: 'border-bad', text: 'text-bad', Icon: XCircle },
} as const;

/** One traced call: outcome header, then a numbered timeline of statements. */
function Trace({ title, subtitle, part, tone }: { title: string; subtitle: string; part: WalkPart; tone: keyof typeof TONE }) {
  const { border, text, Icon } = TONE[tone];
  const longest = Math.max(...part.steps.map((step) => step.gap_ms), 0.001);
  return (
    <section aria-label={title} className={clsx('card flex flex-col gap-4 border-t-4 p-5', border)}>
      <header className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-lg font-bold"><Icon size={20} aria-hidden="true" className={text} />{title}</h3>
        <p className="text-sm text-ink-2">{subtitle}</p>
        <p className="num text-sm">
          <span className={clsx('font-bold', text)}>{part.status}{part.code ? ` ${part.code}` : ''}</span>
          {part.replayed && part.status === 200 ? ' · stored answer replayed' : ''} · {part.server_ms.toFixed(2)} ms on the server
          · {part.steps.length} {part.steps.length === 1 ? 'statement' : 'statements'}
        </p>
      </header>
      <ol className="flex flex-col">
        {part.steps.map((step, index) => (
          <li key={index} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
            {index < part.steps.length - 1 && <span aria-hidden="true" className="absolute left-[13px] top-7 h-full w-[2px] bg-line" />}
            <span className={clsx('num relative z-10 flex h-7 w-7 items-center justify-center rounded-avatar text-[12px] font-bold',
              step.pool === 'write' ? 'bg-plate text-plate-ink' : 'bg-surface-2 text-ink-2')}>{index + 1}</span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold">{step.label}</p>
                <span className="num shrink-0 text-[13px] text-ink-2">+{step.gap_ms.toFixed(2)} ms</span>
              </div>
              <span aria-hidden="true" className="h-1 rounded-sm bg-brand" style={{ width: `${Math.max(4, (step.gap_ms / longest) * 100)}%` }} />
              {step.why && <p className="text-sm text-ink-2">{step.why}</p>}
              <details className="text-[13px]">
                <summary className="inline-flex min-h-touch cursor-pointer items-center text-focus">SQL ({step.pool} pool)</summary>
                <code className="block overflow-x-auto whitespace-pre-wrap break-words rounded bg-surface-2 p-3 font-mono text-[12px] text-ink">{step.sql}</code>
              </details>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The three traced joins side by side (stacked on phones). */
export function WalkthroughView({ result }: { result: WalkthroughResult }) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <Trace tone="ok" title="1. A seat is free" part={result.join}
        subtitle={`${result.team.name} had ${result.team.taken_before} of ${result.team.max_size} seats taken. One person joins by code.`} />
      <Trace tone="replay" title="2. The same click again" part={result.retry}
        subtitle="The browser retries with the same Idempotency-Key (double click, flaky network). No second join happens." />
      <Trace tone="bad" title="3. The team is already full" part={result.full}
        subtitle={`${result.full.team.name} has 4 of 4. The seat UPDATE matches nothing, so everything rolls back and the server explains why.`} />
    </div>
  );
}
