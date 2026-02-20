#!/bin/bash
# ============================================================
#  CrazyDesk Tracker — Build standalone .app for macOS
# ============================================================
#  Prerequisites:
#    pip install -r requirements.txt
#
#  Usage:
#    chmod +x build_mac.sh
#    ./build_mac.sh
#
#  Output:
#    dist/CrazyDeskTracker.app  (macOS application bundle)
#    dist/CrazyDeskTracker      (single-file binary)
# ============================================================

set -e

echo ""
echo "============================================"
echo "  CrazyDesk Tracker — Build macOS App"
echo "============================================"
echo ""

# Step 1: Generate icon if not present
if [ ! -f "assets/icon.png" ]; then
    echo "[1/3] Generating icon..."
    python3 generate_icon.py
else
    echo "[1/3] Icon already exists, skipping."
fi

# Step 2: Generate .icns from .png (macOS native icon format)
if [ ! -f "assets/icon.icns" ]; then
    echo "[1.5/3] Creating macOS .icns icon..."
    mkdir -p assets/icon.iconset
    for size in 16 32 64 128 256 512; do
        sips -z $size $size assets/icon.png --out "assets/icon.iconset/icon_${size}x${size}.png" 2>/dev/null || \
            python3 -c "from PIL import Image; Image.open('assets/icon.png').resize(($size,$size)).save('assets/icon.iconset/icon_${size}x${size}.png')"
    done
    # Create @2x variants
    for size in 16 32 128 256; do
        double=$((size * 2))
        cp "assets/icon.iconset/icon_${double}x${double}.png" "assets/icon.iconset/icon_${size}x${size}@2x.png" 2>/dev/null || true
    done
    iconutil -c icns assets/icon.iconset -o assets/icon.icns 2>/dev/null || echo "  (iconutil not available, using .png fallback)"
    rm -rf assets/icon.iconset
fi

# Determine icon flag
ICON_FLAG=""
if [ -f "assets/icon.icns" ]; then
    ICON_FLAG="--icon assets/icon.icns"
elif [ -f "assets/icon.png" ]; then
    ICON_FLAG="--icon assets/icon.png"
fi

# Step 3: Run PyInstaller
echo "[2/3] Building with PyInstaller..."
pyinstaller \
    --name "CrazyDeskTracker" \
    --onefile \
    --windowed \
    $ICON_FLAG \
    --add-data "assets:assets" \
    --hidden-import "pynput.keyboard._darwin" \
    --hidden-import "pynput.mouse._darwin" \
    --hidden-import "pystray._darwin" \
    --hidden-import "PIL._tkinter_finder" \
    --osx-bundle-identifier "com.crazydesk.tracker" \
    --clean \
    --noconfirm \
    crazydesk_tracker.py

# Step 4: Done
echo ""
echo "[3/3] Build complete!"
echo ""
echo "  Output: dist/CrazyDeskTracker          (single binary)"
echo "  Output: dist/CrazyDeskTracker.app       (macOS app bundle, if --windowed worked)"
echo ""
echo "  To run: double-click CrazyDeskTracker.app"
echo "  Or:     ./dist/CrazyDeskTracker"
echo ""
echo "  NOTE: On first launch, macOS may ask for:"
echo "    - Accessibility permissions (for keyboard/mouse tracking)"
echo "    - Screen recording permissions (for screenshots)"
echo "    - Camera permissions (for webcam capture)"
echo "  Grant these in System Preferences → Privacy & Security."
echo ""
