// Profile: name, skills and time zone; saving republishes the user's teams so boards show the new skills.
import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import type { Skill, User } from '../api/types';
import { Button } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { TextField } from '../components/Field';
import { useAnnounce } from '../components/LiveRegion';
import { SkeletonRows } from '../components/LoadState';
import { SkillPicker } from '../components/Skills';
import { TimeZoneField } from '../components/TimeZoneField';
import { useUpdateProfile } from '../hooks/mutations';
import { useMe, useMeta } from '../hooks/queries';
import { SKILLS } from '../lib/skills';
import { LIMITS, apiFieldError, profileSchema, validate, type FieldErrors } from '../lib/validation';

/** Return only the fields that changed, or null when nothing changed. */
export function profileChanges(user: User, values: { display_name: string; skills: Skill[]; timezone: string }) {
  const patch: Partial<typeof values> = {};
  if (values.display_name !== user.display_name) patch.display_name = values.display_name;
  if (values.timezone !== user.timezone) patch.timezone = values.timezone;
  if (values.skills.join(',') !== user.skills.join(',')) patch.skills = values.skills;
  return Object.keys(patch).length ? patch : null;
}

function ProfileForm({ user }: { user: User }) {
  const meta = useMeta();
  const update = useUpdateProfile();
  const announce = useAnnounce();
  const [values, setValues] = useState({ display_name: user.display_name, skills: user.skills, timezone: user.timezone });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    const result = validate(profileSchema, values);
    setErrors(result.errors ?? {});
    if (!result.data) return;
    const patch = profileChanges(user, result.data);
    if (!patch) {
      setSaved(true);
      announce('Nothing changed.');
      return;
    }
    update.mutate(patch, {
      onSuccess: () => {
        setSaved(true);
        announce('Profile saved.');
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'validation_error') {
          const { field, message } = apiFieldError(error.message);
          setErrors({ [field]: message });
        }
      },
    });
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <TextField label="Email" value={user.email} readOnly disabled hint="Your login. Never shown to other participants." />
      <TextField label="Name shown to other participants" value={values.display_name} maxLength={LIMITS.nameMax} error={errors.display_name}
        onChange={(event) => setValues({ ...values, display_name: event.target.value })} />
      <SkillPicker legend="Your skills" options={meta.data?.skills ?? SKILLS} value={values.skills} error={errors.skills}
        onChange={(skills) => setValues({ ...values, skills })} />
      <TimeZoneField value={values.timezone} error={errors.timezone} onChange={(timezone) => setValues({ ...values, timezone })} />
      <ErrorNotice error={update.error} />
      {saved && !update.error && <p className="text-sm text-room-green">Saved. Your teams and the People board show the change.</p>}
      <Button type="submit" variant="primary" className="self-start" busy={update.isPending} busyLabel="Saving">Save profile</Button>
    </form>
  );
}

/** The profile page. */
export default function ProfilePage() {
  const me = useMe();
  return (
    <section aria-labelledby="page-title" className="mx-auto flex max-w-[560px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 id="page-title" className="page-title">Your profile</h1>
        <p className="text-room-ink2">Teams see your name, skills and time zone. Suggestions use your skills and working hours.</p>
      </div>
      {me.data ? <ProfileForm user={me.data} /> : <SkeletonRows rows={3} label="Loading profile" />}
    </section>
  );
}
