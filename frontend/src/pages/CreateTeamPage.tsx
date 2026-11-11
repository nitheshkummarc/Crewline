// Create a team in one hackathon; the creator becomes the leader and gets the invite code on the team page.
import { ArrowLeft, Crown, QrCode, UserCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Button } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { TextField } from '../components/Field';
import { useCreateTeam, useRegister } from '../hooks/mutations';
import { useHackathon } from '../hooks/queries';
import { LIMITS, apiFieldError, teamNameSchema, validate, type FieldErrors } from '../lib/validation';

const NEXT_STEPS = [
  { icon: Crown, title: 'You lead the team', text: 'You can accept or decline requests, remove members and finalize the team.' },
  { icon: QrCode, title: 'Share the invite', text: 'Copy the code or the link, or show the QR code to people next to you.' },
  { icon: UserCheck, title: 'Fill the seats', text: 'Requests arrive live. When the last seat goes, exactly one person gets it.' },
];

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
    <div className="flex flex-col gap-6">
      <Link to={`/h/${hid}`} className="inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft size={16} aria-hidden="true" /> Board
      </Link>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="page-title" className="card flex flex-col gap-6 p-6 md:p-8">
          <div className="flex flex-col gap-2">
            <h1 id="page-title" className="display text-[30px] leading-9">Create a team</h1>
            <p className="text-ink-2">
              Teams in {hackathon.data?.name ?? 'this hackathon'} have
              {hackathon.data ? ` ${hackathon.data.min_team_size} to ${hackathon.data.max_team_size}` : ''} people.
            </p>
          </div>
          <form noValidate onSubmit={submit} className="flex flex-col gap-4">
            <TextField label="Team name" value={name} maxLength={LIMITS.teamNameMax + 10} autoComplete="off"
              hint={`${name.trim().length} of ${LIMITS.teamNameMax} characters. Shown on the board.`} error={errors.name}
              placeholder="Null Pointers" onChange={(event) => setName(event.target.value)} />
            <ErrorNotice error={create.error} />
            {notRegistered && (
              <Button variant="secondary" busy={register.isPending} busyLabel="Registering"
                onClick={() => register.mutate(undefined, { onSuccess: () => create.reset() })}>Register for this hackathon</Button>
            )}
            <Button type="submit" variant="primary" className="self-start" busy={create.isPending} busyLabel="Creating team">Create team</Button>
          </form>
        </section>
        <aside aria-labelledby="next-title" className="flex flex-col gap-4">
          <h2 id="next-title" className="text-lg font-bold">What happens next</h2>
          <ol className="flex flex-col gap-3">
            {NEXT_STEPS.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="card flex gap-4 p-4">
                <span className="band flex h-10 w-10 shrink-0 items-center justify-center rounded-md" style={{ ['--band' as string]: `var(--band-${index * 2 + 1})` }}>
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span><span className="block font-semibold">{title}</span><span className="text-sm text-ink-2">{text}</span></span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
