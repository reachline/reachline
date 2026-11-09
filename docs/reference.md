# Reference

Form labels from the app are in brackets.

## The Model File

```yaml
version: 1        # optional; the format version
things: {...}
scenarios: {...}
me: [...]
plans: {...}
```

Any other top-level key is an error, and so is a key written twice.

## Ids

Every thing has an id, and all things share one namespace. Scenarios and plans have names of their own. The app's forms make ids from lowercase letters, digits and `_`, never a YAML word such as `yes`, `on` or `null`.

`and`, `or` and `unknown` are the words of a condition, so no thing can have them as its id. `baseline` is the built-in normal day, so no scenario can have it as its name. A `?` anywhere is an error that says to write `unknown`.

## Lists

A list of one can go without brackets: `in: home` = `in: [home]`. A list of multiple needs brackets, as in `in: [head, safe]`, since `in: head, safe` or `in: head or safe` would read as a single id. `[]` is an empty list.

## Things

| Field | Shape | Meaning |
| --- | --- | --- |
| `kind` (Kind) | one word | Required. See [kinds](#kinds). |
| `check` (Check for) | list | `lockout` (lockouts report it if you can't reach it), `breach` (breaches report it if an attacker can). You should check the ends, not the means. |
| `in` (Lives in) | list of ids | Where it lives, physically or digitally. It's reached through any one of these, and gone once all of them are. May include `unknown`, a place you don't know: never lost, and reached only by assuming it. |
| `needs` (Needs) | condition | It exists only while this holds, reached or not. No `unknown`. |
| `access` (Accessed with) | condition | It's reached when this holds. |
| `recovery` (Recovered with) | condition | The same as `access`, reported as recovery. |
| `mirrors` (Mirrors) | `{of, by}` | A synced copy of `of`, kept in step by `by`. It's gone once `of` is, while `by` still exists. |
| `note`, `todo` | text | Free text. `./reach.ts --todo` lists the todos. |

A thing with no `in` and no `needs` always exists. Apart from a state, a thing with no `in`, `access` or `recovery` is reached only from where a scenario starts.

### Kinds

| Kind | For |
| --- | --- |
| `account` | Something you sign in to: email, the bank, cloud storage. |
| `data` | Files you care about: documents, backups. |
| `device` | Hardware, and the unlocked session on it: `phone`, `phone_unlocked`, `hw_key`. |
| `location` | A place: `home`, `safe`, `offsite`, and the roots `head`, `body`, `carried`, `contacts`. |
| `secret` | What proves it's you: passwords, PINs, authenticator seeds, recovery codes, fingerprints. |
| `service` | Something that runs, which you use: the password manager, a phone number, a domain, a sync job. |
| `state` | A condition of the moment: the password manager unlocked on the laptop. |

Only `state` changes how ReachLine treats a thing. A state isn't reached through anything: unless a scenario settles it, it holds as an assumption, for as long as it exists. `in` and `needs` can make it gone; `access` and `recovery` have no effect on it.

## Conditions

Conditions are things joined by `and` and `or`, with brackets, nested as deep as you like. The properties `needs`, `access` and `recovery` each hold one condition.

```yaml
needs: vm and (proxy_a or proxy_b)
access: (github_pw and (github_totp or (yubikey and yubikey_pin))) or github_recovery
recovery: mail and unknown
```

- `and` and `or` can't share a level without brackets. `a and b or c` will error, to prevent ambiguity.
- Each option of a top-level `or` is a separate way in, and the results name the one used. Inside brackets, an `or` takes the option that relies on the fewest assumptions, or the first written on a tie.
- `unknown` is allowed in `access` and `recovery`, and as a place in `in`. Nowhere else.

## Scenarios

| Field | Shape | Meaning |
| --- | --- | --- |
| `kind` | `lockout` or `breach` | Required. A lockout starts from `me`; a breach starts from `attacker`. |
| `lost` | list of ids | Gone in this scenario, along with everything that existed only through them. In a breach this applies to the attacker too. |
| `attacker` ("Attacker has") | list of ids | A breach's starting point, and nothing else. |
| `assume` | list of states | States that hold. |
| `deny` | list of states | States that don't hold. |
| `note` | text | Shown under the scenario's name. |

The normal day, `baseline`, is built in: `me`, nothing lost, no states settled. It comes first in every list of scenarios.

## `me` (On a normal day you have)

A list of ids: what you have without getting it through anything else, usually places. It's where the normal day and every lockout start.

## Plans

Each plan under `plans:` may have the properties `note`, `things`, `scenarios` and `me`. A field replaces the model's whole field, a new id adds a thing, `id: null` removes a thing or scenario, and plans apply in order. See [Plans](plans.md).

## Layout

The app writes the document in one layout when you edit through its forms or press Format: keys in the order written, two-space indents, a thing on one line when it fits, each condition as one string. It drops YAML comments, so keep explanations in `note` and `todo`.
