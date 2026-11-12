# CLI and agents

The `reachline` command works on your models from a terminal. It pulls a model from your server into a file, runs the engine on that file, and pushes your edits back as a new revision. Because it's an ordinary command, an AI agent that can run commands, such as Claude Code, can use it the same way you do.

## Setting it up

Your server hands out the command, always in the version that matches it. Your Account page, under **CLI and agents**, shows the commands to copy:

```sh
mkdir -p ~/.local/bin && curl -fsSL https://reachline.example.com/reachline.mjs -o ~/.local/bin/reachline
chmod +x ~/.local/bin/reachline
reachline login https://reachline.example.com
```

It runs on macOS and Linux, and needs [Node.js](https://nodejs.org) 22 or newer, and `~/.local/bin` on your `PATH`. On Windows, run it in [WSL](https://learn.microsoft.com/windows/wsl/install), which is Linux, and so is your agent's shell there. For a shorter name, add `alias rl=reachline` to your shell's settings.

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

house_fire  (lockout: lost home, carried)
  mail           LOST  →  ok
```

Nothing is lost by accident:

- `push` refuses a model with errors. `--force` pushes it anyway, as the app's editor can save one.
- If someone saved the model since you pulled it, `push` refuses rather than overwrite their edit. Copy your file aside, pull again, and redo your change.
- `pull` won't replace a file with edits you haven't pushed, unless you add `--force`.

Every push is a revision, so you can look at it, or restore what came before, in the app's History.

The reports from [Reading the results](results.md) and [Plans](plans.md) run on the file: `reachline --model home.yml` for every scenario, then a scenario's name, a scenario and a thing, `--plan` or `--todo`. `reachline help` lists them all, and `reachline docs` prints this guide. For a picture, the app draws the graph and exports it.

## With an AI agent

`reachline skill` prints instructions for an agent, in the Agent Skills format: how to read the docs, the pull, check and push loop, and to show you the verdict changes before it pushes. For Claude Code:

```sh
mkdir -p ~/.claude/skills/reachline && reachline skill > ~/.claude/skills/reachline/SKILL.md
```

Other agents keep skills or instructions in their own places. The skill doesn't repeat the docs; it tells the agent to read them with `reachline docs`, so it stays current as ReachLine changes.

Sign in yourself before you start. The agent needs only the command, never the token.

Think about what this means. Your model is a map of your weak points, and an agent sends whatever it reads to whoever runs the model behind it. Give an agent only models you're content to share with that provider. A local model, run on your own machine, works with the same command.
