<script lang="ts">
  import { type RequestDetail, SUPPORTERS_NEEDED } from '@app/shared';
  import { page } from '$app/state';
  import { api } from '$lib/api';
  import Avatar from '$lib/components/Avatar.svelte';
  import Bridge from '$lib/components/Bridge.svelte';
  import Button from '$lib/components/Button.svelte';
  import InviteLink from '$lib/components/InviteLink.svelte';
  import Rules from '$lib/components/Rules.svelte';
  import { formatDate, status } from '$lib/format';
  import { t } from '$lib/i18n';
  import { toast } from '$lib/toast.svelte';

  let request = $state<RequestDetail | null>(null);
  let missing = $state(false);
  let busy = $state(false);

  $effect(() => {
    api
      .get<{ request: RequestDetail }>(`/requests/${page.params.id}`, true)
      .then((res) => (request = res.request))
      .catch(() => (missing = true));
  });

  async function act(action: 'join' | 'leave') {
    busy = true;
    try {
      request = (await api.post<{ request: RequestDetail }>(`/requests/${page.params.id}/${action}`)).request;
      if (action === 'join') toast(`${t().joined} · ${status(request)}`);
    } catch {
      // The API client already shows the error as a toast
    } finally {
      busy = false;
    }
  }
</script>

<div class="page">
  <a class="back" href="/requests">← {t().navRequests}</a>
  {#if missing}
    <p class="muted">{t().notFound}</p>
  {:else if request}
    <Bridge from={request.from} to={request.to} />
    <h1>{t().quoted(request.question)}</h1>
    {#if request.details}<p class="details">{request.details}</p>{/if}
    <div class="meta">
      <span>{t().formatShort[request.format]} · {request.seats} + {request.seats}</span>
      <span>{formatDate(request.startsAt)}</span>
      {#if request.place}<span>{request.place}</span>{/if}
      <span>{status(request)}</span>
    </div>

    <div class="sides">
      {#each [{ bubble: request.from, count: request.fromCount, people: request.fromPeople }, { bubble: request.to, count: request.toCount, people: request.toPeople }] as side (side.bubble.id)}
        <div class="side-box" style:--c={side.bubble.color}>
          <div class="caps">{side.bubble.name} · {t().ofSeats(side.count, request.seats)}</div>
          <div class="row avs">
            {#each side.people as person (person.id)}<Avatar {person} small />{/each}
            <span class="small muted">
              {side.count >= request.seats ? t().complete : t().seatsFree(request.seats - side.count)}
            </span>
          </div>
        </div>
      {/each}
    </div>

    {#if request.toInviteToken}
      <div class="card stack">
        <b>{t().inviteTargetTitle(request.to.name)}</b>
        <p class="small muted">{t().inviteTargetText}</p>
        <InviteLink token={request.toInviteToken} />
      </div>
    {/if}

    {#if !request.sentAt}
      <div class="card stack small">
        <b>{t().decidesTogether(request.from.name)}</b>
        <span class="muted">{t().decidesTogetherText(SUPPORTERS_NEEDED, request.to.name)}</span>
        {#if request.nostrNote}<span class="muted">{t().nostrNoteNotice}</span>{/if}
      </div>
    {/if}

    <Rules />

    <div class="row wrap">
      {#if request.canJoin}
        <Button loading={busy} onclick={() => act('join')}>{t().imIn}</Button>
      {:else if request.mySide && request.acceptedAt}
        <Button href="/rounds/{request.id}">{t().toRound}</Button>
      {:else if request.mySide}
        <span class="in">{t().youAreIn} ✓</span>
        <Button variant="secondary" small loading={busy} onclick={() => act('leave')}>{t().withdraw}</Button>
      {:else if !request.acceptedAt}
        <span class="small faint">{t().onlyMembersJoin(request.sentAt ? request.to.name : request.from.name)}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .details {
    white-space: pre-line;
  }
  .sides {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .side-box {
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: color-mix(in srgb, var(--c) 6%, var(--surface));
  }
  .avs {
    gap: 4px;
    margin-top: 8px;
  }
  .in {
    color: var(--new);
    font-weight: 650;
  }
  @media (max-width: 700px) {
    .sides {
      grid-template-columns: 1fr;
    }
  }
</style>
