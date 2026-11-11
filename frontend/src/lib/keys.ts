// Query key factory: every cached resource has one key shape, scoped by hackathon where it applies.

export const keys = {
  me: () => ['me'] as const,
  meta: () => ['meta'] as const,
  formToken: (form: 'login' | 'signup') => ['form-token', form] as const,
  hackathons: () => ['hackathons'] as const,
  hackathon: (hid: string) => ['hackathon', hid] as const,
  myStatus: (hid: string) => ['hackathon', hid, 'me'] as const,
  teamsBoard: (hid: string) => ['hackathon', hid, 'board', 'teams'] as const,
  peopleBoard: (hid: string) => ['hackathon', hid, 'board', 'people'] as const,
  suggestions: (hid: string) => ['hackathon', hid, 'suggestions'] as const,
  myRequests: (hid: string) => ['hackathon', hid, 'my-requests'] as const,
  /** Prefix of every key above that belongs to one hackathon. */
  hackathonScope: (hid: string) => ['hackathon', hid] as const,
  team: (tid: string) => ['team', tid] as const,
  teamRequests: (tid: string) => ['team', tid, 'requests'] as const,
  invite: (tid: string) => ['team', tid, 'invite'] as const,
  audit: (tid: string) => ['team', tid, 'audit'] as const,
  /** Prefix of every team key. */
  teams: () => ['team'] as const,
};
