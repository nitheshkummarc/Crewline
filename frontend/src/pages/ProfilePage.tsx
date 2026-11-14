// Profile: name, skills and time zone with a live preview card; saving republishes the user's teams.
//
// Contents:
//   profileChanges: Return only the fields that changed, or null when nothing changed.
//   ProfileForm: Profile form for display name, skills and time zone; saves only changed fields.
//   ProfilePage: The profile page.
import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import type { Skill, User } from '../api/types';
import { Button } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { TextField } from '../components/Field';
import { useAnnounce } from '../components/LiveRegion';
import { SkeletonCards } from '../components/LoadState';
import { PersonCard } from '../components/People';
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

/** Profile form for display name, skills and time zone; saves only changed fields. */
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
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form noValidate onSubmit={submit} className="card flex flex-col gap-6 p-6 md:p-8">
        <TextField label="Email" value={user.email} readOnly disabled hint="Your login. Never shown to other participants." />
        <TextField label="Name shown to other participants" value={values.display_name} maxLength={LIMITS.nameMax} error={errors.display_name}
          onChange={(event) => setValues({ ...values, display_name: event.target.value })} />
        <SkillPicker legend="Your skills" options={meta.data?.skills ?? SKILLS} value={values.skills} error={errors.skills}
          onChange={(skills) => setValues({ ...values, skills })} />
        <TimeZoneField value={values.timezone} error={errors.timezone} onChange={(timezone) => setValues({ ...values, timezone })} />
        <ErrorNotice error={update.error} />
        {saved && !update.error && <p className="text-sm font-semibold text-ok">Saved. Your teams and the People board show the change.</p>}
        <Button type="submit" variant="primary" className="self-start" busy={update.isPending} busyLabel="Saving">Save profile</Button>
      </form>
      <aside aria-labelledby="preview-title" className="flex flex-col gap-3">
        <h2 id="preview-title" className="text-lg font-bold">How others see you</h2>
        <PersonCard person={{ user_id: user.id, display_name: values.display_name || user.display_name, skills: values.skills, timezone: values.timezone }} />
        <p className="text-sm text-ink-2">Updates as you type. Suggestions rank you by the skills a team is missing and by working-hour overlap.</p>
      </aside>
    </div>
  );
}

/** The profile page. */
export default function ProfilePage() {
  const me = useMe();
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="label">Account</p>
        <h1 id="page-title" className="display text-[32px] leading-[38px]">Your profile</h1>
      </div>
      {me.data ? <ProfileForm user={me.data} /> : <SkeletonCards count={1} grid={false} label="Loading profile" />}
    </section>
  );
}
