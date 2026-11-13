<script lang="ts">
  // Where edits go: the model, or one of its plans. Add and every form write
  // there, so it shows wherever there's a choice: in the header, or on phones
  // in the toolbar's folded row.
  import Picker from './Picker.svelte';

  interface Props {
    plans: { name: string; note: string }[];
    /** The plan edits go into; none, and they go into the model. */
    layer: string | null;
    onchoose: (layer: string | null) => void;
  }
  let { plans, layer, onchoose }: Props = $props();

  const groups = $derived([
    {
      rows: [
        { id: '', label: 'the model' },
        ...plans.map((p) => ({ id: p.name, label: `plan ${p.name}`, summary: p.note || undefined })),
      ],
    },
  ]);
</script>

<!-- In the accent while edits go into a plan, rather than the model. -->
<span class:plan={layer !== null}>
  <Picker label="Edits go into" {groups} chosen={[layer ?? '']} onchoose={(id: string) => onchoose(id || null)} />
</span>

<style>
  .plan :global(.picker button) {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
