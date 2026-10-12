import {
  bubbleInvitations,
  bubbleMembers,
  bubbles,
  directMessages,
  interests,
  requestParticipants,
  requests,
  users,
} from '@app/db';
import { type Badges, interestKey, traitsSchema } from '@app/shared';
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, notExists, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { myBubbleIds } from '../lib/db';
import { t } from '../lib/i18n';
import { computeMatches } from '../lib/matches';
import { validJson } from '../lib/validate';
import { requireAuth, toUser, userColumns } from '../middleware/auth';
import type { AppEnv } from '../types';

// Suggestions only show interests that several people chose, so a single
// person's free text never shows up for others
const POPULAR_MIN = 3;

export const meRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  .get('/traits', async (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;
    const memberships = await db
      .select({ id: bubbles.id, name: bubbles.name, color: bubbles.color, asTrait: bubbleMembers.asTrait })
      .from(bubbleMembers)
      .innerJoin(bubbles, eq(bubbles.id, bubbleMembers.bubbleId))
      .where(eq(bubbleMembers.userId, userId))
      .orderBy(bubbles.name);
    const own = await db
      .select({ label: interests.label })
      .from(interests)
      .where(eq(interests.userId, userId))
      .orderBy(interests.label);
    const popular = await db
      .select({ label: sql<string>`min(${interests.label})` })
      .from(interests)
      .groupBy(interests.key)
      .having(gte(count(), POPULAR_MIN))
      .orderBy(desc(count()))
      .limit(12);
    const suggestions = [
      ...new Map(
        [...t(c).interestSuggestions, ...popular.map((p) => p.label)].map((l) => [interestKey(l), l]),
      ).values(),
    ];
    return c.json({ bubbles: memberships, interests: own.map((i) => i.label), suggestions });
  })

  // Saving the traits also ends the onboarding
  .put('/traits', validJson(traitsSchema), async (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;
    const { bubbleIds, interests: labels } = c.req.valid('json');
    const unique = new Map(labels.map((label) => [interestKey(label), label.trim().replace(/\s+/g, ' ')]));
    const user = await db.transaction(async (tx) => {
      await tx
        .update(bubbleMembers)
        .set({
          asTrait: bubbleIds.length ? inArray(bubbleMembers.bubbleId, bubbleIds) : sql`false`,
        })
        .where(eq(bubbleMembers.userId, userId));
      await tx.delete(interests).where(eq(interests.userId, userId));
      if (unique.size) await tx.insert(interests).values([...unique].map(([key, label]) => ({ userId, key, label })));
      const [row] = await tx
        .update(users)
        .set({ onboardedAt: sql`coalesce(${users.onboardedAt}, now())`, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning(userColumns);
      return row!;
    });
    return c.json({ user: toUser(user) });
  })

  // Counters for the navigation and the match hint on the board
  .get('/badges', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const mine = myBubbleIds(db, user.id);
    const notJoined = notExists(
      db
        .select({ one: sql`1` })
        .from(requestParticipants)
        .where(and(eq(requestParticipants.requestId, requests.id), eq(requestParticipants.userId, user.id))),
    );
    const [open] = await db
      .select({ n: count() })
      .from(requests)
      .where(
        and(
          notJoined,
          isNull(requests.acceptedAt),
          or(
            and(inArray(requests.toBubbleId, mine), isNotNull(requests.sentAt)),
            and(inArray(requests.fromBubbleId, mine), isNull(requests.sentAt)),
          ),
        ),
      );
    const [unread] = await db
      .select({ n: count() })
      .from(directMessages)
      .where(and(eq(directMessages.toId, user.id), isNull(directMessages.readAt)));
    const [invitations] = await db
      .select({ n: count() })
      .from(bubbleInvitations)
      .where(eq(bubbleInvitations.userId, user.id));
    const matches = await computeMatches(db, user);
    const badges: Badges = {
      requests: open!.n,
      newMatches: matches.newIds.length,
      newMatchCombo: matches.combos.find((combo) => combo.isNew) ?? null,
      unread: unread!.n,
      invitations: invitations!.n,
    };
    return c.json(badges);
  });
