<script lang="ts">
  import { encode } from 'uqr';
  import { t } from '$lib/i18n';
  import { cancelNostr, nostrDialog, pickExtension, pickSignerApp } from '$lib/nostr.svelte';
  import Button from './Button.svelte';

  let dialog: HTMLDialogElement;
  let copied = $state(false);

  $effect(() => {
    if (nostrDialog.step === 'closed') dialog.close();
    else if (!dialog.open) dialog.showModal();
  });

  // The nostrconnect:// code as one SVG path, a square per dark module
  const qr = $derived.by(() => {
    if (!nostrDialog.uri) return null;
    const { data, size } = encode(nostrDialog.uri, { border: 2 });
    let path = '';
    data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) path += `M${x} ${y}h1v1h-1z`;
      });
    });
    return { path, size };
  });

  async function copy() {
    await navigator.clipboard.writeText(nostrDialog.uri);
    copied = true;
  }
</script>

<dialog bind:this={dialog} onclose={cancelNostr} aria-labelledby="nostr-title">
  <button type="button" class="close" aria-label={t().close} onclick={cancelNostr}>×</button>
  <h2 id="nostr-title">{t().nostrDialogTitle}</h2>
  <p class="muted">{t().nostrDialogText}</p>
  {#if nostrDialog.step === 'choose'}
    <button type="button" class="opt" onclick={pickExtension}>{t().nostrExtension}</button>
    {#if nostrDialog.noExtension}<p class="small hint">{t().nostrNoExtension}</p>{/if}
    <button type="button" class="opt" onclick={pickSignerApp}>{t().nostrSigner}</button>
  {:else if nostrDialog.step === 'connect' && qr}
    <p>{t().nostrScan}</p>
    <svg class="qr" viewBox="0 0 {qr.size} {qr.size}" role="img" aria-label={t().nostrSigner}><path d={qr.path} /></svg>
    <Button href={nostrDialog.uri} variant="nostr" block>{t().nostrOpenApp}</Button>
    <Button variant="secondary" block onclick={copy}>{copied ? t().linkCopied : t().copy}</Button>
    <p class="row muted small"><span class="spinner"></span>{t().nostrWaiting}</p>
  {:else if nostrDialog.step === 'confirm'}
    <p class="row"><span class="spinner"></span>{t().nostrConfirm}</p>
  {/if}
</dialog>

<style>
  dialog {
    width: min(400px, calc(100% - 2rem));
    padding: 1.5rem;
    border: none;
    border-radius: 20px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 8px 30px rgb(0 0 0 / 0.15);
  }
  dialog[open] {
    display: grid;
    gap: 12px;
  }
  dialog::backdrop {
    background: rgb(14 13 18 / 0.35);
  }
  @media (max-width: 640px) {
    dialog {
      width: 100%;
      max-width: none;
      max-height: 90dvh;
      margin: auto 0 0;
      border-radius: 20px 20px 0 0;
    }
  }
  h2 {
    padding-right: 2rem;
  }
  .close {
    position: absolute;
    top: 0.75rem;
    right: 1rem;
    border: none;
    background: none;
    color: var(--muted);
    font-size: 1.5rem;
    cursor: pointer;
  }
  .hint {
    color: var(--error);
  }
  .qr {
    width: min(240px, 100%);
    justify-self: center;
    border-radius: 12px;
    background: #fff;
  }
  .qr path {
    fill: #17171a;
  }
  .spinner {
    flex: none;
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
