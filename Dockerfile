# School Theatre Manager for a school server (Linux / Docker).
#
#   docker build --target server -t school-theatre-server .   the server API (data, sign-in, files, backups)
#   docker build --target web    -t school-theatre-web .      the screens, for browsers on the school network
#
# See deploy/compose.yaml and docs/INTRANET-SETUP.md. Nothing here needs the internet once built.

FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
# better-sqlite3 ships prebuilt binaries; nothing needs compiling
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run server:build && npm run build \
 && mkdir -p /out/bs && cp -r node_modules/better-sqlite3/lib node_modules/better-sqlite3/prebuilds node_modules/better-sqlite3/package.json /out/bs/

# ---------- the server API ----------
FROM node:22-bookworm-slim AS server
WORKDIR /app
COPY --from=build /src/apps/server/dist/server.cjs /src/apps/server/dist/stm-tool.cjs ./
COPY --from=build /src/packages/core/drizzle ./drizzle
COPY --from=build /out/bs ./node_modules/better-sqlite3
ENV NODE_ENV=production STM_DATA_DIR=/data STM_MIGRATIONS=/app/drizzle HOST=0.0.0.0 PORT=8417
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8417 8418/udp
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8417)+'/api/v1/ping').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.cjs"]

# ---------- the screens ----------
FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY --from=build /src/apps/client/.next/standalone ./
COPY --from=build /src/apps/client/.next/static ./apps/client/.next/static
COPY --from=build /src/apps/client/public ./apps/client/public
# STM_API_URL: where the server is, e.g. http://school-theatre-server:8417
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/ping').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/client/server.js"]
