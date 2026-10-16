# Vendor the barcode scanner so the app has zero CDN dependencies (Windows).
#
# Also downloads the upstream Apache-2.0 licence text. Apache-2.0 section 4(a)
# requires that anyone you redistribute the library to receives a copy of the
# licence, so both files must be committed together.
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path vendor | Out-Null

$ver = "2.3.8"
$lib = "https://unpkg.com/html5-qrcode@$ver/html5-qrcode.min.js"
$lic = "https://raw.githubusercontent.com/mebjas/html5-qrcode/master/LICENSE"

Write-Host "Fetching $lib"
Invoke-WebRequest -Uri $lib -OutFile "vendor/html5-qrcode.min.js"
Write-Host "Fetching $lic"
Invoke-WebRequest -Uri $lic -OutFile "vendor/html5-qrcode-LICENSE.txt"

# --- local patch -------------------------------------------------------
# html5-qrcode hardcodes ZXing's TRY_HARDER hint to false, and ZXing only
# rotates the image when that hint is on. Without it only barcodes whose bars
# run vertically decode -- a can held the "wrong" way never scans. Flip the
# one flag; nothing else about the library changes.
$js = "vendor/html5-qrcode.min.js"
$src = Get-Content -Raw -Path $js
if ($src.Contains("TRY_HARDER,!1")) {
    $src.Replace("TRY_HARDER,!1", "TRY_HARDER,!0") | Set-Content -NoNewline -Path $js
    Write-Host "Patched TRY_HARDER -> true (reads barcodes in any orientation)."
} else {
    Write-Warning "TRY_HARDER flag not found - upstream may have changed."
    Write-Warning "Barcodes with horizontal bars will not scan."
}

Write-Host ""
Write-Host "Vendored:"
Write-Host ("  vendor/html5-qrcode.min.js        {0} bytes" -f (Get-Item "vendor/html5-qrcode.min.js").Length)
Write-Host ("  vendor/html5-qrcode-LICENSE.txt   {0} bytes" -f (Get-Item "vendor/html5-qrcode-LICENSE.txt").Length)
Write-Host ""
Write-Host "Commit BOTH files: the licence must travel with the library."
