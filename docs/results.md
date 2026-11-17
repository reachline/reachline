# Reading the results

## Verdicts

Each scenario lists the checked things it affects:

```text
house_fire  (lockout: gone home, carried)
  # at night, everything is home
  documents      LOST
  mail           LOST
  code_host      UNSURE  if code_host.recovery (unknown)
  bank           LOST

thief_carried  (breach: has carried)
  # phone and keys taken while locked
  documents      UNSURE  if storage.recovery (unknown)  via in docs_cloud
  mail           REACHED  via recovery phone_number
```

| Verdict | Means |
| --- | --- |
| **LOST** | In a lockout: it can't be reached, whether it's gone or just out of reach. |
| **REACHED** | In a breach: the attacker reaches it outright. |
| **UNSURE** `if …` | It's reached only if what you marked `unknown` works out. Named after its owner: `old_drive (unknown)` is the one in `old_drive`'s `in` or `access`, and `code_host.recovery (unknown)` the one in its `recovery`. |
| **DEPENDS** `if …` | It's reached only if the named states hold. `if any one of pm_open_laptop, pm_open_phone` means either one is enough. |

A result that relies on both unknowns and states is UNSURE. A lockout doesn't list what you still reach outright, and `ok` means nothing checked is affected.

## What each scenario is compared with

A verdict on its own would blame the scenario for problems you already have, so each kind is measured against a reference.

**A lockout is compared with the normal day,** even one that starts from someone else's `has`. It lists a checked thing only if it's worse off than on a normal day: lost, or relying on more assumptions. Anything already shaky shows up once, under `baseline` ("already shaky on a normal day"), rather than in every lockout. Read `baseline` first.

**A breach is compared with an attacker who has nothing.** It lists a checked thing the attacker reaches, unless someone with nothing at all could reach it on fewer assumptions, or on the same ones. A guess anyone could make isn't blamed on the theft.

## Why a thing was reached

Each line of a breach says how the attacker got in: `via in docs_nas`, `via recovery phone_number`, or `via access` and the part of the condition that worked. To follow the whole path, or see what's in the way of something you can't reach, use the [command line](cli.md#following-a-path), or the graph's "Ways in" view.

When there are several ways in, ReachLine reports the one that relies on the fewest assumptions. On a tie, `in` comes before `access`, `access` before `recovery`, and then the first one written.

## In the app

- **Scenarios tab:** the normal day, then the lockouts, then the breaches. Choosing one shows its verdicts as above, then "Also affected": everything else that's worse off, apart from what the scenario names itself. That's where the passwords, keys and devices behind a verdict show up.
- **The graph:** colour it by a scenario from the toolbar. An icon before each name gives its kind, and a glyph after it gives its status without relying on colour: ✓ reached, ✗ lost (or, in a breach, reached by the attacker), and ? reached only if assumptions hold. Status covers everything, checked or not; `!` marks the checked things the scenario reports. A grey edge can't carry access in the scenario, and a chevron in a thing's end shows more of the graph on that side. The Legend has the full key.
- **Views:** "Ways in" grows outward from one thing as you select nodes, "Where things live" shows `in`, `needs` and `mirrors`, and "Everything" shows the lot.
