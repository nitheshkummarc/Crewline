// One typed function per endpoint in docs/api.md.
import { request } from './client';
import type {
  AuditEvent, FormToken, Hackathon, Invite, JoinRequest, LabInfo, LatencyReport, LeaveResult, LoginBody, Meta, MyStatus,
  Page, ProfilePatch, PublicUser, QueueResult, RaceResult, RegisterResult, SignupBody, SpamResult, SuggestionsResponse,
  TeamDetail, TeamPatch, TeamSummary, User, WalkthroughResult,
} from './types';

/** Options for a mutation: the key of the user action it belongs to. */
export interface Action {
  key?: string;
}

const q = (params: Record<string, string | number | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.set(name, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};
const id = encodeURIComponent;

/** GET /api/meta */
export const meta = () => request<Meta>('GET', '/api/meta');

/** GET /api/auth/form-token */
export const formToken = () => request<FormToken>('GET', '/api/auth/form-token');
/** POST /api/auth/signup */
export const signup = (body: SignupBody) => request<User>('POST', '/api/auth/signup', body, { noIdempotency: true });
/** POST /api/auth/login */
export const login = (body: LoginBody) => request<User>('POST', '/api/auth/login', body, { noIdempotency: true });
/** POST /api/auth/logout */
export const logout = () => request<undefined>('POST', '/api/auth/logout', undefined, { noIdempotency: true });
/** GET /api/auth/me */
export const me = () => request<User>('GET', '/api/auth/me');
/** PATCH /api/users/me */
export const updateMe = (patch: ProfilePatch, a: Action = {}) =>
  request<User>('PATCH', '/api/users/me', patch, { idempotencyKey: a.key });

/** GET /api/hackathons */
export const listHackathons = () => request<Hackathon[]>('GET', '/api/hackathons');
/** GET /api/hackathons/{hid} */
export const getHackathon = (hid: string) => request<Hackathon>('GET', `/api/hackathons/${id(hid)}`);
/** POST /api/hackathons/{hid}/register */
export const register = (hid: string, a: Action = {}) =>
  request<RegisterResult>('POST', `/api/hackathons/${id(hid)}/register`, undefined, { idempotencyKey: a.key });
/** GET /api/hackathons/{hid}/me */
export const myStatus = (hid: string) => request<MyStatus>('GET', `/api/hackathons/${id(hid)}/me`);
/** PATCH /api/hackathons/{hid}/me */
export const setLooking = (hid: string, looking: boolean, a: Action = {}) =>
  request<MyStatus>('PATCH', `/api/hackathons/${id(hid)}/me`, { looking }, { idempotencyKey: a.key });

/** GET /api/hackathons/{hid}/board/teams */
export const teamsBoard = (hid: string, cursor?: string | null, limit = 20) =>
  request<Page<TeamSummary>>('GET', `/api/hackathons/${id(hid)}/board/teams${q({ limit, cursor })}`);
/** GET /api/hackathons/{hid}/board/people */
export const peopleBoard = (hid: string, cursor?: string | null, limit = 20) =>
  request<Page<PublicUser>>('GET', `/api/hackathons/${id(hid)}/board/people${q({ limit, cursor })}`);

/** POST /api/hackathons/{hid}/teams */
export const createTeam = (hid: string, name: string, a: Action = {}) =>
  request<TeamDetail>('POST', `/api/hackathons/${id(hid)}/teams`, { name }, { idempotencyKey: a.key });
/** GET /api/teams/{tid} */
export const getTeam = (tid: string) => request<TeamDetail>('GET', `/api/teams/${id(tid)}`);
/** PATCH /api/teams/{tid} */
export const updateTeam = (tid: string, patch: TeamPatch, a: Action = {}) =>
  request<TeamDetail>('PATCH', `/api/teams/${id(tid)}`, patch, { idempotencyKey: a.key });
/** POST /api/teams/join */
export const joinByCode = (code: string, a: Action = {}) =>
  request<TeamDetail>('POST', '/api/teams/join', { code }, { idempotencyKey: a.key });
/** POST /api/teams/{tid}/leave */
export const leaveTeam = (tid: string, a: Action = {}) =>
  request<LeaveResult>('POST', `/api/teams/${id(tid)}/leave`, undefined, { idempotencyKey: a.key });
/** DELETE /api/teams/{tid}/members/{uid} */
export const removeMember = (tid: string, uid: string, a: Action = {}) =>
  request<TeamDetail>('DELETE', `/api/teams/${id(tid)}/members/${id(uid)}`, undefined, { idempotencyKey: a.key });
/** POST /api/teams/{tid}/finalize */
export const finalizeTeam = (tid: string, a: Action = {}) =>
  request<TeamDetail>('POST', `/api/teams/${id(tid)}/finalize`, undefined, { idempotencyKey: a.key });
/** POST /api/teams/{tid}/reopen */
export const reopenTeam = (tid: string, a: Action = {}) =>
  request<TeamDetail>('POST', `/api/teams/${id(tid)}/reopen`, undefined, { idempotencyKey: a.key });
/** GET /api/teams/{tid}/invite */
export const getInvite = (tid: string) => request<Invite>('GET', `/api/teams/${id(tid)}/invite`);
/** POST /api/teams/{tid}/invite/regenerate */
export const regenerateInvite = (tid: string, a: Action = {}) =>
  request<Invite>('POST', `/api/teams/${id(tid)}/invite/regenerate`, undefined, { idempotencyKey: a.key });
/** GET /api/teams/{tid}/audit */
export const teamAudit = (tid: string, cursor?: string | null, limit = 20) =>
  request<Page<AuditEvent>>('GET', `/api/teams/${id(tid)}/audit${q({ limit, cursor })}`);

/** POST /api/teams/{tid}/requests */
export const createRequest = (tid: string, message: string | null, a: Action = {}) =>
  request<JoinRequest>('POST', `/api/teams/${id(tid)}/requests`, message ? { message } : {}, { idempotencyKey: a.key });
/** GET /api/teams/{tid}/requests */
export const teamRequests = (tid: string) => request<JoinRequest[]>('GET', `/api/teams/${id(tid)}/requests`);
/** GET /api/hackathons/{hid}/my-requests */
export const myRequests = (hid: string) => request<JoinRequest[]>('GET', `/api/hackathons/${id(hid)}/my-requests`);
/** POST /api/requests/{rid}/accept */
export const acceptRequest = (rid: string, a: Action = {}) =>
  request<TeamDetail>('POST', `/api/requests/${id(rid)}/accept`, undefined, { idempotencyKey: a.key });
/** POST /api/requests/{rid}/decline */
export const declineRequest = (rid: string, a: Action = {}) =>
  request<JoinRequest>('POST', `/api/requests/${id(rid)}/decline`, undefined, { idempotencyKey: a.key });
/** POST /api/requests/{rid}/withdraw */
export const withdrawRequest = (rid: string, a: Action = {}) =>
  request<JoinRequest>('POST', `/api/requests/${id(rid)}/withdraw`, undefined, { idempotencyKey: a.key });

/** GET /api/hackathons/{hid}/suggestions */
export const suggestions = (hid: string, limit = 20) =>
  request<SuggestionsResponse>('GET', `/api/hackathons/${id(hid)}/suggestions${q({ limit })}`);

/** URL of the event stream for one hackathon (opened with EventSource in useEventStream). */
export const eventsUrl = (hid: string) => `/api/events${q({ hackathon_id: hid })}`;

// Race lab: each run is a new experiment, so these posts carry no Idempotency-Key (api.md).
/** GET /api/lab */
export const labInfo = () => request<LabInfo>('GET', '/api/lab');
/** POST /api/lab/race */
export const labRace = (attempts: number) => request<RaceResult>('POST', '/api/lab/race', { attempts }, { noIdempotency: true });
/** POST /api/lab/spam */
export const labSpam = (clicks: number) => request<SpamResult>('POST', '/api/lab/spam', { clicks }, { noIdempotency: true });
/** POST /api/lab/queue */
export const labQueue = (requests: number) => request<QueueResult>('POST', '/api/lab/queue', { requests }, { noIdempotency: true });
/** POST /api/lab/walkthrough */
export const labWalkthrough = () => request<WalkthroughResult>('POST', '/api/lab/walkthrough', undefined, { noIdempotency: true });
/** GET /api/lab/latency */
export const labLatency = () => request<LatencyReport>('GET', '/api/lab/latency');
