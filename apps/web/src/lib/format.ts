import { BUBBLE_COLORS, type RequestCard, SUPPORTERS_NEEDED } from '@app/shared';
import { page } from '$app/state';
import { t } from './i18n';

// The browser's time zone. Server-rendered pages pass a fixed one, so the
// hydrated page shows the same text.
export const formatDate = (iso: string, timeZone?: string) =>
  new Intl.DateTimeFormat(page.data.locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));

// Where a request stands, as the cards and the detail page show it
export function status(r: RequestCard) {
  const texts = t();
  if (r.doneAt) return texts.statusDone;
  if (r.acceptedAt) return texts.statusRunning;
  if (!r.sentAt) return texts.statusNeedsSupport(SUPPORTERS_NEEDED - r.fromCount, r.from.name);
  if (!r.toCount) return texts.statusNobodyYet;
  return texts.statusJoined(r.toCount, r.seats, r.to.name);
}

// Share of the seats taken on the side that is still filling up
export function progress(r: RequestCard) {
  if (!r.sentAt) return { color: r.from.color, share: r.fromCount / SUPPORTERS_NEEDED };
  return { color: r.to.color, share: r.acceptedAt ? 1 : r.toCount / r.seats };
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');

export function personColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return BUBBLE_COLORS[Math.abs(hash) % BUBBLE_COLORS.length]!;
}
