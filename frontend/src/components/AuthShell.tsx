// Layout for login and signup: the headline and how Crewline works on the lit navy panel, beside the form.
//
// Contents:
//   AuthShell: Split screen: lit navy panel with the headline and three steps, then the form; stacked on phones.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CONTACT_URL, Wordmark } from './Layout';
import { ThemeToggle } from './ThemeToggle';

export const HEADLINE = 'Form a hackathon team. One seat, one winner, no double joins.';

const STEPS: Array<{ band: number; title: string; text: string }> = [
  { band: 0, title: 'See who has a seat', text: 'Every team with an open seat, live, with the skills it still needs.' },
  { band: 1, title: 'Join or ask', text: 'Use an invite code from a team, or send the leader a request.' },
  { band: 5, title: 'One seat, one winner', text: 'When many people go for the last seat at once, exactly one gets it.' },
];

/** Split screen: lit navy panel with the headline and three steps, then the form; stacked on phones. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:grid md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <a href="#main" className="sr-only z-50 rounded bg-plate px-4 py-3 text-plate-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to main content
      </a>
      <section aria-labelledby="headline"
        className="hero-surface relative flex flex-col justify-between gap-10 overflow-hidden px-5 pb-10 pt-6 text-shell-ink md:px-12 md:py-12">
        <div className="flex items-center justify-between gap-4"><Wordmark /><ThemeToggle onShell /></div>
        <div className="flex flex-col gap-8">
          <h1 id="headline" className="display max-w-[15ch] text-[34px] leading-[38px] md:text-[54px] md:leading-[58px]">{HEADLINE}</h1>
          <ol className="flex max-w-[480px] flex-col gap-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex items-start gap-4">
                <span className="num band flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-lg font-bold"
                  style={{ ['--band' as string]: `var(--band-${step.band})` }}>{index + 1}</span>
                <span><span className="block font-bold">{step.title}</span><span className="text-shell-ink2">{step.text}</span></span>
              </li>
            ))}
          </ol>
        </div>
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
