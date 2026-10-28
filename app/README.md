# ReachLine UI

**Svelte Flow** drawing an **ELK** layout of `data/model.yml`, or of
`examples/model.yml` when there's no `data/` (or with `?model=example`).
Localhost only.

    pnpm dev                 # http://127.0.0.1:5199
    node bench.ts            # ELK timings and expand-on-click stability
    pnpm check               # svelte-check

The page runs the engine (`../engine/`) on the model itself; Vite reads the
YAML from disk and reloads when it changes. `?plan=spare_key,backup` applies
plans from the model's `plans:` in order. `dist/` (from
`vite build`) has the whole model inside it and is gitignored.

URL parameters set the initial state, e.g.
`?target=mail&scenario=nas_dies&place=NETWORK_SIMPLEX`,
plus `plan=a,b`, `model=example`, `mode=where|all`, `dir=DOWN`, `routing=SPLINES`,
`select=id`, and `expand=a,b` (clicks those nodes open in turn).

Expanding a node places the new nodes in free space upstream without moving
anything; Tidy runs the full ELK layout from scratch.

- `src/data.ts`: loads model.yml, with any plans, through the engine into the
  shape the views use.
- `src/build.ts`: the views (where, ways into, everything) as nodes and edges,
  ported from the Mermaid builders. Junction ids are stable.
- `src/layout.ts`: the ELK layered layout, and in-place placement for expanding.
- `src/FlowView.svelte`, `src/flow/*`: Svelte Flow, drawing ELK's edge routes.
