// Layout for login and signup: the product headline on the navy brand panel with wristband stripes, beside the form.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CONTACT_URL, Wordmark } from './Layout';
import { ThemeToggle } from './ThemeToggle';

export const HEADLINE = 'Form a hackathon team. One seat, one winner, no double joins.';

// Decorative stripes: each is a wristband with its seats; the last stripe has one seat left.
const STRIPES: Array<{ band: number; taken: number; size: number; rotate: number }> = [
  { band: 0, taken: 4, size: 4, rotate: -6 },
  { band: 1, taken: 2, size: 4, rotate: 3 },
  { band: 2, taken: 1, size: 4, rotate: -2 },
  { band: 4, taken: 3, size: 4, rotate: 5 },
];

function Stripes() {
  return (
    <div aria-hidden="true" className="pointer-events-none flex select-none flex-col gap-4">
      {STRIPES.map((stripe, index) => (
        <div key={index} className="flex h-14 items-center gap-2 rounded-md px-4 shadow-2 md:h-16"
          style={{ background: `var(--band-${stripe.band})`, transform: `rotate(${stripe.rotate}deg) translateX(${index * 18}px)` }}>
          <span className="h-3 w-16 rounded-sm bg-[color-mix(in_srgb,var(--band-ink)_80%,transparent)]" />
          <span className="ml-auto flex gap-[6px]">
            {Array.from({ length: stripe.size }, (_, seat) => (
              <span key={seat} className={seat < stripe.taken
                ? 'h-8 w-5 rounded-sm bg-[color-mix(in_srgb,var(--band-ink)_85%,transparent)]'
                : 'h-8 w-5 rounded-sm border-2 border-dashed border-[var(--band-ink)]'} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Split screen: color panel with the headline and stripes, then the form; stacked on phones. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas md:grid md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <a href="#main" className="sr-only z-50 rounded bg-plate px-4 py-3 text-plate-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to main content
      </a>
      <section aria-labelledby="headline"
        className="relative flex flex-col justify-between gap-10 overflow-hidden bg-shell px-5 pb-10 pt-6 text-shell-ink md:px-12 md:py-12">
        <div className="flex items-center justify-between gap-4"><Wordmark /><ThemeToggle onShell /></div>
        <div className="relative z-10 flex flex-col gap-5">
          <h1 id="headline" className="display max-w-[16ch] text-[34px] leading-[38px] md:text-[52px] md:leading-[56px]">{HEADLINE}</h1>
          <ul className="flex max-w-[46ch] flex-col gap-2 text-shell-ink2">
            <li>See every team with an open seat, live, as people join and leave.</li>
            <li>Join with an invite code, or ask a leader and get an answer here.</li>
            <li>When two people go for the last seat, exactly one gets it.</li>
          </ul>
        </div>
        <div className="hidden md:block"><Stripes /></div>
        <nav aria-label="Legal and contact" className="hidden gap-6 text-sm text-shell-ink2 md:flex">
          <Link to="/privacy" className="underline underline-offset-[3px] hover:text-shell-ink">Privacy</Link>
          <Link to="/terms" className="underline underline-offset-[3px] hover:text-shell-ink">Terms</Link>
          <a href={CONTACT_URL} className="underline underline-offset-[3px] hover:text-shell-ink">Contact</a>
        </nav>
      </section>
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col justify-center px-5 py-10 outline-none md:px-12">
        <div className="card mx-auto w-full max-w-[460px] p-6 md:p-8">{children}</div>
        <nav aria-label="Legal" className="mx-auto mt-8 flex w-full max-w-[460px] gap-6 text-sm text-ink-2 md:hidden">
          <Link to="/privacy" className="inline-flex min-h-touch items-center underline underline-offset-[3px]">Privacy</Link>
          <Link to="/terms" className="inline-flex min-h-touch items-center underline underline-offset-[3px]">Terms</Link>
          <a href={CONTACT_URL} className="inline-flex min-h-touch items-center underline underline-offset-[3px]">Contact</a>
        </nav>
      </main>
    </div>
  );
}
