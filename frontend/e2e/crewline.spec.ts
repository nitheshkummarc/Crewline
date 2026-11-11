// End-to-end flows through the real UI and API: signup with the bot check, live updates, requests, last-seat race.
import { expect, test } from '@playwright/test';
import { PASSWORD, hackathonId, inviteCode, people, unique } from './helpers';

let hid = '';

test.beforeAll(async ({ baseURL }) => {
  hid = await hackathonId(baseURL ?? '');
});

test('E2E-01 sign up in the UI, register, create a team and see the invite code', async ({ page }) => {
  const name = `Ana ${unique().slice(-4)}`;
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Name shown to other participants').fill(name);
  await page.getByLabel('Email').fill(`ana-${unique()}@example.com`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'frontend' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Hackathons' })).toBeVisible();

  await page.getByRole('link', { name: /Open board/ }).first().click();
  await page.getByRole('button', { name: 'Register for this hackathon' }).click();
  await page.getByRole('link', { name: 'Create a team' }).click();
  await page.getByLabel('Team name').fill(`Crew ${unique().slice(-5)}`);
  await page.getByRole('button', { name: 'Create team' }).click();

  await expect(page.getByText('You lead this team')).toBeVisible();
  await expect(page.getByLabel(/Invite code /)).toBeVisible();
  expect(await inviteCode(page)).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('E2E-02 signup form shows field errors next to the fields', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Use at least 8 characters.')).toBeVisible();
  const password = page.getByLabel('Password');
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await password.getAttribute('aria-describedby');
  expect(describedBy).toContain('error');
  await expect(page.getByText('Agree to the terms and the privacy notice to continue.')).toBeVisible();
});

test('E2E-03 a join by shared link shows up live on the leader page without a reload', async ({ browser, baseURL, viewport }) => {
  const [leader, joiner] = await people(browser, baseURL ?? '', hid, viewport, ['Lead', 'Joiner']);
  await leader.page.goto(`/h/${hid}/teams/new`);
  await leader.page.getByLabel('Team name').fill(`Live ${unique().slice(-5)}`);
  await leader.page.getByRole('button', { name: 'Create team' }).click();
  await expect(leader.page.getByText('1 of 4 seats taken').first()).toBeAttached();
  const code = await inviteCode(leader.page);

  await joiner.page.goto(`/h/${hid}/join?code=${code}`);
  await expect(joiner.page.getByLabel('Invite code')).toHaveValue(code);
  await joiner.page.getByRole('button', { name: 'Join team' }).click();
  await expect(joiner.page.getByText('Your team')).toBeVisible();

  await expect(leader.page.getByRole('list', { name: 'Members' }).getByText(joiner.name)).toBeVisible();
  await expect(leader.page.getByText('2 of 4 seats taken').first()).toBeAttached();
  await leader.context.close();
  await joiner.context.close();
});

test('E2E-04 request, live request list, accept, then leave hands leadership over', async ({ browser, baseURL, viewport }) => {
  const [leader, asker] = await people(browser, baseURL ?? '', hid, viewport, ['Owner', 'Asker']);
  const teamName = `Req ${unique().slice(-5)}`;
  await leader.page.goto(`/h/${hid}/teams/new`);
  await leader.page.getByLabel('Team name').fill(teamName);
  await leader.page.getByRole('button', { name: 'Create team' }).click();
  await expect(leader.page.getByRole('heading', { name: 'Requests to join' })).toBeVisible();
  const teamUrl = leader.page.url();

  await asker.page.goto(teamUrl);
  await asker.page.getByRole('button', { name: 'Ask to join' }).click();
  await asker.page.getByLabel('Message to the leader (optional)').fill('I do backend and some devops.');
  await asker.page.getByRole('button', { name: 'Send request' }).click();
  await expect(asker.page.getByRole('button', { name: 'Withdraw your request' })).toBeVisible();

  await expect(leader.page.getByText('"I do backend and some devops."')).toBeVisible();
  await leader.page.getByRole('button', { name: `Accept ${asker.name}` }).click();
  await expect(leader.page.getByText('2 of 4 seats taken').first()).toBeAttached();
  await expect(asker.page.getByText('Your team')).toBeVisible();

  await leader.page.getByRole('button', { name: 'Leave team' }).click();
  await expect(leader.page.getByText('Leadership passes to the member who joined earliest.')).toBeVisible();
  await leader.page.getByRole('dialog').getByRole('button', { name: 'Leave team' }).click();
  await expect(leader.page.getByRole('heading', { name: 'Team board' })).toBeVisible();
  await expect(asker.page.getByText('You lead this team')).toBeVisible();
  await leader.context.close();
  await asker.context.close();
});

test('E2E-05 two people press join on the last seat at once: exactly one gets it', async ({ browser, baseURL, viewport }) => {
  const [leader, second, third, racerA, racerB] = await people(browser, baseURL ?? '', hid, viewport, ['Cap', 'Two', 'Three', 'RacerA', 'RacerB']);
  await leader.page.goto(`/h/${hid}/teams/new`);
  await leader.page.getByLabel('Team name').fill(`Race ${unique().slice(-5)}`);
  await leader.page.getByRole('button', { name: 'Create team' }).click();
  await expect(leader.page.getByLabel(/Invite code /)).toBeVisible();
  const code = await inviteCode(leader.page);
  for (const member of [second, third]) {
    await member.page.goto(`/h/${hid}/join?code=${code}`);
    await member.page.getByRole('button', { name: 'Join team' }).click();
    await expect(member.page.getByText('Your team')).toBeVisible();
  }
  for (const racer of [racerA, racerB]) {
    await racer.page.goto(`/h/${hid}/join?code=${code}`);
    await expect(racer.page.getByRole('button', { name: 'Join team' })).toBeEnabled();
  }
  await Promise.all([racerA, racerB].map((racer) => racer.page.getByRole('button', { name: 'Join team' }).click()));

  const outcome = async (page: typeof racerA.page) => {
    const won = page.getByText('Your team');
    const lost = page.locator('[data-error-code="team_full"]');
    await expect(won.or(lost).first()).toBeVisible();
    return (await lost.count()) > 0 ? 'lost' : 'won';
  };
  const results = await Promise.all([outcome(racerA.page), outcome(racerB.page)]);
  expect([...results].sort()).toEqual(['lost', 'won']);
  const loser = results[0] === 'lost' ? racerA : racerB;
  await expect(loser.page.locator('[data-error-code="team_full"]')).toContainText('Someone took the last seat.');
  await expect(leader.page.getByText('4 of 4 seats taken').first()).toBeAttached();
  for (const person of [leader, second, third, racerA, racerB]) await person.context.close();
});

test('E2E-06 keyboard: the skip link is the first stop and moves focus to the main content', async ({ page }) => {
  await page.goto('/privacy');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});

test('E2E-07 unknown routes show the 404 page and the API keeps JSON 404s', async ({ page, request }) => {
  await page.goto('/no/such/page');
  await expect(page.getByRole('heading', { name: 'This page is not on the board' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to Crewline' }).click();
  await expect(page).toHaveURL(/\/login/);
  const api = await request.get('/api/no-such-endpoint');
  expect(api.status()).toBe(404);
  expect((await api.json()).error.code).toBe('not_found');
});
