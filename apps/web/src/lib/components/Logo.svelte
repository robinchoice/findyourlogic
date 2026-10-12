<script lang="ts">
  let { size = 26 }: { size?: number } = $props();
</script>

<img src="/favicon.svg" alt="" width={size} height={size} />

<style>
  img {
    flex: none;
    border-radius: 24%;
  }
</style>
