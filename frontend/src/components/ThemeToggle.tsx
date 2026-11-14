// Light or dark theme switch as a radio group (arrow keys move between options).
//
// Contents:
//   ThemeToggle: Two-way theme switch; `onShell` styles it for the navy brand shell.
import clsx from 'clsx';
import { Moon, Sun } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useTheme, type ThemeMode } from '../lib/theme';

const OPTIONS: Array<{ mode: ThemeMode; label: string; Icon: typeof Sun }> = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
];

/** Two-way theme switch; `onShell` styles it for the navy brand shell. */
export function ThemeToggle({ onShell = false, className }: { onShell?: boolean; className?: string }) {
  const [mode, setMode] = useTheme();
  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = OPTIONS.findIndex((option) => option.mode === mode);
    const next = OPTIONS[(index + step + OPTIONS.length) % OPTIONS.length];
    if (next) {
      setMode(next.mode);
      (event.currentTarget.parentElement?.querySelector(`[data-mode="${next.mode}"]`) as HTMLButtonElement | null)?.focus();
    }
  };
  return (
    <div role="radiogroup" aria-label="Theme"
      className={clsx('inline-flex rounded-md p-1', onShell ? 'bg-shell-2' : 'border border-line bg-surface-2', className)}>
      {OPTIONS.map(({ mode: option, label, Icon }) => {
        const checked = mode === option;
        return (
          <button key={option} type="button" role="radio" aria-checked={checked} data-mode={option} tabIndex={checked ? 0 : -1}
            onClick={() => setMode(option)} onKeyDown={move} title={label}
            className={clsx('press inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded px-3 text-sm font-semibold',
              checked ? 'bg-brand text-brand-ink shadow-1' : onShell ? 'text-shell-ink2 hover:text-shell-ink' : 'text-ink-2 hover:text-ink')}>
            <Icon size={16} aria-hidden="true" />
            <span className={onShell ? 'sr-only' : 'sr-only sm:not-sr-only'}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
