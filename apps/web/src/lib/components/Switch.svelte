<script lang="ts">
  let { on, label, onchange }: { on: boolean; label: string; onchange: (on: boolean) => void } = $props();
</script>

<button type="button" role="switch" aria-checked={on} aria-label={label} class:on onclick={() => onchange(!on)}></button>

<style>
  button {
    position: relative;
    flex: none;
    width: 42px;
    height: 24px;
    border: 0;
    border-radius: 99px;
    background: var(--border);
    cursor: pointer;
  }
  button::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--surface);
    transition: left 0.15s;
  }
  .on {
    background: var(--gradient);
  }
  .on::after {
    left: 21px;
  }
</style>
