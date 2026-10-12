<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '$lib/api';
  import { auth, checkAuth } from '$lib/auth.svelte';
  import Button from '$lib/components/Button.svelte';
  import Hero from '$lib/components/Hero.svelte';
  import { t } from '$lib/i18n';

  let { data } = $props();
  let joining = $state(false);

  onMount(checkAuth);

  async function join() {
    joining = true;
    try {
      const res = await api.post<{ bubble: { id: string } }>(`/bubbles/invite/${page.params.token}/join`);
      goto(`/bubbles/${res.bubble.id}`);
    } catch {
      // The API client already shows the error as a toast
    } finally {
      joining = false;
    }
  }
</script>

<main>
  <Hero />
  {#if data.bubble}
    <p class="caps">{t().invitationTo}</p>
    <h1 class="bub" style:--c={data.bubble.color}>{data.bubble.name}</h1>
    {#if data.bubble.description}<p class="desc">{data.bubble.description}</p>{/if}
    <p class="muted">{t().members(data.bubble.members)}</p>
    <p class="small muted">{t().joinExplain}</p>
    {#if auth.user}
      <Button loading={joining} onclick={join}>{t().joinBubble}</Button>
    {:else}
      <Button href="/login?next={encodeURIComponent(page.url.pathname)}">{t().loginToJoin}</Button>
    {/if}
  {:else}
    <h1>{t().inviteInvalid}</h1>
    <Button variant="secondary" href="/">{t().toStart}</Button>
  {/if}
</main>

<style>
  main {
    display: grid;
    gap: 14px;
    justify-items: center;
    max-width: 440px;
    margin: 0 auto;
    padding: 4rem 1.25rem;
    text-align: center;
  }
  h1.bub::before {
    width: 18px;
    height: 18px;
  }
  .desc {
    white-space: pre-line;
  }
</style>
