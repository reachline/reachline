<script lang="ts">
  // The left edge of a panel on the right: drag it or use the arrow keys to
  // resize. A click without dragging switches between the usual width and a
  // wide one, so it can be done without dragging (WCAG 2.5.7).
  interface Props {
    width: number;
    min: number;
    max: number;
    usual: number;
    wide: number;
  }
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment -- $bindable() is how Svelte marks a prop bindable
  let { width = $bindable(), min, max, usual, wide }: Props = $props();

  let drag: { x: number; w: number; moved: boolean } | null = null;

  const clamp = (w: number) => Math.round(Math.min(max, Math.max(min, w)));

  function down(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { x: e.clientX, w: Math.min(width, max), moved: false };
  }

  function move(e: PointerEvent) {
    if (!drag) return;
    const dx = drag.x - e.clientX;
    drag.moved ||= Math.abs(dx) > 3;
    if (drag.moved) width = clamp(drag.w + dx);
  }

  function up() {
    if (drag && !drag.moved) width = clamp(width < wide ? wide : usual);
    drag = null;
  }

  function onkeydown(e: KeyboardEvent) {
    const step = e.shiftKey ? 80 : 20;
    const to: Record<string, number> = { ArrowLeft: width + step, ArrowRight: width - step, Home: max, End: min };
    if (!(e.key in to)) return;
    e.preventDefault();
    width = clamp(to[e.key]);
  }
</script>

<!-- A focusable separator is a widget (it's how ARIA marks up a resize handle). -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="resizer"
  role="separator"
  aria-orientation="vertical"
  aria-label="Panel width"
  aria-valuenow={Math.min(width, max)}
  aria-valuemin={min}
  aria-valuemax={max}
  tabindex="0"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={() => (drag = null)}
  {onkeydown}
></div>

<style>
  .resizer {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -4px;
    z-index: 5;
    width: 8px;
    cursor: col-resize;
    touch-action: none;
  }
  .resizer:hover {
    background: linear-gradient(to right, transparent 3px, var(--accent) 3px 5px, transparent 5px);
  }
</style>
