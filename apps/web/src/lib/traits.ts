import type { User } from '@app/shared';
import { api } from './api';
import { auth } from './auth.svelte';

export type Traits = {
  bubbles: { id: string; name: string; color: string; asTrait: boolean }[];
  interests: string[];
  suggestions: string[];
};

export async function saveTraits(traits: Traits) {
  auth.user = (
    await api.put<{ user: User }>('/me/traits', {
      bubbleIds: traits.bubbles.filter((b) => b.asTrait).map((b) => b.id),
      interests: traits.interests,
    })
  ).user;
}
