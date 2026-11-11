// Test fixtures: API payloads and a fetch stub that answers by method and path.
import { vi } from 'vitest';
import type { Hackathon, Member, TeamDetail, TeamSummary, User } from '../api/types';

export const HID = '11111111-1111-4111-8111-111111111111';
export const ME: User = { id: 'aaaaaaaa-0000-4000-8000-000000000001', email: 'ana@example.com', display_name: 'Ana', skills: ['frontend'], timezone: 'Asia/Kolkata' };
export const HACKATHON: Hackathon = { id: HID, name: 'Hack4Hack 2026', min_team_size: 2, max_team_size: 4, invite_ttl_hours: 48 };

/** Return a team summary with overrides. */
export function team(overrides: Partial<TeamSummary> = {}): TeamSummary {
  return {
    id: 'bbbbbbbb-0000-4000-8000-000000000001', hackathon_id: HID, name: 'Null Pointers', member_count: 2, min_size: 2,
    max_size: 4, status: 'forming', looking: true, leader_id: ME.id, version: 1, created_at: '2026-11-11T10:00:00Z',
    skills: ['frontend', 'backend'], ...overrides,
  };
}

/** Return a team member with overrides. */
export function member(overrides: Partial<Member> = {}): Member {
  return { user_id: ME.id, display_name: 'Ana', skills: ['frontend'], timezone: 'Asia/Kolkata', joined_at: '2026-11-11T10:00:00Z', is_leader: true, ...overrides };
}

/** Return a team detail with overrides. */
export function teamDetail(overrides: Partial<TeamDetail> = {}): TeamDetail {
  return { ...team(), members: [member(), member({ user_id: 'cccccccc-0000-4000-8000-000000000002', display_name: 'Ben', is_leader: false })], ...overrides };
}

type Route = [method: string, pattern: RegExp, status: number, body: unknown];

/** Stub global fetch with routes matched in order; unknown requests get 404 not_found. Returns the mock. */
export function stubFetch(routes: Route[]) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const route = routes.find(([m, pattern]) => m === method && pattern.test(url));
    const [, , status, body] = route ?? [method, /./, 404, { error: { code: 'not_found', message: 'Not found', request_id: 'r1' } }];
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}
