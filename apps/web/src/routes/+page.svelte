<script lang="ts">
  import { APP_NAME, type RequestCard as Card } from '@app/shared';
  import { onMount } from 'svelte';
  import { auth, checkAuth } from '$lib/auth.svelte';
  import Button from '$lib/components/Button.svelte';
  import Hero from '$lib/components/Hero.svelte';
  import RequestCard from '$lib/components/RequestCard.svelte';
  import Rules from '$lib/components/Rules.svelte';
  import VennDiagram from '$lib/components/Venn.svelte';
  import { t } from '$lib/i18n';

  onMount(checkAuth);

  // Examples from the mockup, so visitors see what a request looks like
  const day = 86_400_000;
  const example = (
    id: string,
    from: [string, string],
    to: [string, string],
    question: string,
    format: Card['format'],
    inDays: number,
    toCount: number,
  ): Card => ({
    id,
    from: { id: `${id}-from`, name: from[0], color: from[1] },
    to: { id: `${id}-to`, name: to[0], color: to[1] },
    question,
    format,
    place: '',
    startsAt: new Date(Date.UTC(2026, 9, 23, 17, 30) + inDays * day).toISOString(),
    seats: 3,
    fromCount: 3,
    toCount,
    sentAt: '2026-10-01T00:00:00Z',
    acceptedAt: null,
    doneAt: null,
    mySide: null,
  });
  const examples = $derived(
    t().examples.map((e, i) =>
      example(`example-${i}`, e.from, e.to, e.question, (['online', 'onsite', 'onsite'] as const)[i]!, i * 5, [2, 0, 1][i]!),
    ),
  );
  const venn = $derived({
    traits: t().exampleTraits.map((label, i) => ({ key: `example-${i}`, label, color: ['#e8870e', '#6a4cc2', '#2c5fae'][i]! })),
    regions: { '1': 81, '2': 27, '4': 1890, '3': 7, '5': 31, '6': 12, '7': 6 },
  });
</script>

<main>
  <section class="intro">
    <Hero />
    <h1>{APP_NAME}</h1>
    <p class="lead">{t().landingLead}</p>
    {#if auth.user}
      <Button href="/requests">{t().openApp}</Button>
    {:else}
      <Button href="/login">{t().getStarted}</Button>
    {/if}
  </section>

  <section class="stack">
    <h2>{t().landingRequestsTitle}</h2>
    <p class="muted">{t().landingRequestsText}</p>
    {#each examples as request (request.id)}
      <RequestCard {request} timeZone="Europe/Berlin" />
    {/each}
  </section>

  <section class="stack">
    <Rules />
  </section>

  <section class="stack">
    <h2>{t().landingMatchesTitle}</h2>
    <p class="muted">{t().landingMatchesText}</p>
    <div class="card"><VennDiagram {venn} /></div>
  </section>

  <section class="stack">
    <h2>{t().landingPrivacyTitle}</h2>
    <p class="muted">{t().landingPrivacyText}</p>
  </section>
</main>

<style>
  main {
    display: grid;
    gap: 44px;
    max-width: 720px;
    margin: 0 auto;
    padding: 4rem 1.25rem;
  }
  .intro {
    display: grid;
    gap: 16px;
    justify-items: center;
    text-align: center;
  }
  h1 {
    font-size: clamp(2.75rem, 9vw, 4.5rem);
    font-weight: 800;
    font-stretch: 75%;
    line-height: 0.95;
  }
  .lead {
    max-width: 34rem;
    color: var(--muted);
    font-size: 17px;
  }
</style>
