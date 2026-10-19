import { NOSTR_RELAYS } from '@app/shared';
import { nip19 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { type Event, finalizeEvent, verifyEvent } from 'nostr-tools/pure';

// NIP-98 HTTP auth: the event names the URL and method it is meant for, so a
// signature made for another site can't log in here.
export const LOGIN_KIND = 27235;
const MAX_AGE_SECONDS = 10 * 60;

const tag = (event: Event, name: string) => event.tags.find((t) => t[0] === name)?.[1];

// Returns the challenge of a valid login event, else null
export function verifyLoginEvent(event: Event, url: string) {
  if (event.kind !== LOGIN_KIND) return null;
  if (Math.abs(Date.now() / 1000 - event.created_at) > MAX_AGE_SECONDS) return null;
  if (tag(event, 'u') !== url || tag(event, 'method') !== 'POST') return null;
  if (!verifyEvent(event)) return null;
  return tag(event, 'challenge') ?? null;
}

export const npubOf = (pubkey: string) => nip19.npubEncode(pubkey);

// A public note signed with the app's own key (NOSTR_SECRET_KEY, an nsec).
// Without the key it goes to the log, like mails without SMTP_HOST.
export async function publishNote(content: string, tags: string[][]) {
  const nsec = process.env.NOSTR_SECRET_KEY;
  if (!nsec) {
    console.log(`[nostr] ${content}`);
    return;
  }
  const { data } = nip19.decode(nsec as `nsec1${string}`);
  const event = finalizeEvent({ kind: 1, created_at: Math.floor(Date.now() / 1000), tags, content }, data);
  const pool = new SimplePool();
  try {
    await Promise.any(pool.publish(NOSTR_RELAYS, event));
  } finally {
    pool.close(NOSTR_RELAYS);
  }
}
