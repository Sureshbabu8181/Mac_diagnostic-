#!/bin/bash
# First-launch trust helper for One Diagnose.
# Removes the Gatekeeper quarantine attribute so the app opens without
# "unidentified developer" warnings. Run this ONCE after copying the app
# from the DMG into /Applications.
#
# Works with any bundle name: "One Diagnose.app", "One Diagnose (arm64).app",
# "One Diagnose (x86_64).app", "MacDiagnosticApp-arm64.app", etc.
set -euo pipefail

# Find the installed app in /Applications by known name patterns.
APP=""
for candidate in \
    "/Applications/One Diagnose.app" \
    "/Applications/One Diagnose (arm64).app" \
    "/Applications/One Diagnose (x86_64).app" \
    /Applications/MacDiagnosticApp-arm64.app \
    /Applications/MacDiagnosticApp-x86_64.app
do
    if [[ -d "$candidate" ]]; then
        APP="$candidate"
        break
    fi
done

if [[ -z "$APP" ]]; then
    # Fallback: any app bundle whose Info.plist identifies our bundle id.
    while IFS= read -r plist; do
        if plutil -extract CFBundleIdentifier raw "$plist" 2>/dev/null | grep -q "com.macdiagnostic.app"; then
            APP="$(dirname "$(dirname "$plist")")"
            break
        fi
    done < <(ls /Applications/*.app/Contents/Info.plist 2>/dev/null)
fi

if [[ -z "$APP" || ! -d "$APP" ]]; then
    echo "ERROR: One Diagnose was not found in /Applications."
    echo "Please drag the app from the DMG into /Applications first, then re-run this script."
    exit 1
fi

echo "Found app: $APP"
echo "Removing quarantine attribute (Gatekeeper trust) ..."
xattr -cr "$APP"

echo "Re-registering with Launch Services ..."
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" 2>/dev/null || true

echo ""
echo "DONE. One Diagnose is now trusted on this Mac."
echo "Opening it now ..."
open "$APP"
