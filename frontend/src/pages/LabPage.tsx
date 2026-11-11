// Race lab page: runs real concurrent experiments on the server and shows how the backend answers each one.
import * as Tabs from '@radix-ui/react-tabs';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import type { QueueResult, RaceResult, SpamResult, WalkthroughResult } from '../api/types';
import { Button } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { HeroBanner, HeroFact } from '../components/HeroBanner';
import { LatencyView, type BrowserSample } from '../components/lab/LatencyView';
import { QueueView } from '../components/lab/QueueView';
import { RaceView } from '../components/lab/RaceView';
import { SpamView } from '../components/lab/SpamView';
import { WalkthroughView } from '../components/lab/WalkthroughView';
import { EmptyState, LoadError, SkeletonCards } from '../components/LoadState';
import { useLabInfo, useLabLatency, useLabRun } from '../hooks/lab';
import { useShell } from '../hooks/useShell';

const TABS = [
  { id: 'join', label: 'How a join works' },
  { id: 'race', label: 'Last-seat race' },
  { id: 'spam', label: 'Spam clicks' },
  { id: 'queue', label: 'Request queue' },
  { id: 'latency', label: 'Latency' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const TAB = 'press inline-flex min-h-touch shrink-0 items-center rounded px-4 text-[15px] font-semibold text-ink-2 hover:text-ink '
  + 'data-[state=active]:bg-plate data-[state=active]:text-plate-ink';

/** Return the nearest-rank percentile of sorted numbers. */
export function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? 0;
}

/** A labeled number slider for the size of an experiment. */
function SizeControl({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-1 flex-col gap-2">
      <span className="flex items-baseline justify-between gap-3 text-sm font-semibold">{label}<span className="num text-2xl font-bold">{value}</span></span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full accent-[var(--brand)]" />
    </label>
  );
}

/** The Race lab. */
export default function LabPage() {
  const [params, setParams] = useSearchParams();
  const tab: TabId = TABS.some((t) => t.id === params.get('tab')) ? (params.get('tab') as TabId) : 'join';
  const info = useLabInfo();
  const latency = useLabLatency(tab === 'latency' && info.isSuccess);
  const { hid } = useShell();
  const max = info.data?.max_attempts ?? 200;
  const [racers, setRacers] = useState(50);
  const [clicks, setClicks] = useState(15);
  const [askers, setAskers] = useState(20);
  const [browser, setBrowser] = useState<BrowserSample | null>(null);
  const [measuring, setMeasuring] = useState(false);

  const walk = useLabRun<undefined, WalkthroughResult>(() => api.labWalkthrough(), () => 'Walkthrough finished. Three traced joins are shown.');
  const race = useLabRun<number, RaceResult>(api.labRace, (r) => `${r.summary.winners} got the seat, ${r.summary.team_full} were told the team is full.`);
  const spam = useLabRun<number, SpamResult>(api.labSpam, (r) => `Memberships: ${r.same_key.facts.memberships} and ${r.new_keys.facts.memberships}.`);
  const queue = useLabRun<number, QueueResult>(api.labQueue, (r) => `${r.queue.length} requests queued; the first was accepted.`);

  const measure = async () => {
    const target = hid ?? info.data?.hackathon_id;
    if (!target) return;
    setMeasuring(true);
    const times: number[] = [];
    try {
      for (let i = 0; i < 30; i += 1) {
        const start = performance.now();
        await api.teamsBoard(target);
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      setBrowser({ route: 'GET board/teams', count: times.length, p50: percentile(times, 0.5), p95: percentile(times, 0.95), max: times[times.length - 1] ?? 0 });
    } finally {
      setMeasuring(false);
    }
  };

  if (info.isPending) return <SkeletonCards count={2} grid={false} label="Loading the lab" />;
  if (info.error) return <LoadError error={info.error} onRetry={() => void info.refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <HeroBanner titleId="page-title" title="Watch one seat go to exactly one person"
        facts={<><HeroFact>Real requests, real database</HeroFact><HeroFact>Up to {max} at the same instant</HeroFact><HeroFact>Every SQL statement shown</HeroFact></>}>
        <p className="max-w-[60ch] text-shell-ink2">
          Every run fires real requests at the same instant against the real database, through the same code the app uses,
          in a hidden lab hackathon. Nothing here is simulated or replayed from a recording.
        </p>
      </HeroBanner>

      <Tabs.Root value={tab} onValueChange={(next) => setParams((p) => { p.set('tab', next); return p; }, { replace: true })}
        className="flex flex-col gap-5">
        <Tabs.List aria-label="Experiments" className="flex gap-1 overflow-x-auto rounded-md border border-line bg-surface p-1 shadow-1">
          {TABS.map((t) => <Tabs.Trigger key={t.id} value={t.id} className={TAB}>{t.label}</Tabs.Trigger>)}
        </Tabs.List>

        <Tabs.Content value="join" className="flex flex-col gap-4 outline-none">
          <div className="card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <p className="max-w-[70ch] text-ink-2">Traces every SQL statement of three real joins: a free seat, the same click retried with its key, and a team that is already full.</p>
            <Button variant="primary" busy={walk.isPending} busyLabel="Tracing" onClick={() => walk.mutate(undefined)}>Trace a join</Button>
          </div>
          <ErrorNotice error={walk.error} />
          {walk.data ? <WalkthroughView result={walk.data} /> : <EmptyState title="Press Trace a join">The statements, their order and their timing appear here.</EmptyState>}
        </Tabs.Content>

        <Tabs.Content value="race" className="flex flex-col gap-4 outline-none">
          <div className="card flex flex-col gap-4 p-5 md:flex-row md:items-end">
            <SizeControl label="People racing for the last seat (team has 3 of 4)" value={racers} min={2} max={max} onChange={setRacers} />
            <Button variant="primary" busy={race.isPending} busyLabel="Racing" onClick={() => race.mutate(racers)}>Start the race</Button>
          </div>
          <p className="text-sm text-ink-2">
            Why not 100,000 at once? Every attempt queues on the same team row, so the outcome does not depend on the count: one
            UPDATE can see a free seat. Past {max} attempts a single demo run would only wait longer. Throughput at scale is measured separately by the k6 load test.
          </p>
          <ErrorNotice error={race.error} />
          {race.data ? <RaceView result={race.data} /> : <EmptyState title="Press Start the race">Results, timing and the database read-back appear here.</EmptyState>}
        </Tabs.Content>

        <Tabs.Content value="spam" className="flex flex-col gap-4 outline-none">
          <div className="card flex flex-col gap-4 p-5 md:flex-row md:items-end">
            <SizeControl label="Clicks on join by one person" value={clicks} min={2} max={50} onChange={setClicks} />
            <Button variant="primary" busy={spam.isPending} busyLabel="Clicking" onClick={() => spam.mutate(clicks)}>Spam the button</Button>
          </div>
          <ErrorNotice error={spam.error} />
          {spam.data ? <SpamView result={spam.data} /> : <EmptyState title="Press Spam the button">Each click's answer and the database read-back appear here.</EmptyState>}
        </Tabs.Content>

        <Tabs.Content value="queue" className="flex flex-col gap-4 outline-none">
          <div className="card flex flex-col gap-4 p-5 md:flex-row md:items-end">
            <SizeControl label="People asking to join at once (team has 3 of 4)" value={askers} min={2} max={max} onChange={setAskers} />
            <Button variant="primary" busy={queue.isPending} busyLabel="Sending" onClick={() => queue.mutate(askers)}>Send the requests</Button>
          </div>
          <ErrorNotice error={queue.error} />
          {queue.data ? <QueueView result={queue.data} /> : <EmptyState title="Press Send the requests">The leader's queue and the two decisions appear here.</EmptyState>}
        </Tabs.Content>

        <Tabs.Content value="latency" className="flex flex-col gap-4 outline-none">
          <div className="card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <p className="max-w-[70ch] text-ink-2">Server times come from real requests this server handled. The browser measurement sends 30 board requests one after another from here.</p>
            <Button variant="primary" busy={measuring} busyLabel="Measuring" onClick={() => void measure()}>Measure from this browser</Button>
          </div>
          {latency.error && <LoadError error={latency.error} onRetry={() => void latency.refetch()} />}
          {latency.isPending && <SkeletonCards count={1} grid={false} label="Loading latency" />}
          {latency.data && <LatencyView report={latency.data} browser={browser} />}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
