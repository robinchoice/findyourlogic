<script lang="ts">
  import { BUBBLE_COLORS, type Invitation, type MyBubble } from '@app/shared';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { refreshBadges } from '$lib/badges.svelte';
  import Button from '$lib/components/Button.svelte';
  import { t } from '$lib/i18n';

  let bubbles = $state<MyBubble[] | null>(null);
  let invitations = $state<Invitation[]>([]);
  let creating = $state(false);
  let name = $state('');
  let color = $state<(typeof BUBBLE_COLORS)[number]>(BUBBLE_COLORS[0]);
  let description = $state('');
  let saving = $state(false);

  async function load() {
    const res = await api.get<{ bubbles: MyBubble[]; invitations: Invitation[] }>('/bubbles');
    bubbles = res.bubbles;
    invitations = res.invitations;
    refreshBadges();
  }
  onMount(load);

  async function create(e: SubmitEvent) {
    e.preventDefault();
    saving = true;
    try {
      const res = await api.post<{ bubble: { id: string } }>('/bubbles', { name, color, description });
      goto(`/bubbles/${res.bubble.id}`);
    } catch {
      // The API client already shows the error as a toast
    } finally {
      saving = false;
    }
  }

  async function answer(id: string, accept: boolean) {
    await (accept ? api.post(`/bubbles/${id}/invitation`) : api.delete(`/bubbles/${id}/invitation`));
    await load();
  }
</script>

<div class="page">
  <div class="row">
    <h1 class="grow">{t().navBubbles}</h1>
    <Button small variant="secondary" onclick={() => (creating = !creating)}>+ {t().createBubble}</Button>
  </div>

  {#if creating}
    <form class="card stack" onsubmit={create}>
      <div class="field">
        <label for="name">{t().bubbleName}</label>
        <input id="name" class="input" required minlength="2" maxlength="80" placeholder={t().bubbleNamePlaceholder} bind:value={name} />
      </div>
      <div class="field">
        <span class="label">{t().color}</span>
        <div class="row wrap">
          {#each BUBBLE_COLORS as option (option)}
            <button
              type="button"
              class="swatch"
              class:on={color === option}
              style:background={option}
              aria-label={option}
              aria-pressed={color === option}
              onclick={() => (color = option)}
            ></button>
          {/each}
        </div>
      </div>
      <div class="field">
        <label for="description">{t().description}</label>
        <textarea id="description" class="input" maxlength="500" placeholder={t().descriptionPlaceholder} bind:value={description}></textarea>
      </div>
      <div><Button type="submit" loading={saving}>{t().createBubble}</Button></div>
    </form>
  {/if}

  {#each invitations as invitation (invitation.id)}
    <div class="card stack invitation">
      <div class="row">
        <span class="bub grow" style:--c={invitation.color}>{invitation.name}</span>
        <span class="chip">{t().invited}</span>
      </div>
      <span class="small muted">{invitation.invitedBy ? t().invitedBy(invitation.invitedBy) : ''} {invitation.description}</span>
      <div class="row">
        <Button small onclick={() => answer(invitation.id, true)}>{t().accept}</Button>
        <Button small variant="secondary" onclick={() => answer(invitation.id, false)}>{t().decline}</Button>
      </div>
    </div>
  {/each}

  {#if bubbles}
    {#each bubbles as bubble (bubble.id)}
      <a class="card stack" href="/bubbles/{bubble.id}">
        <div class="row">
          <span class="bub grow" style:--c={bubble.color}>{bubble.name}</span>
          {#if !bubble.asTrait}<span class="chip">{t().hiddenFromMatches}</span>{/if}
        </div>
        <div class="meta">
          <span>{t().members(bubble.members)}</span>
          {#if bubble.openRequests}<span>{t().openRequestsToYou(bubble.openRequests)}</span>{/if}
          {#if bubble.rounds}<span>{t().roundsHeld(bubble.rounds)}</span>{/if}
        </div>
      </a>
    {:else}
      <p class="muted">{t().noBubblesYet}</p>
    {/each}
  {/if}
  <p class="small faint">{t().bubbleIsExisting}</p>
</div>

<style>
  .swatch {
    width: 28px;
    height: 28px;
    border: 2px solid var(--surface);
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--border);
    cursor: pointer;
  }
  .swatch.on {
    box-shadow: 0 0 0 2px var(--text);
  }
  .invitation {
    border-color: var(--new-bg);
  }
</style>
