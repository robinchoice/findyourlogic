<script lang="ts">
  import type { Person } from '@app/shared';
  import { initials, personColor } from '$lib/format';

  let { person, small = false }: { person: Person; small?: boolean } = $props();
</script>

<span class="av" class:small style:background={personColor(person.id)} title={person.name}>{initials(person.name)}</span>

<style>
  .av {
    display: grid;
    flex: none;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
  }
  .small {
    width: 26px;
    height: 26px;
    font-size: 11px;
  }
</style>
