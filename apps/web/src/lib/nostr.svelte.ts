import { APP_NAME } from '@app/shared';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools/core';
import { api } from './api';

type Signer = { signEvent: (event: EventTemplate) => Promise<VerifiedEvent> };

// Signer apps answer the QR code here (NIP-46). Also in connect-src in svelte.config.js.
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'];

// State of NostrDialog.svelte: pick a browser extension (NIP-07) or connect
// a signer app with a nostrconnect:// code (NIP-46), then confirm there.
export const nostrDialog = $state({
  step: 'closed' as 'closed' | 'choose' | 'connect' | 'confirm',
  uri: '',
  noExtension: false,
});

let session: {
  abort: AbortController;
  pick: (signer: Signer) => void;
  fail: (err: unknown) => void;
  cleanup: (() => void)[];
} | null = null;

// Signs the API's challenge as a NIP-98 event. Rejects with "cancel" when
// the dialog is closed.
export async function signLogin() {
  const abort = new AbortController();
  const cancelled = new Promise<never>((_, reject) =>
    abort.signal.addEventListener('abort', () => reject(new Error('cancel'))),
  );
  cancelled.catch(() => {});
  const { promise: picked, resolve: pick, reject: fail } = Promise.withResolvers<Signer>();
  const own = { abort, pick, fail, cleanup: [] as (() => void)[] };
  session = own;
  Object.assign(nostrDialog, { step: 'choose', uri: '', noExtension: false });
  try {
    const signer = await Promise.race([picked, cancelled]);
    nostrDialog.step = 'confirm';
    const { challenge } = await api.post<{ challenge: string }>('/auth/nostr/challenge');
    const event = signer.signEvent({
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['u', `${location.origin}/api/v1/auth/nostr`],
        ['method', 'POST'],
        ['challenge', challenge],
      ],
      content: `${APP_NAME} login`,
    });
    return await Promise.race([event, cancelled]);
  } finally {
    abort.abort();
    for (const cleanup of own.cleanup) cleanup();
    if (session === own) {
      session = null;
      nostrDialog.step = 'closed';
    }
  }
}

// nostr-login, used until 2026-10, kept keys and signer sessions here
export function forgetKey() {
  for (const key of Object.keys(localStorage)) if (key.startsWith('__nostrlogin')) localStorage.removeItem(key);
}

export function cancelNostr() {
  session?.abort.abort();
}

export function pickExtension() {
  const nostr = (window as unknown as { nostr?: Signer }).nostr;
  if (nostr) session?.pick(nostr);
  else nostrDialog.noExtension = true;
}

// Shows a nostrconnect:// code and waits until a signer app answers it.
// Only the relays above are used, the CSP allows no others.
export async function pickSignerApp() {
  const own = session;
  if (!own) return;
  const [{ generateSecretKey, getPublicKey }, { BunkerSigner, createNostrConnectURI }] = await Promise.all([
    import('nostr-tools/pure'),
    import('nostr-tools/nip46'),
  ]);
  const clientKey = generateSecretKey();
  const uri = createNostrConnectURI({
    clientPubkey: getPublicKey(clientKey),
    relays: RELAYS,
    secret: crypto.randomUUID(),
    perms: ['sign_event:27235'],
    name: APP_NAME,
    url: location.origin,
  });
  Object.assign(nostrDialog, { step: 'connect', uri });
  // Closing the signer only ends its subscription, nostr-tools closes the idle
  // relay connections itself after 20 seconds
  BunkerSigner.fromURI(clientKey, uri, { skipSwitchRelays: true }, own.abort.signal).then((signer) => {
    own.cleanup.push(() => signer.close());
    own.pick(signer);
  }, own.fail);
}
