# Modelling your setup

Start small. The starter model (one of the ways to start a new model in the app, and [`examples/starter.yml`](../examples/starter.yml)) has the usual places, a phone, a laptop, a password manager and a mail account. Grow it one account at a time and run the scenarios as you go. A model that's honest about a few accounts beats a detailed one you never finish.

## Start from places

`me` is where everything is reached from, so begin with the places you start from: `head`, `body`, `carried`, `home`, and `contacts` if friends would lend you a device. Places can sit inside other places: lose `home` and you lose the safe in it too.

```yaml
safe: {kind: location, in: [home], note: fire-rated box in the hall closet}
offsite: {kind: location, note: a friend's house across town}
```

A place you don't have on a normal day, such as a safe deposit box, stays out of `me` and gets a way in instead: `access: id_card and body`.

## `in` or `access`?

This is the question that comes up most. Ask two things about the container:

- If someone gets it, do they get this too?
- If it's destroyed, is this gone too?

If the answer is yes, use `in`. Whoever opens the vault has every password in it, and the files on the NAS die with the NAS:

```yaml
mail_pw: {kind: secret, in: [vault]}
docs_nas: {kind: data, in: [nas]}
```

If the answer is no, use `access`. The password manager is a cloud service that outlives your laptop, and the laptop is only one way in to it:

```yaml
vault:
  kind: service
  access: (laptop_unlocked and pm_master) or (phone_unlocked and pm_master)
```

`in` works for digital places as well as physical ones: a password in the vault, a file on the NAS, a copy in cloud storage.

## Things that never disappear

A thing with no `in` and no `needs` always exists. That's right for most online things: your mail provider doesn't burn down with your house. It also means such a thing is reached only through `access`, `recovery` or `me`. Give it one of them, or nothing ever reaches it.

When an online thing does depend on something, say so with `needs`:

```yaml
mail: {kind: account, needs: domain, access: ...}
```

When the domain lapses, the account goes with it, and no password or recovery code brings it back. `needs` is about existence only: what it names doesn't have to be reachable, just still there.

## Devices and their unlocked sessions

A thief who takes your phone has the phone, not what's behind its lock screen. Model a device as two things:

```yaml
phone: {kind: device, in: [carried]}
phone_unlocked: {kind: device, access: phone and (phone_pin or face)}
mail_totp: {kind: secret, in: [phone_unlocked], note: authenticator app}
```

What lives behind the lock goes `in` the unlocked one. What anyone holding the device can use hangs off the device itself, such as the SIM for text messages: `phone_number: {kind: service, access: phone or carrier}`.

## States: what's true on the day

Some access depends on the moment: the password manager happens to be open, or the mail app is signed in. Make each one a thing of kind `state`, and use it in a condition alongside the device it's on:

```yaml
pm_open_laptop: {kind: state, note: password manager unlocked on the laptop}
vault:
  kind: service
  access: (laptop_unlocked and (pm_master or pm_open_laptop)) or ...
```

A state isn't reached through anything. It holds or it doesn't, for everyone, so never let one grant access on its own: `access: pm_open_laptop` would hand the vault to a stranger whenever it's open. Pair it with what it's on, as above.

A scenario can settle a state: `assume` says it holds and `deny` says it doesn't. The example forgets the master password twice, once as it stands (the results DEPEND on the password manager being open somewhere) and once logged out everywhere:

```yaml
forgot_master_logged_out:
  kind: lockout
  lost: [pm_master]
  deny: [pm_open_laptop, pm_open_phone]
```

## Check the ends, not the means

Check what you'd hate to lose or have taken for its own sake: mail, documents, money. Don't check the passwords, keys, devices and servers that lead there. ReachLine follows them anyway, and checking them buries the headline under a list of everything a fire burns. Now and then a hub earns a check of its own because it is the headline, as the password manager does for breaches in the example.

What isn't checked still shows up in the app, under "Also affected" in the Scenarios tab.

## Say what you don't know

When you're not sure, write `unknown` rather than guessing, and add a `todo` saying what to find out. `./reach.ts --todo` lists the todos.

```yaml
code_host:
  kind: account
  access: code_pw and (code_totp or (hw_key and key_pin))
  recovery: unknown
  todo: what does support ask for once the 2FA is gone?
storage:
  kind: account
  access: storage_pw and hw_key
  recovery: mail and unknown   # a reset by email, if it gets past the key
old_drive:
  kind: device
  in: [unknown]
  todo: find it; either in the attic or at my parents'
```

In `in`, `unknown` is a place you don't know. It's never lost, and it's reached only by assuming it. `in: [home, unknown]` is reached outright through home, and becomes UNSURE once home is gone.

`unknown` can't go in `needs`: ReachLine can't say something "might be gone". If you're not sure what a thing depends on, say so in a `todo`.

## Syncs are not backups

When a file is deleted at the source, a sync deletes the copy. `mirrors` says a copy works that way:

```yaml
docs_nas: {kind: data, in: [nas]}
docs_cloud: {kind: data, in: [storage], mirrors: {of: docs_nas, by: sync_job}}
sync_job: {kind: service, in: [pi]}
```

The copy is gone once its source is, as long as `sync_job` is still running to carry the loss over. If the sync goes down too, the copy survives: lose both the NAS and the Pi, and the cloud copy is still there. A versioned backup that keeps old versions isn't a mirror, so leave `mirrors` out for one.

## Recovery

`recovery` works exactly like `access`. It's a separate field so that the results can show when you're relying on it (`via recovery phone_number`), and so that an `unknown` in it is named `code_host.recovery`, apart from one in `access`. When access and recovery rely on the same assumptions, access is the one reported.

## Scenarios worth writing

A handful covers most setups:

| Scenario | As written |
| --- | --- |
| You lose what you carry | `{kind: lockout, lost: [carried]}` |
| A house fire, at night | `{kind: lockout, lost: [home, carried]}` |
| You forget the master password | `{kind: lockout, lost: [pm_master]}` |
| A device dies | `{kind: lockout, lost: [nas]}` |
| A thief takes what you carry | `{kind: breach, attacker: [carried]}` |
| A burglary | `{kind: breach, attacker: [home]}` |
| A laptop taken while unlocked | `{kind: breach, attacker: [laptop, laptop_unlocked], assume: [pm_open_laptop]}` |
| A SIM swap | `{kind: breach, attacker: [carrier]}` |

`lost` takes the thing itself, wherever it is, so `lost: [pm_master]` loses the sheet in the safe as well. Losing a place takes only what's in that place alone.

## Notes, not comments

When you edit through the app's forms, or press Format, the app rewrites the whole document in one layout and drops YAML comments. Keep explanations in `note` and open questions in `todo`.
