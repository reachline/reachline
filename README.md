# ReachLine

![GitHub Release](https://img.shields.io/github/v/release/reachline/reachline) [![GitHub License](https://img.shields.io/github/license/reachline/reachline?color=purple)](https://github.com/reachline/reachline/blob/main/LICENSE) [![Repo Size](https://img.shields.io/github/repo-size/reachline/reachline)](https://github.com/reachline/reachline) ![GitHub issues](https://img.shields.io/github/issues/reachline/reachline)

ReachLine maps everything that grants access in your digital life, and how it flows from one thing to the next. That covers devices, passwords, 2FA, recovery codes, accounts and data, and where each of them physically lives. From that map it answers two questions:

- **Lockout:** if I lose these things (a phone, a house fire, a forgotten password), what can I no longer get back?
- **Breach:** if someone takes these things (a stolen laptop, a SIM swap, a burglary), what else can they reach?

You describe your setup in a hand-written YAML file:

```yaml
things:
  mail:
    kind: account                          # or location, device, secret, service, data, state
    check: [lockout, breach]               # report it if you lose it, or if an attacker gets it
    access: mail_pw and (mail_totp or hw_key)
    recovery: mail_codes or phone_number   # recovery codes, or an SMS reset

scenarios:
  sim_swap:
    kind: breach
    attacker: carrier
```

ReachLine follows every path, recovery included, and gives each checked thing a verdict: **LOST**, **REACHED**, **UNSURE** (the path relies on something marked `unknown` because you don't know it) or **DEPENDS** (it relies on a condition of the moment, such as an app being unlocked). It also shows the graph of why. **Plans** are overlays that answer "what changes if I do this?", such as adding a spare security key or replacing a sync with a backup, as a before/after for every scenario. They live in the same file, under `plans:`.

## The model

A model is one YAML document: your `things` (each with a `kind`, and the fields that say where it lives and how it's reached), the `scenarios` to run, what you have on a normal day (`me`), and `plans`. `examples/model.yml` is a made-up person's setup that uses every part of the format, and `examples/starter.yml` is a smaller place to start. Templates in `templates/` add a common service in one go.

The [docs](docs/index.md) explain how ReachLine thinks, how to model your setup, how to read the results, and every field.

## Your server, your data

Your model is a map of your weak points, so ReachLine is self-hosted: you run it on a server you own, for yourself or a few people you trust. There is no central instance, no telemetry, and the page makes no requests anywhere but your server (its Content Security Policy enforces that). [Self-hosting](docs/self-hosting/index.md) covers installing it with Docker, signing in with single sign-on, backups and upgrades.

## How it fits together

- `engine/` computes everything: it parses a model and follows every path for each scenario. Its only dependency is `yaml`. The UI runs it in the browser, and `reachline.ts` runs it on the command line.
- `cli/` is the rest of the command line: signing in to your server, pulling and pushing a model, and the docs it carries. The server hands out a bundle of it, `reachline.mjs`, so your agent can work on your models ([CLI and agents](docs/cli.md)).
- `app/` is the UI: Svelte, with Svelte Flow drawing the graph and ELK laying it out in a worker.
- `server/` signs people in and stores each model as YAML text in SQLite, with every saved revision. It never interprets a model.
- `templates/` and `examples/` are models and pieces of models; `docs/` is the user and self-hosting documentation.

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
pnpm dev:reset                      # a fresh database in data/: user dev, password dev-password, and the example model
pnpm dev                            # the server and the UI, at http://127.0.0.1:6060
pnpm build && pnpm start            # what the Docker image runs
```

Settings come from `.env` (copy `.env.template`). Three more apply when running from source, which the Docker image sets for itself: `HOST` (default `127.0.0.1`), `PORT` (default 6060) and `DATA_DIR`, where the database lives (default `data/`, relative to the repository; `pnpm dev:reset` replaces the database there with example data). `pnpm dev` ignores `PORT` and `PUBLIC_URL`. See `app/README.md` for the UI's URL parameters.

The command line runs the engine on a model file: the synthetic example in `examples/`, or whichever `--model` names. From the repository it runs as `./reachline.ts`; `pnpm build` also bundles it into `app/dist/reachline.mjs`, which the server hands out.

```sh
./reachline.ts                          # every scenario
./reachline.ts house_fire               # one scenario
./reachline.ts thief_carried mail       # how a scenario reaches one thing
./reachline.ts --todo                   # open questions in the model
./reachline.ts --plan spare_key                           # before/after a plan
./reachline.ts help                     # everything else: login, pull, check, push, docs
```

### Checking

```sh
pnpm verify     # all of the below but test:e2e
pnpm check      # type-check the engine, CLI, server and UI
pnpm lint       # ESLint
pnpm format     # Prettier (format:check only checks)
pnpm test       # engine, CLI and server tests
pnpm test:e2e   # the built app in Chromium: user flows, the strict CSP, axe (needs pnpm build)
```

`pnpm install` sets up a pre-commit hook that checks the formatting of staged files. CI runs `pnpm verify` and `pnpm test:e2e`. For `test:e2e` locally, first run `pnpm exec playwright install chromium-headless-shell`. After a deliberate change to what the engine computes, update the test snapshot with `node --test --test-update-snapshots "test/*.test.ts"`.

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
