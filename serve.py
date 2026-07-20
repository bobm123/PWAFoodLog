#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Robert Marchese
"""
Local dev server for the Food Log PWA.

    python3 serve.py [port]

Serves the current directory on http://localhost:8000. `localhost` counts as a
secure context, so the camera scanner and service worker both work here without
any certificate -- unlike opening index.html as a file:// URL, where neither does.

To reach it from a phone you need real HTTPS; see the README.
"""
import http.server, socketserver, sys, os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".js": "application/javascript",
    }

    def end_headers(self):
        # Never cache during development; the service worker is confusing enough.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


os.chdir(os.path.dirname(os.path.abspath(__file__)))
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Food Log serving at http://localhost:{PORT}  (Ctrl-C to stop)")
    if not os.path.exists("vendor/html5-qrcode.min.js"):
        print("  note: vendor/html5-qrcode.min.js absent -> falling back to CDN.")
        print("        run ./fetch-vendor.sh to make this fully self-contained.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
