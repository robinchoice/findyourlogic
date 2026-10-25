import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb, magicLinks, migrateDb, users } from '@app/db';
import { BUBBLE_COLORS, messages } from '@app/shared';
import { z } from 'zod';
import { createApp } from '../../api/src/app';
import { generateToken, hashToken } from '../../api/src/middleware/auth';
import { run } from './cli';
import { SLUG, sessionFile } from './config';

// The CLI runs in-process against the real API on a free port. Runs against
// DATABASE_URL like the API tests and only adds rows with fresh addresses.
const db = createDb(process.env.DATABASE_URL!);
const app = createApp(db);
// Request log and mails stay out of the test output
const log = spyOn(console, 'log').mockImplementation(() => {});
// Rate limits live in the database, so each run counts against its own address
const ip = crypto.randomUUID();
let server: ReturnType<typeof Bun.serve>;
let url = '';

beforeAll(async () => {
  await migrateDb(process.env.DATABASE_URL!);
  server = Bun.serve({
    port: 0,
    fetch: (req) => {
      const headers = new Headers(req.headers);
      headers.set('x-forwarded-for', ip);
      return app.fetch(new Request(req, { headers }));
    },
  });
  url = server.url.origin;
});
afterAll(async () => {
  await server.stop(true);
  await db.$client.end();
});

const de = messages.de;
const storedSchema = z.object({ token: z.string() });
const freshEmail = () => `cli-${crypto.randomUUID()}@example.com`;

// A login link as login-link.ts prints it
async function loginLink(email: string) {
  const token = generateToken();
  await db.insert(magicLinks).values({ email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) });
  return `${url}/auth/verify?token=${token}`;
}

// Without SMTP_HOST the login mail lands in the log
const mails = () => log.mock.calls.map((args) => String(args[0])).filter((line) => line.startsWith('[mail]'));
const lastCode = () =>
  mails()
    .at(-1)
    ?.match(/Dein Code: (\d{6})/)?.[1] ?? '';

// One device: its own config folder, so its own token. Answers the code
// question from the last mail, the email question with `email`.
async function device(env: Record<string, string> = { LANG: 'de_DE.UTF-8' }) {
  const deviceEnv = { XDG_CONFIG_HOME: await mkdtemp(join(tmpdir(), 'cli-')), ...env };
  // Adds --url of the test API unless raw or the call names one
  const cli = async (args: string[], { email = '', stdin = '', raw = false } = {}) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await run(raw || args.length === 0 || args.includes('--url') ? args : [...args, '--url', url], {
      env: deviceEnv,
      out: (text) => out.push(text),
      err: (text) => err.push(text),
      ask: async (question) => (question === de.cliAskCode ? lastCode() : email),
      stdin: async () => stdin,
    });
    return { code, out: out.join('\n'), err: err.join('\n'), json: () => JSON.parse(out.join('\n')) };
  };
  const token = async () => storedSchema.parse(JSON.parse(await readFile(sessionFile(deviceEnv), 'utf8'))).token;
  return { cli, token, env: deviceEnv };
}

const sessionCount = async (token: string) =>
  (await db.$client`select count(*)::int as n from sessions where token_hash = ${hashToken(token)}`)[0]!.n;

const asUser = (token: string, path: string, body?: object) =>
  fetch(`${url}/api/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : null,
  }).then((res) => res.json());

test('login with the mailed code stores a token only the user can read', async () => {
  const email = freshEmail();
  const { cli, token, env } = await device();

  const login = await cli(['login', '--json'], { email });
  expect(login.code).toBe(0);
  expect(login.json()).toMatchObject({ user: { email } });
  expect(login.err).toContain(de.cliCodeSent(email));
  expect((await stat(sessionFile(env))).mode & 0o777).toBe(0o600);
  expect(await sessionCount(await token())).toBe(1);

  expect(await cli(['whoami'])).toMatchObject({ code: 0, out: `${email.split('@')[0]} <${email}>` });
  expect((await cli(['whoami', '--json'])).json()).toMatchObject({ user: { email, npub: null } });
});

test('requests lists the board tab by tab', async () => {
  const { cli, token } = await device();
  await cli(['login'], { email: freshEmail() });
  expect(await cli(['requests'])).toMatchObject({ code: 0, out: `${de.tabMine}:\n\n${de.emptyMine}` });

  const name = `CLI ${crypto.randomUUID().slice(0, 8)}`;
  const created = z.object({ id: z.string() });
  const { bubble } = z
    .object({ bubble: created })
    .parse(await asUser(await token(), '/bubbles', { name, color: BUBBLE_COLORS[0] }));
  const question = 'Was hält uns eigentlich zusammen?';
  const { request } = z.object({ request: created }).parse(
    await asUser(await token(), '/requests', {
      fromBubbleId: bubble.id,
      newBubbleName: `${name} B`,
      question,
      format: 'online',
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      seats: 3,
    }),
  );

  const sent = await cli(['requests', '--tab', 'sent']);
  expect(sent.code).toBe(0);
  expect(sent.out).toContain(de.quoted(question));
  expect(sent.out).toContain(`${name} → ${name} B · ${de.formatShort.online} · 3 + 3`);
  expect(sent.out).toContain(`${de.statusNeedsSupport(2, name)} · ${de.youAreIn}`);
  expect((await cli(['requests', '--tab', 'sent', '--json'])).json()).toMatchObject({
    tab: 'sent',
    requests: [{ id: request.id, question, mySide: 'from', fromCount: 1, sentAt: null }],
  });

  expect((await cli(['requests', '--tab', 'nope'])).code).toBe(2);
  await cli(['logout']);
  expect((await cli(['requests', '--json'])).json()).toEqual({ error: de.notLoggedIn });
});

test('every device has its own token, logout revokes only that one', async () => {
  const email = freshEmail();
  const laptop = await device();
  const server = await device();
  await laptop.cli(['login'], { email });
  await server.cli(['login'], { email });
  const laptopToken = await laptop.token();
  expect(laptopToken).not.toBe(await server.token());

  expect(await laptop.cli(['logout'])).toMatchObject({ code: 0, out: de.cliLoggedOut });
  expect(await sessionCount(laptopToken)).toBe(0);
  expect(await asUser(laptopToken, '/auth/me')).toMatchObject({ user: null });
  expect(await laptop.cli(['whoami'])).toMatchObject({ code: 3, err: de.notLoggedIn });
  expect((await laptop.cli(['whoami', '--json'])).json()).toEqual({ error: de.notLoggedIn });

  expect((await server.cli(['whoami'])).code).toBe(0);

  // Logging in again replaces the token of the device and revokes the old one
  const oldToken = await server.token();
  await server.cli(['login'], { email });
  expect(await sessionCount(oldToken)).toBe(0);
  expect(await sessionCount(await server.token())).toBe(1);
});

test('a session revoked on the server logs the CLI out', async () => {
  const { cli, token } = await device();
  await cli(['login'], { email: freshEmail() });
  await db.$client`delete from sessions where token_hash = ${hashToken(await token())}`;
  expect((await cli(['whoami'])).code).toBe(3);
  expect((await cli(['requests'])).code).toBe(3);
});

test('agents log in with a login link from stdin', async () => {
  const email = freshEmail();
  const link = await loginLink(email);
  const { cli } = await device();

  expect((await cli(['login', '--link', '-'], { stdin: `${link}\n` })).code).toBe(0);
  expect((await cli(['whoami', '--json'])).json()).toMatchObject({ user: { email } });

  const again = await device();
  expect(await again.cli(['login', '--link', link])).toMatchObject({ code: 1, err: de.linkExpired });
  expect(await again.cli(['login', '--link', 'https://example.com/'])).toMatchObject({ code: 2 });
});

test('the CLI creates no account past the closed sign-up', async () => {
  process.env.SIGNUPS_OPEN = 'false';
  try {
    const email = freshEmail();
    const { cli } = await device();
    const before = mails().length;

    // As in the web, the API doesn't tell which addresses have an account: no mail, so no code fits
    const login = await cli(['login', '--json'], { email });
    expect(login.code).toBe(1);
    expect(login.json()).toEqual({ error: de.codeWrong });
    expect(mails().length).toBe(before);

    // A link issued for an unknown address doesn't get past it either
    expect(await cli(['login', '--link', await loginLink(email)])).toMatchObject({ code: 1, err: de.signupsClosed });
    expect(await db.$client`select id from users where email = ${email}`).toHaveLength(0);

    // Existing accounts still log in
    await db.insert(users).values({ email, name: 'Ada' });
    expect((await cli(['login'], { email })).code).toBe(0);
  } finally {
    delete process.env.SIGNUPS_OPEN;
  }
});

test('the token only goes to the address it was issued for', async () => {
  const seen: (string | null)[] = [];
  const other = Bun.serve({
    port: 0,
    fetch: (req) => {
      seen.push(req.headers.get('authorization'));
      return Response.json({ error: 'nope' }, { status: 401 });
    },
  });
  try {
    const { cli } = await device();
    await cli(['login'], { email: freshEmail() });
    expect((await cli(['whoami', '--url', other.url.origin])).code).toBe(3);
    expect((await cli(['requests', '--url', other.url.origin])).code).toBe(3);
    expect(seen).toEqual([]);
    // The stored session stays for its own address, which later calls take without --url
    expect((await cli(['logout', '--url', other.url.origin])).code).toBe(0);
    expect((await cli(['whoami'])).code).toBe(0);
    expect((await cli(['whoami', '--json'], { raw: true })).json()).toMatchObject({
      user: { email: expect.any(String) },
    });
  } finally {
    await other.stop(true);
  }
});

test('help, wrong usage and an unreachable app', async () => {
  const { cli } = await device();
  const helpText = await cli([]);
  expect(helpText.code).toBe(0);
  expect(helpText.out).toContain(`${de.cliCommands}:`);
  expect(helpText.out).toContain('requests [--tab mine|open|sent]');

  const english = await device({ LANG: 'en_US.UTF-8' });
  expect((await english.cli(['--help'])).out).toContain(`${messages.en.cliCommands}:`);
  expect((await cli(['--help', '--lang', 'en'])).out).toContain(`${messages.en.cliCommands}:`);

  expect((await cli(['whoami', '--help', '--json'])).json()).toMatchObject({
    commands: expect.arrayContaining([{ usage: 'whoami', text: de.cliWhoamiHelp }]),
    exitCodes: { loggedOut: 3 },
  });

  expect(await cli(['frobnicate'])).toMatchObject({ code: 2, err: de.cliUnknownCommand('frobnicate', SLUG) });
  expect((await cli(['frobnicate', '--json'])).json()).toEqual({ error: de.cliUnknownCommand('frobnicate', SLUG) });
  expect((await cli(['whoami', '--nope'])).code).toBe(2);
  expect(await cli(['login', '--email', 'a@example.com', '--url', 'http://127.0.0.1:1'])).toMatchObject({
    code: 1,
    err: de.cliUnreachable('http://127.0.0.1:1'),
  });
});

test('an unwritable config folder ends with an error, not a crash', async () => {
  const blocked = join(await mkdtemp(join(tmpdir(), 'cli-')), 'file');
  await Bun.write(blocked, '');
  const { cli } = await device({ LANG: 'de_DE.UTF-8', XDG_CONFIG_HOME: blocked });
  const login = await cli(['login', '--json'], { email: freshEmail() });
  expect(login.code).toBe(1);
  expect(login.json()).toEqual({ error: expect.any(String) });
});

test('the entry point passes the exit code to the shell', async () => {
  const env = { ...process.env, LANG: 'en_US.UTF-8', XDG_CONFIG_HOME: await mkdtemp(join(tmpdir(), 'cli-')) };
  const main = join(import.meta.dir, 'main.ts');
  // Async, so the API in this process keeps answering
  const whoami = Bun.spawn(['bun', main, 'whoami', '--json', '--url', url], { env, stdout: 'pipe' });
  expect(await whoami.exited).toBe(3);
  expect(JSON.parse(await new Response(whoami.stdout).text())).toEqual({ error: messages.en.notLoggedIn });
  expect(await Bun.spawn(['bun', main, '--help'], { env, stdout: 'ignore' }).exited).toBe(0);
});
