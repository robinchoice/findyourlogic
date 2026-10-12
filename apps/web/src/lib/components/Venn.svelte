<script lang="ts">
  import type { Venn } from '@app/shared';
  import { t } from '$lib/i18n';

  // Up to three circles with the counts of discoverable people per region
  let { venn }: { venn: Venn } = $props();

  const CIRCLES = [
    { cx: 160, cy: 120 },
    { cx: 280, cy: 120 },
    { cx: 220, cy: 205 },
  ];
  // Where each region's count sits, by bitmask
  const SPOTS: Record<number, [number, number]> = {
    1: [110, 95],
    2: [330, 95],
    4: [220, 262],
    3: [220, 92],
    5: [158, 192],
    6: [282, 192],
    7: [220, 152],
  };
  const LABELS: [number, number, 'start' | 'end' | 'middle'][] = [
    [70, 18, 'start'],
    [370, 18, 'end'],
    [220, 318, 'middle'],
  ];
  const n = (mask: number) => venn.regions[mask] ?? 0;
  const total = (i: number) =>
    Object.entries(venn.regions).reduce((sum, [mask, count]) => (Number(mask) & (1 << i) ? sum + count : sum), 0);
  const full = $derived((1 << venn.traits.length) - 1);
  const masks = $derived(Object.keys(SPOTS).map(Number).filter((m) => (m & full) === m));
  // With two circles their overlap sits in the middle between them
  const spot = (mask: number): [number, number] => (mask === 3 && venn.traits.length === 2 ? [220, 127] : SPOTS[mask]!);
  const fill = (i: number) => venn.traits[i]?.color ?? ['#5b8a32', '#6a4cc2', '#2c5fae'][i]!;
</script>

<svg class="venn" viewBox="0 0 440 325" role="img" aria-label={t().vennLabel}>
  {#each venn.traits as trait, i (trait.key)}
    <circle cx={CIRCLES[i]!.cx} cy={CIRCLES[i]!.cy} r="95" fill={fill(i)} fill-opacity=".18" stroke={fill(i)} stroke-width="2" />
    <text x={LABELS[i]![0]} y={LABELS[i]![1]} text-anchor={LABELS[i]![2]}>{trait.label} · {total(i)}</text>
  {/each}
  {#each masks as mask (mask)}
    {#if mask === full && venn.traits.length > 1}
      <circle cx={spot(mask)[0]} cy={spot(mask)[1] - 7} r="24" fill="#17171a" />
      <text class="n center" x={spot(mask)[0]} y={spot(mask)[1]} text-anchor="middle">{n(mask)}</text>
    {:else}
      <text class="n" x={spot(mask)[0]} y={spot(mask)[1]} text-anchor="middle">{n(mask)}</text>
    {/if}
  {/each}
</svg>

<style>
  .venn {
    display: block;
    width: 100%;
    max-width: 440px;
    margin: 0 auto;
  }
  text {
    fill: var(--text);
    font: 650 12px system-ui;
  }
  .n {
    font: 800 20px var(--font-display);
  }
  .center {
    fill: #fff;
  }
</style>
