#!/bin/bash
# Builds a release .app bundle and packages it as a drag-to-Applications .dmg.
# Requires only CommandLineTools (hdiutil). No Xcode needed.
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="MacDiagnosticApp"
IDENTIFIER="com.macdiagnostic.app"
VERSION="1.0.1.1"
DIST_DIR="dist"
BUNDLE_DIR="build-artifacts"
# Build outside the iCloud-synced tree to avoid SwiftPM DB lock errors.
SCRATCH="${TMPDIR:-/tmp}/macdiagnostic-build-$RANDOM"
# Unique bundle folder per run: never reuse a possibly root-owned path.
BUNDLE="$BUNDLE_DIR/$APP_NAME-$RANDOM.app"
STAGE="$(mktemp -d)/dmg"

echo "== Running automatic diagnostics (self-test gate) =="
if ! swift run --scratch-path "$SCRATCH" macdiagnostic-selftest; then
    echo "ERROR: automatic diagnostics FAILED. Packaging aborted."
    exit 1
fi

echo "== Building release binary =="
swift build -c release --scratch-path "$SCRATCH"

echo "== Assembling .app bundle =="
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/Contents/MacOS"
mkdir -p "$BUNDLE/Contents/Resources"
cp "$SCRATCH/release/$APP_NAME" "$BUNDLE/Contents/MacOS/$APP_NAME"
if [[ -f "Resources/MacDiagnosticApp.icns" ]]; then
    cp "Resources/MacDiagnosticApp.icns" "$BUNDLE/Contents/Resources/MacDiagnosticApp.icns"
fi

cat > "$BUNDLE/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key><string>en</string>
    <key>CFBundleExecutable</key><string>$APP_NAME</string>
    <key>CFBundleIconFile</key><string>MacDiagnosticApp</string>
    <key>CFBundleIdentifier</key><string>$IDENTIFIER</string>
    <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
    <key>CFBundleName</key><string>One Diagnose</string>
    <key>CFBundleDisplayName</key><string>One Diagnose</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>$VERSION</string>
    <key>CFBundleVersion</key><string>$VERSION</string>
    <key>LSMinimumSystemVersion</key><string>15.0</string>
    <key>NSHighResolutionCapable</key><true/>
    <key>NSHumanReadableCopyright</key><string>Copyright © 2026. Internal IT tool.</string>
    <key>NSMicrophoneUsageDescription</key>
    <string>MAC Diagnostic Center uses the microphone only during the microphone test to verify input. The recording is temporary and deleted after the test.</string>
    <key>NSCameraUsageDescription</key>
    <string>MAC Diagnostic Center uses the camera only during the camera test to verify the device delivers live frames. No video is saved.</string>
</dict>
</plist>
PLIST

echo "== Code signing (ad-hoc) with sandbox + hardened runtime =="
if command -v codesign &>/dev/null; then
    codesign --force --deep --sign - \
        --entitlements Resources/Entitlements.plist \
        --options runtime \
        "$BUNDLE"
fi

echo "== Staging DMG contents =="
mkdir -p "$STAGE"
cp -R "$BUNDLE" "$STAGE/"
cp "Scripts/allow-open.sh" "$STAGE/"
chmod +x "$STAGE/allow-open.sh"
ln -s /Applications "$STAGE/Applications"

echo "== Building .dmg =="
DMG="$DIST_DIR/One-Diagnose-$VERSION.dmg"
rm -f "$DMG"
hdiutil create \
    -volname "One Diagnose" \
    -srcfolder "$STAGE" \
    -ov -format UDZO \
    "$DMG"

echo ""
echo "DONE:"
echo "  App : $BUNDLE"
echo "  DMG : $DMG"
echo ""
echo "NOTE: dmg is unsigned (ad-hoc). For machines that enforce "
echo "Gatekeeper, sign + notarize with a Developer ID certificate "
echo "using Xcode (see Documentation/BUILD.md)."