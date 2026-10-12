import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test';
import { createDb, migrateDb, sessions, users } from '@app/db';
import { eq } from 'drizzle-orm';
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure';
import { createApp } from './app';
import { LOGIN_KIND } from './lib/nostr';
import { generateToken, hashToken } from './middleware/auth';

// Runs against DATABASE_URL and only adds its own rows, see auth.test.ts
const db = createDb(process.env.DATABASE_URL!);
const app = createApp(db);
const log = spyOn(console, 'log');
const ip = crypto.randomUUID();
const run = crypto.randomUUID().slice(0, 8);

beforeAll(() => migrateDb(process.env.DATABASE_URL!));
afterAll(() => db.$client.end());

type Session = { id: string; cookie: string };

async function newUser(name: string): Promise<Session> {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@example.com`, name })
    .returning({ id: users.id });
  const token = generateToken();
  await db
    .insert(sessions)
    .values({ userId: user!.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) });
  return { id: user!.id, cookie: `session=${token}` };
}

// biome-ignore lint/suspicious/noExplicitAny: the tests check the shape with expect
async function call(method: string, path: string, as?: Session | null, body?: unknown): Promise<[number, any]> {
  const headers: Record<string, string> = { 'x-forwarded-for': ip };
  if (as) headers.cookie = as.cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await app.request(`/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return [res.status, await res.json()];
}

async function bubble(owner: Session, name: string) {
  const [status, body] = await call('POST', '/bubbles', owner, { name: `${name} ${run}`, color: '#e8870e' });
  expect(status).toBe(201);
  const [, detail] = await call('GET', `/bubbles/${body.bubble.id}`, owner);
  return { id: body.bubble.id as string, token: detail.bubble.inviteToken as string };
}

const join = (as: Session, token: string) => call('POST', `/bubbles/invite/${token}/join`, as);

async function nostrEvent(sk: Uint8Array, url = `${process.env.APP_URL}/api/v1/auth/nostr`) {
  const [, { challenge }] = await call('POST', '/auth/nostr/challenge');
  return finalizeEvent(
    {
      kind: LOGIN_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['u', url],
        ['method', 'POST'],
        ['challenge', challenge],
      ],
      content: '',
    },
    sk,
  );
}

test('a signed Nostr challenge logs in and finds the same account again', async () => {
  const sk = generateSecretKey();
  const first = await app.request('/api/v1/auth/nostr', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ event: await nostrEvent(sk) }),
  });
  expect(first.status).toBe(200);
  const { user } = (await first.json()) as { user: { id: string; npub: string } };
  expect(user.npub).toMatch(/^npub1/);
  expect(user).toMatchObject({ email: null, discoverable: false, onboarded: false });
  const cookie = first.headers.get('set-cookie')!.match(/session=([0-9a-f]+)/)![0];
  const [, me] = await call('GET', '/auth/me', { id: user.id, cookie });
  expect(me.user.id).toBe(user.id);

  const [, again] = await call('POST', '/auth/nostr', null, { event: await nostrEvent(sk) });
  expect(again.user.id).toBe(user.id);
});

test('a Nostr login needs a fresh challenge for this site', async () => {
  const sk = generateSecretKey();
  const event = await nostrEvent(sk);
  expect((await call('POST', '/auth/nostr', null, { event }))[0]).toBe(200);
  // Used once already
  expect((await call('POST', '/auth/nostr', null, { event }))[0]).toBe(400);
  // Signed for another site
  const foreign = await nostrEvent(sk, 'https://evil.example/api/v1/auth/nostr');
  expect((await call('POST', '/auth/nostr', null, { event: foreign }))[0]).toBe(400);
  // Tampered
  const tampered = { ...(await nostrEvent(sk)), content: 'x' };
  expect((await call('POST', '/auth/nostr', null, { event: tampered }))[0]).toBe(400);
});

test('email and npub can point to the same account', async () => {
  const alice = await newUser('Alice');
  const sk = generateSecretKey();
  const [status, linked] = await call('POST', '/auth/nostr', alice, { event: await nostrEvent(sk) });
  expect(status).toBe(200);
  expect(linked.user.id).toBe(alice.id);
  expect(linked.user.npub).toMatch(/^npub1/);

  // Logging in with the key later lands in the same account
  const [, login] = await call('POST', '/auth/nostr', null, { event: await nostrEvent(sk) });
  expect(login.user.id).toBe(alice.id);

  // A Nostr-only account adds an address through a confirmation link
  const [, me] = await call('POST', '/auth/nostr', null, { event: await nostrEvent(generateSecretKey()) });
  const email = `test-${crypto.randomUUID()}@example.com`;
  const token = generateToken();
  await db
    .insert(sessions)
    .values({ userId: me.user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) });
  expect((await call('POST', '/auth/me/email', { id: me.user.id, cookie: `session=${token}` }, { email }))[0]).toBe(
    200,
  );
  const mailed = log.mock.calls
    .map((args) => String(args[0]))
    .findLast((line) => line.startsWith(`[mail] To ${email}`))!
    .match(/token=([0-9a-f]+)/)![1];
  const [, verified] = await call('POST', '/auth/verify', null, { token: mailed });
  expect(verified.user).toMatchObject({ id: me.user.id, email });
});

test('a request goes out with 3 supporters and starts once the other side is full', async () => {
  const [a1, a2, a3, a4, b1, b2, b3, b4, outsider] = await Promise.all(
    ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'X'].map(newUser),
  );
  const asking = await bubble(a1!, 'Marx-Lesekreis');
  const asked = await bubble(b1!, 'Austrian Economics');
  for (const u of [a2!, a3!, a4!]) await join(u, asking.token);
  for (const u of [b2!, b3!, b4!]) await join(u, asked.token);

  const [, found] = await call('GET', `/bubbles/search?q=${encodeURIComponent(`austrian economics ${run}`)}`, a1);
  expect(found.bubbles.map((b: { id: string }) => b.id)).toEqual([asked.id]);

  const [status, created] = await call('POST', '/requests', a1, {
    fromBubbleId: asking.id,
    toBubbleId: asked.id,
    question: 'Woher kommt eigentlich Wert?',
    format: 'online',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    seats: 3,
  });
  expect(status).toBe(201);
  const id = created.request.id;

  // Not out yet: the asked bubble doesn't see it
  expect((await call('GET', `/requests/${id}`, b1))[0]).toBe(404);
  expect((await call('GET', '/requests?tab=sent', a2))[1].requests[0]).toMatchObject({ id, fromCount: 1 });
  await call('POST', `/requests/${id}/join`, a2);
  const [, sent] = await call('POST', `/requests/${id}/join`, a3);
  expect(sent.request.sentAt).not.toBeNull();
  expect((await call('POST', `/requests/${id}/join`, a4))[0]).toBe(409);

  const [, board] = await call('GET', '/requests?tab=mine', b1);
  expect(board.requests[0]).toMatchObject({ id, fromCount: 3, toCount: 0 });
  const [, badges] = await call('GET', '/me/badges', b1);
  expect(badges.requests).toBe(1);
  // Others see it as open, without names
  const [, open] = await call('GET', `/requests/${id}`, outsider);
  expect(open.request).toMatchObject({ canJoin: null, fromPeople: [] });
  expect((await call('POST', `/requests/${id}/join`, outsider))[0]).toBe(409);

  await call('POST', `/requests/${id}/join`, b1);
  await call('POST', `/requests/${id}/join`, b2);
  const [, accepted] = await call('POST', `/requests/${id}/join`, b3);
  expect(accepted.request.acceptedAt).not.toBeNull();
  expect((await call('POST', `/requests/${id}/leave`, b3))[0]).toBe(409);

  // The round: messages, three phases, both summaries confirmed
  expect((await call('GET', `/rounds/${id}`, b4))[0]).toBe(404);
  await call('POST', `/rounds/${id}/messages`, a1, { body: 'Wert kommt aus Arbeit.' });
  expect((await call('PUT', `/rounds/${id}/summary`, a1, { body: 'Ihr seht Wert als subjektiv.' }))[0]).toBe(409);
  await call('PATCH', `/rounds/${id}`, b1, { phase: 'summary', videoUrl: 'https://meet.jit.si/fyl-test' });
  await call('PUT', `/rounds/${id}/summary`, a1, { body: 'Ihr seht Wert als subjektive Schätzung.' });
  await call('PUT', `/rounds/${id}/summary`, b2, { body: 'Ihr seht Wert in der Arbeitszeit.' });
  expect((await call('POST', `/rounds/${id}/summary/from/confirm`, a2))[0]).toBe(403);
  await call('POST', `/rounds/${id}/summary/from/confirm`, b3);
  const [, done] = await call('POST', `/rounds/${id}/summary/to/confirm`, a3);
  expect(done.round).toMatchObject({ phase: 'summary', videoUrl: 'https://meet.jit.si/fyl-test' });
  expect(done.round.doneAt).not.toBeNull();
  expect(done.round.messages[0]).toMatchObject({ phase: 'views', side: 'from', author: { name: 'A1' } });
});

test('a request to a bubble that is not here yet comes with its invite link', async () => {
  const a = await newUser('A');
  const asking = await bubble(a, 'Bitcoin Freiburg');
  const [status, created] = await call('POST', '/requests', a, {
    fromBubbleId: asking.id,
    newBubbleName: `Sparkasse-Azubis ${run}`,
    question: 'Was haltet ihr von Geld ohne Bank?',
    format: 'written',
    startsAt: new Date().toISOString(),
    seats: 3,
  });
  expect(status).toBe(201);
  expect(created.request.inviteToken).toBeString();
  const [, detail] = await call('GET', `/requests/${created.request.id}`, a);
  expect(detail.request.toInviteToken).toBe(created.request.inviteToken);
});

test('matches need 3 shared traits and both people discoverable', async () => {
  const [me, lena, tobias, hidden] = await Promise.all(['Me', 'Lena', 'Tobias', 'Hidden'].map(newUser));
  const btc = await bubble(me!, 'Bitcoin Stammtisch');
  const modular = await bubble(me!, 'Modular');
  for (const u of [lena!, tobias!, hidden!]) {
    await join(u, btc.token);
    await join(u, modular.token);
  }
  const traits = (bubbleIds: string[], interests: string[]) => ({ bubbleIds, interests });
  await call('PUT', '/me/traits', me, traits([btc.id, modular.id], [`Freiburg ${run}`, `Klettern ${run}`]));
  await call('PUT', '/me/traits', lena, traits([btc.id, modular.id], [` freiburg  ${run.toUpperCase()}`]));
  await call('PUT', '/me/traits', tobias, traits([btc.id, modular.id], []));
  await call('PUT', '/me/traits', hidden, traits([btc.id, modular.id], [`Freiburg ${run}`]));

  // Not discoverable: no matches either way
  expect((await call('GET', '/matches', me))[1]).toMatchObject({ discoverable: false, people: [] });
  for (const u of [me!, lena!, tobias!]) await call('PATCH', '/auth/me', u, { discoverable: true });

  const [, matches] = await call('GET', '/matches', me);
  expect(matches.people.map((p: { name: string }) => p.name)).toEqual(['Lena']);
  expect(matches.people[0].shared).toHaveLength(3);
  expect(matches.fewer).toBe(1);
  expect(matches.combos[0]).toMatchObject({ count: 1, isNew: true });

  const [, badges] = await call('GET', '/me/badges', me);
  expect(badges.newMatches).toBe(1);
  await call('POST', '/matches/seen', me);
  expect((await call('GET', '/me/badges', me))[1].newMatches).toBe(0);

  const keys = matches.combos[0].traits.map((t: { key: string }) => t.key);
  const [, venn] = await call('GET', `/matches/venn?traits=${keys.join(',')}`, me);
  // Me and Lena hold all three, Tobias the two bubbles
  expect(venn.regions).toMatchObject({ '7': 2 });

  // Say hello: only to matches, then the thread goes both ways
  expect((await call('POST', `/messages/${hidden!.id}`, me, { body: 'Hallo!' }))[0]).toBe(403);
  expect((await call('POST', `/messages/${lena!.id}`, me, { body: 'Hallo Lena!' }))[0]).toBe(201);
  expect((await call('GET', '/me/badges', lena))[1].unread).toBe(1);
  const [, thread] = await call('GET', `/messages/${me!.id}`, lena);
  expect(thread.messages).toMatchObject([{ mine: false, body: 'Hallo Lena!' }]);
  expect((await call('GET', '/messages', me))[1].conversations[0]).toMatchObject({ person: { name: 'Lena' } });

  // A bubble from the match invites everyone in it
  const [status, founded] = await call('POST', '/bubbles/from-match', me, {
    name: `Bitcoin × Modular ${run}`,
    traits: keys,
  });
  expect(status).toBe(201);
  expect(founded.invited).toBe(1);
  const [, lenas] = await call('GET', '/bubbles', lena);
  expect(lenas.invitations[0]).toMatchObject({ id: founded.bubble.id, invitedBy: 'Me' });
  await call('POST', `/bubbles/${founded.bubble.id}/invitation`, lena);
  expect((await call('GET', `/bubbles/${founded.bubble.id}`, lena))[1].people).toHaveLength(2);
});

test('deleting the account removes it with its traits', async () => {
  const u = await newUser('Gone');
  const b = await bubble(u, 'Kurz da');
  expect((await call('DELETE', '/auth/me', u))[0]).toBe(200);
  expect(await db.select().from(users).where(eq(users.id, u.id))).toEqual([]);
  const other = await newUser('Other');
  expect((await call('GET', `/bubbles/${b.id}`, other))[1].bubble.members).toBe(0);
});

test('closed signups keep new people out and let existing accounts in', async () => {
  process.env.SIGNUPS_OPEN = 'false';
  try {
    const stranger = `test-${crypto.randomUUID()}@example.com`;
    expect((await call('POST', '/auth/magic-link', null, { email: stranger }))[0]).toBe(200);
    const mailed = () => log.mock.calls.some((args) => String(args[0]).startsWith(`[mail] To ${stranger}`));
    expect(mailed()).toBe(false);
    expect((await call('POST', '/auth/nostr', null, { event: await nostrEvent(generateSecretKey()) }))[0]).toBe(403);
    expect((await call('GET', '/auth/me'))[1].signupsOpen).toBe(false);

    const known = `test-${crypto.randomUUID()}@example.com`;
    await db.insert(users).values({ email: known, name: 'Known' });
    await call('POST', '/auth/magic-link', null, { email: known });
    const token = log.mock.calls
      .map((args) => String(args[0]))
      .findLast((line) => line.startsWith(`[mail] To ${known}`))!
      .match(/token=([0-9a-f]+)/)![1];
    const [status, verified] = await call('POST', '/auth/verify', null, { token });
    expect(status).toBe(200);
    expect(verified.user.email).toBe(known);
  } finally {
    delete process.env.SIGNUPS_OPEN;
  }
});
