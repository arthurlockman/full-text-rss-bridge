# syntax=docker/dockerfile:1

##
## Full-Text RSS Bridge
##
## Multi-stage build on the official Playwright image, which bundles Chromium
## and all of its OS dependencies. The image tag MUST match the `playwright`
## npm version in package.json so the bundled browser matches the client.
##

ARG PLAYWRIGHT_VERSION=1.61.1

# ---------------------------------------------------------------------------
# Builder: compile TypeScript and produce a production node_modules.
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble AS builder

WORKDIR /app
ENV NODE_ENV=development

# Toolchain for native modules (better-sqlite3, argon2).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev

# ---------------------------------------------------------------------------
# Runtime: app + virtual display + noVNC bridge for interactive capture.
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data \
    DISPLAY=:99 \
    VNC_PORT=5900 \
    NOVNC_PORT=6080 \
    NOVNC_URL=/novnc/vnc.html

# Virtual display + VNC/noVNC stack used by the interactive login capture.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       xvfb x11vnc x11-utils novnc websockify \
  && rm -rf /var/lib/apt/lists/*

# Production artifacts from the builder.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/package.json ./package.json
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# SQLite DB, session state, and caches live here — mount a volume.
RUN mkdir -p /data
VOLUME ["/data"]

# Web UI + feed endpoints. noVNC is proxied same-origin under /novnc, so only
# this one port needs to be published.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
