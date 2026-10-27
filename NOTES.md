# Access model: where it stands, and where it could go

A handoff for the next stage: what exists and why, then ideas for growing the
proof of concept into a mature app without losing what makes it good, which is
a narrow scope, few dependencies and deliberate choices.

## What it is

A hand-written YAML model of everything that grants access: locations,
devices, secrets, services, accounts and data. It records how each thing is
reached, and an engine answers two questions per scenario. **Lockout:** having
lost these things, what can I no longer get back? **Breach:** having taken
these things, what can an attacker reach? Plans are overlays that answer "what
changes if I do this?" The output is a verdict per critical or sensitive thing,
plus graphs of why.

## What exists, and why

### Layout

    engine/        pure TS: load + validate, reach, reports, Mermaid (~750 lines)
    reach.ts       CLI over the engine (Node runs it directly; no build)
    spike/         Svelte UI proof of concept (Svelte Flow + ELK)
    examples/      synthetic model and plans: fixture, worked example, demo
    data/          the personal model, plans, generated views.md (gitignored)

The CLI and the UI read `data/model.yml`, or `examples/model.yml` when there's
no `data/`. `./reach.ts --model PATH` picks another (plans then resolve
relative to it), and `?model=example` does the same in the page.

There is one runtime dependency for the engine (`yaml`). The UI adds `svelte`,
`@xyflow/svelte`, `elkjs` and `vite`. `npm run check` type-checks everything.

### The engine (`engine/model.ts`, `report.ts`, `mermaid.ts`)

- **Semantics.** All things share one namespace. A thing is reached through
  its containers (`in`, any one is enough), or through `access` and `recovery`,
  each a list of AND-sets whose elements may be any-of lists. `needs` must still
  exist. `mirrors` follows its source when the source is lost. `"?"` is an
  unknown, and `states:` are conditions of the moment ("vault unlocked").
  Each reached thing carries the *smallest set of assumptions* its best path
  relies on, found by recomputing everything until nothing changes (a fixpoint),
  so a better path upstream propagates downstream. Verdicts: LOST, UNSURE
  (relies on unknowns), DEPENDS (relies only on states; `solo` names every
  single state that would be enough), REACHED. Breach results are compared
  with an attacker who starts with nothing, so guesses anyone could make
  don't count.
- **Why it's pure.** It never touches the filesystem: it takes
  `{path, text}[]`. That's the reason for the TS port. The same code runs in
  the CLI and in the page, and a future server never has to compute anything
  the browser can't.
- **Why TS, not Python.** The original was `reach.py`. Keeping one engine
  instead of a Python CLI plus a JSON export for the UI removed a whole layer
  (`export.py`, `graph.json`). Node 26 runs `.ts` directly, so the code sticks
  to *erasable syntax only* (no enums, no parameter properties, no namespaces)
  and imports use explicit `.ts` extensions.
- **How the port was verified.** Before deleting the Python, a harness compared
  about 22,500 outputs: every report and plan diff, explain for every
  scenario × thing, every chart at several depths with and without scenario
  colouring, across five plan combinations, plus 20 CLI invocations including
  every error path (stdout, stderr and exit code). Everything matched. A
  deliberately broken tie-break gave 569 differences, so the harness could
  catch a regression.
- **Python-isms kept on purpose.** The last tie-break between equally good
  paths compares Python's `repr()` of the path (`pyRepr`), and an any-of
  element prints as Python's `str()` of a list. Both exist only to match the
  old output exactly. Once there are golden tests (below) they can be
  simplified deliberately; this may change which of two equally good paths an
  explanation shows.
- **Speed.** Loading the model and computing every scenario takes about 35 ms
  in the browser. That's fast enough to recompute on every edit without
  caching.

### The UI spike (`spike/`)

- **Svelte 5 + Svelte Flow + ELK (layered).** Svelte Flow gives real DOM nodes
  (rich labels, CSS theming, dark mode) with a small runtime. ELK's layered
  algorithm with orthogonal routing suits a directed AND/OR graph with
  junction nodes. The page draws ELK's own edge routes rather than letting the
  renderer route.
- **Cytoscape was the runner-up, then removed.** The spike showed it can draw
  ELK routes too (as segment edges), so routing wasn't the deciding factor.
  DOM nodes and CSS theming were.
- **Node placement: Brandes–Köpf, not network simplex.** It's about 7× faster
  (about 110 ms vs 860 ms on the largest ways-in views, 160 ms vs 1.2 s for
  all ~150 nodes). Network simplex makes slightly straighter edges.
- **Expand in place; full layout only on "Tidy".** Re-running the layout on
  every expand and animating the change was jarring and lost your place. Even
  ELK's interactive mode, seeded with the current positions, moved about 70%
  of on-screen nodes per click. `placeLocally` puts new nodes in free space
  upstream of what they feed into and moves nothing else. This was the
  clearest UX finding so far.
- **Views:** ways into a thing (expandable, default depth 2), where things live
  (in/needs/mirrors), and everything. Each view can be coloured by a scenario,
  with dead edges faded. Junction ids are derived from their position in the
  model, so they stay stable across expands.
- **Data loading:** `spike/src/data.ts` imports `data/model.yml` and
  `data/plans/*.yml` as raw text through Vite and runs the engine in the page.
  Editing the YAML reloads the page, and `?plan=a,b` applies plans. Only
  `127.0.0.1` is bound.
- **Verified write-back approach (not built):** `yaml`'s `parseDocument` keeps
  comments, but `toString()` reformats the whole file. Splicing the source text
  at a node's `range` gives a one-line diff. That's the basis for editing from
  the UI.

### Known gaps and debts

- **No tests.** The parity harness went with the Python. This is the first
  thing to fix (see Testing).
- **Explanations can be circular.** When two ways in tie (same assumptions,
  same kind), the `pyRepr` tie-break picks alphabetically, and the fixpoint
  keeps a path that supports itself. In the example,
  `./reach.ts --model examples/model.yml thief_carried mail` shows
  mail ← phone_number ← carrier ← mail, though the thief has the phone, which
  is enough for phone_number. Verdicts are right; only the shown path (explain,
  scenario charts) is wrong. It's inherited from the Python, so fix it together
  with the tie-break simplification once goldens exist.
- **A duplicate type layer.** `spike/src/types.ts` plus the adapter in
  `data.ts` reshape engine types into what `build.ts` expects (it predates the
  port). The views should consume the engine's types directly.
- **`placeLocally` limits:** tall stacked columns when a thing has many AND-sets,
  and stepped edges that cross nodes until you Tidy. ELK runs on the main thread
  (100–170 ms for big views); a web worker would keep it from blocking.
- **"spike" is a misnomer now.** It's the app.

## Principles worth keeping

1. **The engine is the product.** Everything else is I/O and presentation
   around one pure module. New features add operations *around* it rather
   than semantics *inside* it, unless the model itself needs to say more.
2. **The YAML file is the API.** It's hand-written, commented and diffable, and
   the user's own git history is the audit log. The UI edits it surgically and
   never rewrites it wholesale. If a feature needs data the file can't express,
   that's a format change to make on purpose, not a database to add on the side.
3. **The data is a map of your weak points.** Ask of every feature: *does this
   make the model leave the machine, or let someone else read it?* Local-first
   is a security property here, not a deployment detail.
4. **Every dependency has to justify itself.** Prefer Node built-ins
   (`node:http`, `node:test`, `fs.watch`) and the platform to frameworks.
   Today's list is short and every entry is load-bearing.

## Ideas for the listed features

Grouped roughly in the order I'd build them, since each enables the next.

### 0. Groundwork

- **An example model** (`examples/`, done): a made-up person with a
  laptop, phone, FIDO2 key, NAS and custom-domain mail. It covers containers,
  nested any-of (`[pw, [totp, [key, pin]]]`), recovery, `needs`, a mirror that
  a sync empties, `in: "?"` and `recovery: "?"`, states with assume/deny
  (including a DEPENDS on "any one of" two states), a mail ↔ carrier recovery
  cycle, and a breach guess that doesn't count because an attacker with nothing
  makes it too. Two plans: `spare-key` adds things and changes fields, and
  `backup` removes a thing and clears a mirror. `backup` is a trade-off: the
  archive becomes recoverable, but a burglar now reaches it too. The model also declares `version: 1`; the loader now rejects any other
  version and still accepts files without one.
- **Tests with `node:test`** (no dependency). Golden files of CLI output for
  the example (text diffs read well in review), generated now from the TS
  engine. That's sound because the TS engine was verified against Python.
  Plus invariant tests that hold for any model:
  adding an access path never makes anything less reachable; losing more never
  makes anything more reachable; the fixpoint loop finishes; plans that only
  restate fields change nothing.
- Rename `spike/` → `app/`, drop the type adapter, and move ELK into a worker.

### 1. Persistence and editing the model from the UI (one feature, really)

- **Store:** the files in `data/`. No database. The one piece of UI-only state
  worth keeping is *layout*: once someone has arranged a view, they'll want it
  kept (the expand-in-place decision points this way). Put it in a sidecar
  file (`data/.layout.json`, keyed by view and node id) so the model file
  stays clean.
- **Write path:** a UI gesture becomes a semantic operation in a new
  `engine/edit.ts` (`setField`, `addThing`, `removeThing`, `addAccessSet`,
  `renameId`). Each operation is applied to the YAML text by splicing at node
  ranges, the engine re-runs to validate, and nothing is written if any
  reference is unknown. Show the text diff before saving; it's small and
  builds trust.
  `renameId` is the hard one, because references span the model and every plan.
- **Transport:** a tiny local server (`node:http`, about 100 lines) serving the
  built app plus `GET`/`PUT` for data files. Each write carries a content hash
  as a precondition, so a hand edit in the editor while the UI is open gives a
  conflict, never a silent overwrite. `fs.watch` + server-sent events push
  outside edits to the page. The File System Access API would avoid the server
  but only works in Chromium; the CLI already needs Node anyway.
- **Undo:** an in-app stack of file versions for the session. Long-term history
  is the user's git.
- **Plans in the UI** may be the most valuable feature on this list: toggle
  plans on and off, and overlay the plan diff on the graph (what turns green,
  what turns red, what's newly reachable by an attacker). The engine already
  computes before/after rows. Edits could go to a *plan* rather than the
  model, so trying something out is non-destructive by default.

### 2. Templates for common services

- **What a template is:** a parametrised fragment in the same YAML sections.
  For example, a code-hosting account: password, the 2FA methods it supports
  (TOTP, passkeys, recovery codes, SMS), recovery by email, sessions on
  devices. Parameters choose which methods are on and where each secret lives.
- **Expand when authoring, not when loading.** Instantiating a template
  copies plain things into the model (with an id prefix), which can then be
  hand-edited. No `uses:` indirection, no hidden semantics, and the engine
  stays the same. Record a `from: <template>@<version>` field (ignored by the
  engine) so drift can be detected later.
- **Their real value is provider knowledge:** "does a password reset by email
  get past 2FA?", "do recovery codes bypass a hardware key?". Those are exactly
  the open questions that pile up as `todo` items. Templates should carry
  that knowledge with sources and a `reviewed:` date, and use `?` where the
  provider's behaviour is unknown rather than guessing. Stale templates are the
  main risk, so keep them few and well sourced.
- Templates are generic, so they can be tracked and shared, unlike `data/`.

### 3. Import and export

- **The YAML is already the interchange format.** Export means downloading the
  files, import means loading them. Add a top-level `version:` to the format
  *now*, before files exist elsewhere, so the loader can migrate old files later.
- **Graph exports:** Mermaid exists. SVG of the current view can be
  hand-rolled from the layout result, since edges are already SVG paths and
  nodes are simple shapes. That avoids an html-to-image dependency. PNG can
  come from SVG via a canvas.
- **Importing from other tools** (password-manager exports, for instance)
  needs care. Those files contain the secrets themselves. If done at all, read
  only item names and metadata to create stubs, never values, and say so in
  the UI. It's probably out of scope.

### 4. Docs

- Two audiences: **model authors** (a format reference, the verdicts, a worked
  example) and **contributors** (the architecture, the principles above).
- Keep the docs honest by running them: every YAML snippet in the format
  reference is loaded by a test, and the worked example *is* `examples/`.
  Plain Markdown in the repo, served by the app's own server if it needs to be
  browsable. A static-site generator is optional, not a starting point.

### 5. Accounts and OIDC: the feature that most threatens the scope

Decide the deployment model explicitly. It determines whether this feature
exists at all.

- **Local, single user (today).** Binding to localhost *is* the
  authentication. No accounts needed.
- **Self-hosted for one person or household** (a homelab). Authentication is
  needed, and should be delegated entirely. Either trust a forward-auth
  header from a reverse proxy the user already runs (Authelia, Authentik and
  similar), which needs zero auth code, or do OIDC directly with
  `openid-client` (authorization code + PKCE, server-side session cookie). No
  passwords are ever stored. Storage stays files on disk. Concurrent editors
  are handled by the same hash preconditions as above.
- **Hosted, multi-tenant (SaaS).** I'd argue against it, because it
  contradicts principle 3. If it ever happens, the pure engine makes the only
  acceptable form possible: encrypt in the browser, the server stores
  ciphertext, and all computation happens client-side, which it already does.
- **The app becomes part of its own model.** Once it's self-hosted behind
  OIDC, the instance, its IdP and the session cookie are things in the model:
  whoever reaches the app reaches the map. It's worth a template and a line in
  the docs.
- **Encryption at rest:** today `data/` is plaintext and relies on disk
  encryption. SOPS/age-encrypted model files are a possible option. Note that
  SOPS leaves keys (the ids) in clear text, and here the ids are much of the
  sensitive part.

## Suggested shape

    engine/      pure: load, reach, report, mermaid, edit
    reach.ts     CLI
    app/         Svelte UI
    server/      node:http: static, data API, watch/SSE, optional OIDC
    templates/   generic service templates (tracked)
    examples/    synthetic model: tests, docs, demo (tracked)
    test/        node:test: goldens and invariants
    docs/        format reference, architecture
    data/        personal model and plans (gitignored)

## Questions for the next session

- Which deployment modes count: local only, or self-hosted too? This decides
  whether auth exists.
- Should UI edits go to the model directly, or to a plan by default?
- Is `templates/` part of this repo (shared, versioned with the format) or a
  separate one?
- Does layout persistence belong in a sidecar file, or not at all (Tidy is
  always available)?
- Does the format need anything new for these features (`version:`, `from:`,
  per-thing sources) before the first file leaves this machine?
