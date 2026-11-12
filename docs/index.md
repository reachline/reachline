# ReachLine

ReachLine maps everything that grants access in your digital life, and answers two questions about it:

- **Lockout:** if I lose these things (a phone, a house fire, a forgotten password), what can I no longer get back?
- **Breach:** if someone takes these things (a stolen laptop, a SIM swap, a burglary), what else can they reach?

You describe your setup as a **model**: one YAML document listing your things and how each one is reached. Write your model through the structured UI, or edit the YAML directly.

## Reading order

1. [Concepts](concepts.md): how ReachLine thinks. Read this first.
2. [Modelling your setup](modelling.md): the patterns that work, and the traps.
3. [Reading the results](results.md): verdicts, what they're compared with, and why a thing was reached.
4. [Plans](plans.md): trying a change before you make it.
5. [Templates](templates.md): adding a common service in one go, and writing a template.
6. [Reference](reference.md): every field, in one place.
7. [CLI and agents](cli.md): working on a model from a terminal, or having an AI agent do it.

The examples come from [`examples/model.yml`](https://github.com/reachline/reachline/blob/main/examples/model.yml), a made-up person's setup that uses every part of the format.
