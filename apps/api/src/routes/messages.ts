import { directMessages, users } from '@app/db';
import { type Conversation, type DirectMessage, messageSchema, type User } from '@app/shared';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../lib/db';
import { t } from '../lib/i18n';
import { computeMatches } from '../lib/matches';
import { rateLimit, tooManyRequests } from '../lib/rate-limit';
import { isUuid, validJson } from '../lib/validate';
import { requireAuth } from '../middleware/auth';
import type { AppEnv } from '../types';

const messagesPerUser = rateLimit('direct-messages-per-user', 30, 60 * 60 * 1000);

const between = (a: string, b: string) =>
  or(
    and(eq(directMessages.fromId, a), eq(directMessages.toId, b)),
    and(eq(directMessages.fromId, b), eq(directMessages.toId, a)),
  );

async function hasThread(db: Db, a: string, b: string) {
  const [row] = await db.select({ id: directMessages.id }).from(directMessages).where(between(a, b)).limit(1);
  return !!row;
}

async function canMessage(db: Db, me: User, other: string) {
  return (await hasThread(db, me.id, other)) || (await computeMatches(db, me)).people.some((p) => p.id === other);
}

export const messageRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  // Newest first, one entry per person
  .get('/', async (c) => {
    const me = c.get('user').id;
    const rows = await c
      .get('db')
      .select({
        fromId: directMessages.fromId,
        toId: directMessages.toId,
        body: directMessages.body,
        createdAt: directMessages.createdAt,
        readAt: directMessages.readAt,
      })
      .from(directMessages)
      .where(or(eq(directMessages.fromId, me), eq(directMessages.toId, me)))
      .orderBy(desc(directMessages.createdAt))
      .limit(1000);
    const byPerson = new Map<string, { last: string; lastAt: Date; unread: number }>();
    for (const row of rows) {
      const other = row.fromId === me ? row.toId : row.fromId;
      if (!byPerson.has(other)) byPerson.set(other, { last: row.body, lastAt: row.createdAt, unread: 0 });
      if (row.toId === me && !row.readAt) byPerson.get(other)!.unread++;
    }
    const names = byPerson.size
      ? await c
          .get('db')
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, [...byPerson.keys()]))
      : [];
    const nameOf = new Map(names.map((n) => [n.id, n.name]));
    const conversations = [...byPerson].map(([id, c]) => ({ person: { id, name: nameOf.get(id)! }, ...c }));
    return c.json({ conversations: conversations as unknown as Conversation[] });
  })

  // A thread exists once someone said hello from a match
  .get('/:userId', async (c) => {
    const db = c.get('db');
    const me = c.get('user');
    const other = c.req.param('userId');
    if (!isUuid(other)) return c.json({ error: t(c).notFound }, 404);
    const [person] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, other));
    const allowed = person && (await canMessage(db, me, other));
    if (!allowed) return c.json({ error: t(c).cannotMessage }, 404);
    await db
      .update(directMessages)
      .set({ readAt: new Date() })
      .where(and(eq(directMessages.fromId, other), eq(directMessages.toId, me.id), isNull(directMessages.readAt)));
    const rows = await db
      .select({
        id: directMessages.id,
        fromId: directMessages.fromId,
        body: directMessages.body,
        createdAt: directMessages.createdAt,
      })
      .from(directMessages)
      .where(between(me.id, other))
      .orderBy(directMessages.createdAt)
      .limit(500);
    const messages = rows.map((r) => ({ id: r.id, mine: r.fromId === me.id, body: r.body, createdAt: r.createdAt }));
    return c.json({ person, messages: messages as unknown as DirectMessage[] });
  })

  .post('/:userId', validJson(messageSchema), async (c) => {
    const db = c.get('db');
    const me = c.get('user');
    const other = c.req.param('userId');
    if (!(await messagesPerUser.hit(c, me.id))) return tooManyRequests(c);
    if (!isUuid(other) || other === me.id) return c.json({ error: t(c).cannotMessage }, 403);
    const allowed = await canMessage(db, me, other);
    if (!allowed) return c.json({ error: t(c).cannotMessage }, 403);
    await db.insert(directMessages).values({ fromId: me.id, toId: other, body: c.req.valid('json').body });
    return c.json({ ok: true }, 201);
  });
