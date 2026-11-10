# Contributing to ReachLine

The following guidelines are designed for contributors to ReachLine.

## Reporting Issues and Questions

For reporting a bug, a failed function or requesting a new feature, open an issue in GitHub's [issue tracker](https://github.com/reachline/reachline/issues). First, seach through existing issues (open or closed) that might have the answer to your question.

When reporting a bug, it is most helpful to include:

- A quick background/summary
- Specific steps to reproduce
- The expected result
- The actual result
- Notes (i.e. why you think this might be happening)

To report a vulnerability, follow [SECURITY.md](SECURITY.md) instead, not a public issue.

## Contributing Code

To make contributions to ReachLine, request your changes or contributions via a pull request against `main`.

Please use the following steps:

1. Fork the reachline repository to your GitHub account.
2. Clone your fork locally with `git clone`.
3. Create a new branch with a name that describes your contribution. For example, if your contribution is a bug fix to the routing, your new branch can be named `bugfix/routing`. You can create and switch to it with `git checkout -b bugfix/routing`.
4. Make your changes on this new branch, and run `pnpm verify`.
5. Push your changes to your fork.
6. [Create a pull request](https://github.com/reachline/reachline/pulls) against `main`, with a title in the form below. Pull requests are squash-merged, so the title becomes the commit.

## Commit Messages

Commits to `main` follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`, with the scope optional, such as `fix(server): reject expired sessions`. The type decides what the next release is and where the commit appears in its notes:

| Type                                                       | Release | Notes                    |
| ---------------------------------------------------------- | ------- | ------------------------ |
| `feat`                                                     | minor   | Features                 |
| `fix`, `perf`                                              | patch   | Fixes, Performance       |
| `!` before the colon, or a `BREAKING CHANGE:` footer       | major   | Breaking changes, first  |
| `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `style` | none    | left out                 |

Until 1.0, a breaking change bumps the minor version instead. A change is breaking when someone running ReachLine has to do something to upgrade: edit their models, change a setting in `.env`, reconfigure sign-in, or move their data. Say what in the commit's body; database migrations that run by themselves aren't breaking. `pnpm install` sets up a hook that checks the form.

## Releases

A release is made from `main` on the first of each month, when there's something to release, and at once when a security fix lands. The `Release` workflow tags it, publishes the image (`latest`, and its version) and writes the notes from the commits. Preview the next one with `pnpm exec git-cliff --unreleased --bump`, or release now by running the workflow by hand.

## License

By contributing, you agree that your contributions will be licensed under the [GNU AGPLv3](LICENSE).
