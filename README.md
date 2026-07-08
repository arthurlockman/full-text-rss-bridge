# Full-Text RSS Bridge

A self-hosted feed proxy that turns **partial / paywalled RSS feeds into
full-text feeds** using *your own* subscription login.

Many paid publications (e.g. [Defector](https://defector.com)) publish RSS feeds
that contain only summaries. As a paying subscriber you can read the full
article in your browser. This tool captures your authenticated session, fetches
each article the way your browser would, extracts the readable body, and
republishes a new full-text feed URL you can subscribe to in any reader.

> **Personal use only.** This is intended for reading content **you already pay
> for**, on your own machine. It stores your session, not your password, and it
> does not redistribute credentials or content. Respect each site's Terms of
> Service; do not make the generated feeds public.

---

## How it works

```
 source RSS ─▶ parse ─▶ fetch each article with your authenticated ─▶ extract ─▶ cache ─▶ /feed/:token
 (rss-parser)           session (Playwright/Chromium)                 (Readability   (SQLite)  (RSS/Atom/JSON)
                                                                       or selectors)
```

- **Interactive login capture** — add a site, click *Capture session*, and log
  in (including 2FA/captcha) through an embedded browser (noVNC). The resulting
  session (`storageState`) is stored and reused. A **cookie/JSON import**
  fallback is also provided.
- **Extraction** — [Mozilla Readability](https://github.com/mozilla/readability)
  by default, with optional per-feed CSS selector overrides. Output is
  sanitized and relative URLs are absolutized.
- **Scheduling** — each feed refreshes on its own interval; results are cached
  in SQLite.
- **Serving** — `GET /feed/:token` returns RSS (add `.rss`, `.atom`, or `.json`
  to force a format).

## Tech stack

Node.js + TypeScript · Fastify + Eta + htmx (server-rendered UI) · Playwright
(Chromium) · Readability + `sanitize-html` · `rss-parser` / `feed` · SQLite via
Drizzle ORM · `node-cron`. Packaged on the official Playwright image with
`Xvfb` + `x11vnc` + noVNC for the embedded capture browser.

---

## Quick start (Linux + Docker)

```bash
git clone <your-fork> full-text-rss-bridge && cd full-text-rss-bridge
cp .env.example .env

# Set at least SESSION_SECRET (openssl rand -hex 32). If you deploy behind
# HTTPS, set PUBLIC_BASE_URL to your https:// URL so cookies are marked Secure.
$EDITOR .env

docker compose up -d --build
```

Then open <http://localhost:8080> and create your admin password on first run.

### Prebuilt image (GitHub Container Registry)

Every push to `main` (and every `v*` tag) triggers the
[`Build and Push Docker Image`](.github/workflows/docker-publish.yml) workflow,
which runs lint/typecheck/tests and then publishes a multi-arch
(`linux/amd64` + `linux/arm64`) image to GHCR:

```
ghcr.io/arthurlockman/full-text-rss-bridge:latest        # default branch
ghcr.io/arthurlockman/full-text-rss-bridge:v1.2.3        # from a v1.2.3 tag
ghcr.io/arthurlockman/full-text-rss-bridge:sha-abc1234   # per commit
```

Pull and run it directly (no local build):

```bash
docker run -d --name ftrb \
  -p 8080:8080 -p 6080:6080 \
  -v ftrb-data:/data \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e NOVNC_URL="http://localhost:6080/vnc.html" \
  ghcr.io/arthurlockman/full-text-rss-bridge:latest
```

Or point `docker-compose.yml` at the published image (replace the `build:`
block with `image: ghcr.io/arthurlockman/full-text-rss-bridge:latest`). The workflow
uses the built-in `GITHUB_TOKEN`, so **no secrets to configure** — just make
the package public (or `docker login ghcr.io` to pull a private one).

Ports:

| Port | Purpose |
|------|---------|
| `8080` | Web UI + feed endpoints |
| `6080` | noVNC client for interactive login capture |

Data (SQLite DB, session state, caches) is persisted in the `ftrb-data` Docker
volume mounted at `/data`.

### Running behind a reverse proxy (HTTPS)

Terminate TLS at your proxy (Caddy, nginx, Traefik) and forward to port `8080`.
Set `PUBLIC_BASE_URL=https://your-host` in `.env` so session/CSRF cookies are
marked `Secure`. Also proxy the noVNC endpoint (`6080`) and set `NOVNC_URL` to
its externally reachable URL, e.g. `https://your-host/vnc.html`.

---

## Local build (this Mac, Apple `container`)

The same OCI image runs under Apple's `container` CLI — no Docker daemon needed:

```bash
container system start                       # once per boot
container build -t full-text-rss-bridge:latest .

container run -d --name ftrb \
  -p 8080:8080 -p 6080:6080 \
  -v "$PWD/data:/data" \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e NOVNC_URL="http://localhost:6080/vnc.html" \
  full-text-rss-bridge:latest

container logs -f ftrb
```

Open <http://localhost:8080>. (You can also reach it at the container's own IP,
shown by `container list`.)

---

## Configuration (environment variables)

See [`.env.example`](./.env.example). Key variables:

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `8080` | Web UI + feed port |
| `HOST` | `0.0.0.0` | Bind address |
| `PUBLIC_BASE_URL` | `http://localhost:8080` | Used for feed links; **`https://` here marks cookies Secure** |
| `DATA_DIR` | `/data` (image) | SQLite DB + session state + caches |
| `SESSION_SECRET` | — | **Required.** Signs session cookies (`openssl rand -hex 32`) |
| `SESSION_ENCRYPTION_KEY` | — | Optional. Encrypts stored site sessions at rest |
| `NOVNC_URL` | — | noVNC client URL embedded in the capture page |
| `LOG_LEVEL` | `info` | `fatal`…`trace` |
| `VNC_PORT` / `NOVNC_PORT` | `5900` / `6080` | Internal VNC / exposed noVNC ports |
| `DISPLAY` | `:99` | X display used by the capture browser |

---

## Usage

### 1. First run — create the admin password
On first visit you'll be prompted to set an admin password. This is the only
account; the whole UI sits behind it.

### 2. Add a site (the thing you have a login for)
**Sites → Add site.** Give it a name and domain (e.g. `defector.com`) and,
optionally, a login URL and a "logged-in" selector/validation URL used to detect
session expiry.

### 3. Capture your session
Two options:

- **Interactive (recommended):** open the site's **Capture** page and click
  *Start login browser*. Log in through the embedded noVNC panel — this handles
  2FA and captchas because it's a real browser. Click *Save session* when you're
  logged in. *(Requires `NOVNC_URL` to be set; in Docker it's wired up for you.)*
- **Import cookies/JSON (fallback):** paste either a Playwright `storageState`
  object (`{ cookies, origins }`) or a bare cookies array exported by a browser
  extension such as Cookie-Editor / EditThisCookie.

The site's session badge turns **valid** once stored.

### 4. Add a feed
**Feeds → Add feed.** Set:

- **Source URL** — the publisher's existing (partial) RSS/Atom feed.
- **Site** — the authenticated site to fetch article pages with.
- **Extraction mode** — `readability` (default) or `selector`.
  - For `selector`, provide JSON like:
    ```json
    { "contentSelector": "article .post-content",
      "removeSelectors": [".newsletter-cta", ".related"],
      "waitForSelector": "article",
      "waitMs": 500 }
    ```
- **Output format** — `rss`, `atom`, or `json`.
- **Refresh interval** and **max items**.

### 5. Subscribe
Each feed gets an unguessable token. Subscribe in your reader to:

```
http://your-host:8080/feed/<token>          # default format
http://your-host:8080/feed/<token>.rss      # force RSS
http://your-host:8080/feed/<token>.atom     # force Atom
http://your-host:8080/feed/<token>.json     # force JSON Feed
```

Use **Refresh** to pull immediately, or wait for the scheduler. If a session
expires, the site badge flips and you re-capture from the site's Capture page.

---

## Development

Requires Node.js 20+ and a local Chromium for Playwright.

```bash
npm install
npx playwright install chromium
cp .env.example .env      # set SESSION_SECRET

npm run db:migrate        # apply migrations (also run automatically on boot)
npm run dev               # http://localhost:8080 with live reload
```

Scripts:

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (tsx watch) |
| `npm run build` | Compile to `dist/` and copy views/assets |
| `npm start` | Run the compiled app (`dist/index.js`) |
| `npm test` | Run the vitest suite |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate a Drizzle migration from schema changes |

Interactive capture needs a display: on Linux/Docker the image runs
`Xvfb`+`x11vnc`+noVNC; on macOS dev a native Chromium window opens instead.

> **Note:** the Docker base image tag and the `playwright` npm version must
> match (both pinned to the same version) so the bundled Chromium matches the
> client library.

---

## Security notes

- The UI is protected by a single hashed admin password (argon2) and CSRF
  double-submit tokens.
- Feeds are protected only by their unguessable token — treat feed URLs as
  secrets and don't publish them.
- Stored subscription sessions are sensitive; set `SESSION_ENCRYPTION_KEY` to
  encrypt them at rest, and keep the noVNC port bound to trusted networks (it is
  `localhost`-only inside the container and only reachable via the port you
  publish / proxy).
