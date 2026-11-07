# Plans

A plan is a change you're considering, kept in the same document under `plans:`. It has the same `things`, `scenarios` and `me` as the model, plus a `note`, and gives only what it changes. ReachLine shows every scenario before and after.

```yaml
plans:
  spare_key:
    note: a second FIDO2 key kept off-site, and no more mail resets by SMS
    things:
      offsite: {kind: location, note: a friend's house across town}
      key_keyring: {kind: device, in: [carried]}
      key_offsite: {kind: device, in: [offsite]}
      hw_key:
        in: []
        access: key_keyring or key_offsite
        note: any one of my keys; every account enrolls both
      mail: {recovery: mail_codes}
    scenarios:
      keys_lost: {kind: lockout, lost: [key_keyring], note: keyring gone}
    me: [head, body, carried, home, contacts, offsite]
```

## How a plan changes the model

- **A field replaces the model's whole field.** Nothing is merged inside it. To add a way in, restate the whole condition. To add a place to `me`, restate the whole list, as `spare_key` does to add `offsite`.
- **A new id adds a thing**, and needs a `kind` like any other.
- **`id: null` removes a thing** (or a scenario). Nothing left may still refer to it.
- **`field: null` removes a field**, such as `mirrors: null`, and `[]` empties a list, such as `in: []`.
- **Scenarios change the same way**, so a plan can add one that only makes sense with it, like `keys_lost`.

`spare_key` also shows a useful trick. Rather than rewriting every account that names `hw_key`, it turns `hw_key` into "any one of my keys": it empties `in` and reaches it through either real key. Everything that used `hw_key` now has a spare without changing.

## Several plans

Plans apply in order, and a later plan's field replaces an earlier one's. On the command line the order is the order of `--plan`; in the app, it's the order the document lists them, with a warning when two plans that are on set the same field.

## Running a plan

```text
$ ./reach.ts --plan spare_key
house_fire  (lockout: lost home, carried)
  # at night, everything is home
  documents      LOST  →  ok
  mail           LOST  →  ok
  code_host      UNSURE  if code_host.recovery (unknown)  →  ok
  bank           LOST  →  ok

nas_dies  (lockout: lost nas)
  # the pi keeps syncing, so the cloud copy empties too
  still          documents
  (no change)
```

Each changed verdict reads before → after. `still` lists the problems the plan leaves as they were. A plan combines with everything else on the command line, such as a scenario, an explanation or `--mermaid`, which then run against the model with the plan applied.

In the app, the Plans tab turns plans on and off, and shows what the plans that are on change, scenario by scenario. **Edit** sends the forms' changes into a plan instead of the model; editing a field copies its current value into the plan first, since the plan replaces the whole field. **Apply** merges a plan into the model and deletes it.

Plans are your drafts. Try a change as a plan, including a [template](templates.md) added as one, and apply it when you've made the change for real.
