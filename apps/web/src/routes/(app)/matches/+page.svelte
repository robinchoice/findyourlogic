<script lang="ts">
  import type { Combo, Matches, Venn } from '@app/shared';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { updateMe } from '$lib/auth.svelte';
  import { refreshBadges } from '$lib/badges.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import Button from '$lib/components/Button.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import VennDiagram from '$lib/components/Venn.svelte';
  import { t } from '$lib/i18n';
  import { toast } from '$lib/toast.svelte';

  let matches = $state<Matches | null>(null);
  let selected = $state<Combo | null>(null);
  let venn = $state<Venn | null>(null);
  let name = $state('');
  let founding = $state(false);

  const inCombo = $derived(
    matches && selected
      ? matches.people.filter((p) => selected!.traits.every((tr) => p.shared.some((s) => s.key === tr.key)))
      : [],
  );

  async function load() {
    matches = await api.get<Matches>('/matches');
    if (matches.combos[0]) select(matches.combos[0]);
    // Opening the page counts as having seen them
    await api.post('/matches/seen', undefined, true);
    refreshBadges();
  }

  onMount(load);

  async function select(combo: Combo) {
    selected = combo;
    name = combo.traits
      .map((tr) => tr.label)
      .join(' × ')
      .slice(0, 80);
    venn = null;
    const keys = combo.traits.slice(0, 3).map((tr) => tr.key);
    venn = await api.get<Venn>(`/matches/venn?traits=${encodeURIComponent(keys.join(','))}`, true);
  }

  async function enable() {
    await updateMe({ discoverable: true });
    await load();
  }

  async function found() {
    founding = true;
    try {
      const res = await api.post<{ bubble: { id: string }; invited: number }>('/bubbles/from-match', {
        name,
        traits: selected!.traits.map((tr) => tr.key),
      });
      toast(t().invitationsSent(res.invited));
      goto(`/bubbles/${res.bubble.id}`);
    } catch {
      // The API client already shows the error as a toast
    } finally {
      founding = false;
    }
  }
</script>

<div class="page">
  <h1>{t().yourMatches}</h1>
  {#if matches && !matches.discoverable}
    <div class="card row">
      <div class="grow">
        <b>{t().discoverable}</b>
        <div class="small muted">{t().matchesNeedDiscoverable}</div>
      </div>
      <Switch on={false} label={t().discoverable} onchange={enable} />
    </div>
  {:else if matches}
    {#if !matches.combos.length}
      <p class="muted">{t().noMatchesYet}</p>
      <p class="small faint">{t().fewerOnly(matches.fewer)}</p>
      <div><Button variant="secondary" href="/profile">{t().editTraits}</Button></div>
    {:else}
      <div class="stack combos">
        {#each matches.combos as combo (combo.traits.map((tr) => tr.key).join())}
          <button type="button" class="combo" class:on={combo === selected} onclick={() => select(combo)}>
            <b>{combo.traits.map((tr) => tr.label).join(' × ')}</b>
            <span class="num">{combo.count}</span>
            <span class="small muted">{combo.isNew ? t().newSinceLastVisit : t().peopleInCombo(combo.count)}</span>
          </button>
        {/each}
      </div>

      {#if venn?.traits.length}
        <div class="card">
          <VennDiagram {venn} />
          <p class="small muted center">{t().onlyDiscoverableCounted}</p>
        </div>
      {/if}

      <h2>{t().inTheMiddle}</h2>
      <div class="stack people">
        {#each inCombo as person (person.id)}
          <div class="card person">
            <Avatar {person} />
            <div>
              <b>{person.name}</b>
              <div class="small muted">{person.shared.map((s) => s.label).join(' · ')}</div>
            </div>
            <Button small variant="secondary" href="/messages/{person.id}">{t().sayHello}</Button>
          </div>
        {/each}
        {#if matches.fewer}<p class="small faint">{t().fewerOnly(matches.fewer)}</p>{/if}
      </div>

      <div class="card stack small">
        <b>{t().makeBubble}</b>
        <span class="muted">{t().makeBubbleText(inCombo.length)}</span>
        <div class="row wrap">
          <input class="input grow" maxlength="80" aria-label={t().bubbleName} bind:value={name} />
          <Button small loading={founding} disabled={name.trim().length < 2} onclick={found}>{t().proposeBubble}</Button>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .combos,
  .people {
    gap: 8px;
  }
  .combo {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 10px;
    align-items: center;
    width: 100%;
    padding: 12px 14px;
    border: 1.5px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .combo.on {
    border-color: var(--text);
    box-shadow: inset 0 0 0 1px var(--text);
  }
  .num {
    grid-row: span 2;
    font: 800 24px var(--font-display);
  }
  .person {
    display: grid;
    grid-template-columns: 38px 1fr auto;
    gap: 10px;
    align-items: center;
  }
  .center {
    text-align: center;
  }
</style>
