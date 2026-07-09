# Vendor the barcode scanner so the app has zero CDN dependencies (Windows).
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path vendor | Out-Null
$url = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
Write-Host "Fetching $url"
Invoke-WebRequest -Uri $url -OutFile "vendor/html5-qrcode.min.js"
$size = (Get-Item "vendor/html5-qrcode.min.js").Length
Write-Host "Vendored to vendor/html5-qrcode.min.js ($size bytes)"
