// Buttons and button-styled links: primary (one per page), secondary, board, danger, quiet; 44 px targets, 4 px radius.
import clsx from 'clsx';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export type Variant = 'primary' | 'secondary' | 'board' | 'danger' | 'quiet';

const BASE = 'press inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded px-4 '
  + 'text-[15px] font-semibold leading-5 disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-plate text-plate-ink hover:brightness-110',
  secondary: 'border border-room-control text-room-ink hover:border-room-ink aria-pressed:border-room-ink aria-pressed:bg-room-raised',
  // Secondary action on an always-dark board surface.
  board: 'border border-flap-edge text-paint hover:border-paint aria-pressed:border-paint',
  danger: 'border border-room-red text-room-red hover:bg-[color-mix(in_srgb,var(--room-red)_12%,transparent)]',
  quiet: 'text-room-ink2 underline underline-offset-[3px] hover:text-room-ink',
};

/** Class list for a button of a variant. */
export const buttonClass = (variant: Variant = 'secondary', className?: string) =>
  clsx(BASE, VARIANTS[variant], className);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  busy?: boolean;
  busyLabel?: string;
}

/** A button that is disabled and relabeled while its action is in flight. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', busy = false, busyLabel, className, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, className)} disabled={disabled || busy} data-variant={variant}
      aria-busy={busy || undefined} {...rest}>
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
});

/** A router link styled as a button. */
export function ButtonLink({ variant = 'secondary', className, ...rest }: LinkProps & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} data-variant={variant} {...rest} />;
}
