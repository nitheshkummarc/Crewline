// People rows for the People board and ranked suggestions with the score breakdown.
import type { PublicUser, Suggestion } from '../api/types';
import { formatZone } from '../lib/time';
import { SkillList } from './Skills';

/** One person who is looking: name, time zone with current offset, skills. */
export function PersonRow({ person }: { person: PublicUser }) {
  return (
    <div className="grid gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)] md:items-center">
      <span className="cells truncate text-[15px] text-paint">{person.display_name}</span>
      <span className="text-sm text-paint-2">{formatZone(person.timezone)}</span>
      <SkillList skills={person.skills} full label={`Skills of ${person.display_name}`} />
    </div>
  );
}

/** People who are looking, on the dark board. */
export function PeopleBoard({ people }: { people: PublicUser[] }) {
  return (
    <ul className="divide-y divide-flap-seam overflow-hidden rounded-md bg-board">
      {people.map((person) => <li key={person.user_id}><PersonRow person={person} /></li>)}
    </ul>
  );
}

const PARTS: Array<[keyof Suggestion['breakdown'], string, number]> = [
  ['complement', 'Fills missing roles', 0.6],
  ['timezone', 'Working-hour overlap', 0.3],
  ['completeness', 'Profile completeness', 0.1],
  ['redundancy', 'Overlap with team (subtracted)', -0.1],
];

/** Ranked suggestions: score, reasons, and the weighted parts that make up the score. */
export function SuggestionList({ items }: { items: Suggestion[] }) {
  return (
    <ol className="divide-y divide-flap-seam overflow-hidden rounded-md bg-board">
      {items.map((person, index) => (
        <li key={person.user_id} className="grid gap-3 px-4 py-3 md:grid-cols-[48px_minmax(0,1fr)_minmax(0,1fr)]">
          <span className="cells text-[13px] text-paint-2">{String(index + 1).padStart(2, '0')}</span>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="cells truncate text-[15px] text-paint">{person.display_name}</span>
              <span className="cells text-[15px] text-lamp-green">{person.score.toFixed(2)}</span>
            </div>
            <span className="text-sm text-paint-2">{formatZone(person.timezone)}</span>
            <SkillList skills={person.skills} full label={`Skills of ${person.display_name}`} />
            <ul className="flex flex-col gap-1 text-sm text-paint">
              {person.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 self-start text-[13px] text-paint-2">
            {PARTS.map(([part, label, weight]) => (
              <div key={part} className="contents">
                <dt>{label}</dt>
                <dd className="cells text-right">{(person.breakdown[part] * weight).toFixed(2)}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}
