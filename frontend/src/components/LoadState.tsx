// Loading skeleton rows, the empty state and load errors, shared by every page.
import type { ReactNode } from 'react';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';

/** Placeholder board rows while data loads (no spinner in the middle of content). */
export function SkeletonRows({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="overflow-hidden rounded-md bg-board">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-flap-seam px-4 py-[18px] last:border-b-0">
          <span className="flap-tile h-4 w-40 opacity-80" />
          <span className="flap-tile h-4 w-16 opacity-60" />
          <span className="flap-tile hidden h-4 w-28 opacity-40 md:block" />
        </div>
      ))}
    </div>
  );
}

/** A load error with the code, the one-line message and a retry button. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-room-line p-4">
      <ErrorNotice error={error} />
      <Button variant="secondary" onClick={onRetry}>Try again</Button>
    </div>
  );
}

/** An empty list that says what would fill it and what to do. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-room-control px-4 py-6">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-2 text-room-ink2">{children}</div>}
    </div>
  );
}
