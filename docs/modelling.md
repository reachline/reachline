# Modelling Your Setup

Start small, and think carefully. The starter model (one of the ways to start a new model in the app, and [`examples/starter.yml`](https://github.com/reachline/reachline/blob/main/examples/starter.yml)) has the usual things: a phone, a laptop, a password manager and a mail account. Grow it one account at a time and always check the source of truth to make sure you're capturing all the login, 2FA, recovery conditions, and any other relevant relations.

## Start from places

`me` is where everything is reached from, so begin with the places you start from: `head`, `body`, `carried` and `home`. A person who keeps something for you, such as a spare key or a copy of the emergency sheet, gets a place of their own, since what each of them could reach, or lose, is a scenario of its own. Places can sit inside other places: lose `home` and you lose the safe in it too.

```yaml
safe: {kind: location, in: home, lock: safe_combo, note: fire-rated box in the hall closet}
offsite: {kind: location, note: a friend's house across town}
```

A place you don't have on a normal day, such as a safe deposit box, stays out of `me` and gets a way in instead: `access: id_card and body`.

## `in` or `access`?

Ask two things about the container:

- If someone gets it, do they get this too?
- If it's destroyed, is this gone too?

If the answer is yes, use `in`. Whoever opens the vault has every password in it, and the files on the NAS die with the NAS:

```yaml
mail_pw: {kind: secret, in: vault}
docs_nas: {kind: data, in: nas}
```

If the answer is no, use `access`. The password manager is a cloud service that outlives your laptop, and the laptop is only one way in to it:

```yaml
vault:
  kind: service
  access: (laptop or phone) and pm_master
```

Name a device only when it's that device that counts: what's on it, what's signed in on it, or that it's already trusted. Any device you could buy or borrow, an attacker has too, so leave it out. Signing in to the vault from a new device is `pm_master and hw_key`, not `new_device and pm_master and hw_key`.

## Things that never disappear

A thing with no `in` and no `needs` always exists. That's right for most cloud-based things: your mail provider doesn't burn down with your house. It also means such a thing is reached only through `access`, `recovery` or `me`. Give it one of them, or nothing ever reaches it.

When an online thing does depend on something, say so with `needs`:

```yaml
mail: {kind: account, needs: domain, access: ...}
```

When the domain lapses, the account goes with it, and no password or recovery code brings it back. `needs` is about existence only: what it names doesn't have to be reachable, just still there.

## Locked things

A thief who takes your phone has the phone, not what's behind its lock screen. Say what gets past the lock with `lock`, and put what's behind it `in` the phone:

```yaml
phone: {kind: device, in: carried, lock: phone_pin or face}
mail_totp: {kind: secret, in: phone, note: authenticator app}
```

Every way in has to meet the lock too, so the id means the phone in use: `access: phone and pm_master` is signing in from it. A safe with a combination, an encrypted backup and a SIM with a PIN work the same way.

What works just by holding the device, without unlocking it, is a thing of its own beside it. A SIM with no PIN works in any phone, so it's `in` wherever the phone is, not `in` the phone:

```yaml
sim: {kind: device, in: carried, note: no SIM PIN}
phone_number: {kind: service, access: sim or carrier}
```

Text messages shown on the lock screen are the same: model them beside the phone if your previews are on.

## States: what may or may not hold

Some access depends on the moment: the password manager happens to be open, or the mail app is signed in. Make each one a thing of kind `state`, `in` the device it's on:

```yaml
pm_open_laptop: {kind: state, in: laptop, note: password manager unlocked on the laptop}
vault:
  kind: service
  access: ((laptop or phone) and pm_master) or pm_open_laptop or ...
```

A state is reached only through where it is, as an assumption: the vault is open to whoever gets past the laptop's lock, if the password manager happens to be unlocked. A state with no `in` holds for anyone, so keep those for what really is everywhere.

The device being unlocked at the moment is a state too, and it belongs in the lock: `lock: laptop_pw or finger or laptop_open`. Only someone who already has the laptop meets its lock, so a state there is safe on its own. Give it no `in`: a state inside the laptop could only be reached by getting past the lock it's meant to open. A breach that reaches the laptop then reports what's on it as DEPENDS on `laptop_open`; leave the state out if that's not a question you want asked.

A scenario can settle a state: `assume` says it holds and `deny` says it doesn't.

```yaml
laptop_taken_open:
  kind: breach
  has: laptop
  assume: [laptop_open, pm_open_laptop]
```

## Check the ends, not the means

Check what you'd hate to lose or have taken for its own sake: mail, documents, money. Don't check the passwords, keys, devices and servers that lead there. ReachLine follows them anyway, and checking them buries the headline under a list of everything a fire burns. Now and then a hub earns a check of its own because it is the headline, as the password manager does for breaches in the example.

What isn't checked still shows up in the app, under "Also affected" in the Scenarios tab.

## Say what you don't know

When you're not sure, write `unknown` rather than guessing, and add a `todo` saying what to find out.

```yaml
gmail:
  kind: account
  access: gmail_pw and (gmail_totp or (yubikey and yubiky_pin))
  recovery: unknown
  todo: what does support ask for once the 2FA is gone?
```

In `in`, `unknown` is a place you don't know. It's never gone, and it's reached only by assuming it. `in: [home, unknown]` is reached outright through home, and becomes UNSURE once home is gone.

`unknown` can't go in `needs`: ReachLine can't say something "might be gone". If you're not sure what a thing depends on, say so in a `todo`.

## Copies

A secret kept in two places, memorised and on a sheet in the safe, is one thing with `in: [head, safe]`, as long as you only lose it everywhere at once. When the copies can go separately (you forget it, but the sheet is still there), make each copy a thing and reach the secret through either:

```yaml
pm_master: {kind: secret, access: pm_master_mem or pm_master_sheet}
pm_master_mem: {kind: secret, in: head}
pm_master_sheet: {kind: secret, in: safe}
```

Then `gone: pm_master_mem` is forgetting it, and the sheet still works. `gone: pm_master` would take every copy.

## Syncs are not backups

When a file is deleted at the source, a sync deletes the copy. `mirrors` says a copy works that way:

```yaml
docs_nas: {kind: data, in: nas}
docs_cloud: {kind: data, in: storage, mirrors: {of: docs_nas, by: sync_job}}
sync_job: {kind: service, in: pi}
```

The copy is gone once its source is, as long as `sync_job` is still running to carry the loss over. If the sync goes down too, the copy survives: lose both the NAS and the Pi, and the cloud copy is still there. A versioned backup that keeps old versions isn't a mirror, so leave `mirrors` out for one.

## Recovery

`recovery` works exactly like `access`. It's a separate field so that the results can show when you're relying on it (`via recovery phone_number`), and so that an `unknown` in it is named `code_host.recovery`, apart from one in `access`. When access and recovery rely on the same assumptions, access is the one reported.

## Scenarios worth writing

A handful covers most setups:

| Scenario | As written |
| --- | --- |
| You lose what you carry | `{kind: lockout, gone: carried}` |
| A house fire, at night | `{kind: lockout, gone: [home, carried]}` |
| You forget your master password | `{kind: lockout, gone: pm_master_mem}` |
| A device dies | `{kind: lockout, gone: nas}` |
| Your partner, if you can't act | `{kind: lockout, has: [home, partner]}` |
| A thief takes what you carry | `{kind: breach, has: carried}` |
| A burglary | `{kind: breach, has: home}` |
| A laptop taken while unlocked | `{kind: breach, has: laptop, assume: [laptop_open, pm_open_laptop]}` |
| A SIM swap | `{kind: breach, has: phone_number}` |
| Your partner, while you're here | `{kind: breach, has: [home, partner]}` |

`gone` takes the thing itself, wherever it is, so `gone: pm_master` loses every copy (see [Copies](#copies)). Losing a place takes only what's in that place alone.

For your partner, or whoever would act for you, make a place such as `partner` for what they know and have, and put things `in` it: `safe_combo: {kind: secret, in: [head, partner]}`. The lockout lists what you'd reach on a normal day that they can't; the breach, what they can reach while you're here.

## Notes, not comments

When you edit through the app's forms, or press Format, the app rewrites the whole document in one layout and drops YAML comments. Keep explanations in `note` and open questions in `todo`.
