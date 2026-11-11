// Skill labels on flap tiles (color by family, code plus accessible name) and the skill picker.
import clsx from 'clsx';
import type { Skill } from '../api/types';
import { skillCode, skillFamily } from '../lib/skills';
import { FieldError } from './Field';

const FAMILY_TEXT = {
  build: 'text-skill-build',
  data: 'text-skill-data',
  ops: 'text-skill-ops',
  people: 'text-skill-people',
} as const;

/** One skill as a flap tile; `full` shows the whole name instead of the short code. */
export function SkillLabel({ skill, full = false, dim = false }: { skill: Skill; full?: boolean; dim?: boolean }) {
  return (
    <span title={skill} className={clsx('flap-tile cells inline-flex h-6 items-center px-[6px] text-[12px] leading-4',
      FAMILY_TEXT[skillFamily(skill)], dim && 'opacity-70')}>
      {full ? skill : <><span aria-hidden="true">{skillCode(skill)}</span><span className="sr-only">{skill}</span></>}
    </span>
  );
}

/** A row of skill labels; renders a dash when empty. */
export function SkillList({ skills, full = false, label }: { skills: readonly Skill[]; full?: boolean; label?: string }) {
  if (skills.length === 0) return <span className="text-sm text-paint-2">No skills listed</span>;
  return (
    <ul className="flex flex-wrap gap-1" aria-label={label}>
      {skills.map((skill) => <li key={skill}><SkillLabel skill={skill} full={full} /></li>)}
    </ul>
  );
}

interface PickerProps {
  options: readonly Skill[];
  value: readonly Skill[];
  onChange: (next: Skill[]) => void;
  legend: string;
  error?: string | undefined;
}

/** Toggle buttons for skills (aria-pressed), grouped in a fieldset with an error line. */
export function SkillPicker({ options, value, onChange, legend, error }: PickerProps) {
  const selected = new Set(value);
  const toggle = (skill: Skill) =>
    onChange(selected.has(skill) ? value.filter((s) => s !== skill) : options.filter((s) => s === skill || selected.has(s)));
  return (
    <fieldset className="flex flex-col gap-[6px]" aria-describedby={error ? 'skills-error' : undefined}>
      <legend className="mb-[6px] text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((skill) => {
          const on = selected.has(skill);
          return (
            <button key={skill} type="button" aria-pressed={on} onClick={() => toggle(skill)}
              className={clsx('press cells min-h-touch rounded border px-3 text-[13px]',
                on ? 'border-paint bg-board text-paint' : 'border-room-control text-room-ink2 hover:text-room-ink')}>
              <span aria-hidden="true" className={clsx('mr-2 inline-block h-2 w-2 align-middle', on ? 'bg-lamp-green' : 'bg-room-line')} />
              {skill}
            </button>
          );
        })}
      </div>
      {error && <FieldError id="skills-error" message={error} />}
    </fieldset>
  );
}
