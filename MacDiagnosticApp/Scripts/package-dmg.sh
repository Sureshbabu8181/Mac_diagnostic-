#!/bin/bash
# Builds release .app bundles — one per Mac processor type (arm64, x86_64) —
# and packages each as a drag-to-Applications .dmg.
# Requires only CommandLineTools (hdiutil). No Xcode needed.
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="MacDiagnosticApp"
IDENTIFIER="com.macdiagnostic.app"
VERSION="1.0.1.1"
DIST_DIR="dist"
BUNDLE_DIR="build-artifacts"

echo "== Running automatic diagnostics (self-test gate) =="
SCRATCH_GATE="${TMPDIR:-/tmp}/macdiagnostic-build-$RANDOM"
if ! swift run --scratch-path "$SCRATCH_GATE" macdiagnostic-selftest; then
    echo "ERROR: automatic diagnostics FAILED. Packaging aborted."
    exit 1
fi

package_arch() {
    local ARCH="$1"          # arm64 | x86_64
    local SCRATCH="${TMPDIR:-/tmp}/macdiagnostic-build-$ARCH-$RANDOM"
    # Directory / bundle names end with the Mac processor type.
    local BUNDLE="$BUNDLE_DIR/$APP_NAME-$ARCH.app"
    local STAGE="$(mktemp -d)/dmg-$ARCH"

    echo ""
    echo "============================================================"
    echo "== [$ARCH] Building release binary =="
    swift build -c release --arch "$ARCH" --scratch-path "$SCRATCH"

    echo "== [$ARCH] Assembling .app bundle =="
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
    <key>CFBundleDisplayName</key><string>One Diagnose ($ARCH)</string>
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

    echo "== [$ARCH] Code signing (ad-hoc) with sandbox + hardened runtime =="
    if command -v codesign &>/dev/null; then
        codesign --force --deep --sign - \
            --entitlements Resources/Entitlements.plist \
            --options runtime \
            "$BUNDLE"
    fi

    echo "== [$ARCH] Staging DMG contents =="
    mkdir -p "$STAGE"
    cp -R "$BUNDLE" "$STAGE/"
    cp "Scripts/allow-open.sh" "$STAGE/"
    chmod +x "$STAGE/allow-open.sh"
    cp "Scripts/HOW-TO-INSTALL-TRUST.txt" "$STAGE/HOW TO INSTALL & TRUST.txt"
    ln -s /Applications "$STAGE/Applications"

    echo "== [$ARCH] Building .dmg =="
    local DMG="$DIST_DIR/One-Diagnose-$VERSION-$ARCH.dmg"
    rm -f "$DMG"
    hdiutil create \
        -volname "One Diagnose ($ARCH)" \
        -srcfolder "$STAGE" \
        -ov -format UDZO \
        "$DMG"

    echo "  App : $BUNDLE"
    echo "  DMG : $DMG"
}

package_arch arm64
package_arch x86_64

echo ""
echo "DONE:"
echo "  Apple Silicon (M1/M2/M3/M4) : $DIST_DIR/One-Diagnose-$VERSION-arm64.dmg"
echo "  Intel (x86_64)              : $DIST_DIR/One-Diagnose-$VERSION-x86_64.dmg"
echo ""
echo "NOTE: dmgs are unsigned (ad-hoc). For machines that enforce "
echo "Gatekeeper, sign + notarize with a Developer ID certificate "
echo "using Xcode (see Documentation/BUILD.md)."
