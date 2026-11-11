// Join a team with an invite code (typed, pasted, or from a shared ?code= link or QR code).
import { ArrowLeft, KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Button } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { TextField } from '../components/Field';
import { useJoinByCode, useRegister } from '../hooks/mutations';
import { joinCodeSchema, normalizeCode, validate, type FieldErrors } from '../lib/validation';

/** The join by code page. */
export default function JoinPage() {
  const { hid = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const join = useJoinByCode(hid);
  const register = useRegister(hid);
  const [code, setCode] = useState(params.get('code') ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const valid = normalizeCode(code) !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validate(joinCodeSchema, { code });
    setErrors(result.errors ?? {});
    const normalized = normalizeCode(code);
    if (!result.data || !normalized) return;
    join.mutate(normalized, { onSuccess: (team) => navigate(`/teams/${team.id}`, { replace: true }) });
  };
  const notRegistered = join.error instanceof ApiError && join.error.code === 'not_registered';

  return (
    <div className="flex flex-col gap-6">
      <Link to={`/h/${hid}`} className="inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> Board
      </Link>
      <section aria-labelledby="page-title" className="card mx-auto flex w-full max-w-[560px] flex-col gap-6 p-6 md:p-8">
        <span className="band flex h-12 w-12 items-center justify-center rounded-md" style={{ ['--band' as string]: 'var(--band-3)' }}>
          <KeyRound size={22} aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 id="page-title" className="display text-[30px] leading-9">Join with a code</h1>
          <p className="text-ink-2">
            Ask a team member for their invite code, or scan their QR code. If two people try for the last seat at the
            same moment, one gets it and the other is told the team is full.
          </p>
        </div>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <TextField label="Invite code" value={code} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            placeholder="ABCDE-FGHJK" hint={valid ? 'Looks right. Press Join team.' : '10 letters and digits. Dashes, spaces and case do not matter.'}
            error={errors.code} className="h-16 text-center font-mono text-[24px] uppercase tracking-[0.18em]" onChange={(event) => setCode(event.target.value)} />
          <ErrorNotice error={join.error} />
          {notRegistered && (
            <Button variant="secondary" busy={register.isPending} busyLabel="Registering"
              onClick={() => register.mutate(undefined, { onSuccess: () => join.reset() })}>Register for this hackathon</Button>
          )}
          <Button type="submit" variant="primary" busy={join.isPending} busyLabel="Joining">Join team</Button>
        </form>
      </section>
    </div>
  );
}
