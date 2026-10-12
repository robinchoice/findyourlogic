<script lang="ts">
  import { safeNextPath } from '@app/shared';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '$lib/api';
  import { auth, updateMe } from '$lib/auth.svelte';
  import Button from '$lib/components/Button.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import TraitPicker from '$lib/components/TraitPicker.svelte';
  import { t } from '$lib/i18n';
  import { saveTraits, type Traits } from '$lib/traits';

  const next = safeNextPath(page.url.searchParams.get('next'));
  let traits = $state<Traits | null>(null);
  let name = $state(auth.user?.name ?? '');
  // Off until the person switches it on: memberships can reveal opinions (Art. 9 GDPR)
  let discoverable = $state(auth.user?.discoverable ?? false);
  let saving = $state(false);

  onMount(async () => {
    traits = await api.get<Traits>('/me/traits');
  });

  async function save() {
    if (!traits) return;
    saving = true;
    try {
      await updateMe({ name, discoverable });
      await saveTraits(traits);
      goto(next && next !== '/welcome' ? next : '/requests', { replaceState: true });
    } catch {
      // The API client already shows the error as a toast
    } finally {
      saving = false;
    }
  }
</script>

<div class="page">
  <div class="caps">{t().welcome}</div>
  <h1>{t().whatMakesYou}</h1>
  <p class="muted">{t().whatMakesYouIntro}</p>
  <div class="field">
    <label for="name">{t().displayName}</label>
    <input id="name" class="input" maxlength="60" bind:value={name} />
    <span class="small faint">{t().displayNameHint}</span>
  </div>
  {#if traits}
    <TraitPicker bind:bubbles={traits.bubbles} bind:interests={traits.interests} suggestions={traits.suggestions} />
  {/if}
  <div class="card row">
    <div class="grow">
      <b>{t().discoverable}</b>
      <div class="small muted">{t().discoverableHint}</div>
    </div>
    <Switch on={discoverable} label={t().discoverable} onchange={(on) => (discoverable = on)} />
  </div>
  <div><Button loading={saving} disabled={!traits || !name.trim()} onclick={save}>{t().continue}</Button></div>
</div>
