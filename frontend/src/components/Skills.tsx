// Skill chips (family color dot), "needs" chips, and the toggle-button skill picker.
//
// Contents:
//   SkillChip: One skill as a chip; `need` shows it as a missing role (dashed).
//   SkillList: A row of skill chips; a short note when empty.
//   SkillPicker: Toggle buttons for skills (aria-pressed), grouped in a fieldset with an error line.
import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { Skill } from '../api/types';
import { skillFamily, type SkillFamily } from '../lib/skills';
import { FieldError } from './Field';

const FAMILY_DOT: Record<SkillFamily, string> = {
  build: 'var(--band-6)',
  data: 'var(--band-1)',
  ops: 'var(--band-0)',
  people: 'var(--band-4)',
};

/** One skill as a chip; `need` shows it as a missing role (dashed). */
export function SkillChip({ skill, need = false }: { skill: Skill; need?: boolean }) {
  return (
    <span className={clsx('inline-flex h-7 items-center gap-[6px] rounded-sm px-2 text-[13px] font-medium',
      need ? 'border border-dashed border-control text-ink-2' : 'bg-surface-2 text-ink')}>
      <span aria-hidden="true" className="h-2 w-2 rounded-avatar" style={{ background: FAMILY_DOT[skillFamily(skill)] }} />
      {skill}
    </span>
  );
}

/** A row of skill chips; a short note when empty. */
export function SkillList({ skills, label, need = false, empty = 'No skills listed' }:
  { skills: readonly Skill[]; label?: string; need?: boolean; empty?: string }) {
  if (skills.length === 0) return <span className="text-sm text-ink-2">{empty}</span>;
  return (
    <ul className="flex flex-wrap gap-[6px]" aria-label={label}>
      {skills.map((skill) => <li key={skill}><SkillChip skill={skill} need={need} /></li>)}
    </ul>
  );
}

interface PickerProps {
  options: readonly Skill[];
  value: readonly Skill[];
  onChange: (next: Skill[]) => void;
  legend: string;
  error?: string | undefined;
  compact?: boolean;
}

/** Toggle buttons for skills (aria-pressed), grouped in a fieldset with an error line. */
export function SkillPicker({ options, value, onChange, legend, error, compact = false }: PickerProps) {
  const selected = new Set(value);
  const toggle = (skill: Skill) =>
    onChange(selected.has(skill) ? value.filter((s) => s !== skill) : options.filter((s) => s === skill || selected.has(s)));
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? 'skills-error' : undefined}>
      <legend className={clsx('mb-2', compact ? 'label' : 'text-sm font-semibold')}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((skill) => {
          const on = selected.has(skill);
          return (
            <button key={skill} type="button" aria-pressed={on} onClick={() => toggle(skill)}
              className={clsx('press inline-flex min-h-touch items-center gap-2 rounded border px-3 text-sm font-medium',
                on ? 'border-plate bg-plate text-plate-ink' : 'border-control bg-surface text-ink hover:border-ink')}>
              {on
                ? <Check size={14} aria-hidden="true" />
                : <span aria-hidden="true" className="h-2 w-2 rounded-avatar" style={{ background: FAMILY_DOT[skillFamily(skill)] }} />}
              {skill}
            </button>
          );
        })}
      </div>
      {error && <FieldError id="skills-error" message={error} />}
    </fieldset>
  );
}
