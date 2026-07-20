#!/bin/sh
# Vendor the barcode scanner so the app has zero CDN dependencies.
#
# Also downloads the upstream Apache-2.0 licence text. Apache-2.0 section 4(a)
# requires that anyone you redistribute the library to receives a copy of the
# licence, so both files must be committed together.
#
# Run once, then commit vendor/ -- a deployed copy without these files silently
# falls back to the CDN.
set -e
mkdir -p vendor
VER=2.3.8
LIB="https://unpkg.com/html5-qrcode@${VER}/html5-qrcode.min.js"
LIC="https://raw.githubusercontent.com/mebjas/html5-qrcode/master/LICENSE"

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"
  else wget -qO "$2" "$1"; fi
}

echo "Fetching $LIB"
fetch "$LIB" vendor/html5-qrcode.min.js
echo "Fetching $LIC"
fetch "$LIC" vendor/html5-qrcode-LICENSE.txt

echo
echo "Vendored:"
echo "  vendor/html5-qrcode.min.js        $(wc -c < vendor/html5-qrcode.min.js) bytes"
echo "  vendor/html5-qrcode-LICENSE.txt   $(wc -c < vendor/html5-qrcode-LICENSE.txt) bytes"
echo
echo "The app now loads the scanner locally; the CDN is only a fallback."
echo "Commit BOTH files: the licence must travel with the library."
