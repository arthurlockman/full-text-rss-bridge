#!/usr/bin/env bash
#
# Container entrypoint. Starts a virtual X display (Xvfb), exposes it over VNC
# (x11vnc) bridged to a browser-friendly noVNC endpoint (websockify), then
# launches the Node application. The interactive "capture session" feature
# opens a headed Chromium on this display so you can log in to a site through
# the embedded noVNC panel in the web UI.
#
set -euo pipefail

DISPLAY_NUM="${DISPLAY:-:99}"
SCREEN_GEOMETRY="${SCREEN_GEOMETRY:-1440x900x24}"
VNC_PORT="${VNC_PORT:-5900}"
NOVNC_PORT="${NOVNC_PORT:-6080}"

log() { echo "[entrypoint] $*"; }

# Clean up any stale X lock from a previous run of the same display.
rm -f "/tmp/.X${DISPLAY_NUM#:}-lock" 2>/dev/null || true

log "Starting Xvfb on ${DISPLAY_NUM} (${SCREEN_GEOMETRY})"
Xvfb "${DISPLAY_NUM}" -screen 0 "${SCREEN_GEOMETRY}" -ac +extension RANDR -nolisten tcp &
XVFB_PID=$!

# Wait for the display socket to be ready.
for _ in $(seq 1 30); do
  if xdpyinfo -display "${DISPLAY_NUM}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

log "Starting x11vnc on localhost:${VNC_PORT}"
x11vnc -display "${DISPLAY_NUM}" -localhost -forever -shared -nopw \
  -rfbport "${VNC_PORT}" -quiet -bg

log "Starting noVNC (websockify) on 127.0.0.1:${NOVNC_PORT}"
# Bound to localhost only — the app reverse-proxies it same-origin under /novnc.
websockify --web=/usr/share/novnc "127.0.0.1:${NOVNC_PORT}" "localhost:${VNC_PORT}" &
WEBSOCKIFY_PID=$!

# Forward termination to children so the container stops promptly.
term() {
  log "Shutting down"
  kill "${WEBSOCKIFY_PID}" "${XVFB_PID}" 2>/dev/null || true
  kill "${APP_PID:-0}" 2>/dev/null || true
}
trap term TERM INT

export DISPLAY="${DISPLAY_NUM}"

log "Starting application"
node dist/index.js &
APP_PID=$!
wait "${APP_PID}"
