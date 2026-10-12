<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant = 'primary',
    small = false,
    block = false,
    type = 'button',
    loading = false,
    disabled = false,
    href,
    onclick,
    children,
  }: {
    variant?: 'primary' | 'secondary' | 'nostr';
    small?: boolean;
    block?: boolean;
    type?: 'button' | 'submit';
    loading?: boolean;
    disabled?: boolean;
    href?: string;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  } = $props();
</script>

{#if href}
  <a {href} class="btn {variant}" class:small class:block>{@render children()}</a>
{:else}
  <button {type} class="btn {variant}" class:small class:block disabled={disabled || loading} {onclick}>
    {#if loading}<span class="spinner"></span>{/if}
    <span class="label" class:hidden={loading}>{@render children()}</span>
  </button>
{/if}

<style>
  .btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 40px;
    padding: 0 1.1rem;
    border: 1px solid transparent;
    border-radius: 999px;
    font: inherit;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .primary {
    background: var(--gradient);
    color: var(--text);
  }
  .small {
    height: 32px;
    padding: 0 0.8rem;
    font-size: 13px;
  }
  .block {
    width: 100%;
  }
  .nostr {
    background: #7b3fe4;
    color: #fff;
  }
  .secondary {
    background: var(--surface);
    border-color: var(--border);
    color: var(--text);
  }
  .spinner {
    position: absolute;
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  .label {
    display: inline-flex;
    gap: 8px;
    align-items: center;
  }
  .hidden {
    visibility: hidden;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
