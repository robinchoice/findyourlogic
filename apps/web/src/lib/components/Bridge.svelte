<script lang="ts">
  import type { BubbleRef } from '@app/shared';

  // Two bubbles joined by a dashed arrow: who asks whom
  let { from, to }: { from: BubbleRef; to: BubbleRef } = $props();
</script>

<div class="bridge">
  <span class="bub" style:--c={from.color}>{from.name}</span>
  <span class="line" aria-hidden="true"></span>
  <span class="bub" style:--c={to.color}>{to.name}</span>
</div>

<style>
  .bridge {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .line {
    position: relative;
    flex: 0 0 34px;
    height: 2px;
    background: repeating-linear-gradient(90deg, var(--text) 0 5px, transparent 5px 9px);
  }
  .line::after {
    content: '';
    position: absolute;
    top: -4px;
    right: -2px;
    border: 5px solid transparent;
    border-right: 0;
    border-left: 7px solid var(--text);
  }
</style>
