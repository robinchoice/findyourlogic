import { bubbleMembers, bubbles, interests, matchesSeen, users } from '@app/db';
import { type Combo, type Matches, type MatchPerson, MIN_SHARED, type Trait, type User } from '@app/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from './db';

// Traits are keyed "b:<bubble id>" for memberships and "i:<interest key>"
export async function myTraits(db: Db, userId: string): Promise<Trait[]> {
  const memberships = await db
    .select({ id: bubbles.id, name: bubbles.name, color: bubbles.color })
    .from(bubbleMembers)
    .innerJoin(bubbles, eq(bubbles.id, bubbleMembers.bubbleId))
    .where(and(eq(bubbleMembers.userId, userId), eq(bubbleMembers.asTrait, true)))
    .orderBy(bubbles.name);
  const own = await db
    .select({ key: interests.key, label: interests.label })
    .from(interests)
    .where(eq(interests.userId, userId))
    .orderBy(interests.label);
  return [
    ...memberships.map((b) => ({ key: `b:${b.id}`, label: b.name, color: b.color })),
    ...own.map((i) => ({ key: `i:${i.key}`, label: i.label, color: null })),
  ];
}

// Which discoverable people hold which of these traits
export async function holders(db: Db, keys: string[]) {
  const bubbleIds = keys.filter((k) => k.startsWith('b:')).map((k) => k.slice(2));
  const interestKeys = keys.filter((k) => k.startsWith('i:')).map((k) => k.slice(2));
  const rows: { userId: string; key: string }[] = [];
  if (bubbleIds.length)
    rows.push(
      ...(await db
        .select({ userId: bubbleMembers.userId, key: sql<string>`'b:' || ${bubbleMembers.bubbleId}` })
        .from(bubbleMembers)
        .innerJoin(users, eq(users.id, bubbleMembers.userId))
        .where(
          and(
            inArray(bubbleMembers.bubbleId, bubbleIds),
            eq(bubbleMembers.asTrait, true),
            eq(users.discoverable, true),
          ),
        )),
    );
  if (interestKeys.length)
    rows.push(
      ...(await db
        .select({ userId: interests.userId, key: sql<string>`'i:' || ${interests.key}` })
        .from(interests)
        .innerJoin(users, eq(users.id, interests.userId))
        .where(and(inArray(interests.key, interestKeys), eq(users.discoverable, true)))),
    );
  return rows;
}

// People with at least MIN_SHARED traits in common, both discoverable. The
// others only count. Combos are the distinct sets of shared traits.
export async function computeMatches(db: Db, user: User): Promise<Matches & { newIds: string[] }> {
  if (!user.discoverable) return { discoverable: false, combos: [], people: [], fewer: 0, newIds: [] };
  const traits = await myTraits(db, user.id);
  const shared = new Map<string, Set<string>>();
  for (const { userId, key } of await holders(
    db,
    traits.map((t) => t.key),
  )) {
    if (userId === user.id) continue;
    if (!shared.has(userId)) shared.set(userId, new Set());
    shared.get(userId)!.add(key);
  }
  const visible = [...shared].filter(([, keys]) => keys.size >= MIN_SHARED);
  const ids = visible.map(([id]) => id);
  const names = ids.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))
    : [];
  const seen = ids.length
    ? await db
        .select({ id: matchesSeen.otherId })
        .from(matchesSeen)
        .where(and(eq(matchesSeen.userId, user.id), inArray(matchesSeen.otherId, ids)))
    : [];
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  const seenIds = new Set(seen.map((s) => s.id));

  const people: MatchPerson[] = visible
    .map(([id, keys]) => ({ id, name: nameOf.get(id)!, shared: traits.filter((t) => keys.has(t.key)) }))
    .sort((a, b) => b.shared.length - a.shared.length || a.name.localeCompare(b.name));

  const sets = new Map(people.map((p) => [p.shared.map((t) => t.key).join('|'), p.shared]));
  const combos: Combo[] = [...sets.values()]
    .map((combo) => {
      const inIt = people.filter((p) => combo.every((t) => p.shared.includes(t)));
      return { traits: combo, count: inIt.length, isNew: inIt.some((p) => !seenIds.has(p.id)) };
    })
    .sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.traits.length - a.traits.length || b.count - a.count)
    .slice(0, 8);

  return {
    discoverable: true,
    combos,
    people: people.slice(0, 50),
    fewer: shared.size - visible.length,
    newIds: people.filter((p) => !seenIds.has(p.id)).map((p) => p.id),
  };
}
