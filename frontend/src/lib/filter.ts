// Board filters: search by name, filter by skills a team needs or has, sort; pure functions over loaded teams.
import type { PublicUser, Skill, TeamSummary } from '../api/types';
import { isSkill, missingRoles } from './skills';

export type SkillMode = 'needs' | 'has';
export type TeamSort = 'newest' | 'most-open' | 'almost-full';

export interface TeamFilter {
  q: string;
  skills: Skill[];
  mode: SkillMode;
  sort: TeamSort;
}

export const DEFAULT_FILTER: TeamFilter = { q: '', skills: [], mode: 'needs', sort: 'newest' };

const SORTS: readonly TeamSort[] = ['newest', 'most-open', 'almost-full'];

/** Read a filter from URL search params (unknown values fall back to defaults). */
export function filterFromParams(params: URLSearchParams): TeamFilter {
  const skills = (params.get('skills') ?? '').split(',').filter(isSkill);
  const sort = params.get('sort') as TeamSort | null;
  return {
    q: params.get('q') ?? '',
    skills,
    mode: params.get('mode') === 'has' ? 'has' : 'needs',
    sort: sort && SORTS.includes(sort) ? sort : 'newest',
  };
}

/** Write a filter into URL search params, dropping default values. */
export function filterToParams(filter: TeamFilter, params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string, fallback: string) => (value === fallback ? next.delete(key) : next.set(key, value));
  set('q', filter.q.trim(), '');
  set('skills', filter.skills.join(','), '');
  set('mode', filter.mode, 'needs');
  set('sort', filter.sort, 'newest');
  return next;
}

/** True if the filter narrows the list (search text or skills). */
export const isFiltering = (filter: TeamFilter) => filter.q.trim() !== '' || filter.skills.length > 0;

const matchesText = (text: string, q: string) => text.toLowerCase().includes(q.trim().toLowerCase());

/** Apply search, skill filter and sort to teams; does not change the input array. */
export function filterTeams(teams: readonly TeamSummary[], filter: TeamFilter): TeamSummary[] {
  const result = teams.filter((team) => {
    if (filter.q.trim() && !matchesText(team.name, filter.q)) return false;
    if (filter.skills.length === 0) return true;
    const pool = filter.mode === 'has' ? team.skills : missingRoles(team.skills);
    return filter.skills.every((skill) => pool.includes(skill));
  });
  const open = (team: TeamSummary) => team.max_size - team.member_count;
  if (filter.sort === 'most-open') result.sort((a, b) => open(b) - open(a));
  if (filter.sort === 'almost-full') result.sort((a, b) => open(a) - open(b));
  return result;
}

/** Search people by name and keep those who have every chosen skill. */
export function filterPeople(people: readonly PublicUser[], q: string, skills: readonly Skill[]): PublicUser[] {
  return people.filter((person) => (!q.trim() || matchesText(person.display_name, q))
    && skills.every((skill) => person.skills.includes(skill)));
}
