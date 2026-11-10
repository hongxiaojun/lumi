#!/bin/zsh
# Save finished work as a snapshot commit on a feature branch.
# Usage: scripts/git-snapshot.sh "what changed" [--push]
# --push fast-forwards origin/main only. It does not create a same-named remote branch.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
git config core.hooksPath .githooks

push_after=0
message=""
for arg in "$@"; do
  if [[ "$arg" == "--push" ]]; then
    push_after=1
  elif [[ -n "$message" ]]; then
    echo "One snapshot message only." >&2
    exit 1
  else
    message="$arg"
  fi
done
if [[ -z "$message" ]]; then
  echo 'Usage: scripts/git-snapshot.sh "what changed" [--push]' >&2
  exit 1
fi

branch="$(git branch --show-current || true)"
if [[ -z "$branch" || "$branch" == "main" || "$branch" == "master" ]]; then
  branch="snap/$(date +%Y%m%d-%H%M)"
  git switch -c "$branch"
  echo "Opened $branch"
else
  echo "Staying on $branch"
fi

git add -A
if git diff --cached --quiet; then
  echo "Nothing to snapshot."
else
  git commit -m "snapshot: $message"
fi

if [[ "$push_after" -eq 1 ]]; then
  "$ROOT/scripts/check-secrets.sh" range "$(git rev-parse origin/main)" HEAD
  git push origin HEAD:main
  echo "Pushed $branch onto origin/main"
fi
