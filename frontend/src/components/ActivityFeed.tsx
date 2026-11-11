// Live activity feed: newest first, entries slide in, times refresh every 20 s.
import { AnimatePresence, m } from 'motion/react';
import { Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { activityText, type ActivityItem } from '../lib/activity';
import { bandStyle } from '../lib/teamColor';

const KIND_MARK: Record<ActivityItem['kind'], string> = {
  created: 'New', joined: '+1', full: 'Full', left: '-1', finalized: 'Done', reopened: 'Open', deleted: 'Gone',
};

/** Return "now", "45 s", "3 min" for a timestamp. */
export function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 10) return 'now';
  if (seconds < 60) return `${seconds} s`;
  return `${Math.round(seconds / 60)} min`;
}

/** The feed of what is happening across the hackathon, from the event stream. */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, []);
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-control p-4 text-sm text-ink-2">
        <Radio size={18} aria-hidden="true" />
        <p>Listening. Teams created, filled or emptied by anyone in this hackathon show up here the moment they happen.</p>
      </div>
    );
  }
  return (
    <ol className="flex flex-col gap-2" aria-label="Recent activity">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <m.li key={item.seq} layout initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="flex items-center gap-3 rounded-md bg-surface px-3 py-2 shadow-1" style={bandStyle(item.teamId)}>
            <span className="band num inline-flex h-8 w-11 shrink-0 items-center justify-center rounded-sm text-[11px] font-bold uppercase">
              {KIND_MARK[item.kind]}
            </span>
            <span className="min-w-0 flex-1 text-sm leading-5">
              {item.kind === 'deleted'
                ? activityText(item)
                : <Link to={`/teams/${item.teamId}`} className="hover:underline">{activityText(item)}</Link>}
              {item.seats && <span className="num ml-1 text-ink-2">({item.seats})</span>}
            </span>
            <time className="num shrink-0 text-[12px] text-ink-2" dateTime={new Date(item.at).toISOString()}>{ago(item.at, now)}</time>
          </m.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
