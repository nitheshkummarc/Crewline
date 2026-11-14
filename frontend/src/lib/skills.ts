// Skill taxonomy (same 12 as backend/app/core/skills.py), short codes and color families for board labels.
//
// Contents:
//   skillFamily: Return the color family of a skill.
//   skillCode: Return the short board code of a skill.
//   isSkill: True if the value is one of the 12 skills.
//   missingRoles: Return the core roles not covered by any of the given skills, in taxonomy order.
import type { Skill } from '../api/types';

export const SKILLS: readonly Skill[] = [
  'frontend', 'backend', 'mobile', 'ml', 'data', 'devops',
  'cloud', 'design', 'product', 'security', 'blockchain', 'pitch',
];

export const CORE_ROLES: readonly Skill[] = ['frontend', 'backend', 'design', 'ml', 'devops', 'pitch'];

export type SkillFamily = 'build' | 'data' | 'ops' | 'people';

const FAMILY: Record<Skill, SkillFamily> = {
  frontend: 'build', backend: 'build', mobile: 'build',
  ml: 'data', data: 'data',
  devops: 'ops', cloud: 'ops', security: 'ops', blockchain: 'ops',
  design: 'people', product: 'people', pitch: 'people',
};

const CODE: Record<Skill, string> = {
  frontend: 'FE', backend: 'BE', mobile: 'MOB', ml: 'ML', data: 'DATA', devops: 'OPS',
  cloud: 'CLD', design: 'DSN', product: 'PM', security: 'SEC', blockchain: 'CHN', pitch: 'PIT',
};

/** Return the color family of a skill. */
export const skillFamily = (skill: Skill): SkillFamily => FAMILY[skill];

/** Return the short board code of a skill. */
export const skillCode = (skill: Skill): string => CODE[skill];

/** True if the value is one of the 12 skills. */
export const isSkill = (value: string): value is Skill => (SKILLS as readonly string[]).includes(value);

/** Return the core roles not covered by any of the given skills, in taxonomy order. */
export function missingRoles(skills: readonly Skill[]): Skill[] {
  const have = new Set(skills);
  return CORE_ROLES.filter((role) => !have.has(role));
}
