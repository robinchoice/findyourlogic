import type { Database } from '@app/db';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { t } from './lib/i18n';
import { captureException } from './monitoring';
import { authRoutes } from './routes/auth';
import { bubbleRoutes } from './routes/bubbles';
import { feedbackRoutes } from './routes/feedback';
import { matchRoutes } from './routes/matches';
import { meRoutes } from './routes/me';
import { messageRoutes } from './routes/messages';
import { requestRoutes } from './routes/requests';
import { roundRoutes } from './routes/rounds';
import type { AppEnv } from './types';

export function createApp(db: Database) {
  return (
    new Hono<AppEnv>()
      .use(logger())
      .use(async (c, next) => {
        c.set('db', db);
        await next();
      })
      .onError((err, c) => {
        // Client errors such as malformed JSON keep their status and stay out of GlitchTip
        if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
        console.error('Unhandled error:', err);
        captureException(err);
        return c.json({ error: t(c).internalError }, 500);
      })
      // Public through the web proxy, so Uptime Kuma checks web, API and database in one go.
      // The CI compares revision with the deployed commit.
      .get('/api/health', async (c) => {
        await db.execute(sql`select 1`);
        return c.json({ status: 'ok', revision: process.env.APP_VERSION || 'dev' });
      })
      .basePath('/api/v1')
      .route('/auth', authRoutes)
      .route('/feedback', feedbackRoutes)
      .route('/me', meRoutes)
      .route('/bubbles', bubbleRoutes)
      .route('/requests', requestRoutes)
      .route('/rounds', roundRoutes)
      .route('/matches', matchRoutes)
      .route('/messages', messageRoutes)
  );
}
