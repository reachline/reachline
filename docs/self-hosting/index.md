# Self-hosting

ReachLine runs on a server you own, for yourself or a few people you trust. There is no central instance and no telemetry. The page makes no requests anywhere but your server, and its Content Security Policy enforces that. The engine runs in the browser; the server stores each model as YAML text, keeps every saved revision, and never interprets it.

## What the server holds

A model is a map of someone's weak points, and models aren't encrypted on the server. Whoever controls the server, its data volume or its backups can read every model on it.

## Requirements

- Docker with Compose.
- Ideally, a domain name and a reverse proxy in front of ReachLine that serves it over HTTPS, and owns HSTS. Plain `http://` works too, but then passwords and sessions cross the network unencrypted, unless the network itself is (a VPN such as Tailscale); ReachLine warns about it when it starts.

## Installing

1. In a directory of its own, download the compose file, and the settings template as `.env`:

   ```sh
   curl -O https://raw.githubusercontent.com/reachline/reachline/main/docker-compose.yml
   curl -o .env https://raw.githubusercontent.com/reachline/reachline/main/.env.template
   ```

2. In `.env`, set `PUBLIC_URL` to the address people will use, such as `https://reachline.example.com`. The container runs as uid and gid 1000; to run it as someone else, set `PUID` and `PGID` there too.
3. Create the data directory, as the user the container runs as, and start it:

   ```sh
   mkdir reachline-data
   docker compose up -d
   ```

4. Point your reverse proxy, if you have one, at port 6060.
5. Open the address and create your account. The first account can always be created.

The image is `ghcr.io/reachline/reachline:latest`, the latest release. To choose when you upgrade, pin a version instead, such as `:0.1.0`; `:main` is built from every commit to `main`, for trying what's next. The database lives in `reachline-data`, mounted at `/data`. If Docker creates that directory itself, root owns it and ReachLine can't write to it; `chown` it to `PUID:PGID`.

Docker's published ports bypass host firewalls such as ufw. With a reverse proxy on the same host, publish the port as `127.0.0.1:6060:6060`, so ReachLine can't be reached around it. If your proxy runs in Docker too, put both containers on one network and remove the `ports` section instead.

## Settings

Settings go in `.env`, and the comments there describe each one. After changing one, run `docker compose up -d` again.

Registration is open by default, so anyone who reaches the page can create an account. Set `AUTH_REGISTRATION=0` to disable registration, for both password and OIDC login.

Next: [auth](auth.md), with passwords or single sign-on, and [maintenance](maintenance.md): backups, upgrades, and lost passwords.
