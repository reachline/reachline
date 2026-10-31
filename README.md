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
    attacker: [carrier]
```

ReachLine follows every path, recovery included, and gives each checked thing a verdict: **LOST**, **REACHED**, **UNSURE** (the path relies on something marked `unknown` because you don't know it) or **DEPENDS** (it relies on a condition of the moment, such as an app being unlocked). It also shows the graph of why. **Plans** are overlays that answer "what changes if I do this?", such as adding a spare security key or replacing a sync with a backup, as a before/after for every scenario. They live in the same file, under `plans:`.

## The model

A model has `things`, `scenarios`, what you have on a normal day (`me`), and `plans`. `examples/model.yml` is a made-up person's setup, small but using every part of the format. Every thing has an id under `things:`, and all ids share one namespace.

In every scenario, ReachLine asks two questions of each thing: does it still exist, and can someone get to it? Its fields answer them:

| Field      | Meaning |
| ---------- | ------- |
| `kind`     | Required: `location`, `device`, `state`, `secret`, `service`, `data` or `account`. Only `state` changes how a thing behaves; the rest are for reading, and for the shapes in the graph. |
| `check`    | `lockout` (lockouts report it if you can't reach it any more) and `breach` (breaches report it if an attacker can). Check what you care about for its own sake (your mail, your documents, your money), not the passwords, keys, devices and servers that lead to it. ReachLine follows those, so a stolen key shows up as the accounts it opens. |
| `in`       | Where it lives, physically (`laptop` in `home`) or digitally (`mail_pw` in `vault`): `[home, office]` says it's in both. Reaching any one of them reaches it, and it's lost only once all of them are. `unknown` is a place you don't know: never lost, and reached only by assuming it. |
| `needs`    | A condition: it exists only while this holds, whether or not you can reach it. The server it runs on, the domain it depends on: `vm and (proxy_a or proxy_b)`. |
| `access`   | A condition: it's reached when this holds. `(code_pw and (code_totp or (hw_key and key_pin))) or recovery_codes`. |
| `recovery` | The same as `access`, reported separately (account recovery): `mail and unknown`. |
| `mirrors`  | `{of: source, by: syncer}`: a synced copy. It's lost once its source is lost while the syncer still runs, since the next sync empties it. |
| `note`, `todo` | Free text. `./reach.ts --todo` lists the todos. |

A list states facts that are all true at once (`in`, `check`, and in a scenario `lost`, `attacker`, `assume` and `deny`). A condition is ids joined by `and` and `or`, with brackets, nested as deep as you like. `and` and `or` can't share a level without brackets (`a and b or c` is an error that says where to add them), so nobody has to remember which binds tighter. `and`, `or` and `unknown` are reserved, so no thing can have them as its id.

`unknown` stands for a fact about your setup you don't know, in `in`, `access` and `recovery`. ReachLine tracks which unknowns each path relies on, and reports those paths as UNSURE.

A `state` is a condition of the moment rather than a fact about the setup, such as a password manager being unlocked on the laptop. Nothing assumes a state either way: a result that hinges on one says DEPENDS, and a scenario can pin states with `assume` (true) and `deny` (false). A device usually has two entries: the device itself, which a thief takes or a fire destroys, and `<device>_unlocked`, a working session that needs the device and its unlock.

`me` is what you have without getting it through anything else, the roots everything is reached from: usually places, such as `head` (what you remember), `body` (biometrics, turning up in person), `carried`, `home` and `contacts` (people who'd lend you a device). That's the normal day, a built-in scenario called `baseline`.

A scenario has a `kind` (`lockout` or `breach`), what's `lost` (lockout) or what the `attacker` has (breach), optionally `assume` and `deny`, and a `note`. A lockout takes some of `me` away, and is reported against the normal day, so what's already shaky isn't blamed on the fire. A breach starts from what the attacker has, and is reported against an attacker with nothing, so a guess anyone could make isn't blamed on the theft.

A plan has the same `things`, `scenarios` and `me` as the model, plus a `note`. A field it gives replaces the model's whole field (so restate the whole `access` condition), a new id adds a thing, and `id: null` removes one, which nothing may still refer to. Plans apply in the order given: `./reach.ts --plan spare_key --plan backup`.

The app writes the model in one layout, without comments, whenever you edit it through its forms or press Format, so keep explanations in `note` and `todo`.

A template (in `templates/`) adds a common service in one go: its things, under a `template:` header that names the slots it binds to your own things (a thing of yours with the slot's id is chosen for you, and `examples/starter.yml` uses those ids) and the options you may not have set up. Add one from the app's Add menu, into the model or as a plan. New templates are welcome by pull request; cite the service's own docs in `links`, and `test/template.test.ts` checks each one loads.

## Your server, your data

Your model is a map of your weak points, so ReachLine is self-hosted: you run it on a server you own, for yourself or a few people you trust. There is no central instance, no telemetry, and the page makes no requests anywhere but your server (its Content Security Policy enforces that). The engine runs in your browser. The server stores each model as YAML text, keeps every saved revision, and never interprets it.

Models aren't encrypted on the server, so whoever controls the server and its backups can read them. Treat the server and its data volume as you would your password manager's backups.

## Signing in

Users sign in with a username and password, with an OpenID Connect provider (single sign-on), or either; `AUTH_METHODS` chooses. `.env.template` describes every setting. An account made at its first sign-in with the provider gets a username from the provider's, and is linked to the provider's identity (issuer and subject), never matched by email or name. Anyone can link or unlink the provider, or add or remove a password, on their account page, as long as one way in remains. A forgotten password is reset on the server: `docker compose exec reachline reset-password <username>`.

ReachLine doesn't check groups: who may sign in is the provider's decision, so limit the application to the right people there. With registration on, anyone the provider lets through gets an account.

### Example: Authentik

1. In Authentik, create an application with an OAuth2/OpenID provider. Make it a confidential client, with the redirect URI `https://reach.example.com/api/auth/oidc/callback` (your `PUBLIC_URL`, then `/api/auth/oidc/callback`), and choose a signing key.
2. To sign people out of ReachLine when their Authentik session ends, set the provider's logout URI to `https://reach.example.com/api/auth/oidc/logout`, with the back-channel method (Authentik 2025.8 or newer). Authentik's server has to be able to reach that address.
3. Bind the users or groups who may use ReachLine to the application.
4. Give ReachLine the provider's details:

   ```sh
   AUTH_METHODS=password,oidc
   AUTH_OIDC_ISSUER=https://auth.example.com/application/o/reachline/   # the provider's issuer, trailing slash and all
   AUTH_OIDC_CLIENT_ID=...
   AUTH_OIDC_CLIENT_SECRET=...
   AUTH_OIDC_LABEL=Sign in with Authentik
   ```

ReachLine's server has to be able to reach the issuer's address too. To use only the provider, set `AUTH_METHODS=oidc`, but first have everyone link their account, since an account with only a password can no longer sign in.

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

To model your own setup, create `data/model.yml`, starting from `examples/model.yml` (see [The model](#the-model)). `data/` is gitignored. Pass `--model examples/model.yml` to see the example again. See the top of `reach.ts` for every command-line option.

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
