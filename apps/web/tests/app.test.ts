import { createHash, randomBytes } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { finalizeEvent, generateSecretKey, getPublicKey, type UnsignedEvent } from 'nostr-tools/pure';
import postgres from 'postgres';
import config from '../svelte.config.js';

const sql = postgres(process.env.DATABASE_URL!, { connection: { timezone: 'UTC' }, onnotice: () => {} });
test.afterAll(() => sql.end());

const run = crypto.randomUUID().slice(0, 8);

// Console errors fail the test, CSP violations included
let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
});
test.afterEach(() => expect(errors).toEqual([]));

async function logIn(page: Page) {
  const email = `e2e-${crypto.randomUUID()}@example.com`;
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await sql`insert into magic_links (email, token_hash, expires_at)
    values (${email}, ${tokenHash}, ${new Date(Date.now() + 15 * 60_000)})`;
  await page.goto(`/auth/verify?token=${token}`);
  return email;
}

test('a browser extension logs in with Nostr', async ({ page }) => {
  // Stands in for Alby or nos2x (NIP-07): signs in the test, not in the page
  const sk = generateSecretKey();
  await page.exposeFunction('signWithTestKey', (event: UnsignedEvent) => finalizeEvent(event, sk));
  await page.addInitScript((pubkey) => {
    const w = window as unknown as Record<string, unknown>;
    w.nostr = {
      getPublicKey: async () => pubkey,
      signEvent: (event: unknown) => (w.signWithTestKey as (e: unknown) => Promise<unknown>)(event),
    };
  }, getPublicKey(sk));

  await Promise.all([page.waitForResponse('**/api/v1/auth/me'), page.goto('/login')]);
  await page.getByRole('button', { name: 'Mit Nostr anmelden' }).click();
  await page.getByRole('button', { name: 'Log in' }).click();

  // The dev server allows inline styles, production only these hashes. A new
  // nostr-login version brings new ones, svelte.config.js needs them.
  const styles = await page.evaluate(() => {
    const texts: string[] = [];
    const walk = (root: Document | ShadowRoot) => {
      for (const style of root.querySelectorAll('style')) texts.push(style.textContent ?? '');
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(document.querySelector('nl-auth')!.shadowRoot!);
    return texts;
  });
  expect(styles.length).toBeGreaterThan(0);
  const allowed = config.kit!.csp!.directives!['style-src']!;
  for (const style of styles)
    expect(allowed).toContain(`sha256-${createHash('sha256').update(style).digest('base64')}`);

  await page.getByRole('button', { name: 'With extension' }).click();

  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByRole('heading', { name: 'Was macht dich aus?' })).toBeVisible();
  await expect(page.getByLabel('Anzeigename')).toHaveValue(/^npub1/);
});

test('onboarding keeps discoverability off until switched on', async ({ page }) => {
  const email = await logIn(page);
  await expect(page).toHaveURL(/\/welcome/);
  const discoverable = page.getByRole('switch', { name: 'Für Schnittmengen auffindbar' });
  await expect(discoverable).toHaveAttribute('aria-checked', 'false');

  await page.getByLabel('Anzeigename').fill('Robin');
  await page.getByRole('button', { name: 'Klettern' }).click();
  await page.getByLabel('Eigenes Interesse').fill(`Modular ${run}`);
  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page).toHaveURL(/\/requests$/);

  const [user] = await sql`select u.discoverable, u.onboarded_at, count(i.key)::int as interests
    from users u left join interests i on i.user_id = u.id where u.email = ${email} group by u.id`;
  expect(user).toMatchObject({ discoverable: false, interests: 2 });
  expect(user!.onboarded_at).not.toBeNull();
});

test('a bubble asks another one', async ({ page }) => {
  await logIn(page);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page).toHaveURL(/\/requests$/);

  await page.getByRole('link', { name: 'Meine Bubbles' }).first().click();
  await page.getByRole('button', { name: '+ Bubble anlegen' }).click();
  await page.getByLabel('Name').fill(`Bitcoin Freiburg ${run}`);
  await page.getByLabel('Beschreibung').fill('Stammtisch jeden ersten Donnerstag');
  await page.getByRole('button', { name: 'Bubble anlegen' }).last().click();
  await expect(page.getByRole('heading', { name: `Bitcoin Freiburg ${run}` })).toBeVisible();
  await expect(page.getByLabel('Einladungslink')).toHaveValue(/\/join\/[\w-]{24}$/);

  await page.getByRole('link', { name: '+ Neue Anfrage' }).last().click();
  await page.getByLabel('An wen?').fill(`Sparkasse ${run}`);
  await page.getByRole('button', { name: `„Sparkasse ${run}“ anlegen und einladen` }).click();
  await page.getByLabel('Eure Frage').fill('Was haltet ihr von Geld, das keine Bank braucht?');
  await page.getByLabel('Termin').fill('2026-11-05T19:30');
  await page.getByRole('button', { name: `An Bitcoin Freiburg ${run} zur Zusage` }).click();

  await expect(page.getByText(`Sparkasse ${run} ist noch nicht hier`)).toBeVisible();
  await page.getByRole('link', { name: 'Zur Anfrage' }).click();
  await expect(page.getByText('wartet auf 2 Zusagen aus')).toBeVisible();
  await expect(page.getByText('Du bist dabei ✓')).toBeVisible();
});
