// Theme preference: light or dark, stored per browser (a convenience, not app data); the device setting applies until a choice is saved.
import { useCallback, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'crewline-theme';

/** Return the device's preferred theme (light when the browser cannot tell). */
function deviceTheme(): ThemeMode {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Return the saved theme, or the device's theme when none is saved or storage is blocked. */
export function savedTheme(): ThemeMode {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : deviceTheme();
  } catch {
    return deviceTheme();
  }
}

/** Apply a theme to the document and remember it (storage failures are ignored). */
export function applyTheme(mode: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', mode);
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

/** Return the current theme and a setter that applies it. */
export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(savedTheme);
  const set = useCallback((next: ThemeMode) => {
    applyTheme(next);
    setMode(next);
  }, []);
  return [mode, set];
}
