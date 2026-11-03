<script lang="ts">
  import { formatearUsd } from '../../../core/dinero/dinero';

  let { saldoUsd }: { saldoUsd: number } = $props();
</script>

{#if saldoUsd > 0}
  <span class="chip chip-agotado num">Debe {formatearUsd(saldoUsd)}</span>
{:else if saldoUsd < 0}
  <span class="chip chip-normal num">A favor {formatearUsd(-saldoUsd)}</span>
{:else}
  <span class="chip">Al día</span>
{/if}
