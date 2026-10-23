import { bubbleInvitations, bubbleMembers, bubbles, requestParticipants, requests, users } from '@app/db';
import { BUBBLE_COLORS, bubbleSchema, type Invitation, type MyBubble, matchBubbleSchema } from '@app/shared';
import { and, count, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { inviteToken, isMember } from '../lib/db';
import { t } from '../lib/i18n';
import { computeMatches } from '../lib/matches';
import { clientIp, rateLimit, tooManyRequests } from '../lib/rate-limit';
import { isUuid, validJson } from '../lib/validate';
import { requireAuth } from '../middleware/auth';
import type { AppEnv } from '../types';

const inviteChecksPerIp = rateLimit('invite-checks-per-ip', 60, 15 * 60 * 1000);

const memberCount = sql<number>`(select count(*)::int from ${bubbleMembers} m where m.bubble_id = ${bubbles.id})`;
const roundCount = sql<number>`(select count(*)::int from ${requests} r where (r.to_bubble_id = ${bubbles.id} or r.from_bubble_id = ${bubbles.id}) and r.accepted_at is not null)`;

// Postgres reports a taken name as a unique violation of bubbles_name_lower
const nameTaken = (err: unknown) =>
  (err as { cause?: { code?: string } })?.cause?.code === '23505' || (err as { code?: string })?.code === '23505';

export const bubbleRoutes = new Hono<AppEnv>()
  // Public, for the link preview and the join page
  .get('/invite/:token', async (c) => {
    if (!(await inviteChecksPerIp.hit(c, clientIp(c)))) return tooManyRequests(c);
    const [bubble] = await c
      .get('db')
      .select({
        id: bubbles.id,
        name: bubbles.name,
        color: bubbles.color,
        description: bubbles.description,
        members: memberCount,
      })
      .from(bubbles)
      .where(eq(bubbles.inviteToken, c.req.param('token')));
    if (!bubble) return c.json({ error: t(c).inviteInvalid }, 404);
    return c.json({ bubble });
  })

  .use(requireAuth)

  .get('/', async (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;
    const mine: MyBubble[] = await db
      .select({
        id: bubbles.id,
        name: bubbles.name,
        color: bubbles.color,
        description: bubbles.description,
        inviteToken: bubbles.inviteToken,
        asTrait: bubbleMembers.asTrait,
        members: memberCount,
        openRequests: sql<number>`(select count(*)::int from ${requests} r where r.to_bubble_id = ${bubbles.id} and r.sent_at is not null and r.accepted_at is null)`,
        rounds: roundCount,
      })
      .from(bubbleMembers)
      .innerJoin(bubbles, eq(bubbles.id, bubbleMembers.bubbleId))
      .where(eq(bubbleMembers.userId, userId))
      .orderBy(bubbles.name);
    const invitations: Invitation[] = await db
      .select({
        id: bubbles.id,
        name: bubbles.name,
        color: bubbles.color,
        description: bubbles.description,
        invitedBy: users.name,
      })
      .from(bubbleInvitations)
      .innerJoin(bubbles, eq(bubbles.id, bubbleInvitations.bubbleId))
      .leftJoin(users, eq(users.id, bubbleInvitations.invitedBy))
      .where(eq(bubbleInvitations.userId, userId))
      .orderBy(bubbleInvitations.createdAt);
    return c.json({ bubbles: mine, invitations });
  })

  .post('/', validJson(bubbleSchema), async (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;
    try {
      const bubble = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(bubbles)
          .values({ ...c.req.valid('json'), inviteToken: inviteToken(), createdBy: userId })
          .returning({ id: bubbles.id });
        await tx.insert(bubbleMembers).values({ bubbleId: row!.id, userId });
        return row!;
      });
      return c.json({ bubble }, 201);
    } catch (err) {
      if (nameTaken(err)) return c.json({ error: t(c).bubbleExists }, 409);
      throw err;
    }
  })

  // Find the bubble to ask by its name
  .get('/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim().slice(0, 80);
    if (q.length < 2) return c.json({ bubbles: [] });
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const found = await c
      .get('db')
      .select({ id: bubbles.id, name: bubbles.name, color: bubbles.color, members: memberCount })
      .from(bubbles)
      .where(ilike(bubbles.name, pattern))
      .orderBy(sql`${memberCount} desc`, bubbles.name)
      .limit(8);
    return c.json({ bubbles: found });
  })

  // From a match: a new bubble, everyone in the chosen combination is invited
  .post('/from-match', validJson(matchBubbleSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const { name, traits } = c.req.valid('json');
    const { people } = await computeMatches(db, user);
    const invited = people.filter((p) => traits.every((key) => p.shared.some((s) => s.key === key)));
    if (!invited.length) return c.json({ error: t(c).matchGone }, 400);
    const [{ n }] = (await db.select({ n: count() }).from(bubbles)) as [{ n: number }];
    try {
      const bubble = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(bubbles)
          .values({
            name,
            color: BUBBLE_COLORS[n % BUBBLE_COLORS.length]!,
            description: t(c).fromMatchDescription(traits.length),
            inviteToken: inviteToken(),
            createdBy: user.id,
          })
          .returning({ id: bubbles.id });
        await tx.insert(bubbleMembers).values({ bubbleId: row!.id, userId: user.id });
        await tx
          .insert(bubbleInvitations)
          .values(invited.map((p) => ({ bubbleId: row!.id, userId: p.id, invitedBy: user.id })));
        return row!;
      });
      return c.json({ bubble, invited: invited.length }, 201);
    } catch (err) {
      if (nameTaken(err)) return c.json({ error: t(c).bubbleExists }, 409);
      throw err;
    }
  })

  .post('/invite/:token/join', async (c) => {
    if (!(await inviteChecksPerIp.hit(c, clientIp(c)))) return tooManyRequests(c);
    const db = c.get('db');
    const userId = c.get('user').id;
    const [bubble] = await db
      .select({ id: bubbles.id })
      .from(bubbles)
      .where(eq(bubbles.inviteToken, c.req.param('token')));
    if (!bubble) return c.json({ error: t(c).inviteInvalid }, 404);
    await db.insert(bubbleMembers).values({ bubbleId: bubble.id, userId }).onConflictDoNothing();
    await db
      .delete(bubbleInvitations)
      .where(and(eq(bubbleInvitations.bubbleId, bubble.id), eq(bubbleInvitations.userId, userId)));
    return c.json({ bubble });
  })

  .post('/:id/invitation', async (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;
    if (!isUuid(c.req.param('id'))) return c.json({ error: t(c).notFound }, 404);
    const [invitation] = await db
      .delete(bubbleInvitations)
      .where(and(eq(bubbleInvitations.bubbleId, c.req.param('id')), eq(bubbleInvitations.userId, userId)))
      .returning({ bubbleId: bubbleInvitations.bubbleId });
    if (!invitation) return c.json({ error: t(c).notFound }, 404);
    await db.insert(bubbleMembers).values({ bubbleId: invitation.bubbleId, userId }).onConflictDoNothing();
    return c.json({ ok: true });
  })

  .delete('/:id/invitation', async (c) => {
    if (!isUuid(c.req.param('id'))) return c.json({ error: t(c).notFound }, 404);
    await c
      .get('db')
      .delete(bubbleInvitations)
      .where(and(eq(bubbleInvitations.bubbleId, c.req.param('id')), eq(bubbleInvitations.userId, c.get('user').id)));
    return c.json({ ok: true });
  })

  // Members see each other and the invite link, others only name and size
  .get('/:id', async (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: t(c).notFound }, 404);
    const [bubble] = await db
      .select({
        id: bubbles.id,
        name: bubbles.name,
        color: bubbles.color,
        description: bubbles.description,
        inviteToken: bubbles.inviteToken,
        members: memberCount,
        rounds: roundCount,
      })
      .from(bubbles)
      .where(eq(bubbles.id, id));
    if (!bubble) return c.json({ error: t(c).notFound }, 404);
    const member = await isMember(db, id, userId);
    const people = member
      ? await db
          .select({ id: users.id, name: users.name })
          .from(bubbleMembers)
          .innerJoin(users, eq(users.id, bubbleMembers.userId))
          .where(eq(bubbleMembers.bubbleId, id))
          .orderBy(bubbleMembers.joinedAt)
      : [];
    return c.json({
      bubble: { ...bubble, inviteToken: member ? bubble.inviteToken : null },
      member,
      people,
    });
  })

  // Leaving also withdraws from requests that haven't started yet
  .post('/:id/leave', async (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: t(c).notFound }, 404);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('request-membership'), hashtext(${userId}))`);
      const pending = await tx
        .select({ id: requests.id })
        .from(requestParticipants)
        .innerJoin(requests, eq(requests.id, requestParticipants.requestId))
        .where(
          and(
            eq(requestParticipants.userId, userId),
            isNull(requests.acceptedAt),
            or(
              and(eq(requestParticipants.side, 'from'), eq(requests.fromBubbleId, id)),
              and(eq(requestParticipants.side, 'to'), eq(requests.toBubbleId, id)),
            ),
          ),
        )
        .orderBy(requests.id);
      for (const request of pending) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${request.id}))`);
      await tx.delete(bubbleMembers).where(and(eq(bubbleMembers.bubbleId, id), eq(bubbleMembers.userId, userId)));
      await tx.execute(sql`
        delete from ${requestParticipants} p using ${requests} r
        where p.request_id = r.id and p.user_id = ${userId} and r.accepted_at is null
          and ((p.side = 'from' and r.from_bubble_id = ${id}) or (p.side = 'to' and r.to_bubble_id = ${id}))`);
    });
    return c.json({ ok: true });
  });
