# Concepts

## Things

Everything in a model is a **thing**: the places you keep stuff, your devices, passwords and keys, the services and accounts you use, and your data. Each has an id under `things:` and a `kind`, and is referred to by its id everywhere else.

```yaml
things:
  home: {kind: location}
  laptop: {kind: device, in: home, lock: laptop_pw or finger}
  mail_pw: {kind: secret, in: vault}
  mail:
    kind: account
    access: mail_pw and (mail_totp or hw_key)
```

## Two questions

In every scenario, ReachLine asks two questions of every thing:

1. **Does it still exist?** A fire destroys the laptop. A lapsed domain takes the mail account that runs on it.
2. **Can someone get to it?** Your password manager survives the fire, but without a device and the master password you can't open it.

The difference matters. Something that's gone can't be reached at all: not by you, not through recovery, not by an attacker. Something that still exists might be reached some other way.

Each field answers one question or both:

| Field | Does it still exist? | Can it be reached? |
| --- | --- | --- |
| `in` | yes, until every place it's in is gone | yes, through any one of those places |
| `needs` | only while the condition holds | — |
| `access`, `recovery` | — | when the condition holds |
| `lock` | — | only when this holds too, however it's reached |
| `mirrors` | not once its source is gone, while the sync still runs | — |

## Facts and conditions

Fields come in two shapes.

**A list states facts, all true at once.** `in: [head, partner]` says the safe's combination is in your memory *and* your partner's. What follows is that reaching either one reaches it, and it's gone only once both are.

**A condition says what it takes**, as ids joined by `and` and `or`, with brackets:

```yaml
access: mail_pw and (mail_totp or hw_key)
```

That reads as it sounds: the password, and either the authenticator code or the security key. Conditions appear in four fields, `needs`, `access`, `recovery` and `lock`. Every other list states facts.

## Locks

Holding a thing isn't the same as using it. A thief with your phone has the phone, not what's behind its lock screen. `lock` says what it takes to get past:

```yaml
phone: {kind: device, in: carried, lock: phone_pin or face}
mail_totp: {kind: secret, in: phone}
```

Every way in has to meet the lock as well, so reaching `carried` gets someone the phone only with the PIN or your face, and the authenticator behind it with it. The id means the thing in use: `access: phone and pm_master` is signing in from the unlocked phone. A safe's combination and an encrypted backup's key are locks too.

## The normal day

Everything has to be reached from somewhere. `me` lists where you start: what you have without getting it through anything else. These are almost always places.

```yaml
me: [head, body, carried, home, contacts]
```

`head` holds what you remember, `body` your fingerprints and face (and turning up in person), `carried` what's on you when you're out, and `contacts` the people who'd lend you a device. A password is reached because it's `in: head`, and the laptop because it's `in: home` and you know its password.

`me` with nothing gone is the **normal day**. It's built in as a scenario called `baseline`, and every lockout is measured against it.

## Scenarios

A scenario is something going wrong.

- A **lockout** asks what you can still reach: `house_fire: {kind: lockout, gone: [home, carried]}`. ReachLine starts from `me`, takes away what's gone and everything that existed only through it, and works out what you can still reach.
- A **breach** asks what someone else can reach: `thief_carried: {kind: breach, has: carried}`. ReachLine starts from what the attacker `has`, and nothing else (not your memory, not your face), and works out what they can reach.

A lockout can start from someone else's `has` instead of `me`. `{kind: lockout, has: [home, partner]}` asks what your partner could reach if you couldn't act, and it's still measured against your normal day, so it lists what you'd have that they can't get to.

## Checks

You don't want a verdict on every password and device. `check` marks the ends: what you care about for its own sake, such as your mail, your documents and your money.

```yaml
mail: {kind: account, check: [lockout, breach], access: ...}
```

ReachLine follows everything that leads to a checked thing, so a stolen key shows up as the accounts it opens. A lockout reports the checked things you lose, and a breach the checked things the attacker gets.

## Unknowns and states

Two things make a result less than certain:

- **`unknown`** stands for a fact about your setup you don't know, such as what support asks for once your second factor is gone: `recovery: unknown`. A result that relies on one is **UNSURE**.
- A **state** (a thing of kind `state`) is a condition of the moment, such as the password manager being unlocked on the laptop. It might hold on the day or not, so ReachLine never assumes either way. A result that relies only on states **DEPENDS**. A state that's `in` something, such as a session on the phone, is reached only through it.

Every verdict names what it relies on, so you can see what to find out or what to fix. [Reading the results](results.md) covers verdicts in full.

## Plans

A plan is a change you're considering, written as an overlay on the model: a spare security key, or a backup instead of a sync. ReachLine shows the before and after for every scenario. See [Plans](plans.md).
