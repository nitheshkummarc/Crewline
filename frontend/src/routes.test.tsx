// T-WEB-05: every page renders, every internal link targets a real route, every external link is a known real URL.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CONTACT_URL, SOURCE_URL } from './components/Layout';
import { LiveRegionProvider } from './components/LiveRegion';
import { isKnownRoute, routes } from './routes';
import { HACKATHON, HID, ME, stubFetch, team, teamDetail } from './test/fixtures';

const EXTERNAL = new Set([CONTACT_URL, SOURCE_URL]);
const TID = team().id;

const UNAUTH = { error: { code: 'unauthenticated', message: 'Log in to continue', request_id: 'r' } };

function api(signedIn: boolean) {
  stubFetch([
    ['GET', /\/api\/auth\/me$/, signedIn ? 200 : 401, signedIn ? ME : UNAUTH],
    ['GET', /\/api\/auth\/form-token$/, 200, { token: 't' }],
    ['GET', /\/api\/meta$/, 200, { skills: ['frontend', 'backend'], core_roles: ['frontend'] }],
    ['GET', /\/api\/hackathons$/, 200, [HACKATHON]],
    ['GET', new RegExp(`/api/hackathons/${HID}/me$`), 200, { registered: true, looking: true, team: team(), pending_requests: [] }],
    ['GET', /\/board\/teams/, 200, { items: [team(), team({ id: 'dddddddd-0000-4000-8000-000000000009', name: 'Byte Me', leader_id: 'x' })], next_cursor: null }],
    ['GET', /\/board\/people/, 200, { items: [], next_cursor: null }],
    ['GET', /\/my-requests$/, 200, [{ id: 'r1', team_id: TID, team_name: 'Null Pointers', user_id: ME.id, display_name: 'Ana', message: null, status: 'declined', created_at: '2026-11-11T09:00:00Z', decided_at: null }]],
    ['GET', /\/suggestions/, 200, { context: { team_id: TID, missing_roles: ['design'] }, items: [] }],
    ['GET', new RegExp(`/api/hackathons/${HID}$`), 200, HACKATHON],
    ['GET', new RegExp(`/api/teams/${TID}/invite$`), 200, { code: 'ABCDE-FGHJK', expires_at: '2026-11-13T10:00:00Z' }],
    ['GET', new RegExp(`/api/teams/${TID}/requests$`), 200, []],
    ['GET', new RegExp(`/api/teams/${TID}/audit`), 200, { items: [{ seq: 1, action: 'team_created', actor_id: ME.id, created_at: '2026-11-11T10:00:00Z', payload: {} }], next_cursor: null }],
    ['GET', new RegExp(`/api/teams/${TID}$`), 200, teamDetail()],
  ]);
}

function App({ path }: { path: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Routes = () => useRoutes(routes);
  return (
    <QueryClientProvider client={client}>
      <LazyMotion features={domAnimation}>
        <LiveRegionProvider>
          <MemoryRouter initialEntries={[path]}><Routes /></MemoryRouter>
        </LiveRegionProvider>
      </LazyMotion>
    </QueryClientProvider>
  );
}

const PAGES: Array<[string, string, boolean]> = [
  ['/login', 'Log in', false],
  ['/signup', 'Create an account', false],
  ['/privacy', 'Privacy', false],
  ['/terms', 'Terms of use', false],
  ['/', 'Hackathons', true],
  [`/h/${HID}`, 'Hack4Hack 2026', true],
  [`/h/${HID}/teams/new`, 'Create a team', true],
  [`/h/${HID}/join?code=ABCDE-FGHJK`, 'Join with a code', true],
  [`/teams/${TID}`, 'Null Pointers', true],
  ['/me', 'Your profile', true],
  ['/no/such/page', 'This page is not on the board', false],
];

describe('T-WEB-05 routes and links', () => {
  it.each(PAGES)('%s renders and links only to real targets', async (path, heading, signedIn) => {
    api(signedIn);
    const { container } = render(<App path={path} />);
    await screen.findByRole('heading', { name: heading }, { timeout: 4000 });
    const links = [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '');
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      if (href.startsWith('#')) {
        expect(container.querySelector(href), href).not.toBeNull();
      } else if (/^https?:/.test(href)) {
        expect(EXTERNAL.has(href), href).toBe(true);
      } else {
        expect(isKnownRoute(href), href).toBe(true);
      }
    }
  });

  it.each(PAGES)('%s has exactly one primary action (rule 10)', async (path, heading, signedIn) => {
    api(signedIn);
    const { container } = render(<App path={path} />);
    await screen.findByRole('heading', { name: heading }, { timeout: 4000 });
    await waitFor(() => expect(container.querySelector('[role="status"]')).toBeNull(), { timeout: 4000 });
    expect(container.querySelectorAll('[data-variant="primary"]').length).toBe(1);
  });

  it('never requests a URL with an empty path segment while ids load (bug B-24)', async () => {
    api(true);
    render(<App path={`/teams/${TID}`} />);
    await screen.findByRole('heading', { name: 'Null Pointers' }, { timeout: 4000 });
    const urls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => String(call[0]));
    expect(urls.filter((url) => url.split('?')[0]?.includes('//'))).toEqual([]);
  });

  it('shows the invite code exactly as the API formats it (bug B-25)', async () => {
    api(true);
    render(<App path={`/teams/${TID}`} />);
    expect(await screen.findByLabelText('Invite code A B C D E - F G H J K', {}, { timeout: 4000 })).toHaveTextContent(/^ABCDE-FGHJK$/);
  });

  it('knows the 404 catch-all is not a real route', () => {
    expect(isKnownRoute('/no/such/page')).toBe(false);
    expect(isKnownRoute(`/teams/${TID}`)).toBe(true);
  });
});
