#!/bin/zsh
# Fail when a change would publish an API key, a signing team, or a device id.
# Usage: check-secrets.sh staged | check-secrets.sh range <from> <to>
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-staged}"
exec python3 - "$mode" "${2:-}" "${3:-}" << 'PY'
import subprocess
import sys

mode, start, end = sys.argv[1], sys.argv[2], sys.argv[3]
home = "/Users/" + "xiaojun"

def interesting(line):
    if "sk-" in line and __import__("re").search(r"sk-[A-Za-z0-9]{16,}", line):
        return "api-key"
    if __import__("re").search(r'TEAM\s*=\s*["\'][A-Z0-9]{10}["\']', line):
        return "team-id"
    if __import__("re").search(r'developmentTeam"\s*:\s*"[A-Z0-9]{10}"', line):
        return "team-id"
    if home in line:
        return "home-path"
    if "github.com" not in line and "http://" not in line and "https://" not in line:
        if __import__("re").search(r"\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}\b", line):
            return "device-id"
    return None

def report(hits):
    if not hits:
        print(f"secret-scan-ok {mode}")
        return
    print("Refusing secret or device identifier:")
    print("\n".join(hits[:40]))
    sys.exit(1)

if mode == "staged":
    listed = subprocess.check_output(["git", "diff", "--cached", "--name-only", "-z"])
    hits = []
    for raw in listed.split(b"\0"):
        if not raw:
            continue
        path = raw.decode()
        if path.startswith(("src-tauri/vendor/", "vendor/")) or path in {"pnpm-lock.yaml", "src-tauri/Cargo.lock"}:
            continue
        diff = subprocess.check_output(["git", "diff", "--cached", "-U0", "--", path], text=True, errors="replace")
        for number, line in enumerate(diff.splitlines(), 1):
            if not line.startswith("+") or line.startswith("+++"):
                continue
            kind = interesting(line[1:])
            if kind:
                hits.append(f"{path}: {kind}")
    report(hits)
elif mode == "range":
    if not start or not end:
        sys.exit("usage: check-secrets.sh range <from> <to>")
    revs = subprocess.check_output(["git", "rev-list", f"{start}..{end}"], text=True).split()
    hits = []
    pattern = r"sk-|TEAM=|developmentTeam|" + home + r"|[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}"
    for rev in revs:
        try:
            out = subprocess.check_output(
                ["git", "grep", "-I", "-n", "-E", pattern, rev, "--", ".", ":!src-tauri/vendor", ":!vendor", ":!pnpm-lock.yaml", ":!src-tauri/Cargo.lock"],
                text=True,
                stderr=subprocess.DEVNULL,
            )
        except subprocess.CalledProcessError as error:
            if error.returncode != 1:
                raise
            out = ""
        for line in out.splitlines():
            body = line.split(":", 3)[-1]
            kind = interesting(body)
            if not kind:
                continue
            loc = ":".join(line.split(":", 3)[:3])
            hits.append(f"{loc}: {kind}")
    report(hits)
else:
    sys.exit("usage: check-secrets.sh staged | check-secrets.sh range <from> <to>")
PY
