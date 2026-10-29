# ReachLine: the built UI and the server, which Node runs as TypeScript.
#
#   docker build -t reachline .
#   docker run -p 127.0.0.1:5199:5199 -v reachline-data:/data -e PUBLIC_URL=https://reach.example.com reachline

FROM node:26-alpine AS build
WORKDIR /src
RUN npm install -g pnpm@12.15.0
# Manifests first, so the install is cached until dependencies change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json app/
COPY server/package.json server/
RUN pnpm install --frozen-lockfile
# Only what the image needs: never data/ or .env (also kept out by .dockerignore).
COPY app app
COPY engine engine
COPY examples examples
COPY server server
RUN pnpm build && pnpm --filter reachline-server --prod deploy /out/server

FROM node:26-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5199 DATA_DIR=/data
WORKDIR /app
COPY --from=build /out/server server
COPY --from=build /src/app/dist app/dist
RUN ln -s /app/server/reset-password.ts /usr/local/bin/reset-password \
  && mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 5199
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["node", "server/main.ts"]
