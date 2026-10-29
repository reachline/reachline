# ReachLine

![GitHub Release](https://img.shields.io/github/v/release/reachline/reachline) [![GitHub License](https://img.shields.io/github/license/reachline/reachline?color=purple)](https://github.com/reachline/reachline/blob/main/LICENSE) [![Repo Size](https://img.shields.io/github/repo-size/reachline/reachline)](https://github.com/reachline/reachline) ![GitHub issues](https://img.shields.io/github/issues/reachline/reachline)

ReachLine maps everything that grants access in your digital life, and how it flows from one thing to the next. That covers devices, passwords, 2FA, recovery codes, accounts and data, and where each of them physically lives. From that map it answers two questions:

- **Lockout:** if I lose these things (a phone, a house fire, a forgotten password), what can I no longer get back?
- **Breach:** if someone takes these things (a stolen laptop, a SIM swap, a burglary), what else can they reach?

You describe your setup in a hand-written YAML file:

```yaml
things:
  mail:
    kind: account                 # or location, device, secret, service, data, state
    tags: [critical, sensitive]   # lockouts check you keep it; breaches, that attackers can't reach it
    access: [[mail_pw, [mail_totp, hw_key]]]   # password AND (TOTP OR key)
    recovery: [[mail_codes], [phone_number]]   # recovery codes, OR an SMS reset

scenarios:
  sim_swap:
    kind: breach
    attacker: [carrier]
```

ReachLine follows every path, recovery included, and gives each critical or sensitive thing a verdict: **LOST**, **REACHED**, **UNSURE** (the path relies on something marked `?` because you don't know it) or **DEPENDS** (it relies on a condition of the moment, such as an app being unlocked). It also shows the graph of why. **Plans** are overlays that answer "what changes if I do this?", such as adding a spare security key or replacing a sync with a backup, as a before/after for every scenario. They live in the same file, under `plans:`.

## Your server, your data

Your model is a map of your weak points, so ReachLine is self-hosted: you run it on a server you own, for yourself or a few people you trust. There is no central instance, no telemetry, and the page makes no requests anywhere but your server (its Content Security Policy enforces that). The engine runs in your browser. The server stores each model as YAML text, keeps every saved revision, and never interprets it.

Models aren't encrypted on the server, so whoever controls the server and its backups can read them. Treat the server and its data volume as you would your password manager's backups.

## Development Instructions

Requires [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io). Node runs the TypeScript directly, with no build step. The command line needs Node 22.18 or newer, and the server needs 24.7 or newer; development happens on Node 26.

### Setup

```sh
git clone https://github.com/reachline/reachline.git
cd reachline
pnpm install
```

### Running

```sh
pnpm dev:reset                      # a fresh .dev/ database: user dev, password dev-password, and the example model
pnpm dev                            # the server and the UI, at http://127.0.0.1:5199
pnpm build && pnpm start            # what the Docker image runs
```

Settings come from `.env` (copy `.env.template`). In development the database lives in `.dev/`, which is gitignored and holds example data only. See `app/README.md` for the UI's URL parameters.

The command line runs the engine on a local file: `data/model.yml`, or the synthetic example in `examples/` when there's no `data/`.

```sh
./reach.ts                          # every scenario
./reach.ts house_fire               # one scenario
./reach.ts thief_carried mail       # how a scenario reaches one thing
./reach.ts --todo                   # open questions in the model
./reach.ts --plan spare_key                           # before/after a plan
./reach.ts --mermaid mail --scenario house_fire       # a Mermaid chart
```

To model your own setup, create `data/model.yml`, starting from `examples/model.yml`: its header documents every field. `data/` is gitignored. Pass `--model examples/model.yml` to see the example again. See the top of `reach.ts` for every command-line option.

### Checking

```sh
pnpm verify     # all of the below but test:csp
pnpm check      # type-check the engine, CLI, server and UI
pnpm lint       # ESLint
pnpm format     # Prettier (format:check only checks)
pnpm test       # engine, CLI and server tests
pnpm test:csp   # the built app in Chromium, under the strict CSP (needs pnpm build)
```

`pnpm install` sets up a pre-commit hook that runs `pnpm verify`, and CI runs it too, along with `pnpm test:csp`. For `test:csp` locally, first run `pnpm exec playwright install chromium-headless-shell`. After a deliberate change to what the engine computes, update the test snapshot with `node --test --test-update-snapshots "test/*.test.ts"`.

## Contributing

Users interested in expanding functionalities in ReachLine are welcome to do so. Issues reports are encouraged through Github's [issue tracker](https://github.com/reachline/reachline/issues). See details on how to contribute and report issues in [CONTRIBUTING.md](CONTRIBUTING.md). All contributors are expected to adhere to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

This software is licensed under the [AGPL-3.0 license](LICENSE).

## Acknowledgements

We owe thanks to all the projects that make ReachLine run.

- [ELK](https://github.com/kieler/elkjs)
- [Hono](https://github.com/honojs/hono)
- [Node](https://github.com/nodejs)
- [Playwright](https://github.com/microsoft/playwright)
- [Svelte](https://github.com/sveltejs)
- [Svelte Flow](https://github.com/xyflow/xyflow)
- [TypeScript](https://github.com/microsoft/TypeScript)
- [Vite](https://github.com/vitejs/vite)
- [yaml](https://github.com/eemeli/yaml)
