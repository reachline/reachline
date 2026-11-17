# Self-Hosting

ReachLine runs on your hardware only. There is no central instance and no telemetry. The page makes no requests anywhere but your server, and its Content Security Policy enforces that. The engine runs in the browser; the server stores each model as YAML text, keeps every saved revision, and never interprets it.

## What the server holds

A model is a map of someone's weak points, and models aren't encrypted on the server. Whoever controls the server, its data volume or its backups can read every model on it.

## Requirements

- Docker with Compose.
- Ideally, a domain name and a reverse proxy in front of ReachLine that serves it over HTTPS.

## Installing

1. In a directory of its own, download the compose file, and the settings template as `.env`:

   ```sh
   curl -O https://raw.githubusercontent.com/reachline/reachline/main/docker-compose.yml
   curl -o .env https://raw.githubusercontent.com/reachline/reachline/main/.env.template
   ```

2. In `.env`, set `PUBLIC_URL` to the address people will use, such as `https://reachline.example.com`.
3. Create the data directory, as the user the container runs as, and start it:

   ```sh
   mkdir reachline-data # ensure ownership matches the puid:pgid set in the docker-compose
   docker compose up -d
   ```

4. Point your reverse proxy, if you have one, at port 6060.
5. Open the address and create your account. The first account can always be created.

The image is `ghcr.io/reachline/reachline:latest`, the latest release. To choose when you upgrade, pin a version instead, such as `:0.1.0`; `:main` is built from every commit to `main`, for trying what's next. The database lives in `reachline-data`, mounted at `/data`. If Docker creates that directory itself, root owns it and ReachLine can't write to it; `chown` it to `PUID:PGID`.
