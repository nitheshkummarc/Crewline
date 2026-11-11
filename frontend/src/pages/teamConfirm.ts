// Text and action for each team confirmation dialog (leave, finalize, reopen, remove).
import type { Member, TeamDetail } from '../api/types';

export type Confirm = 'leave' | 'finalize' | 'reopen' | { remove: Member } | null;

/** The part of a mutation hook result the dialogs use. */
interface Runner<TVars> {
  isPending: boolean;
  error: unknown;
  mutate: (vars: TVars, options?: { onSuccess?: () => void }) => void;
}

interface Args {
  confirm: Confirm;
  team: TeamDetail;
  isLeader: boolean;
  leave: Runner<undefined>;
  finalize: Runner<undefined>;
  reopen: Runner<undefined>;
  remove: Runner<string>;
  onLeft: () => void;
  onClose: () => void;
}

export interface ConfirmCopy {
  title: string;
  body: string;
  label: string;
  busyLabel: string;
  busy: boolean;
  error: unknown;
  run: () => void;
}

/** Return the dialog text and action for the open confirmation, or null when none is open. */
export function teamConfirmCopy({ confirm, team, isLeader, leave, finalize, reopen, remove, onLeft, onClose }: Args): ConfirmCopy | null {
  if (confirm === 'leave') {
    const others = team.members.length - 1;
    return {
      title: 'Leave this team?',
      body: others === 0 ? 'You are the last member, so the team is deleted.'
        : isLeader ? 'Leadership passes to the member who joined earliest.' : 'Your seat opens for someone else.',
      label: 'Leave team', busyLabel: 'Leaving', busy: leave.isPending, error: leave.error,
      run: () => leave.mutate(undefined, { onSuccess: onLeft }),
    };
  }
  if (confirm === 'finalize') {
    return {
      title: 'Finalize the team?', body: `No one can join while it is finalized. You can reopen it later. It needs at least ${team.min_size} members.`,
      label: 'Finalize', busyLabel: 'Finalizing', busy: finalize.isPending, error: finalize.error,
      run: () => finalize.mutate(undefined, { onSuccess: onClose }),
    };
  }
  if (confirm === 'reopen') {
    return {
      title: 'Reopen the team?', body: 'The team takes members again and shows on the board while seats are open.',
      label: 'Reopen', busyLabel: 'Reopening', busy: reopen.isPending, error: reopen.error,
      run: () => reopen.mutate(undefined, { onSuccess: onClose }),
    };
  }
  if (confirm && typeof confirm === 'object') {
    const member = confirm.remove;
    return {
      title: `Remove ${member.display_name}?`, body: 'Their seat opens at once. They can ask to join again.',
      label: 'Remove', busyLabel: 'Removing', busy: remove.isPending, error: remove.error,
      run: () => remove.mutate(member.user_id, {
        onSuccess: () => {
          onClose();
          window.setTimeout(() => document.getElementById('members-title')?.focus(), 0);
        },
      }),
    };
  }
  return null;
}
