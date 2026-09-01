#!/bin/bash
# ====================================================================
# Script Buka Otomatis Fotoyu Uploader Pro di macOS
# Menghapus karantina Apple Gatekeeper & membuka aplikasi secara instan
# ====================================================================

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_NAME="Fotoyu Uploader Pro.app"
DEST_APP="/Applications/$APP_NAME"
SRC_APP="$DIR/$APP_NAME"

clear
echo "====================================================="
echo "     MENYIAPKAN FOTOYU UPLOADER PRO UNTUK MACOS     "
echo "====================================================="
echo ""

# 1. Salin ke folder Applications jika belum ada di sana
if [ ! -d "$DEST_APP" ]; then
    if [ -d "$SRC_APP" ]; then
        echo "📦 Memasang aplikasi ke folder Applications..."
        cp -R "$SRC_APP" /Applications/
        echo "✅ Aplikasi berhasil dipasang ke /Applications/"
    fi
fi

# 2. Hapus atribut karantina Apple (Gatekeeper quarantine)
TARGET_APP="$DEST_APP"
if [ ! -d "$TARGET_APP" ] && [ -d "$SRC_APP" ]; then
    TARGET_APP="$SRC_APP"
fi

if [ -d "$TARGET_APP" ]; then
    echo "🔓 Membuka izin keamanan macOS (Gatekeeper)..."
    xattr -cr "$TARGET_APP" 2>/dev/null || true
    echo "✅ Izin keamanan berhasil disiapkan!"
    echo ""
    echo "🚀 Membuka Fotoyu Uploader Pro..."
    open "$TARGET_APP"
    echo "🎉 Selesai! Aplikasi sudah berjalan."
else
    echo "⚠️ File $APP_NAME tidak ditemukan. Pastikan Anda telah menyeretnya ke Applications."
fi

sleep 2
exit 0
