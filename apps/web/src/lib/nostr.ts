import { APP_NAME } from '@app/shared';
import { api } from './api';

type NostrEvent = { kind: number; created_at: number; tags: string[][]; content: string };
type Signed = NostrEvent & { id: string; pubkey: string; sig: string };
type WindowNostr = { signEvent: (event: NostrEvent) => Promise<Signed> };

// nostr-login is a window.nostr provider with its own dialogs: browser
// extension (NIP-07), signer app via QR or bunker link (NIP-46) and new keys
// made right in the browser. nsec.app is down since mid 2026, the patch in
// patches/ points nostr-login's pairing relay elsewhere. Loaded on demand,
// it is half a megabyte.
let ready: Promise<typeof import('nostr-login')> | null = null;

function load(texts: { title: string; description: string }) {
  ready ??= import('nostr-login').then(async (nostrLogin) => {
    await nostrLogin.init({
      noBanner: true,
      darkMode: false,
      methods: ['connect', 'extension', 'local'],
      localSignup: true,
      perms: 'sign_event:27235',
      title: texts.title,
      description: texts.description,
    });
    return nostrLogin;
  });
  return ready;
}

// Signs the API's challenge as a NIP-98 event. Without a key yet, signEvent
// opens the nostr-login dialog first and rejects if it is closed.
export async function signLogin(texts: { title: string; description: string }) {
  await load(texts);
  const { challenge } = await api.post<{ challenge: string }>('/auth/nostr/challenge');
  const nostr = (window as unknown as { nostr: WindowNostr }).nostr;
  return nostr.signEvent({
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', `${location.origin}/api/v1/auth/nostr`],
      ['method', 'POST'],
      ['challenge', challenge],
    ],
    content: `${APP_NAME} login`,
  });
}

// Forget the key on this device, also the NIP-46 connection
export async function forgetKey() {
  if (!ready && !Object.keys(localStorage).some((key) => key.startsWith('__nostrlogin'))) return;
  const nostrLogin = await (ready ?? import('nostr-login'));
  await nostrLogin.logout();
}
