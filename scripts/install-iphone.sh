#!/bin/zsh
# Sign Lumi with the free personal team and install it on the connected device.
# Pass "iPad" as the first argument to pick the tablet; the default is "iPhone".
# The device must be unlocked, cabled, and trusted ("Trust This Computer"), and
# Developer Mode must be on (Settings → Privacy & Security → Developer Mode).
# A free Apple ID signature lasts 7 days. Run this script again to renew it.
set -euo pipefail

KIND="${1:-iPhone}"
TEAM=""
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="/tmp/lumi-ios-derived/Build/Products/release-iphoneos/Lumi.app"
ARCHIVE="/tmp/Lumi-ios.xcarchive"

export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"

cd "$ROOT/src-tauri/gen/apple"
xcodebuild \
  -project leaf-reader.xcodeproj \
  -scheme leaf-reader_iOS \
  -configuration release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  archive \
  DEVELOPMENT_TEAM="$TEAM" \
  CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates

# Pick the first connected device of this kind by UDID. Old iPads report a bare
# 40-hex UDID, newer ones the 8-16 dash form; the table columns also shift
# between Xcode versions, so match the identifier itself.
DEVICE="$("$DEVELOPER_DIR/usr/bin/devicectl" list devices 2>/dev/null \
  | awk -v kind="$KIND" '$0 ~ kind && $0 !~ /unavailable/ && match($0, /[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}|[0-9A-Fa-f]{40}/) { print substr($0, RSTART, RLENGTH); exit }')"
echo "device: ${DEVICE:-none}"
if [ -z "$DEVICE" ]; then
  echo "No paired $KIND found. Check the cable, unlock the screen, and turn on Settings → Privacy & Security → Developer Mode." >&2
  exit 1
fi
"$DEVELOPER_DIR/usr/bin/devicectl" device install app --device "$DEVICE" "$ARCHIVE/Products/Applications/Lumi.app"
echo "Installed. On the $KIND open Settings → General → VPN & Device Management and trust the developer, then open Lumi."
echo "Staged unsigned app remains at $APP"
