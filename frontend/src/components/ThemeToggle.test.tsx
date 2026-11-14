// T-WEB-12: the theme switch offers only Light and Dark; the device setting applies until a choice is saved.
//
// Contents:
//   deviceIsDark: Make the fake device report a dark or light preference.
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

/** Make the fake device report a dark or light preference. */
function deviceIsDark(dark: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: dark && query === '(prefers-color-scheme: dark)', media: query }),
  });
}

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('T-WEB-12 theme switch', () => {
  it('shows exactly two options, Light and Dark', () => {
    render(<ThemeToggle />);
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('title'))).toEqual(['Light', 'Dark']);
  });

  it('checks the device theme when nothing is saved, without saving it', () => {
    deviceIsDark(true);
    render(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    expect(window.localStorage.getItem('crewline-theme')).toBeNull();
  });

  it('falls back to Light when the browser cannot report a preference', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  });

  it('applies and saves a choice, and a saved choice wins over the device', () => {
    deviceIsDark(true);
    window.localStorage.setItem('crewline-theme', 'light');
    render(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('crewline-theme')).toBe('dark');
  });

  it('moves between the two options with arrow keys and wraps around', () => {
    render(<ThemeToggle />);
    const light = screen.getByRole('radio', { name: 'Light' });
    fireEvent.keyDown(light, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Dark' }), { key: 'ArrowRight' });
    expect(light).toHaveAttribute('aria-checked', 'true');
  });
});
