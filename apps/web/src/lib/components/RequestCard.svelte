<script lang="ts">
  import type { RequestCard } from '@app/shared';
  import Bridge from '$lib/components/Bridge.svelte';
  import { formatDate, progress, status } from '$lib/format';
  import { t } from '$lib/i18n';

  let { request, href, timeZone }: { request: RequestCard; href?: string; timeZone?: string } = $props();
  const bar = $derived(progress(request));
</script>

<svelte:element this={href ? 'a' : 'div'} {href} class="card req">
  <Bridge from={request.from} to={request.to} />
  <p class="q">{t().quoted(request.question)}</p>
  <div class="meta">
    <span>{t().formatShort[request.format]} · {request.seats} + {request.seats}</span>
    <span>{formatDate(request.startsAt, timeZone)}</span>
    <span>{status(request)}</span>
    {#if request.mySide}<span class="mine">{t().youAreIn}</span>{/if}
  </div>
  {#if !request.acceptedAt}
    <div class="progress" style:--c={bar.color}><i style:width="{Math.max(4, bar.share * 100)}%"></i></div>
  {/if}
</svelte:element>

<style>
  .req {
    display: grid;
    gap: 10px;
  }
  .q {
    font-family: var(--font-display);
    font-size: 19px;
    font-weight: 650;
    font-stretch: 85%;
    line-height: 1.2;
  }
  .mine {
    color: var(--new);
    font-weight: 600;
  }
</style>
