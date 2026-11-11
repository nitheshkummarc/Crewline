// Tailwind theme: every color, font and radius comes from the tokens in src/styles/tokens.css.
import type { Config } from 'tailwindcss';

const token = (name: string) => `var(--${name})`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      room: {
        DEFAULT: token('room'),
        raised: token('room-raised'),
        line: token('room-line'),
        control: token('room-control'),
        ink: token('room-ink'),
        ink2: token('room-ink-2'),
        amber: token('room-amber'),
        green: token('room-green'),
        red: token('room-red'),
      },
      board: token('board'),
      plate: { DEFAULT: token('plate'), ink: token('plate-ink') },
      flap: { DEFAULT: token('flap'), seam: token('flap-seam'), edge: token('flap-edge') },
      paint: { DEFAULT: token('paint'), 2: token('paint-2') },
      lamp: { amber: token('lamp-amber'), green: token('lamp-green'), red: token('lamp-red') },
      skill: {
        build: token('skill-build'),
        data: token('skill-data'),
        ops: token('skill-ops'),
        people: token('skill-people'),
      },
      focus: token('focus'),
    },
    fontFamily: {
      sans: ['"Archivo Variable"', 'system-ui', 'sans-serif'],
    },
    borderRadius: {
      none: '0',
      sm: '3px',
      DEFAULT: '4px',
      md: '6px',
    },
    extend: {
      maxWidth: { page: '1120px', read: '68ch' },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
      transitionTimingFunction: { out: token('ease-out') },
      boxShadow: { dialog: '0 12px 32px rgb(0 0 0 / 0.35)' },
    },
  },
  plugins: [],
} satisfies Config;
