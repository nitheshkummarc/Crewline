// T-WEB-06: client form limits match the API models (lengths, email, password 8 to 128, skills, IANA zones, codes).
import { describe, expect, it } from 'vitest';
import { apiFieldError, isTimeZone, joinCodeSchema, normalizeCode, signupSchema, teamNameSchema, validate } from './validation';

const signup = { email: 'a@example.com', password: 'long-enough', display_name: 'Ana', skills: ['frontend'], timezone: 'Asia/Kolkata', agree: true };

describe('T-WEB-06 validation limits', () => {
  it('accepts a valid signup and applies the API limits', () => {
    expect(validate(signupSchema, signup).errors).toBeNull();
    const cases: Array<[Partial<typeof signup> | Record<string, unknown>, string]> = [
      [{ password: 'x'.repeat(7) }, 'password'],
      [{ password: 'x'.repeat(129) }, 'password'],
      [{ email: 'not-an-email' }, 'email'],
      [{ display_name: '' }, 'display_name'],
      [{ display_name: 'x'.repeat(61) }, 'display_name'],
      [{ skills: ['juggling'] }, 'skills'],
      [{ timezone: '+05:30' }, 'timezone'],
      [{ timezone: 'Mars/Olympus' }, 'timezone'],
      [{ agree: false }, 'agree'],
    ];
    for (const [patch, field] of cases) {
      expect(validate(signupSchema, { ...signup, ...patch }).errors?.[field], JSON.stringify(patch)).toBeTruthy();
    }
    expect(validate(signupSchema, { ...signup, password: 'x'.repeat(8) }).errors).toBeNull();
    expect(validate(signupSchema, { ...signup, password: 'x'.repeat(128) }).errors).toBeNull();
  });

  it('limits team names to 1 to 60 characters after trimming', () => {
    expect(validate(teamNameSchema, { name: '   ' }).errors?.name).toBeTruthy();
    expect(validate(teamNameSchema, { name: 'x'.repeat(61) }).errors?.name).toBeTruthy();
    expect(validate(teamNameSchema, { name: ` ${'x'.repeat(60)} ` }).data?.name).toHaveLength(60);
  });

  it('normalizes invite codes like the server', () => {
    expect(normalizeCode('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(normalizeCode('o1l2i 34567')).toBe('0112134567');
    expect(normalizeCode('ABCDE-FGHJ')).toBeNull();
    expect(normalizeCode('ABCDE-FGHJU')).toBeNull();
    expect(validate(joinCodeSchema, { code: 'nope' }).errors?.code).toBeTruthy();
  });

  it('knows IANA zones and refuses offsets', () => {
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('America/New_York')).toBe(true);
    expect(isTimeZone('+05:30')).toBe(false);
  });

  it('maps an API validation_error message to its field', () => {
    expect(apiFieldError('password: String should have at least 8 characters')).toEqual({ field: 'password', message: 'String should have at least 8 characters' });
    expect(apiFieldError('skills.0: Input should be ...')).toMatchObject({ field: 'skills' });
    expect(apiFieldError('Invalid input')).toEqual({ field: 'form', message: 'Invalid input' });
  });
});
