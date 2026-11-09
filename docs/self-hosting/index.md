# Self-hosting

ReachLine runs on a server you own, for yourself or a few people you trust. There is no central instance and no telemetry. The page makes no requests anywhere but your server, and its Content Security Policy enforces that. The engine runs in the browser; the server stores each model as YAML text, keeps every saved revision, and never interprets it.

## What the server holds

A model is a map of someone's weak points, and models aren't encrypted on the server. Whoever controls the server, its data volume or its backups can read every model on it. Treat them as you would your password manager's backups.

## Requirements

- Docker with Compose.
- A domain name, and a reverse proxy in front of ReachLine that serves it over HTTPS. ReachLine refuses to start with a plain `http://` address other than `127.0.0.1` or `localhost`. The proxy also owns HSTS.

## Installing

1. In a directory of its own, download the compose file, and the settings template as `.env`:

   ```sh
   curl -O https://raw.githubusercontent.com/reachline/reachline/main/docker-compose.yml
   curl -o .env https://raw.githubusercontent.com/reachline/reachline/main/.env.template
   ```

2. In `.env`, set `PUBLIC_URL` to the address people will use, such as `https://reach.example.com`.
3. Start it:

   ```sh
   docker compose up -d
   ```

4. Point your reverse proxy at `127.0.0.1:5199`.
5. Open the address and create your account. The first account can always be created.

The image is `ghcr.io/reachline/reachline:main`, built from the latest commit on `main`. The database lives in the `reachline-data` volume, mounted at `/data`.

The compose file publishes the port on `127.0.0.1` only, so ReachLine can't be reached around the proxy. If your proxy runs in Docker too, put both containers on one network and remove the `ports` section instead.

## Settings

Settings go in `.env`, and the comments there describe each one. After changing one, run `docker compose up -d` again. The image sets `HOST`, `PORT` and `DATA_DIR`, and the compose file doesn't pass them on, so leave them empty.

Registration is open until you close it, so anyone who reaches the page can create an account. Once your accounts exist, set `AUTH_REGISTRATION=0`.

Next: [auth](auth.md), with passwords or single sign-on, and [maintenance](maintenance.md): backups, upgrades and lost passwords.
