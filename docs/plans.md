# Plans

A plan is a change you're considering, kept in the same document under `plans:`. It has the same `things`, `scenarios` and `me` as the model, plus a `note`, and gives only what it changes. ReachLine shows every scenario before and after.

```yaml
plans:
  spare_key:
    note: a second FIDO2 key kept off-site, and no more mail resets by SMS
    things:
      offsite: {kind: location, note: a friend's house across town}
      key_keyring: {kind: device, in: carried}
      key_offsite: {kind: device, in: offsite}
      hw_key:
        in: []
        access: key_keyring or key_offsite
        note: any one of my keys; every account enrolls both
      mail: {recovery: mail_codes}
    scenarios:
      keys_lost: {kind: lockout, gone: key_keyring, note: keyring gone}
    me: [head, body, carried, home, offsite]
```

## How a plan changes the model

- **A field replaces the model's whole field.** Nothing is merged inside it. To add a way in, restate the whole condition. To add a place to `me`, restate the whole list, as `spare_key` does to add `offsite`.
- **A new id adds a thing**, and needs a `kind` like any other.
- **`id: null` removes a thing** (or a scenario). Nothing left may still refer to it.
- **`field: null` removes a field**, such as `mirrors: null`, and `[]` empties a list, such as `in: []`.
- **Scenarios change the same way**, so a plan can add one that only makes sense with it, like `keys_lost`.

`spare_key` also shows a useful trick. Rather than rewriting every account that names `hw_key`, it turns `hw_key` into "any one of my keys": it empties `in` and reaches it through either real key. Everything that used `hw_key` now has a spare without changing.

## Several plans

Plans apply in order, and a later plan's field replaces an earlier one's. In the app, that's the order the document lists them, with a warning when two plans that are on set the same field. On the command line, it's the order you give them.

## Seeing what it changes

ReachLine runs every scenario with and without the plan. Each verdict that changes reads before → after, as in `mail  LOST  →  ok`, and `still` lists the problems the plan leaves as they were. For the command line, see [Trying a plan](cli.md#trying-a-plan).

In the app, turn plans on from **Plans** above the graph. The graph then shows the model with them, and the Plans tab shows what they change, scenario by scenario. **Edit** chooses where Add and the forms write: the model, or one plan. A field you edit in a plan is written there whole, since the plan replaces the whole field. **Apply…** shows what a plan changes in the model, then merges it in and removes the plan.
