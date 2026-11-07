# Templates

A template adds a common service in one go: GitHub, Google or Cloudflare with its password, second factors and recovery, as the service's own documentation describes them.

## Adding one

In the app, choose **Add**, then **From a template**, and search by name. Then:

- **Prefix:** the template's ids start with it (`github_pw`, `github_totp`). Change it to add a second account at the same service.
- **Optional things:** tick what you've actually set up, such as an authenticator, SMS codes or a security key. Leaving one out removes it as if it was never set up. Where that leaves no choice for a step, the service doesn't ask for that step, so no second factor means the password alone.
- **Slots:** the things of yours the template connects to, such as where the password is kept or the phone with your authenticator. Bind each one to your own thing, or leave it and the template creates one. A thing of yours with the slot's id is chosen for you, and the starter model uses those ids. A slot that nothing needs any more, once you've left things out, isn't created.

A preview shows what's added and which verdicts change. **Add to model** adds it; **Add as a plan** puts it in a new [plan](plans.md) to try first.

## Writing one

Templates live in `templates/`, one file each, and new ones are welcome by pull request. A template is a model fragment under a `template:` header. Shortened from `templates/github.yml`:

```yaml
template:
  name: GitHub
  note: A GitHub account with two-factor authentication.
  checked: 2026-10-30
  links:
    About two-factor authentication: https://docs.github.com/...
  prefix: github
  slots:
    vault: Where the password is kept
    phone_unlocked: The unlocked phone with your authenticator app
    safe: Where the recovery codes are kept
  optional:
    github_totp: true
    github_codes: true

things:
  vault: {kind: service}
  phone_unlocked: {kind: device}
  safe: {kind: location}

  github_pw: {kind: secret, in: vault}
  github_totp: {kind: secret, in: phone_unlocked, note: an authenticator app}
  github_codes: {kind: secret, in: safe, note: recovery codes}
  github:
    kind: account
    check: [lockout, breach]
    access: github_pw and github_totp
    recovery: github_pw and github_codes
```

| Field | Meaning |
| --- | --- |
| `name`, `note` | What the dialog shows. |
| `checked` | When the facts were last checked against the service's docs, as `YYYY-MM-DD`. |
| `links` | Those docs: a title and an `https` URL each. Cite them for every claim the template makes. |
| `prefix` | Ids that are the prefix or start with `prefix_` take the prefix the user chooses. |
| `slots` | Things the user probably has, each with a label saying which of theirs it means. Use the starter's ids where they fit, so the template binds to them unasked. |
| `optional` | Things the user may not have set up, labelled by their `note`. `true` means ticked to start with. |

Under `things:`, give each slot a `kind` and little else, since it's usually replaced by the user's own thing. Give the service's things ids that start with the prefix. The template file is never rewritten by the app, so comments are fine, and are a good place to say how the service's recovery really works. `test/template.test.ts` checks that each template loads with every option and with none, and adds cleanly to the starter.
