<script lang="ts">
  import type { RequestCard as Card } from '@app/shared';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import RequestCard from '$lib/components/RequestCard.svelte';
  import { t } from '$lib/i18n';

  let rounds = $state<Card[] | null>(null);
  onMount(async () => {
    rounds = (await api.get<{ rounds: Card[] }>('/rounds')).rounds;
  });
</script>

<div class="page">
  <h1>{t().navRounds}</h1>
  {#if rounds}
    <div class="stack">
      {#each rounds as round (round.id)}
        <RequestCard request={round} href="/rounds/{round.id}" />
      {:else}
        <p class="muted">{t().emptyRounds}</p>
      {/each}
    </div>
  {/if}
</div>
