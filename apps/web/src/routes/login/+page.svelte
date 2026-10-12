<script lang="ts">
  import { safeNextPath } from '@app/shared';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { auth, checkAuth, nostrLogin, sendMagicLink } from '$lib/auth.svelte';
  import Button from '$lib/components/Button.svelte';
  import Hero from '$lib/components/Hero.svelte';
  import { t } from '$lib/i18n';
  import { toastError } from '$lib/toast.svelte';

  // Page that sent us here, e.g. a link opened while logged out
  const next = safeNextPath(page.url.searchParams.get('next'));

  let email = $state('');
  let sent = $state(false);
  let loading = $state(false);
  let signing = $state(false);

  onMount(async () => {
    await checkAuth();
    if (auth.user) goto(next ?? '/requests', { replaceState: true });
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    loading = true;
    try {
      await sendMagicLink(email, next);
      sent = true;
    } catch {
      // The API client already shows the error as a toast
    } finally {
      loading = false;
    }
  }

  async function withNostr() {
    signing = true;
    try {
      await nostrLogin({ title: t().nostrDialogTitle, description: t().nostrDialogText });
      goto(next ?? '/requests', { replaceState: true });
    } catch (err) {
      // Closing the dialog is no error. API errors already showed as a toast.
      if (err instanceof Error && !/cancel|reject/i.test(err.message) && !auth.user) toastError(t().nostrFailed);
    } finally {
      signing = false;
    }
  }
</script>

<main>
  <Hero />
  <h1>{t().logIn}</h1>
  <p class="muted center">{t().loginIntro}</p>
  <Button variant="nostr" block loading={signing} onclick={withNostr}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"
      ><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" /></svg
    >
    {t().nostrLogin}
  </Button>
  <div class="card small stack ways">
    <div class="row"><span class="dot"></span>{t().nostrExtension}</div>
    <div class="row"><span class="dot"></span>{t().nostrSigner}</div>
    <div class="row"><span class="dot"></span>{t().nostrNew}</div>
  </div>
  <div class="row muted small"><div class="hr grow"></div>{t().or}<div class="hr grow"></div></div>
  {#if sent}
    <p>{t().linkSent}</p>
    <Button variant="secondary" onclick={() => (sent = false)}>{t().otherAddress}</Button>
  {:else}
    <form onsubmit={submit} class="stack">
      <input
        class="input"
        type="email"
        required
        aria-label={t().email}
        placeholder={t().emailForLink}
        bind:value={email}
      />
      <Button type="submit" variant="secondary" block {loading}>{t().sendLink}</Button>
    </form>
  {/if}
</main>

<style>
  main {
    display: grid;
    gap: 14px;
    max-width: 400px;
    margin: 0 auto;
    padding: 4rem 1.25rem;
  }
  h1,
  .center {
    text-align: center;
  }
  .ways {
    gap: 8px;
  }
  .ways .dot {
    background: #7b3fe4;
  }
</style>
