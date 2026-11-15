#!/bin/zsh
# Deploy Lumi to the 飞牛 NAS: rsync the source, build there, swap the container.
# Building on the NAS is required — a Mac here is arm64 and the NAS is x86_64.
# Usage: scripts/deploy-nas.sh [--host <ssh-alias>] [--port <host-port>]
# Env: LEAF_DEPLOY_HOST (default: feiniu), LEAF_DEPLOY_PORT (default: 8080)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

host="${LEAF_DEPLOY_HOST:-feiniu}"
port="${LEAF_DEPLOY_PORT:-8080}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) host="$2"; shift 2 ;;
    --port) port="$2"; shift 2 ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

step() { echo "==> $*" }
die() { echo "error: $*" >&2; exit 1; }

for cmd in ssh rsync; do
  command -v "$cmd" >/dev/null || die "$cmd not found"
done

step "checking ssh to $host (needs passwordless key auth)"
ssh -T -o BatchMode=yes -o ConnectTimeout=10 "$host" true \
  || die "cannot ssh to $host. Run: ssh-copy-id -i ~/.ssh/id_ed25519.pub $host, and set User in ~/.ssh/config"

step "syncing source to ${host}:lumi-src"
# --exclude-from keeps the sync list and the image context in agreement.
# -c because a stale mtime must never make rsync skip a changed file.
# Brace variables before a colon: in zsh "$host:lumi-src" applies the :l
# modifier to $host and quietly writes to a local dir named feiniuumi-src.
rsync -azc --delete -e ssh --exclude-from=.dockerignore ./ "${host}:lumi-src/"

step "making sure the library token exists on $host"
ssh -T "$host" 'set -e
  if [ ! -s ~/.lumi-token ]; then
    openssl rand -hex 24 > ~/.lumi-token
    chmod 600 ~/.lumi-token
    echo "generated ~/.lumi-token"
  else
    echo "keeping ~/.lumi-token"
  fi'

step "building lumi:latest on $host"
ssh -T "$host" 'set -e; cd ~/lumi-src && docker build -t lumi:latest .'

step "swapping the container on $host"
ssh -T "$host" "PORT=$port bash -s" <<'REMOTE'
set -euo pipefail
token="$(cat ~/.lumi-token)"
# The old container is only removed after the build succeeded, so a failed
# build leaves the previous deployment running.
docker rm -f lumi >/dev/null 2>&1 || true
docker run -d --name lumi --restart unless-stopped \
  -p "$PORT:8080" \
  -e PORT=8080 \
  -e LEAF_BIND_HOST=0.0.0.0 \
  -e LEAF_LIBRARY_DIR=/data/library \
  -e LEAF_TOKEN="$token" \
  -v lumi-library:/data/library \
  lumi:latest >/dev/null
for _ in $(seq 1 20); do
  if wget -qO- "http://127.0.0.1:$PORT/health" 2>/dev/null | grep -q '"ok":true'; then
    echo "health ok on :$PORT"
    exit 0
  fi
  sleep 1
done
echo "health check failed" >&2
docker logs --tail 20 lumi >&2
exit 1
REMOTE

token="$(ssh -T "$host" 'cat ~/.lumi-token')"
lan="$(ssh -G -T "$host" | awk '$1 == "hostname" { print $2; exit }')"
[[ -n "$lan" ]] || lan="$host"

step "deployed"
echo "  open once with the token so the browser gets the cookie:"
echo "  http://${lan}:${port}/?token=${token}"
echo "  library volume: lumi-library (keep it; it holds every AI book dir)"
