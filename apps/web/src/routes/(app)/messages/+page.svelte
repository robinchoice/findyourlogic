<script lang="ts">
  import type { Conversation } from '@app/shared';
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import Avatar from '$lib/components/Avatar.svelte';
  import { formatDate } from '$lib/format';
  import { t } from '$lib/i18n';

  let conversations = $state<Conversation[] | null>(null);
  onMount(async () => {
    conversations = (await api.get<{ conversations: Conversation[] }>('/messages')).conversations;
  });
</script>

<div class="page">
  <h1>{t().navMessages}</h1>
  {#if conversations}
    <div class="stack">
      {#each conversations as conversation (conversation.person.id)}
        <a class="card row" href="/messages/{conversation.person.id}">
          <Avatar person={conversation.person} />
          <span class="grow">
            <b>{conversation.person.name}</b>
            <span class="small muted last">{conversation.last}</span>
          </span>
          <span class="small faint">{formatDate(conversation.lastAt)}</span>
          {#if conversation.unread}<span class="badge new">{conversation.unread}</span>{/if}
        </a>
      {:else}
        <p class="muted">{t().noMessages}</p>
      {/each}
    </div>
  {/if}
</div>

<style>
  .last {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
