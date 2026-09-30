"""
Dev server for the Veora website.

Serves the static files from this folder and proxies every request under
/api/* to the backend, so the browser never makes a cross-origin call
(the backend has no CORS middleware).

    python3 frontend/serve.py                      # proxies to https://api.nexi.center
    API_URL=http://127.0.0.1:8000 python3 frontend/serve.py

Settings can also go in frontend/.env (git-ignored): API_URL, PORT, X_API_KEY.
"""
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


def load_env(path):
    # Minimal KEY=VALUE reader so frontend/.env works without python-dotenv.
    if not os.path.exists(path):
        return
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

API_URL = os.getenv("API_URL", "https://api.nexi.center").rstrip("/")
# Added to every proxied request so the key never has to ship to the browser.
X_API_KEY = os.getenv("X_API_KEY", "")
PORT = int(os.getenv("PORT", "5173"))
ROOT = os.path.dirname(os.path.abspath(__file__))

FORWARD_HEADERS = ("Authorization", "Content-Type", "Accept")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _proxy(self):
        path = self.path[len("/api"):] or "/"
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None

        req = urllib.request.Request(API_URL + path, data=body, method=self.command)
        for name in FORWARD_HEADERS:
            value = self.headers.get(name)
            if value:
                req.add_header(name, value)
        if X_API_KEY:
            req.add_header("X-API-KEY", X_API_KEY)
        # Cloudflare in front of the API rejects the default "Python-urllib" agent (error 1010).
        req.add_header("User-Agent", self.headers.get("User-Agent") or "Mozilla/5.0 VeoraWeb")

        try:
            resp = urllib.request.urlopen(req, timeout=300)
            status, headers, data = resp.status, resp.headers, resp.read()
        except urllib.error.HTTPError as e:
            status, headers, data = e.code, e.headers, e.read()
        except Exception as e:
            self.send_error(502, f"Proxy error: {e}")
            return

        self.send_response(status)
        self.send_header("Content-Type", headers.get("Content-Type", "application/json"))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _route(self, fallback):
        if self.path.startswith("/api/") or self.path == "/api":
            self._proxy()
        else:
            fallback()

    def do_GET(self):
        self._route(super().do_GET)

    def do_POST(self):
        self._route(lambda: self.send_error(405))

    def do_DELETE(self):
        self._route(lambda: self.send_error(405))


if __name__ == "__main__":
    print(f"Veora web: http://localhost:{PORT}  (API -> {API_URL})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
