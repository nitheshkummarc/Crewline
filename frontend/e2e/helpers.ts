// End-to-end helpers: create real users through the API (with the real bot check) and open browsers as them.
import { expect, request, type Browser, type BrowserContext, type Page, type ViewportSize } from '@playwright/test';

export const PASSWORD = 'e2e-password-1';
const MIN_FILL_MS = 2100;

export interface Person {
  name: string;
  email: string;
  context: BrowserContext;
  page: Page;
}

/** Return a short unique suffix for names and emails. */
export const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Return the id of the first hackathon (the seeded one). */
export async function hackathonId(baseURL: string): Promise<string> {
  const api = await request.newContext({ baseURL });
  const email = `probe-${unique()}@example.com`;
  await signupThroughApi(api, email, 'Probe');
  const list = await (await api.get('/api/hackathons')).json() as Array<{ id: string }>;
  await api.dispose();
  const first = list[0];
  expect(first).toBeDefined();
  return first?.id ?? '';
}

async function signupThroughApi(api: Awaited<ReturnType<typeof request.newContext>>, email: string, name: string) {
  const token = (await (await api.get('/api/auth/form-token')).json() as { token: string }).token;
  await new Promise((resolve) => setTimeout(resolve, MIN_FILL_MS));
  const response = await api.post('/api/auth/signup', {
    data: { email, password: PASSWORD, display_name: name, skills: ['backend'], timezone: 'Asia/Kolkata', form_token: token, company: '' },
  });
  expect(response.status(), await response.text()).toBe(201);
}

/** Sign up and register people through the API in parallel, then open a signed-in page for each at the project's viewport. */
export async function people<const N extends readonly string[]>(browser: Browser, baseURL: string, hid: string,
                                                               viewport: ViewportSize | null, names: N): Promise<{ [K in keyof N]: Person }> {
  const created = await Promise.all(names.map(async (base) => {
    const name = `${base} ${unique().slice(-4)}`;
    const email = `${base.toLowerCase()}-${unique()}@example.com`;
    const api = await request.newContext({ baseURL });
    await signupThroughApi(api, email, name);
    const registered = await api.post(`/api/hackathons/${hid}/register`, { headers: { 'Idempotency-Key': `reg${unique()}${unique()}` } });
    expect(registered.status()).toBe(200);
    const state = await api.storageState();
    await api.dispose();
    const context = await browser.newContext({ storageState: state, baseURL, viewport: viewport ?? { width: 1280, height: 860 } });
    const page = await context.newPage();
    watch(page);
    return { name, email, context, page };
  }));
  return created as { [K in keyof N]: Person };
}

/** Read the invite code shown on a team page. */
export async function inviteCode(page: Page): Promise<string> {
  const label = await page.getByLabel(/Invite code /).getAttribute('aria-label');
  return (label ?? '').replace('Invite code ', '').replace(/ /g, '');
}

const problems = new WeakMap<Page, string[]>();

/** Record CSP violations and uncaught errors on a page (bug B-28); `assertClean` fails the test if any happened. */
export function watch(page: Page): void {
  const list: string[] = [];
  problems.set(page, list);
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) list.push(`CSP: ${message.text().slice(0, 160)}`);
  });
  page.on('pageerror', (error) => list.push(`pageerror: ${error.message.slice(0, 160)}`));
}

/** Fail if the page logged a CSP violation or an uncaught error, or scrolls sideways at its viewport. */
export async function assertClean(page: Page): Promise<void> {
  expect(problems.get(page) ?? []).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}
