# ReachLine UI

**Svelte Flow** drawing an **ELK** layout of a model loaded from the server
(`../server/`). Pages: `/login`, `/` (your models) and `/m/:id` (one model).

    pnpm dev                 # from the root: the server, and Vite at http://127.0.0.1:6060
    pnpm dev:reset           # from the root: a fresh database in data/ (sign in as dev / dev-password)
    node bench.ts            # ELK timings and expand-on-click stability, on examples/
    pnpm check               # svelte-check

The page runs the engine (`../engine/`) on the model's text itself; the server
only stores it. `?plan=spare_key,backup` applies plans from the model's
`plans:` in order.

The URL on `/m/:id` keeps what the graph shows, so a reload or a link comes
back to it: `?target=mail&scenario=nas_dies`, plus `plan=a,b`,
`into=plan` (where edits go), `mode=where|all` and `select=id`. `dir=DOWN`,
`routing=SPLINES` and `place=NETWORK_SIMPLEX` set the layout, which the
browser then keeps for every model, and `expand=a,b` clicks those nodes open
in turn.

Expanding a node places the new nodes in free space upstream without moving
anything; Tidy runs the full ELK layout from scratch.

- `src/app.css`: the whole look, in light and dark. The conventions are in
  `../.claude/CLAUDE.md`.
- `src/Root.svelte`: routes to the `pages/`; `pages/App.svelte` is a model open.
- `src/lib/`: no UI. `api.ts` is the server's API (types from
  `../server/api.ts`); `data.ts` runs a model's text, with any plans, through
  the engine; `edit.ts` makes guided edits to the text; `route.svelte.ts` and
  `theme.svelte.ts` keep the page and the theme.
- `src/graph/`: draws the engine's views (`../engine/view.ts`: where, ways
  into, everything, as nodes and edges with stable junction ids). `nodes.ts`
  says how a node reads; `layout.ts` is the ELK layered layout and in-place
  placement for expanding;
  `FlowView.svelte` and `flow/` draw it with Svelte Flow, following ELK's
  edge routes; `export.ts` writes it out.
- `src/panel/`: the tabs beside the graph. `src/forms/`: the guided-edit
  fields they use. `src/dialogs/`: Add, adding from a template, and Confirm.
- `src/shell/`: what's around every page: the header, menus, the resizer.
