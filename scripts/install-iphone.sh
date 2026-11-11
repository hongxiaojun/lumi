#!/bin/zsh
# Sign Lumi with the free personal team and install it on the connected device.
# Pass "iPad" for the tablet, "Air" for the iPhone Air, or "17" for the iPhone 17.
# The default is the first ready iPhone.
# The device must be unlocked, cabled, and trusted ("Trust This Computer"), and
# Developer Mode must be on (Settings → Privacy & Security → Developer Mode).
# A free Apple ID signature lasts 7 days. Run this script again to renew it.
set -euo pipefail

KIND="${1:-iPhone}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="$ROOT/scripts/signing.local"
if [[ -f "$LOCAL" ]]; then
  # The team id stays in this gitignored file.
  source "$LOCAL"
fi
TEAM="${LUMI_IOS_TEAM:-${TEAM:-}}"
if [[ -z "$TEAM" ]]; then
  echo "Missing Apple team. Put TEAM=... in scripts/signing.local or export LUMI_IOS_TEAM." >&2
  exit 1
fi
APP="/tmp/lumi-ios-derived/Build/Products/release-iphoneos/Lumi.app"
ARCHIVE="/tmp/Lumi-ios.xcarchive"

export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"

# Choose the phone before the archive, so a locked or unprepared device does
# not spend several minutes signing an app that cannot be copied on.
LIST="$(mktemp)"
"$DEVELOPER_DIR/usr/bin/devicectl" list devices --json-output "$LIST" >/dev/null
PICK="$(node - "$LIST" "$KIND" <<'JS'
const fs = require('fs')
const kind = String(process.argv[3] || 'iPhone').toLowerCase()
const devices = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).result.devices
const physical = devices.filter((device) => (device.hardwareProperties?.reality || '') !== 'simulated')
const textOf = (device) => [
  device.deviceProperties?.name,
  device.hardwareProperties?.marketingName,
  device.hardwareProperties?.productType,
  device.hardwareProperties?.deviceType,
].filter(Boolean).join(' ')
const matches = physical.filter((device) => {
  const text = textOf(device)
  if (kind.includes('air')) {
    return device.hardwareProperties?.productType === 'iPhone18,4' || /iPhone Air/i.test(text)
  }
  if (kind.includes('17')) {
    return device.hardwareProperties?.productType === 'iPhone18,3' || /iPhone 17/i.test(text)
  }
  if (kind.includes('ipad')) return /ipad/i.test(text)
  return /iphone/i.test(text)
})
const ready = matches.filter((device) => {
  const pairing = device.connectionProperties?.pairingState || ''
  const tunnel = device.connectionProperties?.tunnelState || ''
  return pairing === 'paired' && tunnel === 'connected'
})
const chosen = ready[0] || matches[0]
if (!chosen) {
  console.log('NONE')
  process.exit(0)
}
const pairing = chosen.connectionProperties?.pairingState || 'unknown'
const tunnel = chosen.connectionProperties?.tunnelState || 'unknown'
const readyFlag = ready.length > 0 ? 'ready' : 'blocked'
const udid = chosen.hardwareProperties?.udid || chosen.properties?.hardware?.udid || ''
console.log([readyFlag, chosen.identifier, pairing, tunnel, chosen.hardwareProperties?.productType || '', udid].join('\t'))
JS
)"
rm -f "$LIST"
READY="${PICK%%$'\t'*}"
DEVICE="$(printf '%s' "$PICK" | awk -F '\t' 'NR==1 { print $2 }')"
DETAIL="$(printf '%s' "$PICK" | awk -F '\t' 'NR==1 { print $3 " " $4 " " $5 }')"
UDID="$(printf '%s' "$PICK" | awk -F '\t' 'NR==1 { print $6 }')"
echo "device: ${DEVICE:-none} ${DETAIL}"
if [[ "$READY" != "ready" || -z "$DEVICE" ]]; then
  echo "No ready $KIND. Unlock the phone, keep the cable in, and turn on Settings → Privacy & Security → Developer Mode. Xcode can see the hardware, but it cannot copy an app on until that developer connection is up." >&2
  exit 1
fi
# A generic archive does not add a new phone to the free-team profile.
DEST="generic/platform=iOS"
if [[ -n "$UDID" ]]; then
  DEST="platform=iOS,id=${UDID}"
fi

cd "$ROOT/src-tauri/gen/apple"
PRODUCT="$ARCHIVE/Products/Applications/Lumi.app"
if [[ -n "$UDID" ]]; then
  # archive always signs for "Any iOS Device" and keeps the old device list.
  rm -rf /tmp/lumi-ios-derived
  xcodebuild \
    -project leaf-reader.xcodeproj \
    -scheme leaf-reader_iOS \
    -configuration release \
    -destination "$DEST" \
    -derivedDataPath /tmp/lumi-ios-derived \
    -allowProvisioningUpdates \
    -allowProvisioningDeviceRegistration \
    DEVELOPMENT_TEAM="$TEAM" \
    CODE_SIGN_STYLE=Automatic \
    build
  PRODUCT="$APP"
else
  rm -rf "$ARCHIVE"
  xcodebuild \
    -project leaf-reader.xcodeproj \
    -scheme leaf-reader_iOS \
    -configuration release \
    -destination "$DEST" \
    -archivePath "$ARCHIVE" \
    archive \
    DEVELOPMENT_TEAM="$TEAM" \
    CODE_SIGN_STYLE=Automatic \
    -allowProvisioningUpdates
fi

"$DEVELOPER_DIR/usr/bin/devicectl" device install app --device "$DEVICE" "$PRODUCT"
echo "Installed. On the $KIND open Settings → General → VPN & Device Management and trust the developer, then open Lumi."
echo "Staged unsigned app remains at $APP"
