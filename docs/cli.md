# CLI and agents

The `reachline` command works on your models from a terminal. It pulls a model from your server into a file, runs the engine on that file, and pushes your edits back as a new revision. If you want to utilize an AI agent to help you reason through your model, this would be how.

## Setup

You download the CLI tool from your own server. Your Account page, under **CLI and agents**, shows the commands to copy:

```sh
mkdir -p ~/.local/bin && curl -fsSL https://reachline.example.com/reachline.mjs -o ~/.local/bin/reachline
chmod +x ~/.local/bin/reachline
reachline login https://reachline.example.com
```

It runs on macOS and Linux, and needs [Node.js](https://nodejs.org) 22 or newer, and `~/.local/bin` on your `PATH`. On Windows, run it in [WSL](https://learn.microsoft.com/windows/wsl/install), which is Linux, and so is your agent's shell there.

`reachline login` prints a link to your Account page, with a new token's name filled in. Create the token, copy it, and paste it at the prompt. It isn't shown as you paste, so it stays out of your shell's history. The token is kept in `~/.config/reachline/config.json`, which only you can read. `REACHLINE_SERVER` and `REACHLINE_TOKEN` in the environment override it.

A token reaches your models and nothing else. It can't change your password or make other tokens. `reachline logout` revokes it, and so does **Revoke** on your Account page, which also lists when each token was last used. Changing your password revokes every token, as it signs out your other sessions, so whoever learned the old one keeps no way in; run `reachline login` again afterwards. In a model's History, a revision saved from the command line shows the token's name.

When the server is upgraded, `reachline` says so. `reachline update` then replaces it with the server's version.

## Working on a model

```sh
reachline models                 # your models
reachline pull home              # writes home.yml
reachline check home.yml         # errors, open todos, and what changed
reachline push home.yml          # saves it as a new revision
```

`pull` leaves a hidden file beside the model, `.home.yml.reachline`, that remembers where the model came from and what it said then. That is what lets `check` and `push` say how your edit changes the verdicts:

```text
Verdicts changed since revision 41:

house_fire  (lockout: gone home, carried)
  mail           LOST  →  ok
```

Nothing is lost by accident:

- `push` refuses a model with errors. `--force` pushes it anyway, as the app's editor can save one.
- If someone saved the model since you pulled it, `push` refuses rather than overwrite their edit. Copy your file aside, pull again, and redo your change.
- `pull` won't replace a file with edits you haven't pushed, unless you add `--force`.

Every push is a revision, so you can look at it, or restore what came before, in the app's History.

## Reports

The reports run the engine on a file, on your computer, so they need no server or sign-in. Name the file with `--model`:

| Command | Shows |
| --- | --- |
| `reachline --model home.yml` | every scenario's verdicts |
| `reachline --model home.yml house_fire burglary` | just those scenarios |
| `reachline --model home.yml burglary mail` | how the scenario reaches one thing, or what's in the way if it can't |
| `reachline --model home.yml --todo` | the model's open todos |
| `reachline --model home.yml --plan spare_key` | every scenario, before and after the plan |

[Reading the results](results.md) explains the verdicts.

A scenario that shares its name with a command, such as `check`, goes after `--`: `reachline --model home.yml -- check`. Any command that fails exits 1, with the reason on stderr, and `check` exits 1 when the model has errors, so a script or an agent can tell.

`reachline help` lists every command. `reachline docs` prints these docs, one topic at a time, as in `reachline docs modelling`. For a picture, the app draws the graph and exports it as SVG, PNG or Mermaid.

### Following a path

Give a scenario and a thing to see the whole path to it:

```text
$ reachline --model home.yml thief_carried mail
mail  [recovery phone_number]
  phone_number  [access sim]
    sim  [in carried]
      carried  [start]
```

Each line is a thing and how it was reached, with what that used indented beneath it. `start` is where the scenario starts (`me`, or what it `has`), `state` is a state with no way in that held, and `(above)` marks a thing already shown. A locked thing also says how its lock was met, as in `laptop  [in home, lock laptop_pw]`, with what that used beneath it too.

When the thing can't be reached, you get its ways in instead, and its lock if it has one, with where each part stands: `yes`, `no`, or `if` and the assumptions.

```text
$ reachline --model home.yml house_fire mail
mail not reachable in house_fire. Its ways in:
  access mail_pw and (mail_totp or hw_key)
      hw_key: no
      mail_pw: no
      mail_totp: no
  ...
  recovery mail_codes
      mail_codes: no
```

### Trying a plan

`--plan` can repeat, and the plans apply in the order given. It combines with the other forms: with scenario names, just those scenarios before and after; with a scenario and a thing, or `--todo`, the model with the plans applied.

```text
$ reachline --model home.yml --plan spare_key
house_fire  (lockout: gone home, carried)
  # at night, everything is home
  documents      LOST  →  ok
  mail           LOST  →  ok
  code_host      UNSURE  if code_host.recovery (unknown)  →  ok
  bank           LOST  →  ok

nas_dies  (lockout: gone nas)
  # the pi keeps syncing, so the cloud copy empties too
  still          documents
  (no change)
```

Each verdict that changes reads before → after, and `still` lists the problems the plan leaves as they were.

## With an AI agent

`reachline skill` prints instructions for an agent, in the Agent Skills format: how to read the docs, the pull, check and push loop, and to show you the verdict changes before it pushes. For Claude Code:

```sh
mkdir -p ~/.claude/skills/reachline && reachline skill > ~/.claude/skills/reachline/SKILL.md
```

Other agents keep skills or instructions in their own places. The skill doesn't repeat the docs; it tells the agent to read them with `reachline docs`, so it stays current as ReachLine changes.

Sign in yourself before you start. The agent needs only the command, never the token.

Keep in mind, your model is a map of your weak points, and an agent sends whatever it reads to whoever runs the model behind it. Give an agent only models you're fine sharing with that provider.
