import { matchesSeen } from '@app/db';
import type { Venn } from '@app/shared';
import { Hono } from 'hono';
import { computeMatches, holders, myTraits } from '../lib/matches';
import { requireAuth } from '../middleware/auth';
import type { AppEnv } from '../types';

export const matchRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  .get('/', async (c) => {
    const { newIds: _, ...matches } = await computeMatches(c.get('db'), c.get('user'));
    return c.json(matches);
  })

  // Opening the matches page marks everyone in them as seen
  .post('/seen', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const { newIds } = await computeMatches(db, user);
    if (newIds.length)
      await db
        .insert(matchesSeen)
        .values(newIds.map((otherId) => ({ userId: user.id, otherId })))
        .onConflictDoNothing();
    return c.json({ ok: true });
  })

  // Counts for the Venn diagram of up to three of the user's own traits,
  // over all discoverable people. No names.
  .get('/venn', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user.discoverable) return c.json({ traits: [], regions: {} } satisfies Venn);
    const wanted = (c.req.query('traits') ?? '').split(',');
    const traits = (await myTraits(db, user.id)).filter((t) => wanted.includes(t.key)).slice(0, 3);
    const masks = new Map<string, number>();
    for (const { userId, key } of await holders(
      db,
      traits.map((t) => t.key),
    ))
      masks.set(userId, (masks.get(userId) ?? 0) | (1 << traits.findIndex((t) => t.key === key)));
    const regions: Record<string, number> = {};
    for (const mask of masks.values()) regions[mask] = (regions[mask] ?? 0) + 1;
    return c.json({ traits, regions } satisfies Venn);
  });
