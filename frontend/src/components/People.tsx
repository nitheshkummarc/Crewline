// People cards (looking for a team) and ranked suggestion cards with a stacked score bar.
import type { PublicUser, Suggestion } from '../api/types';
import { formatZone } from '../lib/time';
import { Avatar } from './Avatar';
import { SkillList } from './Skills';

/** Return the person's local time now, such as "14:05". */
export function localTime(timezone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(at);
  } catch {
    return '';
  }
}

/** One person who is looking: avatar, name, time zone with their local time, skills. */
export function PersonCard({ person }: { person: PublicUser }) {
  return (
    <article className="card card-lift flex h-full flex-col gap-3 p-4" aria-label={person.display_name}>
      <div className="flex items-center gap-3">
        <Avatar id={person.user_id} name={person.display_name} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{person.display_name}</p>
          <p className="truncate text-sm text-ink-2">{formatZone(person.timezone)} · <span className="num">{localTime(person.timezone)}</span> there</p>
        </div>
      </div>
      <SkillList skills={person.skills} label={`Skills of ${person.display_name}`} />
    </article>
  );
}

/** People who are looking, as a card grid. */
export function PeopleGrid({ people }: { people: PublicUser[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3" aria-label="People looking for a team">
      {people.map((person) => <li key={person.user_id}><PersonCard person={person} /></li>)}
    </ul>
  );
}

const PARTS: Array<{ key: keyof Suggestion['breakdown']; label: string; weight: number; color: string }> = [
  { key: 'complement', label: 'Fills missing roles', weight: 0.6, color: 'var(--band-6)' },
  { key: 'timezone', label: 'Working-hour overlap', weight: 0.3, color: 'var(--band-5)' },
  { key: 'completeness', label: 'Profile completeness', weight: 0.1, color: 'var(--band-3)' },
];

/** The score as a stacked bar of its weighted parts (redundancy subtracted), with a legend. */
export function ScoreBar({ person }: { person: Suggestion }) {
  const redundancy = person.breakdown.redundancy * 0.1;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 w-full overflow-hidden rounded-sm bg-surface-2" role="img"
        aria-label={`Score ${person.score.toFixed(2)}: ${PARTS.map((p) => `${p.label} ${(person.breakdown[p.key] * p.weight).toFixed(2)}`).join(', ')}, minus overlap ${redundancy.toFixed(2)}`}>
        {PARTS.map((part) => (
          <span key={part.key} style={{ width: `${person.breakdown[part.key] * part.weight * 100}%`, background: part.color }} />
        ))}
      </div>
      <dl className="grid gap-y-1 text-[13px] text-ink-2">
        {PARTS.map((part) => (
          <div key={part.key} className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-2"><span aria-hidden="true" className="h-2 w-2 rounded-sm" style={{ background: part.color }} />{part.label}</dt>
            <dd className="num font-semibold text-ink">{(person.breakdown[part.key] * part.weight).toFixed(2)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2">
          <dt>Overlap with team</dt>
          <dd className="num font-semibold text-ink">-{redundancy.toFixed(2)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Ranked suggestions: rank, person, score, reasons, and the score bar. */
export function SuggestionList({ items }: { items: Suggestion[] }) {
  return (
    <ol className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Ranked suggestions">
      {items.map((person, index) => (
        <li key={person.user_id} className="card flex flex-col gap-4 p-4">
          <div className="flex items-center gap-3">
            <span className="num w-7 text-sm font-bold text-ink-2">#{index + 1}</span>
            <Avatar id={person.user_id} name={person.display_name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{person.display_name}</p>
              <p className="truncate text-sm text-ink-2">{formatZone(person.timezone)}</p>
            </div>
            <span className="num text-2xl font-bold" aria-label={`Score ${person.score.toFixed(2)}`}>{person.score.toFixed(2)}</span>
          </div>
          <SkillList skills={person.skills} label={`Skills of ${person.display_name}`} />
          <ul className="flex flex-col gap-1 text-sm">
            {person.reasons.map((reason) => <li key={reason} className="flex gap-2"><span aria-hidden="true" className="text-ok">+</span>{reason}</li>)}
          </ul>
          <ScoreBar person={person} />
        </li>
      ))}
    </ol>
  );
}
