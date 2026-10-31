#!/usr/bin/env bash
# Builds dist/TheatreInventory.exe and dist/AHS-Theatre-Inventory-Setup-<version>.exe
# Needs: Go 1.24+, rsrc (go install github.com/akavel/rsrc@v0.10.2), NSIS 3 makensis.
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(grep -oP 'appVersion = "\K[^"]+' main.go)
MAKENSIS=${MAKENSIS:-makensis}
RSRC=${RSRC:-rsrc}
mkdir -p dist
"$RSRC" -ico app.ico -manifest installer/app.manifest -arch amd64 -o rsrc_windows_amd64.syso
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w" -o dist/TheatreInventory.exe .
rm -f rsrc_windows_amd64.syso
"$MAKENSIS" -V2 -DVERSION="$VERSION" installer/ahs-theatre.nsi
ls -lh dist
