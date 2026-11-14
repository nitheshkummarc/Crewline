// Bot-checked form submit for login and signup: form token per render, honeypot, minimum fill time.
//
// Contents:
//   useBotCheckedSubmit: Return the bot fields and a `send` that waits out the minimum fill time before calling
//       the endpoint.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { BotFields } from '../api/types';
import { ApiError, timing } from '../api/client';
import { keys } from '../lib/keys';
import { useFormToken } from './queries';

export const MIN_FILL_MS = 2000;

/** Return the bot fields and a `send` that waits out the minimum fill time before calling the endpoint. */
export function useBotCheckedSubmit(form: 'login' | 'signup') {
  const client = useQueryClient();
  const token = useFormToken(form);
  const [company, setCompany] = useState('');

  const send = async <T,>(call: (fields: BotFields) => Promise<T>): Promise<T> => {
    const current = token.data ?? (await token.refetch()).data;
    if (!current) throw new ApiError(0, 'network_error', 'Could not load the form. Check your network.');
    // A person who submits within 2 s (autofill) waits the rest instead of being rejected.
    const wait = MIN_FILL_MS + 50 - (Date.now() - current.receivedAt);
    if (wait > 0) await timing.sleep(wait);
    try {
      return await call({ form_token: current.token, company });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'bot_check_failed') {
        void client.invalidateQueries({ queryKey: keys.formToken(form) });
      }
      throw error;
    }
  };

  return { ready: token.isSuccess, company, setCompany, send };
}
