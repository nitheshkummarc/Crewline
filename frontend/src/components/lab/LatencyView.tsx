// Latency: measured server time per route (recent requests) and a measurement from this browser, plus pool state.
import type { LatencyReport } from '../../api/types';

export interface BrowserSample {
  route: string;
  count: number;
  p50: number;
  p95: number;
  max: number;
}

/** Server latency table with bars, pool state and transaction counters; optional browser measurement. */
export function LatencyView({ report, browser }: { report: LatencyReport; browser: BrowserSample | null }) {
  const top = Math.max(...report.routes.map((r) => r.p95_ms), 1);
  return (
    <div className="flex flex-col gap-6">
      {browser && (
        <section aria-labelledby="browser-title" className="card flex flex-col gap-2 p-5">
          <h3 id="browser-title" className="text-lg font-bold">From this browser (network included)</h3>
          <p className="num">
            {browser.count} sequential requests to {browser.route}: p50 <b>{browser.p50.toFixed(1)} ms</b>, p95{' '}
            <b>{browser.p95.toFixed(1)} ms</b>, max {browser.max.toFixed(1)} ms. The challenge target is p95 under 200 ms at 100
            concurrent users (k6 load test).
          </p>
        </section>
      )}
      <section aria-labelledby="server-title" className="card flex flex-col gap-3 p-5">
        <h3 id="server-title" className="text-lg font-bold">On the server, per route</h3>
        <p className="text-sm text-ink-2">Measured by the request middleware over the last {report.window} requests of each route. Refreshes every 5 s.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-ink-2">
              <tr><th className="py-2 font-semibold">Route</th><th className="font-semibold">Requests</th><th className="font-semibold">p50</th>
                <th className="font-semibold">p95</th><th className="font-semibold">p99</th><th className="w-[30%] font-semibold">p95 bar</th></tr>
            </thead>
            <tbody className="num">
              {report.routes.map((row) => (
                <tr key={row.route} className="border-t border-line">
                  <td className="py-2 pr-3 font-mono text-[12px]">{row.route}</td>
                  <td>{row.count}</td><td>{row.p50_ms.toFixed(1)} ms</td><td>{row.p95_ms.toFixed(1)} ms</td><td>{row.p99_ms.toFixed(1)} ms</td>
                  <td><span className="block h-2 rounded-sm bg-brand" style={{ width: `${Math.max(2, (row.p95_ms / top) * 100)}%` }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="pools-title" className="card grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 id="pools-title" className="text-lg font-bold">Connection pools</h3>
          {report.pools.map((pool) => (
            <p key={pool.pool} className="num">{pool.pool}: {pool.size} open, {pool.idle} idle (opened at start, never reaped)</p>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-bold">Write transactions since start</h3>
          {Object.entries(report.transactions).map(([name, value]) => (
            <p key={name} className="num">{name.replace(/_/g, ' ')}: {value}</p>
          ))}
        </div>
      </section>
    </div>
  );
}
