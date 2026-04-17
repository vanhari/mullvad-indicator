#!/usr/bin/env bash

set -e

UUID="mullvad-indicator@riku"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "Installing Mullvad Indicator."

# Create target folder
mkdir -p "$DEST"

# Copy files
cp extension.js "$DEST/"
cp metadata.json "$DEST/"

# Optional folders
[ -d schemas ] && cp -r schemas "$DEST/"
[ -d assets ] && cp -r assets "$DEST/"

echo "Installed to: $DEST"

echo "Restart GNOME Shell:"
