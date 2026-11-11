// Theme preference: light, dark or the system setting; stored per browser (a convenience, not app data).
import { useCallback, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'crewline-theme';

/** Return the saved theme mode, or "system" when none is saved or storage is blocked. */
export function savedTheme(): ThemeMode {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

/** Apply a theme mode to the document and remember it (storage failures are ignored). */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  try {
    if (mode === 'system') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

/** Return the current theme mode and a setter that applies it. */
export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(savedTheme);
  const set = useCallback((next: ThemeMode) => {
    applyTheme(next);
    setMode(next);
  }, []);
  return [mode, set];
}
