// T-WEB-09: board search, skill filters (needs or has), sorting and URL round trip.
import { describe, expect, it } from 'vitest';
import { team } from '../test/fixtures';
import { DEFAULT_FILTER, filterFromParams, filterPeople, filterTeams, filterToParams, isFiltering } from './filter';

const alpha = team({ id: 'a', name: 'Alpha Squad', skills: ['frontend', 'design'], member_count: 3, max_size: 4 });
const beta = team({ id: 'b', name: 'Beta Builders', skills: ['backend', 'ml', 'devops'], member_count: 1, max_size: 4 });
const gamma = team({ id: 'c', name: 'Gamma', skills: [], member_count: 2, max_size: 4 });
const teams = [alpha, beta, gamma];

describe('T-WEB-09 board filters', () => {
  it('searches by name, case-insensitive', () => {
    expect(filterTeams(teams, { ...DEFAULT_FILTER, q: 'bUiLd' }).map((t) => t.id)).toEqual(['b']);
  });

  it('filters by roles a team needs or skills it has', () => {
    expect(filterTeams(teams, { ...DEFAULT_FILTER, skills: ['design'], mode: 'needs' }).map((t) => t.id)).toEqual(['b', 'c']);
    expect(filterTeams(teams, { ...DEFAULT_FILTER, skills: ['design'], mode: 'has' }).map((t) => t.id)).toEqual(['a']);
    expect(filterTeams(teams, { ...DEFAULT_FILTER, skills: ['backend', 'ml'], mode: 'has' }).map((t) => t.id)).toEqual(['b']);
  });

  it('sorts by open seats without changing the input', () => {
    expect(filterTeams(teams, { ...DEFAULT_FILTER, sort: 'most-open' }).map((t) => t.id)).toEqual(['b', 'c', 'a']);
    expect(filterTeams(teams, { ...DEFAULT_FILTER, sort: 'almost-full' }).map((t) => t.id)).toEqual(['a', 'c', 'b']);
    expect(teams.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('round-trips through URL params, dropping defaults and unknown values', () => {
    const filter = { q: 'gam', skills: ['ml' as const, 'pitch' as const], mode: 'has' as const, sort: 'almost-full' as const };
    const params = filterToParams(filter, new URLSearchParams('tab=teams'));
    expect(params.get('tab')).toBe('teams');
    expect(filterFromParams(params)).toEqual(filter);
    expect(filterToParams(DEFAULT_FILTER, new URLSearchParams('q=x&sort=newest')).toString()).toBe('');
    expect(filterFromParams(new URLSearchParams('skills=ml,juggling&sort=bogus'))).toEqual({ ...DEFAULT_FILTER, skills: ['ml'] });
    expect(isFiltering(DEFAULT_FILTER)).toBe(false);
    expect(isFiltering({ ...DEFAULT_FILTER, q: '  ' })).toBe(false);
  });

  it('searches people by name and required skills', () => {
    const people = [
      { user_id: '1', display_name: 'Ana Rao', skills: ['ml' as const, 'data' as const], timezone: 'UTC' },
      { user_id: '2', display_name: 'Ben', skills: ['ml' as const], timezone: 'UTC' },
    ];
    expect(filterPeople(people, 'ana', []).map((p) => p.user_id)).toEqual(['1']);
    expect(filterPeople(people, '', ['ml', 'data']).map((p) => p.user_id)).toEqual(['1']);
  });
});
