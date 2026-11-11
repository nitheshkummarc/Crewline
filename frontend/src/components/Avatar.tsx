// Initials avatar in the person's band color (picked from their user id).
import clsx from 'clsx';
import { bandStyle, initials } from '../lib/teamColor';

const SIZES = { sm: 'h-8 w-8 text-[12px]', md: 'h-10 w-10 text-sm', lg: 'h-16 w-16 text-xl' } as const;

/** A round avatar with initials; decorative, so the name must be shown next to it. */
export function Avatar({ id, name, size = 'md', className }: { id: string; name: string; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span aria-hidden="true" style={bandStyle(id)}
      className={clsx('band inline-flex shrink-0 items-center justify-center rounded-avatar font-bold ring-2 ring-surface', SIZES[size], className)}>
      {initials(name)}
    </span>
  );
}
