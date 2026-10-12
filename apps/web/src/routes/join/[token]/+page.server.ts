import { APP_NAME } from '@app/shared';
import type { PageServerLoad } from './$types';

type Bubble = { id: string; name: string; color: string; description: string; members: number };

// Server-rendered, so the link preview in Telegram, Signal and co. names the bubble
export const load: PageServerLoad = async ({ fetch, params, request }) => {
  const res = await fetch(`/api/v1/bubbles/invite/${encodeURIComponent(params.token)}`, {
    // The API rate-limits by the visitor's address, not by this server's
    headers: { 'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '' },
  });
  const bubble = res.ok ? ((await res.json()) as { bubble: Bubble }).bubble : null;
  return {
    bubble,
    meta: bubble ? { title: `${bubble.name} · ${APP_NAME}`, description: bubble.description || undefined } : undefined,
  };
};
