# ReachLine: the built UI and the server, which Node runs as TypeScript.
#
#   docker build -t reachline .
#   docker run -p 6060:6060 -v reachline-data:/data -e PUBLIC_URL=https://reachline.example.com reachline

FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS build
WORKDIR /src
# Manifests first, so the install is cached until dependencies change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# The pnpm that package.json's packageManager names (less any +sha hash), as in CI.
RUN npm install -g "pnpm@$(node -p 'require("./package.json").packageManager.split("@")[1].split("+")[0]')"
COPY app/package.json app/
COPY server/package.json server/
RUN pnpm install --frozen-lockfile
# Only what the image needs: never data/ or .env (also kept out by .dockerignore).
COPY app app
COPY engine engine
COPY examples examples
COPY server server
# The command line, bundled with its docs into app/dist/reachline.mjs.
COPY cli cli
COPY docs docs
COPY reachline.ts tsconfig.json ./
RUN pnpm build && pnpm --filter reachline-server --prod deploy /out/server

FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
ENV NODE_ENV=production HOST=0.0.0.0 PORT=6060 DATA_DIR=/data
WORKDIR /app
COPY --from=build /out/server server
COPY --from=build /src/app/dist app/dist
RUN ln -s /app/server/reset-password.ts /usr/local/bin/reset-password \
  && mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 6060
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["node", "server/main.ts"]
