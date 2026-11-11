// Public pages: privacy notice, terms of use, and the 404 page.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '../components/Button';
import { CONTACT_URL, Wordmark } from '../components/Layout';

export const LEGAL_UPDATED = '11 November 2026';

/** Reading layout for the legal pages, usable signed in or out. */
function ReadingPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-50 rounded bg-paint px-4 py-3 text-board focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to main content
      </a>
      <header className="border-b border-flap-seam bg-board">
        <div className="mx-auto flex h-14 max-w-page items-center px-4">
          <Link to="/" className="inline-flex min-h-touch items-center" aria-label="Crewline home"><Wordmark /></Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-read flex-1 px-4 py-8 outline-none">
        <h1 className="page-title">{title}</h1>
        <p className="mt-2 text-sm text-room-ink2">Last updated {LEGAL_UPDATED}</p>
        <div className="mt-6 flex flex-col gap-6 [&_h2]:caps-heading [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-7 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
          {children}
        </div>
        <p className="mt-10">
          Questions or a request about your data: <a href={CONTACT_URL} className="underline underline-offset-[3px]">open an issue on GitHub</a>.
        </p>
        <ButtonLink to="/" variant="primary" className="mt-6">Back to Crewline</ButtonLink>
      </main>
    </div>
  );
}

/** What Crewline stores, why, for how long, and the one cookie it sets. */
export function PrivacyPage() {
  return (
    <ReadingPage title="Privacy">
      <section className="flex flex-col gap-3">
        <h2>What we store</h2>
        <ul>
          <li>Your account: email address, a hash of your password (never the password itself), your display name, skills and time zone.</li>
          <li>Per hackathon: that you registered, and whether you show yourself on the People board.</li>
          <li>Teams you create or join, join requests you send or decide, and an audit log of team actions: who did what and when.</li>
          <li>Short-lived retry records of your actions, so a repeated request never joins you twice.</li>
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2>Why</h2>
        <p>To run team formation: show teams with open seats, show people who are looking, rank teammates by the roles a team is missing and by working-hour overlap, and let team members see the history of their team.</p>
      </section>
      <section className="flex flex-col gap-3">
        <h2>Who sees what</h2>
        <ul>
          <li>Other participants see your display name, skills and time zone on the boards and in teams.</li>
          <li>Your email address is never shown to other participants.</li>
          <li>Invite codes, join requests and the team history are shown only to the members of that team (and a request to the person who sent it).</li>
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2>Cookies and tracking</h2>
        <p>One cookie: <code>crewline_session</code>, an httpOnly session cookie that keeps you logged in for up to 2 hours. There are no analytics, advertising or third-party scripts, and fonts are served from this site.</p>
      </section>
      <section className="flex flex-col gap-3">
        <h2>How long we keep it</h2>
        <p>Retry records are deleted after 24 hours. Account, team and audit data are kept for the hackathon and its judging, then deleted when the event's data is cleared. Ask through the contact link below to delete your account earlier.</p>
      </section>
    </ReadingPage>
  );
}

/** Acceptable use, accounts, invite codes and requests, no warranty. */
export function TermsPage() {
  return (
    <ReadingPage title="Terms of use">
      <section className="flex flex-col gap-3">
        <h2>Using Crewline</h2>
        <p>Crewline helps hackathon participants form teams. Use it to find teammates and manage your team. Do not use it to spam people with requests, impersonate others, guess invite codes, or overload the service.</p>
      </section>
      <section className="flex flex-col gap-3">
        <h2>Your account</h2>
        <ul>
          <li>One account per person, with an email address you control and a name that is not offensive or misleading.</li>
          <li>Keep your password to yourself. You are responsible for actions taken with your account.</li>
          <li>Accounts that break these terms can be removed.</li>
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2>Teams, invite codes and requests</h2>
        <ul>
          <li>You can be in one team per hackathon. Team sizes are set by the hackathon.</li>
          <li>An invite code lets anyone who has it join while a seat is open, until it expires or the leader replaces it. Share it only with people you want on the team.</li>
          <li>You can have up to 5 join requests waiting. The team leader decides. A request goes stale if you join another team first; while a team is full, its leader cannot accept anyone.</li>
          <li>When several people try for the last seat at once, exactly one gets it. The others are told the team is full.</li>
          <li>If the leader leaves, the member who joined earliest becomes leader. When the last member leaves, the team is deleted.</li>
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2>No warranty</h2>
        <p>Crewline is provided as is, without warranty of any kind. It may be unavailable at times, and we are not liable for lost seats, missed deadlines or any other loss from using it.</p>
      </section>
      <section className="flex flex-col gap-3">
        <h2>Changes</h2>
        <p>These terms can change; the date above shows the latest version.</p>
      </section>
    </ReadingPage>
  );
}

/** The 404 page for unknown client routes: a cancelled row on the board. */
export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-start justify-center gap-6 bg-board px-4 text-paint md:px-12">
      <Wordmark />
      <main id="main" className="flex flex-col gap-4">
        <p className="cells flex items-center gap-3 text-[14px] text-lamp-red">
          <span aria-hidden="true" className="h-2 w-2 bg-lamp-red" />Not found
        </p>
        <h1 className="cells text-[32px] leading-9 md:text-[44px] md:leading-[48px]">This page is not on the board</h1>
        <p className="max-w-[48ch] text-paint-2">The link may be mistyped, or the team it pointed to was deleted.</p>
        <ButtonLink to="/" variant="primary" className="self-start">Go to Crewline</ButtonLink>
      </main>
    </div>
  );
}
