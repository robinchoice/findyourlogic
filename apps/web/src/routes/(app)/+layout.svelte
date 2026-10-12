<script lang="ts">
  import { APP_NAME } from '@app/shared';
  import { onMount } from 'svelte';
  import { afterNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { auth, checkAuth, logout } from '$lib/auth.svelte';
  import { badges, refreshBadges } from '$lib/badges.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import Button from '$lib/components/Button.svelte';
  import Feedback from '$lib/components/Feedback.svelte';
  import Logo from '$lib/components/Logo.svelte';
  import { openFeedback } from '$lib/feedback.svelte';
  import { t } from '$lib/i18n';

  let { children } = $props();
  let ready = $state(false);

  onMount(async () => {
    await checkAuth();
    if (!auth.user) {
      // Come back to the requested page after logging in
      goto(`/login?next=${encodeURIComponent(page.url.pathname + page.url.search)}`, { replaceState: true });
      return;
    }
    ready = true;
    if (!auth.user.onboarded && page.url.pathname !== '/welcome') {
      goto(`/welcome?next=${encodeURIComponent(page.url.pathname + page.url.search)}`, { replaceState: true });
    }
  });

  afterNavigate(() => {
    if (auth.user) refreshBadges();
  });

  const nav = $derived([
    { href: '/requests', label: t().navRequests, count: badges.requests, icon: 'requests' },
    { href: '/matches', label: t().navMatches, count: badges.newMatches, icon: 'matches', isNew: true },
    { href: '/rounds', label: t().navRounds, count: 0, icon: 'rounds' },
    { href: '/messages', label: t().navMessages, count: badges.unread, icon: 'messages' },
    { href: '/bubbles', label: t().navBubbles, count: badges.invitations, icon: 'bubbles' },
  ]);
  const active = (href: string) => page.url.pathname.startsWith(href);

  async function handleLogout() {
    await logout();
    goto('/');
  }
</script>

{#snippet icon(name: string)}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    {#if name === 'requests'}
      <circle cx="8" cy="12" r="5" /><circle cx="16" cy="12" r="5" />
    {:else if name === 'matches'}
      <circle cx="9" cy="10" r="6" /><circle cx="15" cy="10" r="6" /><circle cx="12" cy="15" r="6" />
    {:else if name === 'rounds'}
      <path d="M4 5h16v11H9l-5 4z" />
    {:else if name === 'messages'}
      <path d="M4 6h16v12H4z" /><path d="m4 7 8 6 8-6" />
    {:else}
      <circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    {/if}
  </svg>
{/snippet}

{#if ready && auth.user}
  <div class="app">
    <aside class="side">
      <a href="/requests" class="brand"><Logo />{APP_NAME}</a>
      {#each nav as item (item.href)}
        <a href={item.href} class="nav" class:on={active(item.href)} aria-current={active(item.href) ? 'page' : undefined}>
          {item.label}
          {#if item.count}<span class="badge" class:new={item.isNew}>{item.isNew ? t().new : item.count}</span>{/if}
        </a>
      {/each}
      <div class="spacer"></div>
      <Button href="/requests/new">+ {t().newRequest}</Button>
      <button type="button" class="textbtn feedback" onclick={() => openFeedback('idea')}>{t().giveFeedback}</button>
      <div class="me">
        <a href="/profile" class="row grow">
          <Avatar person={auth.user} />
          <span class="small grow">
            <b>{auth.user.name}</b>
            <span class="faint tiny">{[auth.user.email, auth.user.npub && 'Nostr'].filter(Boolean).join(' · ')}</span>
          </span>
        </a>
        <button type="button" class="textbtn" onclick={handleLogout}>{t().logOut}</button>
      </div>
    </aside>

    <main>
      <div class="phone-head">
        <a href="/requests" class="brand"><Logo size={22} />{APP_NAME}</a>
        <a href="/profile" aria-label={t().profile}><Avatar person={auth.user} small /></a>
      </div>
      {@render children()}
    </main>

    <nav class="tabs">
      {#each nav as item (item.href)}
        <a href={item.href} class="tab" class:on={active(item.href)}>
          {@render icon(item.icon)}
          {item.label}
          {#if item.count}<span class="dotbadge" class:new={item.isNew}></span>{/if}
        </a>
      {/each}
    </nav>
  </div>
  <Feedback />
{/if}

<style>
  .app {
    display: grid;
    grid-template-columns: 230px minmax(0, 1fr);
    min-height: 100%;
  }
  .side {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    height: 100dvh;
    padding: 20px 14px;
    border-right: 1px solid var(--line);
    background: #ececea;
  }
  .brand {
    display: flex;
    gap: 9px;
    align-items: center;
    padding: 0 8px 16px;
    font-family: var(--font-display);
    font-size: 21px;
    font-weight: 780;
    font-stretch: 78%;
    text-decoration: none;
  }
  .nav {
    position: relative;
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    padding: 9px 10px 9px 14px;
    border-radius: 10px;
    color: var(--muted);
    font-weight: 550;
    text-decoration: none;
  }
  .nav:hover {
    background: rgb(23 23 26 / 0.05);
    color: var(--text);
  }
  .nav.on {
    background: var(--surface);
    color: var(--text);
  }
  .nav.on::before {
    content: '';
    position: absolute;
    top: 8px;
    bottom: 8px;
    left: 4px;
    width: 3px;
    border-radius: 2px;
    background: var(--gradient);
  }
  .spacer {
    height: 10px;
  }
  .feedback {
    margin: 10px 0 0 10px;
    text-align: left;
  }
  .me {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: auto;
    padding: 12px 6px 0;
    border-top: 1px solid var(--line);
  }
  .me a {
    text-decoration: none;
  }
  .me .small {
    display: grid;
    overflow: hidden;
  }
  .me b {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tiny {
    overflow: hidden;
    font-size: 11.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  main {
    min-width: 0;
  }
  .phone-head,
  .tabs {
    display: none;
  }
  @media (max-width: 700px) {
    .app {
      grid-template-columns: 1fr;
    }
    /* Room for the tab bar below the footer */
    :global(.shell) {
      padding-bottom: 70px;
    }
    .side {
      display: none;
    }
    .phone-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px 0;
    }
    .phone-head .brand {
      padding: 0;
      font-size: 19px;
    }
    .tabs {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 5;
      display: flex;
      padding: 6px 4px 14px;
      border-top: 1px solid var(--line);
      background: var(--surface);
    }
    .tab {
      position: relative;
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      align-items: center;
      padding: 6px 2px;
      color: var(--muted);
      font-size: 11px;
      text-decoration: none;
    }
    .tab.on {
      color: var(--text);
    }
    .tab.on::before {
      content: '';
      position: absolute;
      top: -7px;
      right: 25%;
      left: 25%;
      height: 2px;
      background: var(--gradient);
    }
    .tab svg {
      width: 22px;
      height: 22px;
    }
    .dotbadge {
      position: absolute;
      top: 4px;
      right: calc(50% - 16px);
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--needs-bg);
    }
    .dotbadge.new {
      background: var(--new-bg);
    }
  }
</style>
