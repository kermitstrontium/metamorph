#!/usr/bin/env python3
"""Static server for Metamorph. Sends no-store so a deploy is never masked by a
stale cache, and hides the dev-only folders (tools/, host/, .git/)."""
import argparse, http.server, os, socketserver

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIDDEN = ('/tools', '/host', '/.git', '/.claude', '/.gitignore')

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.webmanifest': 'application/manifest+json', '.js': 'text/javascript', '.mjs': 'text/javascript'}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def send_head(self):
        path = self.path.split('?', 1)[0]
        if path.startswith(HIDDEN):
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def log_message(self, *a):
        pass

class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8089)
    ap.add_argument('--bind', default='127.0.0.1')
    a = ap.parse_args()
    Server((a.bind, a.port), Handler).serve_forever()
