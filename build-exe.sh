#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Infinite Canvas — EXE Build Script (Linux / macOS / Git Bash)
# ============================================================
# Prerequisites:
#   - Go 1.25+   (https://go.dev/dl/)
#   - Bun        (https://bun.sh)
#   - Git Bash (on Windows) or WSL2
#
# Usage:
#   ./build-exe.sh                    # Build for current OS
#   TARGET=windows ./build-exe.sh     # Cross-compile for Windows
#   TARGET=darwin  ./build-exe.sh     # Cross-compile for macOS
#   TARGET=linux   ./build-exe.sh     # Cross-compile for Linux
#   VERSION=0.3.0  ./build-exe.sh     # Set version
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --- Configuration ---
VERSION="${VERSION:-$(cat VERSION 2>/dev/null || echo 'dev')}"
TARGET="${TARGET:-$(go env GOOS)}"
ARCH="${ARCH:-amd64}"
OUTPUT="${OUTPUT:-infinite-canvas}"

# Append .exe for Windows
if [ "$TARGET" = "windows" ]; then
    OUTPUT="${OUTPUT}.exe"
fi

echo "=========================================="
echo " Infinite Canvas EXE Builder"
echo " Version: $VERSION"
echo " Target:  $TARGET/$ARCH"
echo " Output:  $OUTPUT"
echo "=========================================="

# --- Step 1: Build Frontend ---
echo ""
echo "[1/4] Building frontend (Next.js static export)..."

API_ROUTE="web/src/app/api/[...path]/route.ts"
WEBDAV_ROUTE="web/src/app/webdav-proxy/route.ts"
API_BAK=""
WEBDAV_BAK=""

cleanup_routes() {
    if [ -n "$API_BAK" ] && [ -f "$API_BAK" ]; then
        mv "$API_BAK" "$API_ROUTE"
        echo "      Restored: $API_ROUTE"
    fi
    if [ -n "$WEBDAV_BAK" ] && [ -f "$WEBDAV_BAK" ]; then
        mv "$WEBDAV_BAK" "$WEBDAV_ROUTE"
        echo "      Restored: $WEBDAV_ROUTE"
    fi
}
trap cleanup_routes EXIT

# Temporarily disable API routes (not compatible with Next.js static export)
if [ -f "$API_ROUTE" ]; then
    API_BAK="${API_ROUTE}.exe-build-bak"
    mv "$API_ROUTE" "$API_BAK"
    echo "      Disabled: $API_ROUTE"
fi
if [ -f "$WEBDAV_ROUTE" ]; then
    WEBDAV_BAK="${WEBDAV_ROUTE}.exe-build-bak"
    mv "$WEBDAV_ROUTE" "$WEBDAV_BAK"
    echo "      Disabled: $WEBDAV_ROUTE"
fi

cd web
NEXT_EXPORT=1 bun install --frozen-lockfile
NEXT_EXPORT=1 bun run build
cd ..

echo "      Frontend build complete."

# Restore API routes immediately after frontend build
if [ -n "$API_BAK" ] && [ -f "$API_BAK" ]; then
    mv "$API_BAK" "$API_ROUTE"
    echo "      Restored: $API_ROUTE"
    API_BAK=""
fi
if [ -n "$WEBDAV_BAK" ] && [ -f "$WEBDAV_BAK" ]; then
    mv "$WEBDAV_BAK" "$WEBDAV_ROUTE"
    echo "      Restored: $WEBDAV_ROUTE"
    WEBDAV_BAK=""
fi

# --- Step 2: Build Go Backend ---
echo ""
echo "[2/4] Building Go backend (with embedded frontend)..."

# Verify web/out exists
if [ ! -d "web/out" ]; then
    echo "ERROR: web/out/ directory not found after frontend build!"
    exit 1
fi

GOOS="$TARGET" GOARCH="$ARCH" go build \
    -tags embed \
    -ldflags="-s -w -X main.version=$VERSION" \
    -o "$OUTPUT" \
    .

echo "      Go build complete: $OUTPUT"

# --- Step 3: Report ---
echo ""
echo "[3/4] Build artifacts:"
ls -lh "$OUTPUT"
if [ "$TARGET" = "windows" ]; then
    echo ""
    echo "      Windows EXE is ready. Double-click to run."
    echo "      (No console window will appear — the app opens in your browser.)"
fi

# --- Step 4: Optional packaging ---
echo ""
echo "[4/4] Done!"
echo ""
echo "  To distribute, include:"
echo "    - $OUTPUT"
echo "    - data/ directory (created on first run, contains the database)"
echo ""
echo "  Optional: create a zip archive for distribution"
if [ "$TARGET" = "windows" ]; then
    echo "    powershell Compress-Archive -Path $OUTPUT -DestinationPath infinite-canvas-v$VERSION-$TARGET-$ARCH.zip"
else
    echo "    zip -r infinite-canvas-v$VERSION-$TARGET-$ARCH.zip $OUTPUT"
fi
echo ""
echo "=========================================="
echo " Build complete: $OUTPUT"
echo "=========================================="
