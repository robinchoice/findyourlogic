<script lang="ts">
  import type { DirectMessage, Person } from '@app/shared';
  import { page } from '$app/state';
  import { api } from '$lib/api';
  import { refreshBadges } from '$lib/badges.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import Button from '$lib/components/Button.svelte';
  import { formatDate } from '$lib/format';
  import { t } from '$lib/i18n';

  let person = $state<Person | null>(null);
  let messages = $state<DirectMessage[]>([]);
  let missing = $state(false);
  let body = $state('');
  let sending = $state(false);

  async function load() {
    const res = await api.get<{ person: Person; messages: DirectMessage[] }>(`/messages/${page.params.userId}`, true);
    person = res.person;
    messages = res.messages;
    refreshBadges();
  }

  $effect(() => {
    load().catch(() => (missing = true));
  });

  async function send(e: SubmitEvent) {
    e.preventDefault();
    sending = true;
    try {
      await api.post(`/messages/${page.params.userId}`, { body });
      body = '';
      await load();
    } catch {
      // The API client already shows the error as a toast
    } finally {
      sending = false;
    }
  }
</script>

<div class="page">
  <a class="back" href="/messages">← {t().navMessages}</a>
  {#if missing}
    <p class="muted">{t().cannotMessage}</p>
  {:else if person}
    <div class="row"><Avatar {person} /><h1>{person.name}</h1></div>
    <div class="stack thread">
      {#each messages as message (message.id)}
        <div class="msg" class:mine={message.mine}>
          <div class="text">{message.body}</div>
          <span class="tiny faint">{formatDate(message.createdAt)}</span>
        </div>
      {:else}
        <p class="small muted">{t().helloHint(person.name)}</p>
      {/each}
    </div>
    <form class="row" onsubmit={send}>
      <input class="input grow" required maxlength="2000" aria-label={t().message} placeholder={messages.length ? t().message : t().helloPlaceholder} bind:value={body} />
      <Button type="submit" loading={sending}>{t().send}</Button>
    </form>
  {/if}
</div>

<style>
  .thread {
    gap: 8px;
  }
  .msg {
    display: grid;
    gap: 2px;
    justify-items: start;
    max-width: 80%;
  }
  .msg.mine {
    justify-self: end;
    justify-items: end;
  }
  .text {
    padding: 9px 12px;
    border: 1px solid var(--line);
    border-radius: 4px 14px 14px;
    background: var(--surface);
    white-space: pre-line;
  }
  .mine .text {
    border-radius: 14px 4px 14px 14px;
    background: color-mix(in srgb, var(--new-bg) 22%, var(--surface));
  }
  .tiny {
    font-size: 11px;
  }
</style>
