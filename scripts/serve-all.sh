#!/bin/sh
# Start the four comparison servers (no-cache). Safe to re-run: skips ports already in use.
#   sh scripts/serve-all.sh
#   :8803 hybrid   :8804 slingshot-assist (working asteroids)   :8801 main   :8802 star-explorer overhaul
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO=/Users/benstagl/InterstellarSlingshot
up() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
start() {
  if up "$1"; then echo ":$1 already up ($2)"; return; fi
  if [ ! -d "$2" ]; then echo ":$1 SKIPPED — $2 missing"; return; fi
  nohup node "$ROOT/scripts/serve.mjs" "$1" "$2" >/dev/null 2>&1 &
  sleep 1; up "$1" && echo ":$1 started → $2" || echo ":$1 FAILED"
}
start 8803 "$ROOT"
start 8804 "$REPO"
start 8801 "$REPO/.claude/worktrees/main-baseline"
start 8802 "$REPO/.claude/worktrees/nebula-path-fix"
echo "hybrid: http://localhost:8803/   build: $(grep -o "BUILD_TAG = '[^']*'" "$ROOT/index.html")"
