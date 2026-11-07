# ReachLine UI

**Svelte Flow** drawing an **ELK** layout of a model loaded from the server
(`../server/`). Pages: `/login`, `/` (your models) and `/m/:id` (one model).

    pnpm dev                 # from the root: the server, and Vite at http://127.0.0.1:5199
    pnpm dev:reset           # from the root: a fresh .dev/ (sign in as dev / dev-password)
    node bench.ts            # ELK timings and expand-on-click stability, on examples/
    pnpm check               # svelte-check

The page runs the engine (`../engine/`) on the model's text itself; the server
only stores it. `?plan=spare_key,backup` applies plans from the model's
`plans:` in order.

URL parameters on `/m/:id` set the initial state, e.g.
`?target=mail&scenario=nas_dies&place=NETWORK_SIMPLEX`,
plus `plan=a,b`, `mode=where|all`, `dir=DOWN`, `routing=SPLINES`,
`select=id`, and `expand=a,b` (clicks those nodes open in turn).

Expanding a node places the new nodes in free space upstream without moving
anything; Tidy runs the full ELK layout from scratch.

- `src/app.css`: the whole look, in light and dark. The conventions are in
  `../.claude/CLAUDE.md`.
- `src/Root.svelte`: routes to the `pages/`; `pages/App.svelte` is a model open.
- `src/lib/`: no UI. `api.ts` is the server's API (types from
  `../server/api.ts`); `data.ts` runs a model's text, with any plans, through
  the engine; `edit.ts` makes guided edits to the text; `route.svelte.ts` and
  `theme.svelte.ts` keep the page and the theme.
- `src/graph/`: `build.ts` makes the views (where, ways into, everything) as
  nodes and edges, ported from the Mermaid builders, with stable junction ids;
  `layout.ts` is the ELK layered layout and in-place placement for expanding;
  `FlowView.svelte` and `flow/` draw it with Svelte Flow, following ELK's
  edge routes; `export.ts` writes it out.
- `src/panel/`: the tabs beside the graph. `src/forms/`: the guided-edit
  fields they use. `src/dialogs/`: Add, and adding from a template.
- `src/shell/`: what's around every page: the header, menus, the resizer.
