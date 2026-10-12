import { type Database, loginCodes, magicLinks, nostrChallenges, sessions, users } from '@app/db';
import {
  addEmailSchema,
  loginCodeSchema,
  magicLinkSchema,
  nostrLoginSchema,
  safeNextPath,
  updateMeSchema,
  verifyCodeSchema,
  verifySchema,
} from '@app/shared';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { t } from '../lib/i18n';
import { sendConfirmEmail, sendLoginCodeEmail, sendMagicLinkEmail } from '../lib/mail';
import { npubOf, verifyLoginEvent } from '../lib/nostr';
import { clientIp, rateLimit, tooManyRequests } from '../lib/rate-limit';
import { validJson } from '../lib/validate';
import {
  currentUser,
  generateToken,
  hashToken,
  requireAuth,
  SESSION_COOKIE,
  SESSION_DAYS,
  sessionToken,
  setSessionCookie,
  toUser,
  userColumns,
} from '../middleware/auth';
import type { AppEnv } from '../types';

const MINUTE = 60 * 1000;
// Apps would otherwise ask for a new code every month
const APP_SESSION_DAYS = 365;
const CODE_ATTEMPTS = 5;
const mailsPerAddress = rateLimit('mails-per-address', 5, 60 * MINUTE);
const mailsPerIp = rateLimit('mails-per-ip', 20, 60 * MINUTE);
const codeChecksPerIp = rateLimit('code-checks-per-ip', 30, 15 * MINUTE);
const nostrPerIp = rateLimit('nostr-per-ip', 30, 15 * MINUTE);

// The first login creates the account. The no-op update lets RETURNING
// yield existing users too.
async function userByEmail(db: Database, email: string) {
  const [user] = await db
    .insert(users)
    .values({ email, name: email.split('@')[0]! })
    .onConflictDoUpdate({ target: users.email, set: { email } })
    .returning(userColumns);
  return user!;
}

async function startSession(db: Database, userId: string, days: number) {
  const token = generateToken();
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + days * 24 * 60 * MINUTE),
  });
  return token;
}

// Short form of the key until the user picks a name
const npubName = (npub: string) => `${npub.slice(0, 12)}…${npub.slice(-4)}`;

export const authRoutes = new Hono<AppEnv>()
  .post('/magic-link', validJson(magicLinkSchema), async (c) => {
    const { email, next } = c.req.valid('json');
    if (!(await mailsPerIp.hit(c, clientIp(c))) || !(await mailsPerAddress.hit(c, email))) return tooManyRequests(c);

    const token = generateToken();
    await c
      .get('db')
      .insert(magicLinks)
      .values({
        email,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 15 * MINUTE),
      });
    await sendMagicLinkEmail(email, token, safeNextPath(next), t(c));
    return c.json({ ok: true });
  })

  .post('/verify', validJson(verifySchema), async (c) => {
    const db = c.get('db');

    // Marking the link as used in the same statement keeps it single-use
    // even when two requests race.
    const [link] = await db
      .update(magicLinks)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(magicLinks.tokenHash, hashToken(c.req.valid('json').token)),
          isNull(magicLinks.usedAt),
          gt(magicLinks.expiresAt, new Date()),
        ),
      )
      .returning({ email: magicLinks.email, userId: magicLinks.userId });
    if (!link) return c.json({ error: t(c).linkExpired }, 400);

    // A link from "add email" confirms the address for that account
    let user: Parameters<typeof toUser>[0] | undefined;
    if (link.userId) {
      const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, link.email));
      if (owner && owner.id !== link.userId) return c.json({ error: t(c).emailTaken }, 409);
      [user] = await db
        .update(users)
        .set({ email: link.email, updatedAt: new Date() })
        .where(eq(users.id, link.userId))
        .returning(userColumns);
      if (!user) return c.json({ error: t(c).linkExpired }, 400);
    } else {
      user = await userByEmail(db, link.email);
    }
    setSessionCookie(c, await startSession(db, user.id, SESSION_DAYS));
    return c.json({ user: toUser(user) });
  })

  // Logged in with Nostr only: confirm an address for the same account
  .post('/me/email', requireAuth, validJson(addEmailSchema), async (c) => {
    const { email } = c.req.valid('json');
    if (!(await mailsPerIp.hit(c, clientIp(c))) || !(await mailsPerAddress.hit(c, email))) return tooManyRequests(c);
    const db = c.get('db');
    const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (owner && owner.id !== c.get('user').id) return c.json({ error: t(c).emailTaken }, 409);

    const token = generateToken();
    await db.insert(magicLinks).values({
      email,
      userId: c.get('user').id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 15 * MINUTE),
    });
    await sendConfirmEmail(email, token, t(c));
    return c.json({ ok: true });
  })

  // Nostr login: the client signs this challenge with its key (NIP-07 or NIP-46)
  .post('/nostr/challenge', async (c) => {
    if (!(await nostrPerIp.hit(c, clientIp(c)))) return tooManyRequests(c);
    const challenge = generateToken();
    await c
      .get('db')
      .insert(nostrChallenges)
      .values({ challenge, expiresAt: new Date(Date.now() + 5 * MINUTE) });
    return c.json({ challenge });
  })

  // Logs in or creates the account of the key. With a session it links the
  // key to the current account instead, so email and npub share one account.
  .post('/nostr', validJson(nostrLoginSchema), async (c) => {
    if (!(await nostrPerIp.hit(c, clientIp(c)))) return tooManyRequests(c);
    const { event } = c.req.valid('json');
    const challenge = verifyLoginEvent(event, `${process.env.APP_URL}/api/v1/auth/nostr`);
    if (!challenge) return c.json({ error: t(c).nostrInvalid }, 400);

    const db = c.get('db');
    const [used] = await db
      .update(nostrChallenges)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(nostrChallenges.challenge, challenge),
          isNull(nostrChallenges.usedAt),
          gt(nostrChallenges.expiresAt, new Date()),
        ),
      )
      .returning({ challenge: nostrChallenges.challenge });
    if (!used) return c.json({ error: t(c).nostrInvalid }, 400);

    const npub = npubOf(event.pubkey);
    const [owner] = await db.select(userColumns).from(users).where(eq(users.npub, npub));
    const current = await currentUser(c);
    if (current) {
      if (owner && owner.id !== current.id) return c.json({ error: t(c).nostrTaken }, 409);
      if (current.npub && current.npub !== npub) return c.json({ error: t(c).nostrOtherKey }, 409);
      const [user] = await db
        .update(users)
        .set({ npub, updatedAt: new Date() })
        .where(eq(users.id, current.id))
        .returning(userColumns);
      return c.json({ user: toUser(user!) });
    }

    let user = owner;
    if (!user)
      [user] = await db
        .insert(users)
        .values({ npub, name: npubName(npub) })
        .returning(userColumns);
    setSessionCookie(c, await startSession(db, user!.id, SESSION_DAYS));
    return c.json({ user: toUser(user!) });
  })

  // Mobile apps: a 6-digit code by mail instead of a link
  .post('/code', validJson(loginCodeSchema), async (c) => {
    const { email } = c.req.valid('json');
    if (!(await mailsPerIp.hit(c, clientIp(c))) || !(await mailsPerAddress.hit(c, email))) return tooManyRequests(c);

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, '0');
    await c
      .get('db')
      .insert(loginCodes)
      .values({
        email,
        codeHash: hashToken(code),
        expiresAt: new Date(Date.now() + 15 * MINUTE),
      });
    await sendLoginCodeEmail(email, code, t(c));
    return c.json({ ok: true });
  })

  // Answers with the session token, the app sends it as a bearer token
  .post('/code/verify', validJson(verifyCodeSchema), async (c) => {
    if (!(await codeChecksPerIp.hit(c, clientIp(c)))) return tooManyRequests(c);
    const { email, code } = c.req.valid('json');
    const db = c.get('db');

    // Every guess counts against all open codes of the address before the
    // comparison, so parallel requests can't get more than CODE_ATTEMPTS tries.
    const open = await db
      .update(loginCodes)
      .set({ attempts: sql`${loginCodes.attempts} + 1` })
      .where(
        and(
          eq(loginCodes.email, email),
          isNull(loginCodes.usedAt),
          gt(loginCodes.expiresAt, new Date()),
          lt(loginCodes.attempts, CODE_ATTEMPTS),
        ),
      )
      .returning({ id: loginCodes.id, codeHash: loginCodes.codeHash });
    const match = open.find((row) => row.codeHash === hashToken(code));
    if (!match) return c.json({ error: t(c).codeWrong }, 400);

    const [used] = await db
      .update(loginCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(loginCodes.id, match.id), isNull(loginCodes.usedAt)))
      .returning({ id: loginCodes.id });
    if (!used) return c.json({ error: t(c).codeWrong }, 400);

    const user = await userByEmail(db, email);
    return c.json({ user: toUser(user), token: await startSession(db, user.id, APP_SESSION_DAYS) });
  })

  .post('/logout', async (c) => {
    const token = sessionToken(c);
    if (token)
      await c
        .get('db')
        .delete(sessions)
        .where(eq(sessions.tokenHash, hashToken(token)));
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  })

  .get('/me', async (c) => c.json({ user: await currentUser(c) }))

  .patch('/me', requireAuth, validJson(updateMeSchema), async (c) => {
    const [user] = await c
      .get('db')
      .update(users)
      .set({ ...c.req.valid('json'), updatedAt: new Date() })
      .where(eq(users.id, c.get('user').id))
      .returning(userColumns);
    return c.json({ user: toUser(user!) });
  })

  // Memberships, interests, participations and messages go with the account
  .delete('/me', requireAuth, async (c) => {
    await c
      .get('db')
      .delete(users)
      .where(eq(users.id, c.get('user').id));
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });
