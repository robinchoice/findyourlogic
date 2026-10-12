<script lang="ts">
  import { t } from '$lib/i18n';
</script>

<div class="card stack small">
  <b>{t().rulesTitle}</b>
  {#each t().rules as rule, i (i)}
    <div class="rule"><b>{i + 1}</b><span>{rule}</span></div>
  {/each}
</div>

<style>
  .rule {
    display: grid;
    grid-template-columns: 22px 1fr;
    gap: 8px;
  }
  .rule b {
    font-family: var(--font-display);
  }
</style>
