import type { User } from '@app/shared';
import { api } from './api';
import { forgetKey, signLogin } from './nostr.svelte';

export const auth = $state({ user: null as User | null, signupsOpen: true });

// Pages that depend on the login call this on mount. The verify page doesn't,
// so a stale "logged out" answer can't race its fresh session.
export async function checkAuth() {
  const res = await api
    .get<{ user: User | null; signupsOpen: boolean }>('/auth/me', true)
    .catch(() => ({ user: null, signupsOpen: true }));
  auth.user = res.user;
  auth.signupsOpen = res.signupsOpen;
}

// altcha: the payload of the widget in the form
export function sendMagicLink(email: string, next: string | null, altcha: string) {
  return api.post('/auth/magic-link', { email, next: next ?? undefined, altcha });
}

// Silent: the verify page shows the error itself
export async function verify(token: string) {
  auth.user = (await api.post<{ user: User }>('/auth/verify', { token }, true)).user;
}

// Logs in with the key, or links it to the account that is logged in
export async function nostrLogin() {
  const event = await signLogin();
  auth.user = (await api.post<{ user: User }>('/auth/nostr', { event })).user;
}

export async function addEmail(email: string) {
  await api.post('/auth/me/email', { email });
}

export async function logout() {
  await api.post('/auth/logout');
  auth.user = null;
  forgetKey();
}

export async function updateMe(changes: { name?: string; discoverable?: boolean }) {
  auth.user = (await api.patch<{ user: User }>('/auth/me', changes)).user;
}

export async function deleteAccount() {
  await api.delete('/auth/me');
  auth.user = null;
  forgetKey();
}
