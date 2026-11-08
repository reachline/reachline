<script lang="ts">
  // A choice of kind, each with its icon, in the same list the id fields
  // suggest from. A <select> can't show icons in its list, so this is the
  // select-only combobox of the WAI-ARIA APG, on a <button>. Name it with
  // aria-labelledby; other attributes go to the button too.
  import { ChevronDown } from '@lucide/svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import KindIcon from '../shell/KindIcon.svelte';

  interface Props extends Omit<HTMLButtonAttributes, 'value' | 'onchange'> {
    value: string;
    options: readonly string[];
    'aria-labelledby': string;
    /** What it says with no value. */
    placeholder?: string;
    onchange: (value: string) => void;
  }
  let { value, options, 'aria-labelledby': labelledby, placeholder = '', onchange, ...rest }: Props = $props();

  const uid = $props.id();
  let open = $state(false);
  let active = $state(0);
  let list = $state<HTMLElement>();

  // In the top layer, so a dialog can't clip it; anchored under the button.
  $effect(() => {
    if (open) list?.showPopover();
    else if (list?.matches(':popover-open')) list.hidePopover();
  });

  function show(at = options.indexOf(value)) {
    open = true;
    active = Math.max(at, 0);
  }

  function choose(i: number) {
    open = false;
    if (options[i] !== value) onchange(options[i]);
  }

  // The next option starting with a letter typed, after the one it's on.
  function seek(key: string): number {
    const from = (open ? active : options.indexOf(value)) + 1;
    for (let n = 0; n < options.length; n++) {
      const i = (from + n) % options.length;
      if (options[i].startsWith(key.toLowerCase())) return i;
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
    <KindIcon kind={value} /><span class:muted={!value}>{value || placeholder}</span><ChevronDown />
  </button>
  <ul
    class="listbox"
    id="{uid}-list"
    role="listbox"
    aria-labelledby={labelledby}
    popover="manual"
    style:position-anchor="--{uid}"
    bind:this={list}
  >
    {#each options as k, i (k)}
      <!-- Pressed, not clicked, so the button keeps its focus. -->
      <li
        id="{uid}-option-{i}"
        role="option"
        aria-selected={i === active}
        onpointerdown={(e) => {
          e.preventDefault();
          choose(i);
        }}
      >
        <KindIcon kind={k} />{k}
      </li>
    {/each}
  </ul>
</div>
