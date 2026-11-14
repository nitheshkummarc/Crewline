// Side sheet (bottom sheet on phones) for peeking at a team without leaving the board; focus trapped, Escape closes.
//
// Contents:
//   Sheet: A sheet that slides in from the right on wide screens and from the bottom on phones.
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  header?: ReactNode;
  style?: CSSProperties;
  children: ReactNode;
}

/** A sheet that slides in from the right on wide screens and from the bottom on phones. */
export function Sheet({ open, onOpenChange, title, description, header, style, children }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)] data-[state=open]:animate-[fade-in_160ms_ease-out]" />
        <Dialog.Content style={style}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-lg bg-surface shadow-2 outline-none data-[state=open]:animate-[sheet-up_220ms_cubic-bezier(0.2,0.8,0.2,1)] md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[440px] md:rounded-none md:data-[state=open]:animate-[sheet-left_220ms_cubic-bezier(0.2,0.8,0.2,1)]">
          <div className="band relative px-5 pb-5 pt-6">
            <Dialog.Close className="press absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded hover:bg-[color-mix(in_srgb,var(--band-ink)_12%,transparent)]" aria-label="Close">
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
            <Dialog.Title className="display pr-12 text-[24px] leading-7">{title}</Dialog.Title>
            {description && <Dialog.Description className="mt-1 text-sm">{description}</Dialog.Description>}
            {header}
          </div>
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
