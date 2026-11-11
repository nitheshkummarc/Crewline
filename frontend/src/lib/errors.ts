// UI messages for API error codes (one per code in docs/api.md, plus the client's network_error).
import { ApiError } from '../api/client';
import type { ErrorCode } from '../api/types';

export const MESSAGES: Record<ErrorCode, string> = {
  validation_error: 'Some fields are not valid. Check the highlighted fields.',
  bot_check_failed: 'That was faster than a person can type. Wait a moment and submit again.',
  idempotency_key_required: 'The request was missing its retry key. Reload the page and try again.',
  unauthenticated: 'Your session ended. Log in again.',
  invalid_credentials: 'Wrong email or password.',
  not_leader: 'Only the team leader can do this.',
  members_only: 'Only members of this team can see this.',
  not_found: 'This no longer exists.',
  invite_invalid: 'This invite code is wrong or has expired. Ask the team for a new one.',
  email_taken: 'An account with this email already exists. Log in instead.',
  not_registered: 'Register for this hackathon first.',
  already_in_team: 'You are already in a team in this hackathon. Leave it first.',
  team_full: 'Someone took the last seat.',
  team_finalized: 'This team is finalized and not taking members.',
  not_finalized: 'This team is not finalized.',
  below_min_size: 'The team is below the minimum size for this hackathon.',
  request_not_pending: 'This request was already handled.',
  not_a_member: 'That person is no longer in the team.',
  cannot_remove_self: 'Use Leave team to remove yourself.',
  too_many_pending_requests: 'You already have 5 pending requests. Withdraw one to send another.',
  idempotency_key_mismatch: 'This action conflicted with an earlier one. Reload the page and try again.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  busy: 'The server is busy. Try again in a moment.',
  internal_error: 'Something went wrong on our side. Try again.',
  network_error: 'No connection. Check your network and try again.',
};

/** Return the error code of any thrown value. */
export function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : 'internal_error';
}

/** Return the message to show for any thrown value; validation errors keep the server's text. */
export function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'validation_error') return error.message;
    return MESSAGES[error.code as ErrorCode] ?? error.message;
  }
  return MESSAGES.internal_error;
}
