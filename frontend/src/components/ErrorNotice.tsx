// The one error display: red lamp, the exact API error code, one line saying what happened and what to do.
import { ApiError } from '../api/client';
import { errorCode, messageFor } from '../lib/errors';

interface Props {
  error: unknown;
  id?: string;
  className?: string;
}

/** Show an API error as a cancelled board row: code and one-line message (request id for server errors). */
export function ErrorNotice({ error, id, className = '' }: Props) {
  if (!error) return null;
  const code = errorCode(error);
  const requestId = error instanceof ApiError && error.status >= 500 ? error.requestId : null;
  return (
    <div id={id} className={`flex items-start gap-2 text-sm text-room-red ${className}`} data-error-code={code}>
      <span aria-hidden="true" className="mt-[6px] h-2 w-2 shrink-0 bg-current" />
      <p>
        <span className="cells mr-2">{code}</span>
        <span className="text-room-ink">{messageFor(error)}</span>
        {requestId && <span className="ml-2 text-room-ink2">Ref {requestId.slice(0, 12)}</span>}
      </p>
    </div>
  );
}
