// Dialog to send a join request with an optional message (max 280 characters).
import * as Dialog from '@radix-ui/react-dialog';
import { useState, type FormEvent } from 'react';
import { LIMITS, requestMessageSchema, validate } from '../lib/validation';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';
import { TextAreaField } from './Field';

interface Props {
  teamName: string | null;
  busy: boolean;
  error: unknown;
  onSend: (message: string | null) => void;
  onClose: () => void;
}

/** Ask a team's leader to let the caller join; opens when `teamName` is set. */
export function RequestDialog({ teamName, busy, error, onSend, onClose }: Props) {
  const [message, setMessage] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validate(requestMessageSchema, { message });
    setFieldError(result.errors?.message);
    if (result.data) onSend(result.data.message || null);
  };
  return (
    <Dialog.Root open={teamName !== null} onOpenChange={(open) => { if (!open && !busy) { setMessage(''); setFieldError(undefined); onClose(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgb(0_0_0/0.55)]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-room-line bg-room-raised p-6 text-room-ink shadow-dialog">
          <Dialog.Title className="page-title text-[20px] leading-6">Ask to join {teamName}</Dialog.Title>
          <Dialog.Description className="mt-2 text-room-ink2">
            The leader sees your name, skills, time zone and this message. You can have up to 5 requests waiting.
          </Dialog.Description>
          <form noValidate onSubmit={submit} className="mt-4 flex flex-col gap-4">
            <TextAreaField label="Message to the leader (optional)" value={message} maxLength={LIMITS.messageMax + 20}
              hint={`${message.trim().length} of ${LIMITS.messageMax} characters`} error={fieldError}
              onChange={(event) => setMessage(event.target.value)} />
            <ErrorNotice error={error} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Dialog.Close asChild><Button variant="quiet" disabled={busy}>Cancel</Button></Dialog.Close>
              <Button type="submit" variant="secondary" busy={busy} busyLabel="Sending">Send request</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
