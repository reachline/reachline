# ReachLine

![GitHub Release](https://img.shields.io/github/v/release/reachline/reachline) [![GitHub License](https://img.shields.io/github/license/reachline/reachline?color=purple)](https://github.com/reachline/reachline/blob/main/LICENSE) [![Repo Size](https://img.shields.io/github/repo-size/reachline/reachline)](https://github.com/reachline/reachline) ![GitHub issues](https://img.shields.io/github/issues/reachline/reachline)

ReachLine maps everything that grants access in your digital life, and how it flows from one thing to the next. That covers devices, passwords, 2FA, recovery codes, accounts and data, and where each of them physically lives. From that map it answers two questions:

- **Lockout:** if I lose these things (a phone, a house fire, a forgotten password), what can I no longer get back?
- **Breach:** if someone takes these things (a stolen laptop, a SIM swap, a burglary), what else can they reach?

You describe your setup in a hand-written YAML file:

```yaml
accounts:
  mail:
    critical: true      # lockout scenarios check you can still reach it
    sensitive: true     # breach scenarios check an attacker can't
    access: [[mail_pw, [mail_totp, hw_key]]]   # password AND (TOTP OR key)
    recovery: [[mail_codes], [phone_number]]   # recovery codes, OR an SMS reset

scenarios:
  sim_swap:
    kind: breach
    attacker: [carrier]
```

ReachLine follows every path, recovery included, and gives each critical or sensitive thing a verdict: **LOST**, **REACHED**, **UNSURE** (the path relies on something marked `?` because you don't know it) or **DEPENDS** (it relies on a condition of the moment, such as an app being unlocked). It also shows the graph of why. **Plans** are overlays that answer "what changes if I do this?", such as adding a spare security key or replacing a sync with a backup, as a before/after for every scenario.

ReachLine runs entirely on your machine. Your model is a map of your weak points, so it never leaves your computer: the web UI binds only to `127.0.0.1`, and your data stays in plain files that you version yourself.

## Development Instructions

Requires [Node.js](https://nodejs.org) 22.18 or newer, which runs TypeScript directly with no build step, and [pnpm](https://pnpm.io). Development happens on Node 26.

### Setup

```sh
git clone https://github.com/reachline/reachline.git
cd reachline
pnpm install
```

### Running

The repository ships with a synthetic example model in `examples/`. Without a model of your own, both the command line and the UI open the example.

```sh
./reach.ts                          # every scenario
./reach.ts house_fire               # one scenario
./reach.ts thief_carried mail       # how a scenario reaches one thing
./reach.ts --todo                   # open questions in the model
./reach.ts --plan plans/spare-key.yml                 # before/after a plan
./reach.ts --mermaid mail --scenario house_fire       # a Mermaid chart

pnpm dev                            # web UI at http://127.0.0.1:5199
```

To model your own setup, create `data/model.yml`, with plans in `data/plans/`. Use `examples/model.yml` as a starting point: its header documents every field. `data/` is gitignored, and once it exists, ReachLine uses it in place of the example. Pass `--model examples/model.yml` on the command line, or open the UI with `?model=example`, to see the example again. See the top of `reach.ts` for every command-line option, and `app/README.md` for the UI's URL parameters.

### Checking

```sh
pnpm verify     # all of the below
pnpm check      # type-check the engine, CLI and UI
pnpm lint       # ESLint
pnpm format     # Prettier (format:check only checks)
pnpm test       # engine and CLI tests
```

`pnpm install` sets up a pre-commit hook that runs `pnpm verify`, and CI runs it too. After a deliberate change to what the engine computes, update the test snapshot with `node --test --test-update-snapshots "test/*.test.ts"`.

## Contributing

Users interested in expanding functionalities in ReachLine are welcome to do so. Issues reports are encouraged through Github's [issue tracker](https://github.com/reachline/reachline/issues). See details on how to contribute and report issues in [CONTRIBUTING.md](CONTRIBUTING.md). All contributors are expected to adhere to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

This software is licensed under the [AGPL-3.0 license](LICENSE).

## Acknowledgements

We owe thanks to all the projects that make ReachLine run.

- [ELK](https://github.com/kieler/elkjs)
- [Node](https://github.com/nodejs)
- [Svelte](https://github.com/sveltejs)
- [Svelte Flow](https://github.com/xyflow/xyflow)
- [TypeScript](https://github.com/microsoft/TypeScript)
- [Vite](https://github.com/vitejs/vite)
- [yaml](https://github.com/eemeli/yaml)
