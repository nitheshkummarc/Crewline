// Buttons and button-styled links: primary (one per page), secondary, ghost, danger; 44 px targets, 6 px radius.
//
// Contents:
//   buttonClass: Class list for a button of a variant and size.
//   Button: A button that is disabled and relabeled while its action is in flight.
//   ButtonLink: A router link styled as a button.
import clsx from 'clsx';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type Size = 'md' | 'sm';

const BASE = 'press inline-flex items-center justify-center gap-2 rounded font-semibold '
  + 'disabled:cursor-not-allowed disabled:opacity-50';

const SIZES: Record<Size, string> = {
  md: 'min-h-touch min-w-touch px-4 text-[15px] leading-5',
  sm: 'min-h-touch min-w-touch px-3 text-sm leading-5',
};

const VARIANTS: Record<Variant, string> = {
  primary: 'border border-brand-edge bg-brand text-brand-ink shadow-1 hover:shadow-2 hover:-translate-y-px hover:brightness-105',
  secondary: 'border border-control bg-surface text-ink hover:border-ink aria-pressed:border-ink aria-pressed:bg-plate aria-pressed:text-plate-ink',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'border border-bad text-bad hover:bg-[color-mix(in_srgb,var(--bad)_10%,transparent)]',
};

/** Class list for a button of a variant and size. */
export const buttonClass = (variant: Variant = 'secondary', size: Size = 'md', className?: string) =>
  clsx(BASE, SIZES[size], VARIANTS[variant], className);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
  busyLabel?: string;
}

/** A button that is disabled and relabeled while its action is in flight. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', busy = false, busyLabel, className, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || busy}
      aria-busy={busy || undefined} data-variant={variant} {...rest}>
      {busy && <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-avatar border-2 border-current border-r-transparent" />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
});

/** A router link styled as a button. */
export function ButtonLink({ variant = 'secondary', size = 'md', className, ...rest }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} data-variant={variant} {...rest} />;
}
