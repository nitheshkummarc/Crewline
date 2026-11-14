// Confirmation dialog for actions that change the team for others (leave, remove, regenerate, finalize, reopen).
//
// Contents:
//   ConfirmDialog: A modal that asks once before an action that changes the team for others; focus trapped, Escape
//       closes.
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
  tone?: 'danger' | 'neutral';
}

export const DIALOG_CLASS = 'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 '
  + 'rounded-lg border border-line bg-surface p-6 text-ink shadow-2 outline-none data-[state=open]:animate-[dialog-in_180ms_cubic-bezier(0.2,0.8,0.2,1)]';

/** A modal that asks once before an action that changes the team for others; focus trapped, Escape closes. */
export function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, busyLabel, busy, error, onConfirm, tone = 'danger' }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)] data-[state=open]:animate-[fade-in_160ms_ease-out]" />
        <Dialog.Content className={DIALOG_CLASS}>
          <Dialog.Title className="display text-[22px] leading-7">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="mt-3 text-ink-2">{body}</div>
          </Dialog.Description>
          <ErrorNotice error={error} className="mt-4" />
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="ghost" disabled={busy}>Cancel</Button>
            </Dialog.Close>
            <Button variant={tone === 'danger' ? 'danger' : 'secondary'} busy={busy} busyLabel={busyLabel} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
