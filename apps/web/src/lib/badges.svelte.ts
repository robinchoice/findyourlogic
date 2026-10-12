import type { Badges } from '@app/shared';
import { api } from './api';

// Counters of the navigation, refreshed after each navigation in the app
export const badges = $state<Badges>({
  requests: 0,
  newMatches: 0,
  newMatchCombo: null,
  unread: 0,
  invitations: 0,
});

export async function refreshBadges() {
  Object.assign(badges, await api.get<Badges>('/me/badges', true).catch(() => ({})));
}
