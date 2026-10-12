<script lang="ts">
  import { type BubbleRef, FORMATS, type Format, type MyBubble, SUPPORTERS_NEEDED } from '@app/shared';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import InviteLink from '$lib/components/InviteLink.svelte';
  import { t } from '$lib/i18n';
  import { toast } from '$lib/toast.svelte';

  type Found = BubbleRef & { members: number };

  let mine = $state<MyBubble[] | null>(null);
  let fromId = $state('');
  let query = $state('');
  let found = $state<Found[]>([]);
  let target = $state<BubbleRef | null>(null);
  let newName = $state<string | null>(null);
  let question = $state('');
  let details = $state('');
  let format = $state<Format>('online');
  let place = $state('');
  let startsAt = $state('');
  let seats = $state(3);
  let sending = $state(false);
  let created = $state<{ id: string; inviteToken: string | null } | null>(null);

  const from = $derived(mine?.find((b) => b.id === fromId));

  onMount(async () => {
    mine = (await api.get<{ bubbles: MyBubble[] }>('/bubbles')).bubbles;
    fromId = mine.find((b) => b.id === page.url.searchParams.get('from'))?.id ?? mine[0]?.id ?? '';
    const to = page.url.searchParams.get('to');
    if (to) target = (await api.get<{ bubble: BubbleRef }>(`/bubbles/${to}`)).bubble;
  });

  // Searches as you type, the newest answer wins
  let searchId = 0;
  $effect(() => {
    const q = query.trim();
    const id = ++searchId;
    if (q.length < 2) {
      found = [];
      return;
    }
    const timer = setTimeout(async () => {
      const res = await api.get<{ bubbles: Found[] }>(`/bubbles/search?q=${encodeURIComponent(q)}`, true);
      if (id === searchId) found = res.bubbles.filter((b) => b.id !== fromId);
    }, 200);
    return () => clearTimeout(timer);
  });

  function clearTarget() {
    target = null;
    newName = null;
  }

  function pick(bubble: BubbleRef) {
    target = bubble;
    newName = null;
    query = '';
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!target && !newName) return toast(t().pickTarget, 'error');
    sending = true;
    try {
      const res = await api.post<{ request: { id: string; inviteToken: string | null } }>('/requests', {
        fromBubbleId: fromId,
        ...(target ? { toBubbleId: target.id } : { newBubbleName: newName }),
        question,
        details,
        format,
        place: format === 'onsite' ? place : '',
        startsAt: new Date(startsAt).toISOString(),
        seats,
      });
      if (res.request.inviteToken) created = res.request;
      else {
        toast(t().waitsForSupport(SUPPORTERS_NEEDED - 1, from!.name));
        goto(`/requests/${res.request.id}`);
      }
    } catch {
      // The API client already shows the error as a toast
    } finally {
      sending = false;
    }
  }
</script>

<div class="page">
  <a class="back" href="/requests">← {t().navRequests}</a>
  <h1>{t().newRequest}</h1>

  {#if created}
    <div class="card stack">
      <b>{t().inviteTargetTitle(newName ?? '')}</b>
      <p class="small muted">{t().inviteTargetText}</p>
      <InviteLink token={created.inviteToken!} />
      <div><Button href="/requests/{created.id}">{t().toRequest}</Button></div>
    </div>
  {:else if mine && !mine.length}
    <div class="card stack">
      <p>{t().needBubbleFirst}</p>
      <div><Button href="/bubbles">{t().navBubbles}</Button></div>
    </div>
  {:else if mine}
    <form class="stack form" onsubmit={submit}>
      <div class="field">
        <span class="label">{t().whoAsks}</span>
        <div class="row wrap">
          {#each mine as bubble (bubble.id)}
            <button type="button" class="chip" class:on={bubble.id === fromId} onclick={() => (fromId = bubble.id)}>
              <span class="dot" style:background={bubble.color}></span>{bubble.name}
            </button>
          {/each}
        </div>
        <span class="small faint">{t().whoAsksHint(SUPPORTERS_NEEDED)}</span>
      </div>

      <div class="field">
        <label for="to">{t().toWhom}</label>
        {#if target || newName}
          <div class="row">
            {#if target}
              <span class="bub grow" style:--c={target.color}>{target.name}</span>
            {:else}
              <span class="grow"><b>{newName}</b> <span class="faint small">· {t().notHereYet}</span></span>
            {/if}
            <button type="button" class="textbtn" onclick={clearTarget}>{t().change}</button>
          </div>
        {:else}
          <input id="to" class="input" placeholder={t().searchBubble} bind:value={query} autocomplete="off" />
          {#if query.trim().length >= 2}
            <div class="card stack small results">
              {#each found as bubble (bubble.id)}
                <button type="button" class="result row" onclick={() => pick(bubble)}>
                  <span class="bub" style:--c={bubble.color}>{bubble.name}</span>
                  <span class="faint grow">· {t().members(bubble.members)}</span>
                </button>
              {/each}
              {#if found.length}<div class="hr"></div>{/if}
              <span class="muted">{t().notFoundInvite}</span>
              <div>
                <Button small variant="secondary" onclick={() => (newName = query.trim())}>
                  {t().createAndInvite(query.trim())}
                </Button>
              </div>
            </div>
          {/if}
        {/if}
      </div>

      <div class="field">
        <label for="question">{t().yourQuestion}</label>
        <textarea id="question" class="input short" maxlength="200" required placeholder={t().questionPlaceholder} bind:value={question}></textarea>
      </div>
      <div class="field">
        <label for="details">{t().details}</label>
        <textarea id="details" class="input" maxlength="2000" placeholder={t().detailsPlaceholder} bind:value={details}></textarea>
      </div>

      <div class="field">
        <span class="label">{t().format}</span>
        <div class="stack options">
          {#each FORMATS as name (name)}
            <button type="button" class="opt" class:on={format === name} aria-pressed={format === name} onclick={() => (format = name)}>
              <b>{t().formatShort[name]}</b> <span class="muted small">· {t().formatHint[name]}</span>
            </button>
          {/each}
        </div>
      </div>
      {#if format === 'onsite'}
        <div class="field">
          <label for="place">{t().place}</label>
          <input id="place" class="input" maxlength="200" placeholder={t().placePlaceholder} bind:value={place} />
        </div>
      {/if}

      <div class="row wrap two">
        <div class="field grow">
          <label for="starts">{format === 'written' ? t().startDate : t().date}</label>
          <input id="starts" class="input" type="datetime-local" required bind:value={startsAt} />
        </div>
        <div class="field">
          <span class="label">{t().seatsPerSide}</span>
          <div class="seg">
            {#each [3, 4, 5, 6] as n (n)}
              <button type="button" class:on={seats === n} onclick={() => (seats = n)}>{n} + {n}</button>
            {/each}
          </div>
        </div>
      </div>

      <div class="row wrap">
        <Button type="submit" loading={sending} disabled={!fromId}>{t().sendForSupport(from?.name ?? '')}</Button>
      </div>
    </form>
  {/if}
</div>

<style>
  .form {
    gap: 18px;
  }
  .short {
    min-height: 70px;
  }
  .options {
    gap: 8px;
  }
  .results {
    gap: 6px;
    padding: 10px;
  }
  .result {
    padding: 4px 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .two {
    align-items: flex-end;
    gap: 16px;
  }
</style>
