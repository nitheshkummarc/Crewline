// The one error display: the exact API error code and one line saying what happened and what to do.
//
// Contents:
//   ErrorNotice: Show an API error: code tag, one-line message, and the request id for server errors.
import { CircleAlert } from 'lucide-react';
import { ApiError } from '../api/client';
import { errorCode, messageFor } from '../lib/errors';

interface Props {
  error: unknown;
  id?: string;
  className?: string;
}

/** Show an API error: code tag, one-line message, and the request id for server errors. */
export function ErrorNotice({ error, id, className = '' }: Props) {
  if (!error) return null;
  const code = errorCode(error);
  const requestId = error instanceof ApiError && error.status >= 500 ? error.requestId : null;
  return (
    <div id={id} data-error-code={code}
      className={`flex items-start gap-3 rounded border border-bad bg-[color-mix(in_srgb,var(--bad)_8%,var(--surface))] px-3 py-[10px] text-sm ${className}`}>
      <CircleAlert size={18} aria-hidden="true" className="mt-[1px] shrink-0 text-bad" />
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="rounded-sm bg-bad px-[6px] py-[1px] font-mono text-[11px] font-semibold uppercase tracking-wide text-surface">{code}</span>
        <span className="text-ink">{messageFor(error)}</span>
        {requestId && <span className="text-ink-2">Ref {requestId.slice(0, 12)}</span>}
      </p>
    </div>
  );
}
