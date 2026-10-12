<script lang="ts">
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import { toast } from '$lib/toast.svelte';

  let { token }: { token: string } = $props();
  const url = $derived(`${page.url.origin}/join/${token}`);

  async function copy() {
    await navigator.clipboard.writeText(url);
    toast(t().linkCopied);
  }
</script>

<div class="row">
  <input class="input grow" readonly value={url} aria-label={t().inviteLink} onfocus={(e) => e.currentTarget.select()} />
  <button type="button" class="chip" onclick={copy}>{t().copy}</button>
</div>
