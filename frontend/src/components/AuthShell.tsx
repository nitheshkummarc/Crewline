// Layout for login and signup: the product headline on the board beside the form (above it on phones).
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FlapText } from './Board';
import { CONTACT_URL, Wordmark } from './Layout';

export const HEADLINE = 'Form a hackathon team. One seat, one winner, no double joins.';

/** Split screen with the board panel and the form panel; footer links stay reachable. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <a href="#main" className="sr-only z-50 rounded bg-paint px-4 py-3 text-board focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to main content
      </a>
      <section aria-labelledby="headline" className="flex flex-col justify-between gap-8 bg-board px-4 py-6 text-paint md:px-12 md:py-12">
        <Wordmark />
        <div className="flex flex-col gap-5">
          <h1 id="headline" className="cells max-w-[18ch] text-[30px] leading-[34px] tracking-[0.02em] md:text-[44px] md:leading-[48px]">
            <FlapText value={HEADLINE} animateFirst />
          </h1>
          <ul className="flex max-w-[44ch] flex-col gap-2 text-paint-2">
            <li>Teams show their open seats live, for every participant at once.</li>
            <li>Join with an invite code from a team, or send the leader a request.</li>
            <li>When two people go for the last seat, exactly one gets it.</li>
          </ul>
        </div>
        <nav aria-label="Legal and contact" className="hidden gap-6 text-sm text-paint-2 md:flex">
          <Link to="/privacy" className="underline underline-offset-[3px] hover:text-paint">Privacy</Link>
          <Link to="/terms" className="underline underline-offset-[3px] hover:text-paint">Terms</Link>
          <a href={CONTACT_URL} className="underline underline-offset-[3px] hover:text-paint">Contact</a>
        </nav>
      </section>
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col justify-center px-4 py-8 outline-none md:px-12">
        <div className="mx-auto w-full max-w-[420px]">{children}</div>
        <nav aria-label="Legal" className="mx-auto mt-10 flex w-full max-w-[420px] gap-6 text-sm text-room-ink2 md:hidden">
          <Link to="/privacy" className="inline-flex min-h-touch items-center underline underline-offset-[3px]">Privacy</Link>
          <Link to="/terms" className="inline-flex min-h-touch items-center underline underline-offset-[3px]">Terms</Link>
          <a href={CONTACT_URL} className="inline-flex min-h-touch items-center underline underline-offset-[3px]">Contact</a>
        </nav>
      </main>
    </div>
  );
}
