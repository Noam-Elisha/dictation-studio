"""Tiny no-cache static file server for local preview/verification.

Usage: python tools/serve.py [port]

SimpleHTTPRequestHandler caches aggressively (no cache-control headers), which
makes edited JS appear stale on reload. This adds `Cache-Control: no-store` so
every reload fetches fresh files.
"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8753


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


with socketserver.TCPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
    print(f"no-cache static server on http://127.0.0.1:{PORT}")
    httpd.serve_forever()
