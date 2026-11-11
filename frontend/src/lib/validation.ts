// Form schemas with the same limits as the API models (auth, teams, requests schemas in backend/app/modules).
import { z } from 'zod';
import { SKILLS } from './skills';
import type { Skill } from '../api/types';

export const LIMITS = {
  passwordMin: 8,
  passwordMax: 128,
  nameMax: 60,
  teamNameMax: 60,
  skillsMax: 12,
  timezoneMax: 64,
  messageMax: 280,
  codeLength: 10,
} as const;

const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Normalize an invite code like the server: uppercase, drop dashes and spaces, O to 0, I and L to 1; null if malformed. */
export function normalizeCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[-\s]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (code.length !== LIMITS.codeLength || [...code].some((ch) => !CODE_ALPHABET.includes(ch))) return null;
  return code;
}

/** True if the value is an IANA zone name the browser knows; offsets such as +05:30 are refused like the server does. */
export function isTimeZone(value: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const email = z.string().trim().min(1, 'Enter your email.').email('Enter a valid email address, like name@example.com.');
const displayName = z.string().trim().min(1, 'Enter your name.')
  .max(LIMITS.nameMax, `Use at most ${LIMITS.nameMax} characters.`);
const skills = z.array(z.enum(SKILLS as [Skill, ...Skill[]])).max(LIMITS.skillsMax);
const timezone = z.string().max(LIMITS.timezoneMax).refine(isTimeZone, 'Pick a time zone from the list.');

export const signupSchema = z.object({
  email,
  password: z.string().min(LIMITS.passwordMin, `Use at least ${LIMITS.passwordMin} characters.`)
    .max(LIMITS.passwordMax, `Use at most ${LIMITS.passwordMax} characters.`),
  display_name: displayName,
  skills,
  timezone,
  agree: z.literal(true, { errorMap: () => ({ message: 'Agree to the terms and the privacy notice to continue.' }) }),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.').max(LIMITS.passwordMax, `Use at most ${LIMITS.passwordMax} characters.`),
});

export const profileSchema = z.object({ display_name: displayName, skills, timezone });

export const teamNameSchema = z.object({
  name: z.string().trim().min(1, 'Enter a team name.').max(LIMITS.teamNameMax, `Use at most ${LIMITS.teamNameMax} characters.`),
});

export const joinCodeSchema = z.object({
  code: z.string().refine((value) => normalizeCode(value) !== null,
    'Invite codes have 10 letters and digits, like ABCDE-FGHJK.'),
});

export const requestMessageSchema = z.object({
  message: z.string().trim().max(LIMITS.messageMax, `Use at most ${LIMITS.messageMax} characters.`),
});

export type FieldErrors = Partial<Record<string, string>>;

/** Validate values against a schema; return the parsed data or the first error per field. */
export function validate<T>(schema: z.ZodType<T>, values: unknown): { data: T; errors: null } | { data: null; errors: FieldErrors } {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return { data: null, errors };
}

/** Map an API `validation_error` message ("field: reason") to the field it names, if any. */
export function apiFieldError(message: string): { field: string; message: string } {
  const match = /^([a-z_]+)(?:\.\d+)?: (.+)$/.exec(message);
  if (!match || !match[1] || !match[2]) return { field: 'form', message };
  return { field: match[1], message: match[2] };
}
