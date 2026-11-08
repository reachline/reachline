<script lang="ts">
  // A kind's icon, as the graph draws it, sized like a Lucide icon. Beside the
  // kind's name or a thing's id, so it's decorative. Nothing for what isn't a
  // kind (unknown, an id that isn't a thing, a scenario's kind).
  import { KIND_ICONS } from '../graph/shapes';

  let { kind }: { kind: unknown } = $props();
  const icon = $derived(
    typeof kind === 'string' && Object.hasOwn(KIND_ICONS, kind) ? KIND_ICONS[kind as keyof typeof KIND_ICONS] : '',
  );
</script>

{#if icon}
  <svg
    class="lucide kind-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- Lucide's markup, a constant in shapes.ts -->
    {@html icon}
  </svg>
{/if}
