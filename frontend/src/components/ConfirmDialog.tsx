// Confirmation dialog for destructive actions (leave, remove, regenerate, finalize, reopen); focus trapped, Escape closes.
import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  error: unknown;
  onConfirm: () => void;
  tone?: 'danger' | 'primary';
}

/** A modal that asks once before an action that changes the team for others. */
export function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, busyLabel, busy, error, onConfirm, tone = 'danger' }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgb(0_0_0/0.55)]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-room-line bg-room-raised p-6 text-room-ink shadow-dialog">
          <Dialog.Title className="page-title text-[20px] leading-6">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="mt-3 text-room-ink2">{body}</div>
          </Dialog.Description>
          <ErrorNotice error={error} className="mt-4" />
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="quiet" disabled={busy}>Cancel</Button>
            </Dialog.Close>
            <Button variant={tone === 'danger' ? 'danger' : 'secondary'} busy={busy} busyLabel={busyLabel} onClick={onConfirm}
              className={tone === 'danger' ? 'bg-[color-mix(in_srgb,var(--room-red)_14%,transparent)]' : undefined}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
