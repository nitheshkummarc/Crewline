// Page header on the navy brand field lit by soft warm and cool glows, with an optional row of facts.
//
// Contents:
//   HeroBanner: A colored page header: big title, supporting text, and real facts underneath.
//   HeroFact: One fact chip on the banner (real data only).
import type { ReactNode } from 'react';

interface Props {
  title: ReactNode;
  titleId: string;
  children?: ReactNode;
  facts?: ReactNode;
}

/** A colored page header: big title, supporting text, and real facts underneath. */
export function HeroBanner({ title, titleId, children, facts }: Props) {
  return (
    <section aria-labelledby={titleId} className="hero-surface relative overflow-hidden rounded-lg p-6 text-shell-ink shadow-2 md:p-9">
      <div className="relative z-10 flex max-w-[760px] flex-col gap-3">
        <h1 id={titleId} className="display text-[32px] leading-[38px] md:text-[48px] md:leading-[54px]">{title}</h1>
        {children}
      </div>
      {facts && <div className="relative z-10 mt-6 flex flex-wrap gap-2">{facts}</div>}
    </section>
  );
}

/** One fact chip on the banner (real data only). */
export function HeroFact({ children }: { children: ReactNode }) {
  return <span className="inline-flex min-h-[36px] items-center gap-2 rounded bg-[rgb(255_255_255/0.1)] px-3 text-sm font-semibold text-shell-ink">{children}</span>;
}
