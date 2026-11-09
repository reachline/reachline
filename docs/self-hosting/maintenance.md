# Maintenance

## Backups

Everything ReachLine keeps is in one SQLite database, `reachline.db`, in the `reachline-data` volume. Copying it while the server runs can catch it mid-write, so stop it first:

```sh
docker compose stop
docker run --rm -v reachline_reachline-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/reachline-$(date +%F).tar.gz -C /data .
docker compose start
```

Compose prefixes the volume's name with the project's, which is the directory's name; `docker volume ls` shows it. A backup can read every model, so keep it as carefully as the server.

To restore one, stop the server, replace the volume's contents, and start it again:

```sh
docker compose stop
docker run --rm -v reachline_reachline-data:/data -v "$PWD":/backup alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/reachline-2026-11-08.tar.gz -C /data'
docker compose start
```

## Upgrading

```sh
docker compose pull
docker compose up -d
```

A new setting needs the newer `docker-compose.yml` too, since the compose file lists the settings it passes on; the release notes will say. The server upgrades the database when it starts. There's no downgrade: to go back to an older version, restore the backup you took before upgrading.

## A forgotten password

Give the user a new random password, which also signs them out everywhere:

```sh
docker compose exec reachline reset-password <username>
```

It prints the new password. Tell them to change it on their account page.
