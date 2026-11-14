// Board toolbar: search box ("/" focuses it), skill filter chips with needs or has, sort; all state lives in the URL.
//
// Contents:
//   SearchBox: A search input with an icon, a clear button and a "/" hint.
//   BoardToolbar: Search, filter and sort controls for the teams board.
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { forwardRef } from 'react';
import type { Skill } from '../api/types';
import type { TeamFilter, TeamSort } from '../lib/filter';
import { Button } from './Button';
import { SkillPicker } from './Skills';

interface SearchProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
}

/** A search input with an icon, a clear button and a "/" hint. */
export const SearchBox = forwardRef<HTMLInputElement, SearchProps>(function SearchBox({ value, onChange, label, placeholder }, ref) {
  return (
    <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
      <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
      <input ref={ref} type="search" value={value} aria-label={label} placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded border border-control bg-surface pl-10 pr-16 text-[16px] text-ink placeholder:text-ink-2 focus:border-focus focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--focus)_22%,transparent)]" />
      {value ? (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search"
          className="press absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded text-ink-2 hover:bg-surface-2">
          <X size={16} aria-hidden="true" />
        </button>
      ) : (
        <kbd aria-hidden="true" className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-sm border border-line px-[6px] text-[12px] text-ink-2 sm:block">/</kbd>
      )}
    </div>
  );
});

interface ToolbarProps {
  filter: TeamFilter;
  options: readonly Skill[];
  onChange: (next: TeamFilter) => void;
  searchRef?: React.Ref<HTMLInputElement>;
}

const SORT_LABEL: Record<TeamSort, string> = { newest: 'Newest', 'most-open': 'Most open seats', 'almost-full': 'Almost full' };

/** Search, filter and sort controls for the teams board. */
export function BoardToolbar({ filter, options, onChange, searchRef }: ToolbarProps) {
  const count = filter.skills.length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox ref={searchRef} value={filter.q} onChange={(q) => onChange({ ...filter, q })} label="Search teams by name" placeholder="Search teams" />
        <Popover.Root>
          <Popover.Trigger asChild>
            <Button variant="secondary" aria-label={count ? `Filter by skills, ${count} selected` : 'Filter by skills'}>
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Skills</span>
              {count > 0 && <span className="num rounded-sm bg-plate px-[6px] text-[12px] text-plate-ink">{count}</span>}
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="end" sideOffset={8} collisionPadding={16}
              className="card z-40 flex w-[min(92vw,420px)] flex-col gap-4 p-4 shadow-2">
              <div role="group" aria-label="Match teams that" className="grid grid-cols-2 gap-2">
                {(['needs', 'has'] as const).map((mode) => (
                  <Button key={mode} size="sm" variant="secondary" aria-pressed={filter.mode === mode}
                    onClick={() => onChange({ ...filter, mode })}>
                    {mode === 'needs' ? 'Teams that need' : 'Teams that have'}
                  </Button>
                ))}
              </div>
              <SkillPicker compact legend="Skills" options={options} value={filter.skills}
                onChange={(skills) => onChange({ ...filter, skills })} />
              {count > 0 && <Button variant="ghost" size="sm" className="self-start" onClick={() => onChange({ ...filter, skills: [] })}>Clear skills</Button>}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <label className="sr-only" htmlFor="team-sort">Sort teams</label>
        <select id="team-sort" value={filter.sort} onChange={(event) => onChange({ ...filter, sort: event.target.value as TeamSort })}
          className="h-11 rounded border border-control bg-surface px-3 text-[15px] text-ink">
          {(Object.keys(SORT_LABEL) as TeamSort[]).map((sort) => <option key={sort} value={sort}>{SORT_LABEL[sort]}</option>)}
        </select>
      </div>
      {count > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Active skill filters">
          {filter.skills.map((skill) => (
            <li key={skill}>
              <button type="button" onClick={() => onChange({ ...filter, skills: filter.skills.filter((s) => s !== skill) })}
                aria-label={`Remove filter ${skill}`}
                className={clsx('press inline-flex min-h-touch items-center gap-2 rounded-sm bg-plate px-3 text-sm text-plate-ink')}>
                {filter.mode === 'needs' ? 'needs' : 'has'} {skill} <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
