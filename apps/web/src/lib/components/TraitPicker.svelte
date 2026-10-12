<script lang="ts">
  import { interestKey } from '@app/shared';
  import { t } from '$lib/i18n';

  type Membership = { id: string; name: string; color: string; asTrait: boolean };

  // Bubbles come from the memberships, interests are free text. Both can be
  // switched off without leaving anything.
  let {
    bubbles = $bindable(),
    interests = $bindable(),
    suggestions,
  }: { bubbles: Membership[]; interests: string[]; suggestions: string[] } = $props();

  let own = $state('');
  const has = (label: string) => interests.some((i) => interestKey(i) === interestKey(label));
  const shown = $derived([...new Map([...suggestions, ...interests].map((l) => [interestKey(l), l])).values()]);

  function toggle(label: string) {
    interests = has(label) ? interests.filter((i) => interestKey(i) !== interestKey(label)) : [...interests, label];
  }

  function add() {
    const label = own.trim();
    if (label && !has(label) && interests.length < 30) interests = [...interests, label.slice(0, 40)];
    own = '';
  }
</script>

<div class="field">
  <span class="label">{t().yourBubbles}</span>
  {#if bubbles.length}
    <div class="row wrap">
      {#each bubbles as bubble (bubble.id)}
        <button
          type="button"
          class="chip"
          class:on={bubble.asTrait}
          aria-pressed={bubble.asTrait}
          onclick={() => (bubble.asTrait = !bubble.asTrait)}
        >
          <span class="dot" style:background={bubble.color}></span>{bubble.name}
        </button>
      {/each}
    </div>
    <span class="small faint">{t().bubblesHint}</span>
  {:else}
    <span class="small faint">{t().noBubblesYet}</span>
  {/if}
</div>

<div class="field">
  <span class="label">{t().interests}</span>
  <div class="row wrap">
    {#each shown as label (interestKey(label))}
      <button type="button" class="chip" class:on={has(label)} aria-pressed={has(label)} onclick={() => toggle(label)}>
        {label}
      </button>
    {/each}
  </div>
  <div class="row">
    <input
      class="input grow"
      maxlength="40"
      placeholder={t().ownInterest}
      aria-label={t().ownInterest}
      bind:value={own}
      onkeydown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          add();
        }
      }}
    />
    <button type="button" class="chip" onclick={add}>{t().add}</button>
  </div>
</div>
