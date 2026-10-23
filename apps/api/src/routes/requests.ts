import { bubbles, requestParticipants, requests } from '@app/db';
import { BUBBLE_COLORS, requestSchema, SUPPORTERS_NEEDED } from '@app/shared';
import { and, asc, desc, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { inviteToken, isMember, loadRequest, myBubbleIds, requestCards } from '../lib/db';
import { t } from '../lib/i18n';
import { publishNote } from '../lib/nostr';
import { isUuid, validJson } from '../lib/validate';
import { requireAuth } from '../middleware/auth';
import { captureException } from '../monitoring';
import type { AppEnv } from '../types';

export const requestRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  // Tabs of the board: to my bubbles, open between others, sent by my bubbles
  .get('/', async (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;
    const mine = myBubbleIds(db, userId);
    const tab = c.req.query('tab');
    const open = sql`${requests.acceptedAt} is null`;
    const cards =
      tab === 'sent'
        ? await requestCards(db, userId, inArray(requests.fromBubbleId, mine))
        : tab === 'open'
          ? await requestCards(
              db,
              userId,
              and(
                isNotNull(requests.sentAt),
                notInArray(requests.fromBubbleId, mine),
                notInArray(requests.toBubbleId, mine),
              ),
              [desc(open), asc(requests.startsAt)],
            )
          : await requestCards(db, userId, and(inArray(requests.toBubbleId, mine), isNotNull(requests.sentAt)), [
              desc(open),
              asc(requests.startsAt),
            ]);
    return c.json({ requests: cards });
  })

  .post('/', validJson(requestSchema), async (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;
    const { fromBubbleId, toBubbleId, newBubbleName, startsAt, ...rest } = c.req.valid('json');
    if (!(await isMember(db, fromBubbleId, userId))) return c.json({ error: t(c).notMember }, 403);
    if (toBubbleId === fromBubbleId) return c.json({ error: t(c).sameBubble }, 400);

    const result = await db.transaction(async (tx) => {
      let target = toBubbleId;
      let token: string | null = null;
      if (newBubbleName) {
        // Not here yet: an empty bubble, whose invite link the asking side passes on
        const [existing] = await tx
          .select({ id: bubbles.id })
          .from(bubbles)
          .where(sql`lower(${bubbles.name}) = lower(${newBubbleName})`);
        if (existing) return null;
        token = inviteToken();
        const [created] = await tx
          .insert(bubbles)
          .values({
            name: newBubbleName,
            color: BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)]!,
            inviteToken: token,
            createdBy: userId,
          })
          .returning({ id: bubbles.id });
        target = created!.id;
      } else {
        const [found] = await tx.select({ id: bubbles.id }).from(bubbles).where(eq(bubbles.id, target!));
        if (!found) return null;
      }
      const [request] = await tx
        .insert(requests)
        .values({ ...rest, fromBubbleId, toBubbleId: target!, startsAt: new Date(startsAt), createdBy: userId })
        .returning({ id: requests.id });
      // Asking counts as the first of the supporters
      await tx.insert(requestParticipants).values({ requestId: request!.id, userId, side: 'from' });
      return { id: request!.id, inviteToken: token };
    });
    if (!result) return c.json({ error: newBubbleName ? t(c).bubbleExists : t(c).notFound }, 409);
    return c.json({ request: result }, 201);
  })

  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const request = isUuid(id) ? await loadRequest(c.get('db'), c.get('user').id, id) : null;
    if (!request) return c.json({ error: t(c).notFound }, 404);
    return c.json({ request });
  })

  // Seats are counted under a lock per request, so parallel joins can't overfill a side
  .post('/:id/join', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: t(c).notFound }, 404);
    const userId = c.get('user').id;
    let announce = false;
    const error = await c.get('db').transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}))`);
      const request = await loadRequest(tx, userId, id);
      if (!request) return t(c).notFound;
      if (!request.canJoin) return request.acceptedAt ? t(c).alreadyAccepted : t(c).cannotJoin;
      const side = request.canJoin;
      await tx.insert(requestParticipants).values({ requestId: id, userId, side });
      if (side === 'from' && !request.sentAt && request.fromCount + 1 >= SUPPORTERS_NEEDED) {
        await tx.update(requests).set({ sentAt: new Date() }).where(eq(requests.id, id));
        announce = request.nostrNote;
      }
      if (side === 'to' && request.toCount + 1 >= request.seats)
        await tx.update(requests).set({ acceptedAt: new Date() }).where(eq(requests.id, id));
      return null;
    });
    if (error) return c.json({ error }, 409);
    const request = await loadRequest(c.get('db'), userId, id);
    // Only what the request shows anyway, no names. A failed note doesn't undo the join.
    if (announce && request) {
      const url = `${process.env.APP_URL}/requests/${id}`;
      await publishNote(t(c).nostrNote(request.from.name, request.to.name, request.question, url), [
        ['r', url],
        ['t', 'findyourlogic'],
      ]).catch((err) => {
        console.error('Nostr note failed:', err);
        captureException(err);
      });
    }
    return c.json({ request });
  })

  // Withdrawing is possible until the round starts
  .post('/:id/leave', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) return c.json({ error: t(c).notFound }, 404);
    const db = c.get('db');
    const userId = c.get('user').id;
    const [request] = await db.select({ acceptedAt: requests.acceptedAt }).from(requests).where(eq(requests.id, id));
    if (!request) return c.json({ error: t(c).notFound }, 404);
    if (request.acceptedAt) return c.json({ error: t(c).alreadyAccepted }, 409);
    await db
      .delete(requestParticipants)
      .where(and(eq(requestParticipants.requestId, id), eq(requestParticipants.userId, userId)));
    return c.json({ request: await loadRequest(db, userId, id) });
  });
