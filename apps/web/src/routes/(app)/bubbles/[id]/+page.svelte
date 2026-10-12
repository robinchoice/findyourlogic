<script lang="ts">
  import type { Person } from '@app/shared';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '$lib/api';
  import Avatar from '$lib/components/Avatar.svelte';
  import Button from '$lib/components/Button.svelte';
  import InviteLink from '$lib/components/InviteLink.svelte';
  import { t } from '$lib/i18n';

  type Bubble = {
    id: string;
    name: string;
    color: string;
    description: string;
    inviteToken: string | null;
    members: number;
    rounds: number;
  };

  let bubble = $state<Bubble | null>(null);
  let member = $state(false);
  let people = $state<Person[]>([]);
  let missing = $state(false);
  let leaving = $state(false);

  $effect(() => {
    api
      .get<{ bubble: Bubble; member: boolean; people: Person[] }>(`/bubbles/${page.params.id}`, true)
      .then((res) => {
        bubble = res.bubble;
        member = res.member;
        people = res.people;
      })
      .catch(() => (missing = true));
  });

  async function leave() {
    await api.post(`/bubbles/${bubble!.id}/leave`);
    goto('/bubbles');
  }
</script>

<div class="page">
  <a class="back" href="/bubbles">← {t().navBubbles}</a>
  {#if missing}
    <p class="muted">{t().notFound}</p>
  {:else if bubble}
    <h1 class="bub" style:--c={bubble.color}>{bubble.name}</h1>
    {#if bubble.description}<p class="desc">{bubble.description}</p>{/if}
    <div class="meta">
      <span>{t().members(bubble.members)}</span>
      {#if bubble.rounds}<span>{t().roundsHeld(bubble.rounds)}</span>{/if}
    </div>

    {#if member}
      <div class="card stack">
        <b>{t().inviteLink}</b>
        <span class="small muted">{t().inviteLinkHint}</span>
        <InviteLink token={bubble.inviteToken!} />
      </div>
      <div class="row wrap">
        <Button href="/requests/new?from={bubble.id}">+ {t().newRequest}</Button>
      </div>
      <h2>{t().membersTitle}</h2>
      <div class="stack people">
        {#each people as person (person.id)}
          <div class="row"><Avatar {person} small /><span>{person.name}</span></div>
        {/each}
      </div>
      <div class="row">
        {#if leaving}
          <span class="small">{t().leaveConfirm}</span>
          <Button small variant="secondary" onclick={leave}>{t().leaveYes}</Button>
          <button type="button" class="textbtn" onclick={() => (leaving = false)}>{t().cancel}</button>
        {:else}
          <button type="button" class="textbtn" onclick={() => (leaving = true)}>{t().leaveBubble}</button>
        {/if}
      </div>
    {:else}
      <div class="row wrap">
        <Button href="/requests/new?to={bubble.id}">{t().askThisBubble}</Button>
      </div>
      <p class="small faint">{t().joinOnlyByLink}</p>
    {/if}
  {/if}
</div>

<style>
  h1.bub::before {
    width: 18px;
    height: 18px;
  }
  .desc {
    white-space: pre-line;
  }
  .people {
    gap: 8px;
  }
</style>
