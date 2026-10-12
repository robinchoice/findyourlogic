<script lang="ts">
  import { PHASES, type Round, type Side } from '@app/shared';
  import { page } from '$app/state';
  import { api } from '$lib/api';
  import Avatar from '$lib/components/Avatar.svelte';
  import Bridge from '$lib/components/Bridge.svelte';
  import Button from '$lib/components/Button.svelte';
  import { formatDate } from '$lib/format';
  import { t } from '$lib/i18n';

  let round = $state<Round | null>(null);
  let missing = $state(false);
  let message = $state('');
  let video = $state('');
  let summary = $state('');
  let busy = $state(false);

  const other = (side: Side): Side => (side === 'from' ? 'to' : 'from');
  const bubbleOf = (side: Side) => (side === 'from' ? round!.from : round!.to);
  const ours = $derived(round?.summaries.find((s) => s.side === round!.mySide));
  const theirs = $derived(round?.summaries.find((s) => s.side !== round!.mySide));
  const phaseIndex = $derived(round ? PHASES.indexOf(round.phase) : 0);

  function show(next: Round) {
    round = next;
    video = next.videoUrl;
    summary = next.summaries.find((s) => s.side === next.mySide)?.body ?? summary;
  }

  $effect(() => {
    api
      .get<{ round: Round }>(`/rounds/${page.params.id}`, true)
      .then((res) => show(res.round))
      .catch(() => (missing = true));
  });

  async function run(call: () => Promise<{ round: Round }>) {
    busy = true;
    try {
      show((await call()).round);
      return true;
    } catch {
      // The API client already shows the error as a toast
      return false;
    } finally {
      busy = false;
    }
  }

  const path = () => `/rounds/${page.params.id}`;

  async function send(e: SubmitEvent) {
    e.preventDefault();
    if (await run(() => api.post(`${path()}/messages`, { body: message }))) message = '';
  }
</script>

<div class="page">
  <a class="back" href="/rounds">← {t().navRounds}</a>
  {#if missing}
    <p class="muted">{t().notParticipant}</p>
  {:else if round}
    <Bridge from={round.from} to={round.to} />
    <h1>{t().quoted(round.question)}</h1>
    <div class="meta">
      <span>{t().formatShort[round.format]}</span>
      <span>{formatDate(round.startsAt)}</span>
      {#if round.place}<span>{round.place}</span>{/if}
    </div>

    {#if round.doneAt}
      <div class="card done stack">
        <b>{t().roundDoneTitle}</b>
        <span class="small muted">{t().roundDoneText}</span>
      </div>
    {:else}
      <div class="seg phases">
        {#each PHASES as phase, i (phase)}
          <span class:on={round.phase === phase}>{i + 1} · {t().phaseName[phase]}</span>
        {/each}
      </div>
      <div class="card small">
        <div class="caps">{t().guideQuestion}</div>
        <p class="guide">{t().phaseGuide[round.phase]}</p>
      </div>
    {/if}

    {#if round.format !== 'onsite' && !round.doneAt}
      <div class="row">
        {#if round.videoUrl}
          <a class="chip" href={round.videoUrl} target="_blank" rel="noopener noreferrer">{t().openVideo} ↗</a>
        {/if}
        <input class="input grow" type="url" placeholder={t().videoPlaceholder} aria-label={t().videoLink} bind:value={video} />
        <Button small variant="secondary" disabled={video === round.videoUrl} onclick={() => run(() => api.patch(path(), { videoUrl: video.trim() }))}>
          {t().save}
        </Button>
      </div>
    {/if}

    <div class="stack messages">
      {#each round.messages as msg, i (msg.id)}
        {#if i === 0 || round.messages[i - 1]!.phase !== msg.phase}
          <div class="caps">{PHASES.indexOf(msg.phase) + 1} · {t().phaseName[msg.phase]}</div>
        {/if}
        <div class="msg">
          <Avatar person={msg.author} small />
          <div>
            <div class="small"><b>{msg.author.name}</b> <span class="faint">· {bubbleOf(msg.side).name}</span></div>
            <div class="bubble-t">{msg.body}</div>
          </div>
        </div>
      {:else}
        <p class="small faint">{t().noMessagesYet}</p>
      {/each}
    </div>

    {#if !round.doneAt}
      <form class="row" onsubmit={send}>
        <input class="input grow" maxlength="2000" required placeholder={t().messagePlaceholder[round.phase]} aria-label={t().message} bind:value={message} />
        <Button type="submit" loading={busy}>{t().send}</Button>
      </form>
    {/if}

    {#if round.phase === 'summary' || round.doneAt}
      <div class="sums">
        <div class="card stack" style:--c={bubbleOf(other(round.mySide!)).color}>
          <div class="caps">{t().ourSummary(bubbleOf(other(round.mySide!)).name)}</div>
          {#if round.doneAt}
            <p class="body">{ours?.body}</p>
          {:else}
            <textarea class="input" maxlength="2000" placeholder={t().summaryPlaceholder} aria-label={t().ourSummary(bubbleOf(other(round.mySide!)).name)} bind:value={summary}></textarea>
            <div><Button small loading={busy} disabled={summary.trim().length < 10 || summary === ours?.body} onclick={() => run(() => api.put(`${path()}/summary`, { body: summary }))}>{t().save}</Button></div>
          {/if}
          <span class="small" class:ok={ours?.confirmedBy}>
            {ours?.confirmedBy ? t().confirmedBy(ours.confirmedBy) : ours ? t().waitsForConfirm(bubbleOf(other(round.mySide!)).name) : ''}
          </span>
        </div>
        <div class="card stack">
          <div class="caps">{t().theirSummary(bubbleOf(other(round.mySide!)).name)}</div>
          {#if theirs}
            <p class="body">{theirs.body}</p>
            {#if theirs.confirmedBy}
              <span class="small ok">{t().confirmedBy(theirs.confirmedBy)}</span>
            {:else}
              <div><Button small loading={busy} onclick={() => run(() => api.post(`${path()}/summary/${other(round!.mySide!)}/confirm`))}>{t().thatsHowWeSeeIt}</Button></div>
            {/if}
          {:else}
            <p class="small faint">{t().notWrittenYet}</p>
          {/if}
        </div>
      </div>
    {:else}
      <div class="steel stack small">
        <b>{t().nextPhase}: {t().phaseName[PHASES[phaseIndex + 1]!]}</b>
        <span class="muted">{t().summaryAhead(bubbleOf(other(round.mySide!)).name)}</span>
        <div>
          <Button small variant="secondary" loading={busy} onclick={() => run(() => api.patch(path(), { phase: PHASES[phaseIndex + 1] }))}>
            {t().goToPhase(phaseIndex + 2)}
          </Button>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .phases span {
    padding: 6px 12px;
    border-radius: 999px;
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
  }
  .phases span.on {
    color: var(--bg);
  }
  .guide {
    margin-top: 4px;
    font-weight: 600;
  }
  .messages {
    gap: 10px;
  }
  .msg {
    display: grid;
    grid-template-columns: 30px 1fr;
    gap: 10px;
  }
  .bubble-t {
    padding: 9px 12px;
    border: 1px solid var(--line);
    border-radius: 4px 14px 14px;
    background: var(--surface);
    white-space: pre-line;
  }
  .steel {
    padding: 14px;
    border: 1.5px dashed var(--border);
    border-radius: 12px;
  }
  .sums {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .body {
    white-space: pre-line;
  }
  .ok {
    color: var(--new);
    font-weight: 600;
  }
  .done {
    border-color: var(--new-bg);
    background: color-mix(in srgb, var(--new-bg) 12%, var(--surface));
  }
  @media (max-width: 700px) {
    .sums {
      grid-template-columns: 1fr;
    }
  }
</style>
