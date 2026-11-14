// Labeled form controls with the field error under the control, linked by aria-describedby.
//
// Contents:
//   FieldShell: Label above, control, hint and error below; the control gets the right ids.
//   FieldError: The error line under a field: a red mark and the message.
//   TextField: A labeled text input.
//   TextAreaField: A labeled multi-line input.
//   SelectField: A labeled native select.
//   Honeypot: Hidden honeypot field `company` for signup and login: off-screen, not focusable, never autofilled.
import clsx from 'clsx';
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const CONTROL = 'block w-full rounded border border-control bg-surface px-3 py-[10px] text-[16px] leading-6 text-ink '
  + 'placeholder:text-ink-2 transition-shadow duration-150 focus:border-focus focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--focus)_22%,transparent)] '
  + 'focus:outline-none aria-[invalid=true]:border-bad';

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Label above, control, hint and error below; the control gets the right ids. */
export function FieldShell({ label, hint, error, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-[6px]">
      <label htmlFor={id} className="text-sm font-semibold text-ink">{label}</label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && <p id={hintId} className="text-sm text-ink-2">{hint}</p>}
      {error && errorId && <FieldError id={errorId} message={error} />}
    </div>
  );
}

/** The error line under a field: a red mark and the message. */
export function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} className="flex items-start gap-2 text-sm font-medium text-bad">
      <span aria-hidden="true" className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-avatar bg-current" />
      {message}
    </p>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | undefined };

/** A labeled text input. */
export function TextField({ label, hint, error, className, ...rest }: InputProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <input id={id} aria-describedby={describedBy} aria-invalid={invalid} className={clsx(CONTROL, className)} {...rest} />
      )}
    </FieldShell>
  );
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode; error?: string | undefined };

/** A labeled multi-line input. */
export function TextAreaField({ label, hint, error, className, ...rest }: AreaProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <textarea id={id} aria-describedby={describedBy} aria-invalid={invalid}
          className={clsx(CONTROL, 'min-h-[96px] resize-y', className)} {...rest} />
      )}
    </FieldShell>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode; error?: string | undefined };

/** A labeled native select. */
export function SelectField({ label, hint, error, className, children, ...rest }: SelectProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={invalid} className={clsx(CONTROL, className)} {...rest}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

/** Hidden honeypot field `company` for signup and login: off-screen, not focusable, never autofilled. */
export function Honeypot({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
      <label htmlFor="company-field">Company</label>
      <input id="company-field" name="company" type="text" tabIndex={-1} autoComplete="off" value={value}
        onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
