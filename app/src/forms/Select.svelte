<script lang="ts">
  // A dropdown of our own, where a <select> can't show icons or headings in
  // its list: the select-only combobox of the WAI-ARIA APG, on a <button>.
  // Name it with aria-labelledby; other attributes go to the button too.
  import { ChevronDown } from '@lucide/svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import KindIcon from '../shell/KindIcon.svelte';
  import type { SelectGroup, SelectOption } from './select';

  interface Props extends Omit<HTMLButtonAttributes, 'value' | 'onchange'> {
    value: string;
    groups: SelectGroup[];
    'aria-labelledby': string;
    /** What it says with no value. */
    placeholder?: string;
    onchange: (value: string) => void;
  }
  let { value, groups, 'aria-labelledby': labelledby, placeholder = '', onchange, ...rest }: Props = $props();

  const uid = $props.id();
  let open = $state(false);
  let active = $state(0);
  let list = $state<HTMLElement>();

  // The arrow keys go through every group's options in turn.
  const options = $derived(groups.flatMap((g) => g.options));
  const indexed = $derived.by(() => {
    let i = 0;
    return groups.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o, i: i++ })) }));
  });
  const current = $derived(options.find((o) => o.value === value));
  const text = (o: SelectOption) => o.label ?? o.value;

  // In the top layer, so a dialog can't clip it; anchored under the button.
  $effect(() => {
    if (open) list?.showPopover();
    else if (list?.matches(':popover-open')) list.hidePopover();
  });
  // The option the arrow keys are on stays in view. Scrolls the list alone:
  // scrollIntoView() could scroll the dialog behind it too.
  $effect(() => {
    const at = open ? document.getElementById(`${uid}-option-${active}`) : null;
    if (!at || !list) return;
    if (at.offsetTop < list.scrollTop) list.scrollTop = at.offsetTop;
    else if (at.offsetTop + at.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = at.offsetTop + at.offsetHeight - list.clientHeight;
  });

  function show(at = options.findIndex((o) => o.value === value)) {
    open = true;
    active = Math.max(at, 0);
  }

  function choose(i: number) {
    open = false;
    if (options[i].value !== value) onchange(options[i].value);
  }

  // The next option starting with a letter typed, after the one it's on.
  function seek(key: string): number {
    const from = (open ? active : options.findIndex((o) => o.value === value)) + 1;
    for (let n = 0; n < options.length; n++) {
      const i = (from + n) % options.length;
      if (text(options[i]).toLowerCase().startsWith(key.toLowerCase())) return i;
    }
    return -1;
  }

  // Enter and Space are handled here, and their clicks stopped (onkeyup), so a click is the pointer's.
  function onkeydown(e: KeyboardEvent) {
    const last = options.length - 1;
    const to: Record<string, number> = open
      ? { ArrowDown: Math.min(active + 1, last), ArrowUp: Math.max(active - 1, 0), Home: 0, End: last }
      : { Home: 0, End: last };
    if (e.key in to) {
      e.preventDefault();
      if (open) active = to[e.key];
      else show(to[e.key]);
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (open) choose(active);
      else show();
    } else if (open && e.key === 'Tab') {
      choose(active);
    } else if (open && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      open = false;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = seek(e.key);
      if (i < 0) return;
      e.preventDefault();
      show(i);
    }
  }
</script>

<div class="combo">
  <button
    type="button"
    class="select"
    style:anchor-name="--{uid}"
    {...rest}
    role="combobox"
    aria-labelledby={labelledby}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls="{uid}-list"
    aria-activedescendant={open ? `${uid}-option-${active}` : undefined}
    onclick={() => (open ? (open = false) : show())}
    {onkeydown}
    onkeyup={(e) => {
      if (e.key === ' ') e.preventDefault();
    }}
    onblur={() => (open = false)}
  >
    <KindIcon kind={current?.kind} /><span class:muted={!current} class:mono={current?.mono}
      >{current ? text(current) : placeholder}</span
    ><ChevronDown />
  </button>
  <div
    class="listbox"
    id="{uid}-list"
    role="listbox"
    aria-labelledby={labelledby}
    popover="manual"
    style:position-anchor="--{uid}"
    bind:this={list}
  >
    {#each indexed as g, gi (gi)}
      {#if g.name}
        <div role="group" aria-labelledby="{uid}-group-{gi}">
          <div class="group" id="{uid}-group-{gi}" role="presentation"><KindIcon kind={g.kind} />{g.name}</div>
          {#each g.options as o (o.value)}{@render option(o, false)}{/each}
        </div>
      {:else}
        {#each g.options as o (o.value)}{@render option(o, true)}{/each}
      {/if}
    {/each}
  </div>
</div>

<!-- Under a heading, the heading has the icon. -->
{#snippet option(o: SelectOption & { i: number }, icon: boolean)}
  <!-- Pressed, not clicked, so the button keeps its focus. -->
  <div
    id="{uid}-option-{o.i}"
    role="option"
    tabindex="-1"
    class:mono={o.mono}
    aria-selected={o.i === active}
    onpointerdown={(e) => {
      e.preventDefault();
      choose(o.i);
    }}
  >
    {#if icon}<KindIcon kind={o.kind} />{/if}{text(o)}
  </div>
{/snippet}
