import { requestParticipants, requests, roundMessages, roundSummaries, users } from '@app/db';
import {
  messageSchema,
  type Phase,
  type Round,
  type RoundMessage,
  roundUpdateSchema,
  type Side,
  type Summary,
  summarySchema,
} from '@app/shared';
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Hono } from 'hono';
import { type Db, loadRequest, lockRequest, requestCards } from '../lib/db';
import { t } from '../lib/i18n';
import { rateLimit, tooManyRequests } from '../lib/rate-limit';
import { isUuid, validJson } from '../lib/validate';
import { requireAuth } from '../middleware/auth';
import type { AppEnv } from '../types';

const messagesPerUser = rateLimit('round-messages-per-user', 120, 60 * 60 * 1000);
const other = (side: Side): Side => (side === 'from' ? 'to' : 'from');

const author = alias(users, 'author');
const confirmer = alias(users, 'confirmer');

// Only the people in the round read and write it
async function loadRound(db: Db, userId: string, id: string): Promise<Round | null> {
  if (!isUuid(id)) return null;
  const request = await loadRequest(db, userId, id);
  if (!request?.acceptedAt || !request.mySide) return null;
  const [state] = await db
    .select({ phase: requests.phase, videoUrl: requests.videoUrl })
    .from(requests)
    .where(eq(requests.id, id));
  const messages = await db
    .select({
      id: roundMessages.id,
      phase: roundMessages.phase,
      body: roundMessages.body,
      createdAt: roundMessages.createdAt,
      author: { id: users.id, name: users.name },
      side: sql<Side>`coalesce(${requestParticipants.side}, 'from')`,
    })
    .from(roundMessages)
    .innerJoin(users, eq(users.id, roundMessages.userId))
    .leftJoin(
      requestParticipants,
      and(eq(requestParticipants.requestId, roundMessages.requestId), eq(requestParticipants.userId, users.id)),
    )
    .where(eq(roundMessages.requestId, id))
    .orderBy(asc(roundMessages.createdAt));
  const summaries: Summary[] = (await db
    .select({
      side: roundSummaries.side,
      body: roundSummaries.body,
      author: author.name,
      confirmedBy: confirmer.name,
    })
    .from(roundSummaries)
    .leftJoin(author, eq(author.id, roundSummaries.authorId))
    .leftJoin(confirmer, eq(confirmer.id, roundSummaries.confirmedBy))
    .where(eq(roundSummaries.requestId, id))) as Summary[];
  return {
    ...request,
    phase: state!.phase as Phase,
    videoUrl: state!.videoUrl,
    messages: messages as unknown as RoundMessage[],
    summaries,
  };
}

export const roundRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  .get('/', async (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;
    const mine = db
      .select({ id: requestParticipants.requestId })
      .from(requestParticipants)
      .where(eq(requestParticipants.userId, userId));
    const rounds = await requestCards(db, userId, and(inArray(requests.id, mine), isNotNull(requests.acceptedAt)), [
      sql`${requests.doneAt} is not null`,
      asc(requests.startsAt),
    ]);
    return c.json({ rounds });
  })

  .get('/:id', async (c) => {
    const round = await loadRound(c.get('db'), c.get('user').id, c.req.param('id'));
    if (!round) return c.json({ error: t(c).notParticipant }, 404);
    return c.json({ round });
  })

  .post('/:id/messages', validJson(messageSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!(await messagesPerUser.hit(c, user.id))) return tooManyRequests(c);
    const id = c.req.param('id');
    return db.transaction(async (tx) => {
      await lockRequest(tx, id);
      const round = await loadRound(tx, user.id, id);
      if (!round) return c.json({ error: t(c).notParticipant }, 404);
      if (round.doneAt) return c.json({ error: t(c).roundDone }, 409);
      await tx
        .insert(roundMessages)
        .values({ requestId: round.id, userId: user.id, phase: round.phase, body: c.req.valid('json').body });
      return c.json({ round: await loadRound(tx, user.id, round.id) }, 201);
    });
  })

  // Any participant moves the phase on and sets the video room
  .patch('/:id', validJson(roundUpdateSchema), async (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;
    const id = c.req.param('id');
    return db.transaction(async (tx) => {
      await lockRequest(tx, id);
      const round = await loadRound(tx, userId, id);
      if (!round) return c.json({ error: t(c).notParticipant }, 404);
      if (round.doneAt) return c.json({ error: t(c).roundDone }, 409);
      await tx.update(requests).set(c.req.valid('json')).where(eq(requests.id, round.id));
      return c.json({ round: await loadRound(tx, userId, round.id) });
    });
  })

  // My side's summary of the other side's view. Editing it asks for a new confirmation.
  .put('/:id/summary', validJson(summarySchema), async (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;
    const id = c.req.param('id');
    return db.transaction(async (tx) => {
      await lockRequest(tx, id);
      const round = await loadRound(tx, userId, id);
      if (!round) return c.json({ error: t(c).notParticipant }, 404);
      if (round.doneAt) return c.json({ error: t(c).roundDone }, 409);
      if (round.phase !== 'summary') return c.json({ error: t(c).notSummaryPhase }, 409);
      const values = { body: c.req.valid('json').body, authorId: userId, confirmedBy: null, confirmedAt: null };
      await tx
        .insert(roundSummaries)
        .values({ requestId: round.id, side: round.mySide!, ...values })
        .onConflictDoUpdate({
          target: [roundSummaries.requestId, roundSummaries.side],
          set: { ...values, updatedAt: new Date() },
        });
      return c.json({ round: await loadRound(tx, userId, round.id) });
    });
  })

  // The side that was summed up says "yes, that's how we see it". Once both
  // summaries are confirmed, the round is done.
  .post('/:id/summary/:side/confirm', async (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;
    const side = c.req.param('side');
    const id = c.req.param('id');
    return db.transaction(async (tx) => {
      await lockRequest(tx, id);
      const round = await loadRound(tx, userId, id);
      if (!round) return c.json({ error: t(c).notParticipant }, 404);
      if (round.doneAt) return c.json({ error: t(c).roundDone }, 409);
      if (side !== other(round.mySide!)) return c.json({ error: t(c).confirmOtherSide }, 403);
      const [confirmed] = await tx
        .update(roundSummaries)
        .set({ confirmedBy: userId, confirmedAt: new Date() })
        .where(and(eq(roundSummaries.requestId, round.id), eq(roundSummaries.side, side)))
        .returning({ side: roundSummaries.side });
      if (!confirmed) return c.json({ error: t(c).notFound }, 404);
      await tx
        .update(requests)
        .set({ doneAt: new Date() })
        .where(
          and(
            eq(requests.id, round.id),
            sql`(select count(*) from ${roundSummaries} s where s.request_id = ${round.id} and s.confirmed_at is not null) = 2`,
          ),
        );
      return c.json({ round: await loadRound(tx, userId, round.id) });
    });
  });
