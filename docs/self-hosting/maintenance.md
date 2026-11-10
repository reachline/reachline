# Maintenance

## Backups

Everything ReachLine keeps is in `reachline-data`. Copying it while the server runs can catch the database mid-write, so stop it first:

```sh
docker compose stop
tar czf reachline-$(date +%F).tar.gz reachline-data
docker compose start
```

A backup can read every model, so keep it as carefully as the server. To restore one, stop the server, replace `reachline-data` with the backup's, and start it again.

## Upgrading

A release comes out on the first of each month when there's something new, and at once for a security fix. Read its [notes](https://github.com/reachline/reachline/releases) first: anything you need to do, such as changing a setting, is under **Breaking changes**. Until 1.0, any release may have some.

```sh
docker compose pull
docker compose up -d
```

The server upgrades the database when it starts. Downgrade is not supported; to go back to an older version, restore the backup you took before upgrading.

## A forgotten password

Give the user a new random password, which also signs them out everywhere:

```sh
docker compose exec reachline reset-password <username>
```

It prints the new password. Tell them to change it on their account page.
