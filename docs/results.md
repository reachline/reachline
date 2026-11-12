# Reading the results

## Verdicts

Each scenario lists the checked things it affects:

```text
house_fire  (lockout: lost home, carried)
  # at night, everything is home
  documents      LOST
  mail           LOST
  code_host      UNSURE  if code_host.recovery (unknown)
  bank           LOST

thief_carried  (breach: attacker has carried)
  # phone and keys taken while locked
  documents      UNSURE  if storage.recovery (unknown)  via in docs_cloud
  mail           REACHED  via recovery phone_number
```

| Verdict | Means |
| --- | --- |
| **LOST** | In a lockout: you can't reach it, whether it's gone or just out of reach. |
| **REACHED** | In a breach: the attacker reaches it outright. |
| **UNSURE** `if …` | It's reached only if what you marked `unknown` works out. Named after its owner: `old_drive (unknown)` is the one in `old_drive`'s `in` or `access`, and `code_host.recovery (unknown)` the one in its `recovery`. |
| **DEPENDS** `if …` | It's reached only if the named states hold. `if any one of pm_open_laptop, pm_open_phone` means either one is enough. |

A result that relies on both unknowns and states is UNSURE. A lockout doesn't list what you still reach outright, and `ok` means nothing checked is affected.

## What each scenario is compared with

A verdict on its own would blame the scenario for problems you already have, so each kind is measured against a reference.

**A lockout is compared with the normal day.** It lists a checked thing only if it's worse off than on a normal day: lost, or relying on more assumptions. Anything already shaky shows up once, under `baseline` ("already shaky on a normal day"), rather than in every lockout. Read `baseline` first.

**A breach is compared with an attacker who has nothing.** It lists a checked thing the attacker reaches, unless someone with nothing at all could reach it on fewer assumptions, or on the same ones. A guess anyone could make isn't blamed on the theft.

## Why a thing was reached

Each line of a breach says how the attacker got in: `via in docs_nas`, `via recovery phone_number`, or `via access` and the part of the condition that worked. To follow the whole path, give the scenario and the thing:

```text
$ reachline --model model.yml thief_carried mail
mail  [recovery phone_number]
  phone_number  [access phone]
    phone  [in carried]
      carried  [start]
```

Each line is a thing and how it was reached, with what that used indented beneath it. `start` is where the scenario starts (`me`, or what the attacker has), `state` is a state that held, and `(above)` marks a thing already shown.

When the thing can't be reached, you get its ways in instead, with where each part stands: `yes`, `no`, or `if` and the assumptions.

```text
$ reachline --model model.yml house_fire mail
mail not reachable in house_fire. Its ways in:
  access mail_pw and (mail_totp or hw_key)
      hw_key: no
      mail_pw: no
      mail_totp: no
  ...
  recovery mail_codes
      mail_codes: no
```

When there are several ways in, ReachLine reports the one that relies on the fewest assumptions. On a tie, `in` comes before `access`, `access` before `recovery`, and then the first one written.

## In the app

- **Scenarios tab:** the normal day, then the lockouts, then the breaches. Choosing one shows its verdicts as above, then "Also affected": everything else that's worse off, apart from what the scenario names itself. That's where the passwords, keys and devices behind a verdict show up.
- **The graph:** colour it by a scenario from the toolbar. An icon before each name gives its kind, and a glyph after it gives its status without relying on colour: ✓ reached, ✗ lost (or, in a breach, reached by the attacker), and ? reached only if assumptions hold. Status covers everything, checked or not; `!` marks the checked things the scenario reports. A grey edge can't carry access in the scenario, and a chevron in a thing's end shows more of the graph on that side. The Legend has the full key.
- **Views:** "Ways in" grows outward from one thing as you select nodes, "Where things live" shows `in`, `needs` and `mirrors`, and "Everything" shows the lot.
