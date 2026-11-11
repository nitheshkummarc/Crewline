// API payload types; they match docs/api.md field for field.

export type Skill =
  | 'frontend' | 'backend' | 'mobile' | 'ml' | 'data' | 'devops'
  | 'cloud' | 'design' | 'product' | 'security' | 'blockchain' | 'pitch';

export interface User {
  id: string;
  email: string;
  display_name: string;
  skills: Skill[];
  timezone: string;
}

export interface PublicUser {
  user_id: string;
  display_name: string;
  skills: Skill[];
  timezone: string;
}

export interface TeamSummary {
  id: string;
  hackathon_id: string;
  name: string;
  member_count: number;
  min_size: number;
  max_size: number;
  status: 'forming' | 'finalized';
  looking: boolean;
  leader_id: string;
  version: number;
  created_at: string;
  skills: Skill[];
}

export interface Member extends PublicUser {
  joined_at: string;
  is_leader: boolean;
}

export interface TeamDetail extends TeamSummary {
  members: Member[];
}

export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'stale';

export interface JoinRequest {
  id: string;
  team_id: string;
  team_name: string;
  user_id: string;
  display_name: string;
  message: string | null;
  status: RequestStatus;
  created_at: string;
  decided_at: string | null;
}

export interface Hackathon {
  id: string;
  name: string;
  min_team_size: number;
  max_team_size: number;
  invite_ttl_hours: number;
}

export interface Suggestion extends PublicUser {
  score: number;
  breakdown: { complement: number; timezone: number; completeness: number; redundancy: number };
  reasons: string[];
}

export interface SuggestionsResponse {
  context: { team_id: string | null; missing_roles: Skill[] };
  items: Suggestion[];
}

export interface AuditEvent {
  seq: number;
  action: string;
  actor_id: string | null;
  created_at: string;
  payload: Record<string, unknown>;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export interface Meta {
  skills: Skill[];
  core_roles: Skill[];
}

export interface MyStatus {
  registered: boolean;
  looking: boolean;
  team: TeamSummary | null;
  pending_requests: JoinRequest[];
}

export interface RegisterResult {
  registered: true;
  looking: boolean;
}

export interface Invite {
  code: string;
  expires_at: string;
}

export interface LeaveResult {
  team: TeamDetail | null;
}

export interface FormToken {
  token: string;
}

/** Bot-check fields sent with signup and login. */
export interface BotFields {
  form_token: string;
  company: string;
}

export interface SignupBody extends BotFields {
  email: string;
  password: string;
  display_name: string;
  skills: Skill[];
  timezone: string;
}

export interface LoginBody extends BotFields {
  email: string;
  password: string;
}

export interface ProfilePatch {
  display_name?: string;
  skills?: Skill[];
  timezone?: string;
}

export interface TeamPatch {
  name?: string;
  looking?: boolean;
}

export type ErrorCode =
  | 'validation_error' | 'bot_check_failed' | 'idempotency_key_required'
  | 'unauthenticated' | 'invalid_credentials'
  | 'not_leader' | 'members_only'
  | 'not_found' | 'invite_invalid'
  | 'email_taken' | 'not_registered' | 'already_in_team' | 'team_full' | 'team_finalized'
  | 'not_finalized' | 'below_min_size' | 'request_not_pending' | 'not_a_member'
  | 'cannot_remove_self' | 'too_many_pending_requests'
  | 'idempotency_key_mismatch' | 'rate_limited' | 'busy' | 'internal_error'
  | 'network_error';

/** SSE `team` event data. */
export interface TeamEvent {
  seq: number;
  action: string;
  team_id: string;
  version: number;
  team: TeamSummary | null;
}

/** SSE `request` event data. */
export interface RequestEvent {
  seq: number;
  action: string;
  team_id: string;
  request_id: string | null;
}

/** GET /api/lab */
export interface LabInfo {
  enabled: true;
  hackathon_id: string;
  max_attempts: number;
}

/** One attempt in a lab experiment, timed from the moment all attempts were released. */
export interface LabAttempt {
  status: number;
  code: string | null;
  replayed: boolean;
  started_ms: number;
  finished_ms: number;
  retries: number;
}

export interface LabTeamFacts {
  member_count: number;
  max_size: number;
  memberships: number;
  join_events: number;
}

/** POST /api/lab/race */
export interface RaceResult {
  hackathon_id: string;
  team: { id: string; name: string; taken_before: number; max_size: number };
  attempts: Array<LabAttempt & { racer: string }>;
  elapsed_ms: number;
  facts: LabTeamFacts;
  summary: { winners: number; team_full: number; other: number; busy_retries: number };
}

export interface SpamPhase {
  user: string;
  clicks: Array<LabAttempt & { click: number; same_body: boolean }>;
  facts: { memberships: number; join_events: number; stored_keys: number };
}

/** POST /api/lab/spam */
export interface SpamResult {
  hackathon_id: string;
  team: { id: string; name: string };
  same_key: SpamPhase;
  new_keys: SpamPhase;
  facts: LabTeamFacts;
}

/** POST /api/lab/queue */
export interface QueueResult {
  hackathon_id: string;
  team: { id: string; name: string; taken_before: number; max_size: number };
  created: { ok: number; failed: number; busy_retries: number };
  queue: Array<{ position: number; name: string; request_id: string; after_first_ms: number }>;
  decisions: Array<{ request_id: string; status: number; code: string | null }>;
  facts: LabTeamFacts;
}

export interface WalkStep {
  label: string;
  why: string;
  sql: string;
  pool: 'read' | 'write';
  at_ms: number;
  gap_ms: number;
  error: string | null;
}

export interface WalkPart {
  status: number;
  code: string | null;
  replayed: boolean;
  server_ms: number;
  steps: WalkStep[];
}

/** POST /api/lab/walkthrough */
export interface WalkthroughResult {
  hackathon_id: string;
  team: { id: string; name: string; taken_before: number; max_size: number };
  join: WalkPart;
  retry: WalkPart;
  full: WalkPart & { team: { id: string; name: string } };
}

/** GET /api/lab/latency */
export interface LatencyReport {
  routes: Array<{ route: string; count: number; p50_ms: number; p95_ms: number; p99_ms: number; max_ms: number }>;
  window: number;
  pools: Array<{ pool: 'read' | 'write'; size: number; idle: number }>;
  transactions: Record<string, number>;
}
