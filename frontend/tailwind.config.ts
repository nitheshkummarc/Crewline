// Tailwind theme: every color, shadow, font and radius comes from the tokens in src/styles/tokens.css.
import type { Config } from 'tailwindcss';

const token = (name: string) => `var(--${name})`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      canvas: token('canvas'),
      surface: { DEFAULT: token('surface'), 2: token('surface-2') },
      line: token('line'),
      control: token('control'),
      ink: { DEFAULT: token('ink'), 2: token('ink-2') },
      plate: { DEFAULT: token('plate'), ink: token('plate-ink') },
      focus: token('focus'),
      ok: token('ok'),
      warn: token('warn'),
      bad: token('bad'),
      live: token('live'),
      band: { ink: token('band-ink') },
      // Fixed in both themes: the dark brand panel on login and signup, and white behind QR codes.
      night: { DEFAULT: '#111317', ink: '#f2f3f5', ink2: '#c4c9d0' },
      paper: '#ffffff',
    },
    fontFamily: {
      sans: ['"Archivo Variable"', 'system-ui', 'sans-serif'],
      mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
    },
    // No `full` radius: buttons can never be pill-shaped (product rule 13). Avatars use `rounded-avatar`.
    borderRadius: {
      none: '0',
      sm: '4px',
      DEFAULT: '6px',
      md: '10px',
      lg: '14px',
      avatar: '9999px',
    },
    boxShadow: {
      none: 'none',
      1: token('shadow-1'),
      2: token('shadow-2'),
    },
    extend: {
      maxWidth: { page: '1240px', read: '68ch' },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
      transitionTimingFunction: { out: token('ease-out') },
    },
  },
  plugins: [],
} satisfies Config;
