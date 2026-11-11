// Create a team in one hackathon; the creator becomes the leader and gets the invite code on the team page.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Button } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { TextField } from '../components/Field';
import { useCreateTeam, useRegister } from '../hooks/mutations';
import { useHackathon } from '../hooks/queries';
import { LIMITS, apiFieldError, teamNameSchema, validate, type FieldErrors } from '../lib/validation';

/** The create team page. */
export default function CreateTeamPage() {
  const { hid = '' } = useParams();
  const navigate = useNavigate();
  const hackathon = useHackathon(hid);
  const create = useCreateTeam(hid);
  const register = useRegister(hid);
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validate(teamNameSchema, { name });
    setErrors(result.errors ?? {});
    if (!result.data) return;
    create.mutate(result.data.name, {
      onSuccess: (team) => navigate(`/teams/${team.id}`, { replace: true }),
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'validation_error') setErrors({ [apiFieldError(error.message).field]: error.message });
      },
    });
  };
  const notRegistered = create.error instanceof ApiError && create.error.code === 'not_registered';

  return (
    <section aria-labelledby="page-title" className="mx-auto flex max-w-[520px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 id="page-title" className="page-title">Create a team</h1>
        <p className="text-room-ink2">
          You become the leader. Teams in {hackathon.data?.name ?? 'this hackathon'} have
          {hackathon.data ? ` ${hackathon.data.min_team_size} to ${hackathon.data.max_team_size}` : ''} people; you share an invite code
          or accept requests to fill the seats.
        </p>
      </div>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <TextField label="Team name" value={name} maxLength={LIMITS.teamNameMax + 10} autoComplete="off"
          hint={`Up to ${LIMITS.teamNameMax} characters. Shown on the board.`} error={errors.name}
          onChange={(event) => setName(event.target.value)} />
        <ErrorNotice error={create.error} />
        {notRegistered && (
          <Button variant="secondary" busy={register.isPending} busyLabel="Registering"
            onClick={() => register.mutate(undefined, { onSuccess: () => create.reset() })}>
            Register for this hackathon
          </Button>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="submit" variant="primary" busy={create.isPending} busyLabel="Creating team">Create team</Button>
          <Link to={`/h/${hid}`} className="inline-flex min-h-touch items-center justify-center px-4 text-room-ink2 underline underline-offset-[3px]">
            Back to the board
          </Link>
        </div>
      </form>
    </section>
  );
}
