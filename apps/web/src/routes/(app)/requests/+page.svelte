<script lang="ts">
  import type { RequestCard as Card } from '@app/shared';
  import { page } from '$app/state';
  import { api } from '$lib/api';
  import { badges } from '$lib/badges.svelte';
  import Button from '$lib/components/Button.svelte';
  import RequestCard from '$lib/components/RequestCard.svelte';
  import { t } from '$lib/i18n';

  const TABS = ['mine', 'open', 'sent'] as const;
  const tab = $derived(TABS.find((name) => name === page.url.searchParams.get('tab')) ?? 'mine');
  let requests = $state<Card[] | null>(null);

  $effect(() => {
    const current = tab;
    requests = null;
    api.get<{ requests: Card[] }>(`/requests?tab=${current}`).then((res) => {
      if (current === tab) requests = res.requests;
    });
  });

  const label = { mine: () => t().tabMine, open: () => t().tabOpen, sent: () => t().tabSent };
  const empty = { mine: () => t().emptyMine, open: () => t().emptyOpen, sent: () => t().emptySent };
</script>

<div class="page">
  <div class="row"><h1 class="grow">{t().navRequests}</h1><Button small href="/requests/new">+ {t().newShort}</Button></div>
  <nav class="seg">
    {#each TABS as name (name)}
      <a href="?tab={name}" class:on={tab === name} aria-current={tab === name ? 'page' : undefined}>{label[name]()}</a>
    {/each}
  </nav>

  {#if badges.newMatches && badges.newMatchCombo}
    <a href="/matches" class="card hit row">
      <span class="spark" aria-hidden="true">✨</span>
      <span class="grow">
        <b>{t().newMatchHint(badges.newMatches, badges.newMatchCombo.map((trait) => trait.label).join(' × '))}</b>
        <span class="small muted block">{t().newMatchSub}</span>
      </span>
      <span class="chip">{t().look}</span>
    </a>
  {/if}

  {#if requests}
    <div class="stack">
      {#each requests as request (request.id)}
        <RequestCard {request} href="/requests/{request.id}" />
      {:else}
        <p class="muted">{empty[tab]()}</p>
      {/each}
    </div>
  {/if}
</div>

<style>
  .hit {
    display: flex;
    border-color: #d9e4c8;
    background: linear-gradient(120deg, #f4f9ec, #e9f6ef);
  }
  .spark {
    font-size: 22px;
  }
  .block {
    display: block;
  }
</style>
