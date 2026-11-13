<script lang="ts" module>
  export interface PickerRow {
    id: string;
    /** Shown instead of the id, as for "none". */
    label?: string;
    summary?: string;
  }
  export interface PickerGroup {
    name?: string;
    /** A kind of thing, whose icon goes beside the name. */
    kind?: string;
    rows: PickerRow[];
  }
</script>

<script lang="ts">
  // A choice in the toolbar: a button opening a menu of rows, in groups. One
  // row is chosen (pressed), and choosing closes the menu; or, with
  // `multiple`, any number are (checked), and the menu stays open.
  import { ChevronsUpDown } from '@lucide/svelte';
  import { tick } from 'svelte';
  import KindIcon from './KindIcon.svelte';

  interface Props {
    label: string;
    groups: PickerGroup[];
    chosen: string[];
    multiple?: boolean;
    /** What the button says with nothing chosen. */
    none?: string;
    /** A box to narrow the rows by name, for long lists. */
    filter?: boolean;
    onchoose: (id: string, on: boolean) => void;
  }
  let { label, groups, chosen, multiple = false, none = 'none', filter = false, onchoose }: Props = $props();

  const uid = $props.id();
  let menu = $state<HTMLElement>();
  let list = $state<HTMLElement>();
  let query = $state('');

  const rows = $derived(groups.flatMap((g) => g.rows));
  const value = $derived(
    rows
      .filter((r) => chosen.includes(r.id))
      .map((r) => r.label ?? r.id)
      .join(' + ') || none,
  );
  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, rows: g.rows.filter((r) => (r.label ?? r.id).toLowerCase().includes(q)) }))
      .filter((g) => g.rows.length);
  });

  function choose(id: string) {
    menu?.hidePopover();
    onchoose(id, true);
  }

  // Opening starts at the filter, with a pointer (on touch it would bring up
  // the keyboard), or else at the row that's chosen.
  async function ontoggle(e: ToggleEvent) {
    if (e.newState !== 'open') {
      query = '';
      if (menu) menu.style.width = '';
      return;
    }
    await tick();
    // Held at the width it opens at, so it doesn't narrow as the filter hides rows.
    if (menu) menu.style.width = `${menu.getBoundingClientRect().width}px`;
    const box = menu?.querySelector<HTMLElement>('input[type=search]');
    const at = list?.querySelector<HTMLElement>('[aria-pressed=true], :checked') ?? list?.querySelector('.row');
    // Scrolls the list alone: scrollIntoView() and focus() would scroll the page too.
    if (at && list) list.scrollTop = at.offsetTop - list.offsetTop - (list.clientHeight - at.offsetHeight) / 2;
    if (box && matchMedia('(pointer: fine)').matches) box.focus({ preventScroll: true });
    else at?.focus({ preventScroll: true });
  }

  function onkeydown(e: KeyboardEvent) {
    const first = shown.at(0)?.rows.at(0);
    if (e.key !== 'Enter' || multiple || !first) return;
    e.preventDefault();
    choose(first.id);
  }
</script>

<span class="picker">
  <span id="{uid}-label">{label}</span>
  <button id="{uid}-button" popovertarget="{uid}-menu" aria-labelledby="{uid}-label {uid}-button"
    ><span class="value mono">{value}</span><ChevronsUpDown /></button
  >
</span>
<div id="{uid}-menu" class="menu" popover bind:this={menu} {ontoggle}>
  {#if filter}
    <label class="field filter">Filter <input type="search" bind:value={query} {onkeydown} /></label>
  {/if}
  <div class="rows" bind:this={list}>
    {#each shown as g, i (g.name ?? i)}
      <div role="group" aria-labelledby={g.name ? `${uid}-g${i}` : undefined}>
        {#if g.name}<h3 id="{uid}-g{i}"><KindIcon kind={g.kind} />{g.name}</h3>{/if}
        {#each g.rows as r (r.id)}
          {#if multiple}
            <label class="row"
              ><input
                type="checkbox"
                checked={chosen.includes(r.id)}
                onchange={(e) => onchoose(r.id, e.currentTarget.checked)}
              />{@render text(r)}</label
            >
          {:else}
            <button class="quiet row" aria-pressed={chosen.includes(r.id)} onclick={() => choose(r.id)}
              >{@render text(r)}</button
            >
          {/if}
        {/each}
      </div>
    {:else}
      <p class="muted">Nothing matches.</p>
    {/each}
  </div>
</div>

{#snippet text(r: PickerRow)}
  <span class="text">
    <span class="mono name">{r.label ?? r.id}</span>
    {#if r.summary}<span class="muted">{r.summary}</span>{/if}
  </span>
{/snippet}

<style>
  .picker {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    font-weight: 500;
  }
  /* A long name, or several, shouldn't push the toolbar onto two rows. */
  .picker button {
    max-width: 12rem;
    font-weight: 400;
  }
  .value {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* As wide as its rows, up to a width where long summaries wrap. */
  .menu {
    width: max-content;
    max-width: min(22rem, calc(100vw - 2 * var(--space-4)));
    gap: var(--space-1);
  }
  h3 {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .filter {
    padding: var(--space-1) var(--space-2) var(--space-2);
  }
  .rows {
    display: grid;
    gap: var(--space-1);
    max-height: min(24rem, 60vh);
    overflow-y: auto;
  }
  /* A block of its own: inline, a group's rows would all be on one line at its widest. */
  .row {
    display: flex;
    width: 100%;
    padding-block: var(--space-1);
    text-align: left;
    white-space: normal;
  }
  .text {
    display: grid;
  }
  .name {
    font-weight: 600;
  }
  .text .muted {
    font-size: var(--text-sm);
  }
  p {
    padding: var(--space-1) var(--space-3);
  }
</style>
