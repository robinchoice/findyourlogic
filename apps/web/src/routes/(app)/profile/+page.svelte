<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { addEmail, auth, deleteAccount, nostrLogin, updateMe } from '$lib/auth.svelte';
  import Button from '$lib/components/Button.svelte';
  import NostrDialog from '$lib/components/NostrDialog.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import TraitPicker from '$lib/components/TraitPicker.svelte';
  import { t } from '$lib/i18n';
  import { toast } from '$lib/toast.svelte';
  import { saveTraits, type Traits } from '$lib/traits';

  let traits = $state<Traits | null>(null);
  let name = $state(auth.user?.name ?? '');
  let email = $state('');
  let emailSent = $state(false);
  let saving = $state(false);
  let deleting = $state(false);

  onMount(async () => {
    traits = await api.get<Traits>('/me/traits');
  });

  async function save() {
    saving = true;
    try {
      if (name !== auth.user!.name) await updateMe({ name });
      await saveTraits(traits!);
      toast(t().saved);
    } catch {
      // The API client already shows the error as a toast
    } finally {
      saving = false;
    }
  }

  async function sendConfirm(e: SubmitEvent) {
    e.preventDefault();
    try {
      await addEmail(email);
      emailSent = true;
    } catch {
      // The API client already shows the error as a toast
    }
  }

  async function linkNostr() {
    try {
      await nostrLogin();
      toast(t().nostrLinked);
    } catch {
      // Closing the dialog is no error, API errors showed as a toast
    }
  }

  async function remove() {
    await deleteAccount();
    goto('/');
  }
</script>

{#if auth.user}
  <div class="page">
    <h1>{t().profile}</h1>

    <div class="card stack">
      <div class="field">
        <label for="name">{t().displayName}</label>
        <input id="name" class="input" maxlength="60" bind:value={name} />
      </div>
      {#if traits}
        <TraitPicker bind:bubbles={traits.bubbles} bind:interests={traits.interests} suggestions={traits.suggestions} />
      {/if}
      <div><Button loading={saving} disabled={!traits || !name.trim()} onclick={save}>{t().save}</Button></div>
    </div>

    <div class="card row">
      <div class="grow">
        <b>{t().discoverable}</b>
        <div class="small muted">{t().discoverableShort}</div>
      </div>
      <Switch on={auth.user.discoverable} label={t().discoverable} onchange={(on) => updateMe({ discoverable: on })} />
    </div>
    <p class="small faint">{t().noOpinionScales}</p>

    <div class="card stack">
      <div class="caps">{t().login}</div>
      <div class="row wrap">
        <span class="grow">{t().email}: {auth.user.email ?? '–'}</span>
      </div>
      {#if !auth.user.email}
        {#if emailSent}
          <p class="small muted">{t().confirmSent}</p>
        {:else}
          <form class="row" onsubmit={sendConfirm}>
            <input class="input grow" type="email" required aria-label={t().email} placeholder={t().emailPlaceholder} bind:value={email} />
            <Button type="submit" small variant="secondary">{t().addEmail}</Button>
          </form>
        {/if}
      {/if}
      <div class="row wrap">
        <span class="grow npub">Nostr: {auth.user.npub ?? '–'}</span>
        {#if !auth.user.npub}<Button small variant="nostr" onclick={linkNostr}>{t().linkNostr}</Button>{/if}
      </div>
    </div>

    <div class="card stack danger">
      <b>{t().deleteAccount}</b>
      <span class="small muted">{t().deleteAccountText}</span>
      <div class="row">
        {#if deleting}
          <Button small variant="secondary" onclick={remove}>{t().deleteYes}</Button>
          <button type="button" class="textbtn" onclick={() => (deleting = false)}>{t().cancel}</button>
        {:else}
          <Button small variant="secondary" onclick={() => (deleting = true)}>{t().deleteAccount}</Button>
        {/if}
      </div>
    </div>
  </div>
{/if}
<NostrDialog />

<style>
  .npub {
    overflow-wrap: anywhere;
  }
  .danger {
    border-color: color-mix(in srgb, var(--error) 30%, transparent);
  }
</style>
