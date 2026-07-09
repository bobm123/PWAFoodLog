#!/bin/sh
# Vendor the barcode scanner so the app has zero CDN dependencies.
# Run once, then COMMIT vendor/html5-qrcode.min.js -- otherwise a deployed
# copy (e.g. GitHub Pages) has no local file and silently falls back to the CDN.
set -e
mkdir -p vendor
URL="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
echo "Fetching $URL"
if command -v curl >/dev/null 2>&1; then curl -fsSL "$URL" -o vendor/html5-qrcode.min.js
else wget -qO vendor/html5-qrcode.min.js "$URL"; fi
echo "Vendored to vendor/html5-qrcode.min.js ($(wc -c < vendor/html5-qrcode.min.js) bytes)"
echo "The app now loads it locally; the CDN is only a fallback."
