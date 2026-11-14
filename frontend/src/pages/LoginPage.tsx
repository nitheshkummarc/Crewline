// Login form with client validation, honeypot and form token; signed-in users go straight to the app.
//
// Contents:
//   safeNext: Return a safe in-app path from ?next=, or "/".
//   LoginPage: The login page.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { AuthShell } from '../components/AuthShell';
import { Button } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { Honeypot, TextField } from '../components/Field';
import { useAnnounce } from '../components/LiveRegion';
import { useBotCheckedSubmit } from '../hooks/useBotCheckedSubmit';
import { useMe } from '../hooks/queries';
import { messageFor } from '../lib/errors';
import { keys } from '../lib/keys';
import { loginSchema, validate, type FieldErrors } from '../lib/validation';

/** Return a safe in-app path from ?next=, or "/". */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

/** The login page. */
export default function LoginPage() {
  const me = useMe();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const client = useQueryClient();
  const announce = useAnnounce();
  const bot = useBotCheckedSubmit('login');
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const login = useMutation({
    mutationFn: (body: typeof values) => bot.send((fields) => api.login({ ...body, ...fields })),
    onSuccess: (user) => {
      client.setQueryData(keys.me(), user);
      navigate(next, { replace: true });
    },
    onError: (error) => announce(messageFor(error)),
  });

  if (me.data) return <Navigate to={next} replace />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validate(loginSchema, values);
    setErrors(result.errors ?? {});
    if (result.data) login.mutate(result.data);
  };

  return (
    <AuthShell>
      <h2 className="display text-[28px] leading-8">Log in</h2>
      <p className="mt-2 text-ink-2">
        New here? <Link to={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold underline underline-offset-[3px]">Create an account</Link>.
      </p>
      <form noValidate onSubmit={submit} className="relative mt-6 flex flex-col gap-4">
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={values.email}
          error={errors.email} onChange={(e) => setValues({ ...values, email: e.target.value })} />
        <TextField label="Password" type="password" autoComplete="current-password" value={values.password}
          error={errors.password} onChange={(e) => setValues({ ...values, password: e.target.value })} />
        <Honeypot value={bot.company} onChange={bot.setCompany} />
        <ErrorNotice error={login.error} />
        <Button type="submit" variant="primary" busy={login.isPending} busyLabel="Logging in" disabled={!bot.ready}>
          Log in
        </Button>
      </form>
    </AuthShell>
  );
}
