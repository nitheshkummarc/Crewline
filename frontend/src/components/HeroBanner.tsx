// Page header on the navy brand field with decorative wristband stripes on the right (hidden on phones).
import type { ReactNode } from 'react';

const STRIPES = [
  { band: 0, taken: 4, rotate: -8 },
  { band: 1, taken: 2, rotate: 4 },
  { band: 5, taken: 3, rotate: -3 },
];

interface Props {
  eyebrow: string;
  title: ReactNode;
  titleId: string;
  children?: ReactNode;
  aside?: ReactNode;
}

/** A colored header: label, big title, supporting content, optional right-hand content instead of the stripes. */
export function HeroBanner({ eyebrow, title, titleId, children, aside }: Props) {
  return (
    <section aria-labelledby={titleId} className="relative overflow-hidden rounded-lg bg-shell p-6 text-shell-ink shadow-2 md:p-8">
      <div className="relative z-10 flex max-w-[640px] flex-col gap-3">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-shell-ink2">{eyebrow}</p>
        <h1 id={titleId} className="display text-[30px] leading-9 md:text-[44px] md:leading-[50px]">{title}</h1>
        {children}
      </div>
      {aside ?? (
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 top-1/2 hidden w-[340px] -translate-y-1/2 flex-col gap-3 md:flex">
          {STRIPES.map((stripe, index) => (
            <div key={index} className="flex h-12 items-center gap-2 rounded-md px-4 shadow-2"
              style={{ background: `var(--band-${stripe.band})`, transform: `rotate(${stripe.rotate}deg) translateX(${index * 14}px)` }}>
              <span className="h-3 w-14 rounded-sm bg-[color-mix(in_srgb,var(--band-ink)_80%,transparent)]" />
              <span className="ml-auto flex gap-[5px]">
                {Array.from({ length: 4 }, (_, seat) => (
                  <span key={seat} className={seat < stripe.taken
                    ? 'h-7 w-[18px] rounded-sm bg-[color-mix(in_srgb,var(--band-ink)_85%,transparent)]'
                    : 'h-7 w-[18px] rounded-sm border-2 border-dashed border-band-ink'} />
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
