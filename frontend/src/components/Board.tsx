// Board primitives: lamps, flap text that turns over when its value changes, and the seat strip.
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

export type LampTone = 'amber' | 'green' | 'red' | 'off';

const LAMP: Record<LampTone, string> = {
  amber: 'bg-lamp-amber',
  green: 'bg-lamp-green',
  red: 'bg-lamp-red',
  off: 'bg-flap-edge',
};

/** An 8 px square lamp with its text label; color is never the only signal. */
export function Lamp({ tone, label, className }: { tone: LampTone; label: string; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <span aria-hidden="true" className={clsx('h-2 w-2 shrink-0', LAMP[tone])} />
      <span>{label}</span>
    </span>
  );
}

/** Text whose characters turn over once when the value changes after the first render. */
export function FlapText({ value, className, animateFirst = false }: { value: string; className?: string; animateFirst?: boolean }) {
  const first = useRef(true);
  const [turn, setTurn] = useState(animateFirst ? 1 : 0);
  const previous = useRef(value);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (previous.current !== value) {
      previous.current = value;
      setTurn((n) => n + 1);
    }
  }, [value]);
  return (
    <span className={className}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" key={turn}>
        {turn === 0 ? value : <FlapWords value={value} />}
      </span>
    </span>
  );
}

/** Characters grouped by word so lines break only between words; each character turns over with a stagger. */
function FlapWords({ value }: { value: string }) {
  let index = 0;
  return (
    <>
      {value.split(' ').map((word, w) => (
        <span key={w}>
          {w > 0 && ' '}
          <span className="whitespace-nowrap">
            {[...word].map((char) => {
              index += 1;
              return <span key={index} className="flap-char" style={{ ['--i' as string]: Math.min(index, 20) }}>{char}</span>;
            })}
          </span>
        </span>
      ))}
    </>
  );
}

/** One tile per seat: lit when taken, open with a seam, an amber lamp on the last open seat. */
export function SeatStrip({ taken, size, mine = false }: { taken: number; size: number; mine?: boolean }) {
  const open = size - taken;
  return (
    <span className="inline-flex items-center gap-[3px]" role="img"
      aria-label={`${taken} of ${size} seats taken${open === 1 ? ', last seat open' : ''}`}>
      {Array.from({ length: size }, (_, index) => {
        const filled = index < taken;
        const last = !filled && open === 1;
        return (
          <span key={index} className={clsx('h-[18px] w-[12px] rounded-sm transition-colors duration-150',
            filled ? (mine ? 'bg-lamp-green' : 'bg-paint') : 'flap-tile border border-flap-edge',
            last && 'border-lamp-amber')} />
        );
      })}
    </span>
  );
}
