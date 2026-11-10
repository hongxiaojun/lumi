#!/bin/zsh
# Sign Lumi with the free personal team and install it on the connected iPhone.
# The phone must be unlocked, cabled, and trusted ("Trust This Computer").
# A free Apple ID signature lasts 7 days. Run this script again to renew it.
set -euo pipefail

export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"
TEAM=""
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="/tmp/lumi-ios-derived/Build/Products/release-iphoneos/Lumi.app"
ARCHIVE="/tmp/Lumi-ios.xcarchive"

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

# Pick the first connected iPhone.
DEVICE="$("$DEVELOPER_DIR/usr/bin/devicectl" list devices 2>/dev/null | awk '/iPhone/ && $0 !~ /unavailable/ {print; exit}')"
echo "device line: ${DEVICE:-none}"
"$DEVELOPER_DIR/usr/bin/devicectl" device install app --device "$(echo "$DEVICE" | awk '{print $(NF-2)}')" "$ARCHIVE/Products/Applications/Lumi.app"
echo "Installed. On the iPhone open Settings → General → VPN & Device Management and trust the developer, then open Lumi."
echo "Staged unsigned app remains at $APP"
