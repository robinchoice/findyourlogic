import { bubbleMembers, bubbles, type Database, requestParticipants, requests, users } from '@app/db';
import type { Person, RequestCard, RequestDetail, Side } from '@app/shared';
import { and, desc, eq, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Db = Database | Tx;

export const myBubbleIds = (db: Db, userId: string) =>
  db.select({ id: bubbleMembers.bubbleId }).from(bubbleMembers).where(eq(bubbleMembers.userId, userId));

export async function isMember(db: Db, bubbleId: string, userId: string) {
  const [row] = await db
    .select({ id: bubbleMembers.bubbleId })
    .from(bubbleMembers)
    .where(and(eq(bubbleMembers.bubbleId, bubbleId), eq(bubbleMembers.userId, userId)));
  return !!row;
}

// Random, URL-safe and short enough for a chat message
export const inviteToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString('base64url');

const fromB = alias(bubbles, 'from_b');
const toB = alias(bubbles, 'to_b');

const count = (side: Side) =>
  sql<number>`(select count(*)::int from ${requestParticipants} p where p.request_id = ${requests.id} and p.side = ${side})`;

// Dates arrive as ISO strings on the client, hence the cast to the wire type
export async function requestCards(
  db: Db,
  userId: string,
  where: SQL | undefined,
  order: SQL[] = [desc(requests.createdAt)],
): Promise<RequestCard[]> {
  const rows = await db
    .select({
      id: requests.id,
      from: { id: fromB.id, name: fromB.name, color: fromB.color },
      to: { id: toB.id, name: toB.name, color: toB.color },
      question: requests.question,
      format: requests.format,
      place: requests.place,
      startsAt: requests.startsAt,
      seats: requests.seats,
      fromCount: count('from'),
      toCount: count('to'),
      sentAt: requests.sentAt,
      acceptedAt: requests.acceptedAt,
      doneAt: requests.doneAt,
      mySide: sql<Side | null>`(select p.side from ${requestParticipants} p where p.request_id = ${requests.id} and p.user_id = ${userId})`,
    })
    .from(requests)
    .innerJoin(fromB, eq(fromB.id, requests.fromBubbleId))
    .innerJoin(toB, eq(toB.id, requests.toBubbleId))
    .where(where)
    .orderBy(...order)
    .limit(50);
  return rows as unknown as RequestCard[];
}

const people = (db: Db, requestId: string, side: Side): Promise<Person[]> =>
  db
    .select({ id: users.id, name: users.name })
    .from(requestParticipants)
    .innerJoin(users, eq(users.id, requestParticipants.userId))
    .where(and(eq(requestParticipants.requestId, requestId), eq(requestParticipants.side, side)))
    .orderBy(requestParticipants.createdAt);

// A request as the user may see it, null if they may not. Before it goes out
// only the asking bubble sees it. Names of participants only for members.
export async function loadRequest(db: Db, userId: string, id: string): Promise<RequestDetail | null> {
  const [card] = await requestCards(db, userId, eq(requests.id, id));
  if (!card) return null;
  const [extra] = await db
    .select({
      details: requests.details,
      nostrNote: requests.nostrNote,
      toMembers: sql<number>`(select count(*)::int from ${bubbleMembers} m where m.bubble_id = ${requests.toBubbleId})`,
      toInviteToken: bubbles.inviteToken,
    })
    .from(requests)
    .innerJoin(bubbles, eq(bubbles.id, requests.toBubbleId))
    .where(eq(requests.id, id));
  const fromMember = await isMember(db, card.from.id, userId);
  const toMember = await isMember(db, card.to.id, userId);
  if (!card.sentAt && !fromMember) return null;

  let canJoin: Side | null = null;
  if (!card.mySide && !card.acceptedAt) {
    if (fromMember && card.fromCount < card.seats) canJoin = 'from';
    else if (toMember && card.sentAt && card.toCount < card.seats) canJoin = 'to';
  }
  const insider = fromMember || toMember;
  return {
    ...card,
    details: extra!.details,
    nostrNote: extra!.nostrNote,
    canJoin,
    fromPeople: insider ? await people(db, id, 'from') : [],
    toPeople: insider ? await people(db, id, 'to') : [],
    // The asking side passes the link on to a bubble that isn't here yet
    toInviteToken: fromMember && extra!.toMembers === 0 ? extra!.toInviteToken : null,
  };
}
