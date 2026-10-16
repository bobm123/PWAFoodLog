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

# --- local patch -------------------------------------------------------
# html5-qrcode hardcodes ZXing's TRY_HARDER hint to false, and ZXing only
# rotates the image when that hint is on. Without it only barcodes whose bars
# run vertically decode -- a can held the "wrong" way never scans. Flip the
# one flag; nothing else about the library changes.
if grep -q "TRY_HARDER,!1" vendor/html5-qrcode.min.js; then
  sed -i.bak "s/TRY_HARDER,!1/TRY_HARDER,!0/" vendor/html5-qrcode.min.js
  rm -f vendor/html5-qrcode.min.js.bak
  echo "Patched TRY_HARDER -> true (reads barcodes in any orientation)."
else
  echo "WARNING: TRY_HARDER flag not found - upstream may have changed." >&2
  echo "         Barcodes with horizontal bars will not scan." >&2
fi

echo
echo "Vendored:"
echo "  vendor/html5-qrcode.min.js        $(wc -c < vendor/html5-qrcode.min.js) bytes"
echo "  vendor/html5-qrcode-LICENSE.txt   $(wc -c < vendor/html5-qrcode-LICENSE.txt) bytes"
echo
echo "The app now loads the scanner locally; the CDN is only a fallback."
echo "Commit BOTH files: the licence must travel with the library."
