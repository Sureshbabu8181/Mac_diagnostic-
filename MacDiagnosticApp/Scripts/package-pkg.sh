#!/bin/bash
# Builds a release .app bundle and packages it as a .pkg installer.
# Requires only CommandLineTools (pkgbuild). No Xcode needed.
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="MacDiagnosticApp"
IDENTIFIER="com.macdiagnostic.app"
VERSION="1.0.1.1"
BUILD_DIR=".build/release"
DIST_DIR="dist"
BUNDLE_DIR="build-artifacts"
# The project lives under iCloud-synced paths that intermittently lock
# SwiftPM's build database; build release into a scratch dir outside the sync.
SCRATCH="${TMPDIR:-/tmp}/macdiagnostic-build-$RANDOM"
# Unique bundle folder per run: a previous run may have produced root-owned
# files here (not removable without sudo), so never reuse the same path.
BUNDLE="$BUNDLE_DIR/$APP_NAME-$RANDOM.app"

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
    <key>CFBundleName</key><string>MAC Diagnostic Center</string>
    <key>CFBundleDisplayName</key><string>MAC Diagnostic Center</string>
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

echo "== Building .pkg =="
PKG="$DIST_DIR/$APP_NAME-$VERSION.pkg"
rm -f "$PKG"
pkgbuild \
    --component "$BUNDLE" \
    --install-location /Applications \
    --identifier "$IDENTIFIER" \
    --version "$VERSION" \
    "$PKG"

echo ""
echo "DONE:"
echo "  App : $BUNDLE"
echo "  PKG : $PKG"
echo ""
echo "NOTE: pkg is unsigned (ad-hoc). For machines that enforce "
echo "Gatekeeper, sign + notarize with a Developer ID certificate "
echo "using Xcode (see Documentation/BUILD.md)."