#!/usr/bin/env python3
"""Stands in for api.github.com and slack.com so the refresh script's notify
decisions can be counted. Behaviour is read off disk per request, so one server
covers every arm of the test."""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

CTL = sys.argv[2]


def ctl(name, default=""):
    try:
        with open(os.path.join(CTL, name)) as fh:
            return fh.read().strip()
    except OSError:
        return default


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        mode = ctl("MODE", "ok")
        if mode.isdigit() and mode != "200":
            body = json.dumps({"message": "Bad credentials", "status": mode}).encode()
            self.send_response(int(mode))
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if mode == "malformed":
            body = b'{"not":"an array"}'
        elif mode == "empty":
            body = b"[]"
        elif "page=2" in self.path or "affiliation=owner" not in self.path:
            body = b"[]"
        else:
            body = json.dumps(
                [{"full_name": "t/alpha"}, {"full_name": "t/beta"}]
            ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        expires = ctl("EXPIRES")
        if expires:
            self.send_header("github-authentication-token-expiration", expires)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n)
        try:
            text = json.loads(raw).get("text", "")
        except Exception:
            text = raw.decode("utf-8", "replace")
        # Attempts are recorded whether or not the send is accepted: an arm has
        # to be able to tell "it tried and Slack refused" from "it stayed
        # quiet", and those two look identical if only deliveries are counted.
        with open(os.path.join(CTL, "attempts"), "a") as fh:
            fh.write(text + "\n")
        if ctl("SLACK", "ok") == "reject":
            # Slack's own shape for a refusal: HTTP 200 carrying ok:false. The
            # message did not arrive, so it is not written to `dms`.
            body = b'{"ok":false,"error":"channel_not_found"}'
        else:
            with open(os.path.join(CTL, "dms"), "a") as fh:
                fh.write(text + "\n")
            body = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


HTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
