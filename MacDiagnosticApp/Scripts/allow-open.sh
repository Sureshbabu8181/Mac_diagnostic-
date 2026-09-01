#!/bin/bash
# First-launch helper: removes the quarantine flag so the app opens without Gatekeeper warnings.
# Run this ONCE after copying One Diagnose.app to /Applications.
set -euo pipefail

APP="/Applications/One Diagnose.app"

if [[ ! -d "$APP" ]]; then
    echo "ERROR: $APP not found."
    echo "Please drag 'One Diagnose' from the DMG into /Applications first."
    exit 1
fi

echo "Removing quarantine attribute from $APP ..."
xattr -cr "$APP"

echo ""
echo "DONE. You can now double-click 'One Diagnose' in /Applications to open it."
