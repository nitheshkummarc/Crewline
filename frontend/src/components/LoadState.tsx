// Loading skeletons, the empty state and load errors, shared by every page.
import type { ReactNode } from 'react';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';

/** Placeholder cards while data loads (no spinner in the middle of content). */
export function SkeletonCards({ count = 3, label = 'Loading', grid = true }: { count?: number; label?: string; grid?: boolean }) {
  return (
    <div role="status" aria-label={label} className={grid ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'flex flex-col gap-3'}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card overflow-hidden">
          <div className="h-14 animate-pulse bg-surface-2" />
          <div className="flex flex-col gap-3 p-4">
            <div className="h-4 w-2/3 animate-pulse rounded-sm bg-surface-2" />
            <div className="h-4 w-1/2 animate-pulse rounded-sm bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A load error with the code, the one-line message and a retry button. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-4">
      <ErrorNotice error={error} className="w-full" />
      <Button variant="secondary" onClick={onRetry}>Try again</Button>
    </div>
  );
}

/** An empty list that says what would fill it and what to do. */
export function EmptyState({ title, icon, children }: { title: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-control px-5 py-6">
      {icon && <span aria-hidden="true" className="text-ink-2">{icon}</span>}
      <p className="font-semibold">{title}</p>
      {children && <div className="text-ink-2">{children}</div>}
    </div>
  );
}
