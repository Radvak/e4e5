#!/bin/sh
# Regenerates the app icons in public/icons/ from scripts/icons/*.svg (needs rsvg-convert:
# `brew install librsvg`). The PNGs are committed, so this only runs when the icons change.
set -e
cd "$(dirname "$0")/.."
src=scripts/icons
out=public/icons
mkdir -p "$out"
cp "$src/icon.svg" "$out/icon.svg"
rsvg-convert -w 192 -h 192 "$src/icon.svg" -o "$out/icon-192.png"
rsvg-convert -w 512 -h 512 "$src/icon.svg" -o "$out/icon-512.png"
rsvg-convert -w 512 -h 512 "$src/icon-maskable.svg" -o "$out/icon-maskable-512.png"
rsvg-convert -w 180 -h 180 "$src/icon-maskable.svg" -o "$out/apple-touch-icon.png"
ls -l "$out"
