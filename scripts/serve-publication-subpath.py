"""Serve the publication tree under project subpath /ciconia-web/ (Pages-like)."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import os
import mimetypes
import sys

DEFAULT_ROOT = Path(__file__).resolve().parent.parent
BASE = "/ciconia-web"


def make_handler(root: Path):
    root = root.resolve()

    class Handler(SimpleHTTPRequestHandler):
        extensions_map = {
            **SimpleHTTPRequestHandler.extensions_map,
            ".mjs": "text/javascript",
            ".js": "text/javascript",
            ".wasm": "application/wasm",
            ".whl": "application/octet-stream",
            ".mei": "application/xml",
            ".json": "application/json",
            ".css": "text/css",
            ".html": "text/html",
        }

        def translate_path(self, path):
            path = path.split("?", 1)[0].split("#", 1)[0]
            if path == BASE or path.startswith(BASE + "/"):
                rel = path[len(BASE) :].lstrip("/")
                if not rel:
                    return str(root / "index.html")
                candidate = (root / rel).resolve()
                rootResolved = str(root)
                if str(candidate).startswith(rootResolved) and candidate.exists():
                    if candidate.is_dir():
                        index = candidate / "index.html"
                        if index.exists():
                            return str(index)
                    return str(candidate)
            return str(root / "__missing_outside_project_base__")

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def log_message(self, fmt, *args):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8788)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    args = parser.parse_args()
    root = Path(args.root).resolve()
    os.chdir(root)
    mimetypes.add_type("text/javascript", ".mjs")
    mimetypes.add_type("application/wasm", ".wasm")
    print(f"Serving {root} at http://{args.bind}:{args.port}{BASE}/", flush=True)
    ThreadingHTTPServer((args.bind, args.port), make_handler(root)).serve_forever()


if __name__ == "__main__":
    main()
