// Join a team with an invite code (typed, pasted, or from a shared ?code= link).
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
    <section aria-labelledby="page-title" className="mx-auto flex max-w-[520px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 id="page-title" className="page-title">Join with a code</h1>
        <p className="text-room-ink2">
          Ask a team member for their invite code. If two people try for the last seat at the same moment, one gets it
          and the other sees that the team is full.
        </p>
      </div>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <TextField label="Invite code" value={code} autoComplete="off" autoCapitalize="characters" spellCheck={false}
          placeholder="ABCDE-FGHJK" hint="10 letters and digits. Dashes, spaces and case do not matter." error={errors.code}
          className="cells text-[18px] tracking-[0.12em]" onChange={(event) => setCode(event.target.value)} />
        <ErrorNotice error={join.error} />
        {notRegistered && (
          <Button variant="secondary" busy={register.isPending} busyLabel="Registering"
            onClick={() => register.mutate(undefined, { onSuccess: () => join.reset() })}>
            Register for this hackathon
          </Button>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="submit" variant="primary" busy={join.isPending} busyLabel="Joining">Join team</Button>
          <Link to={`/h/${hid}`} className="inline-flex min-h-touch items-center justify-center px-4 text-room-ink2 underline underline-offset-[3px]">
            Back to the board
          </Link>
        </div>
      </form>
    </section>
  );
}
