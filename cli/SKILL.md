---
name: reachline
description: Read and change the user's ReachLine model, the map of how access flows between their accounts, devices, secrets, data and places, with lockout and breach scenarios. Use when they ask what they'd lose or what an attacker could reach, or want to add or change things, scenarios or plans in their model.
---

# ReachLine

A ReachLine model is one YAML document on the user's own server. The `reachline` command moves it between the server and a local file, and runs the engine on that file.

## Before you edit

Read `reachline docs concepts` and `reachline docs modelling` first; `reachline docs reference` lists every field, and `reachline docs` lists the other topics. The engine's errors say what's wrong and where, so trust them over your own reading of the format.

## Changing a model

1. `reachline models` lists the models. `reachline pull NAME` writes `NAME.yml`.
2. Edit the YAML. Keep the user's layout. Put explanations in `note` and open questions in `todo`, not in YAML comments, which the app drops.
3. `reachline check NAME.yml` gives errors, open todos, and how the verdicts changed since the pull. Fix every error.
4. Show the user the verdict changes, and push only once they agree: `reachline push NAME.yml`. Every push is a revision they can restore from the app's History.

To answer questions, run the reports on the file: `reachline --model NAME.yml` for every scenario, then a scenario's name, or a scenario and a thing to see why it was reached. `reachline help` lists them all.

## Ground rules

- The model maps the user's weak points. Don't copy it anywhere but the pulled file, and don't quote more of it than the task needs.
- When `reachline` says it isn't signed in, ask the user to run `reachline login` themselves. Never ask them to paste a token into the conversation.
- When `push` says the model changed on the server, don't use `--force` on `pull` to get past it: that discards the edit. Tell the user.
- Write `unknown`, with a `todo`, for anything you're not sure of. Don't guess the user's setup.
