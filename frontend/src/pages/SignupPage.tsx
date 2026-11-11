// Signup form: name, email, password, skills, time zone, agreement to terms and privacy; bot-checked.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import type { Skill } from '../api/types';
import { AuthShell } from '../components/AuthShell';
import { Button } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { FieldError, Honeypot, TextField } from '../components/Field';
import { useAnnounce } from '../components/LiveRegion';
import { SkillPicker } from '../components/Skills';
import { TimeZoneField } from '../components/TimeZoneField';
import { useBotCheckedSubmit } from '../hooks/useBotCheckedSubmit';
import { useMe, useMeta } from '../hooks/queries';
import { ApiError } from '../api/client';
import { messageFor } from '../lib/errors';
import { keys } from '../lib/keys';
import { SKILLS } from '../lib/skills';
import { browserTimeZone } from '../lib/time';
import { LIMITS, apiFieldError, signupSchema, validate, type FieldErrors } from '../lib/validation';
import { safeNext } from './LoginPage';

/** The signup page. */
export default function SignupPage() {
  const me = useMe();
  const meta = useMeta();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const client = useQueryClient();
  const announce = useAnnounce();
  const bot = useBotCheckedSubmit('signup');
  const [values, setValues] = useState({
    display_name: '', email: '', password: '', skills: [] as Skill[], timezone: browserTimeZone(), agree: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const signup = useMutation({
    mutationFn: ({ agree: _agree, ...body }: typeof values) => bot.send((fields) => api.signup({ ...body, ...fields })),
    onSuccess: (user) => {
      client.setQueryData(keys.me(), user);
      navigate(next, { replace: true });
    },
    onError: (error) => {
      announce(messageFor(error));
      if (error instanceof ApiError && error.code === 'validation_error') {
        const { field, message } = apiFieldError(error.message);
        setErrors((current) => ({ ...current, [field]: message }));
      }
      if (error instanceof ApiError && error.code === 'email_taken') setErrors((c) => ({ ...c, email: messageFor(error) }));
    },
  });

  if (me.data) return <Navigate to={next} replace />;

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues({ ...values, [key]: value });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validate(signupSchema, values);
    setErrors(result.errors ?? {});
    if (result.data) signup.mutate({ ...values, ...result.data });
  };

  return (
    <AuthShell>
      <h2 className="page-title">Create an account</h2>
      <p className="mt-2 text-room-ink2">
        Have one? <Link to="/login" className="underline underline-offset-[3px]">Log in</Link>.
      </p>
      <form noValidate onSubmit={submit} className="relative mt-6 flex flex-col gap-5">
        <TextField label="Name shown to other participants" autoComplete="name" maxLength={LIMITS.nameMax}
          value={values.display_name} error={errors.display_name} onChange={(e) => set('display_name', e.target.value)} />
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={values.email}
          hint="Only you see it. It is never shown on the board." error={errors.email}
          onChange={(e) => set('email', e.target.value)} />
        <TextField label="Password" type="password" autoComplete="new-password" value={values.password}
          hint={`${LIMITS.passwordMin} to ${LIMITS.passwordMax} characters.`} error={errors.password}
          onChange={(e) => set('password', e.target.value)} />
        <SkillPicker legend="Your skills (pick any)" options={meta.data?.skills ?? SKILLS} value={values.skills}
          error={errors.skills} onChange={(skills) => set('skills', skills)} />
        <TimeZoneField value={values.timezone} error={errors.timezone} onChange={(zone) => set('timezone', zone)} />
        <div className="flex flex-col gap-[6px]">
          <label className="flex min-h-touch items-start gap-3">
            <input type="checkbox" checked={values.agree} onChange={(e) => set('agree', e.target.checked)}
              aria-describedby={errors.agree ? 'agree-error' : undefined} aria-invalid={Boolean(errors.agree)}
              className="mt-1 h-5 w-5 accent-[var(--lamp-green)]" />
            <span>
              I agree to the <Link to="/terms" className="underline underline-offset-[3px]">terms</Link> and
              have read the <Link to="/privacy" className="underline underline-offset-[3px]">privacy notice</Link>.
            </span>
          </label>
          {errors.agree && <FieldError id="agree-error" message={errors.agree} />}
        </div>
        <Honeypot value={bot.company} onChange={bot.setCompany} />
        <ErrorNotice error={signup.error} />
        <Button type="submit" variant="primary" busy={signup.isPending} busyLabel="Creating account" disabled={!bot.ready}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
