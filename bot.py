"""Bale bot: turns WireGuard .conf files and any text/link into a shareable QR code.

Env vars:
  BOT_TOKEN       required
  WEBHOOK_URL     public HTTPS base URL (e.g. https://bot.example.com); empty = long polling
  WEBHOOK_SECRET  random string used in the webhook path (/webhook/<secret>)
  WEBHOOK_HOST    listen address for the webhook server (default 0.0.0.0)
  WEBHOOK_PORT    listen port for the webhook server (default 8080)
"""

import io
import json
import logging
import os
import re
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import requests
import segno

API = "https://tapi.bale.ai"
TOKEN = os.environ.get("BOT_TOKEN", "").strip()
WEBHOOK_URL = os.environ.get("WEBHOOK_URL", "").strip()
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "").strip() or secrets.token_hex(16)
WEBHOOK_HOST = os.environ.get("WEBHOOK_HOST", "0.0.0.0").strip()
WEBHOOK_PORT = int(os.environ.get("WEBHOOK_PORT") or 8080)
MAX_FILE_BYTES = 20 * 1024
POLL_TIMEOUT = 30

HELP = (
    "سلام! 👋\n\n"
    "• فایل کانفیگ وایرگارد (.conf) بفرست تا QR کدش رو بسازم.\n"
    "• یا هر لینک/متنی (مثل vless:// یا vmess:// یا آدرس سایت) بفرست.\n\n"
    "QR ساخته‌شده رو می‌تونی مستقیم با اپ WireGuard یا v2rayNG اسکن کنی یا برای بقیه بفرستی."
)

log = logging.getLogger("bale-qr")
session = requests.Session()


class QrTooLargeError(Exception):
    pass


def api(method, timeout=20, files=None, **params):
    url = f"{API}/bot{TOKEN}/{method}"
    if files:
        res = session.post(url, data=params, files=files, timeout=timeout)
    else:
        res = session.post(url, json=params, timeout=timeout)
    data = res.json()
    if not data.get("ok"):
        raise RuntimeError(f"{method} failed: {data}")
    return data["result"]


def make_qr_png(text):
    """Builds a QR PNG; tries error correction M first, falls back to L for long data."""
    for level in ("m", "l"):
        try:
            qr = segno.make(text, error=level, micro=False, boost_error=False)
        except segno.DataOverflowError:
            continue
        modules = qr.symbol_size(scale=1, border=0)[0]
        scale = max(4, min(12, 1000 // (modules + 8)))
        buf = io.BytesIO()
        qr.save(buf, kind="png", scale=scale, border=4)
        return buf.getvalue()
    raise QrTooLargeError()


def looks_like_wireguard(text):
    return bool(re.search(r"^\s*\[Interface\]", text, re.I | re.M)) and bool(
        re.search(r"^\s*\[Peer\]", text, re.I | re.M)
    )


def normalize_config(text):
    """Strips BOM / CRLF and trailing whitespace so the QR is as small and clean as possible."""
    text = text.lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(line.rstrip() for line in text.split("\n")).strip()


def download_file(file_id):
    info = api("getFile", file_id=file_id)
    res = session.get(f"{API}/file/bot{TOKEN}/{info['file_path']}", timeout=30)
    res.raise_for_status()
    return res.content.decode("utf-8", errors="replace")


def send_text(chat_id, text, reply_to=None):
    return api("sendMessage", chat_id=chat_id, text=text, reply_to_message_id=reply_to)


def send_photo(chat_id, png, caption, reply_to, base_name):
    file_name = re.sub(r"\.[^.]*$", "", base_name) + "-qr.png"
    params = {"chat_id": chat_id, "caption": caption}
    if reply_to:
        params["reply_to_message_id"] = reply_to
    return api("sendPhoto", timeout=60, files={"photo": (file_name, png, "image/png")}, **params)


def handle_message(msg):
    chat_id = msg["chat"]["id"]
    reply_to = msg.get("message_id")

    try:
        doc = msg.get("document")
        if doc:
            if (doc.get("file_size") or 0) > MAX_FILE_BYTES:
                return send_text(chat_id, "❌ فایل خیلی بزرگه. فایل کانفیگ باید زیر ۲۰ کیلوبایت باشه.", reply_to)
            content = normalize_config(download_file(doc["file_id"]))
            if not content:
                return send_text(chat_id, "❌ فایل خالیه.", reply_to)
            name = doc.get("file_name") or "config.conf"
            png = make_qr_png(content)
            return send_photo(chat_id, png, f"📄 {name}\nاین QR رو با اپ WireGuard اسکن کن.", reply_to, name)

        text = (msg.get("text") or msg.get("caption") or "").strip()
        if not text:
            return send_text(chat_id, "فقط فایل .conf یا متن/لینک می‌تونم تبدیل کنم.", reply_to)
        if text in ("/start", "/help"):
            return send_text(chat_id, HELP)

        png = make_qr_png(normalize_config(text) if looks_like_wireguard(text) else text)
        preview = text[:200] + "…" if len(text) > 200 else text
        return send_photo(chat_id, png, f"✅ QR ساخته شد:\n{preview}", reply_to, "qr")
    except QrTooLargeError:
        return send_text(chat_id, "❌ متن خیلی طولانیه و توی یک QR جا نمی‌شه (حداکثر حدود ۲۹۰۰ بایت).", reply_to)
    except Exception:
        log.exception("failed to handle message")
        return send_text(chat_id, "❌ خطایی پیش اومد، دوباره امتحان کن.", reply_to)


def handle_update(update):
    if "message" in update:
        try:
            handle_message(update["message"])
        except Exception:
            log.exception("failed to reply")


def run_webhook():
    path = f"/webhook/{WEBHOOK_SECRET}"

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != path:
                self.send_error(404)
                return
            body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
            try:
                update = json.loads(body)
            except ValueError:
                return
            threading.Thread(target=handle_update, args=(update,), daemon=True).start()

        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Bale QR bot is running.")

        def log_message(self, fmt, *args):
            pass

    api("setWebhook", url=WEBHOOK_URL.rstrip("/") + path)
    log.info("webhook set, listening on %s:%d", WEBHOOK_HOST, WEBHOOK_PORT)
    ThreadingHTTPServer((WEBHOOK_HOST, WEBHOOK_PORT), Handler).serve_forever()


def run_polling():
    try:
        api("deleteWebhook")  # getUpdates doesn't work while a webhook is set
    except Exception as e:
        log.warning("deleteWebhook: %s", e)

    log.info("polling for updates")
    offset = None
    while True:
        try:
            params = {"timeout": POLL_TIMEOUT}
            if offset is not None:
                params["offset"] = offset
            updates = api("getUpdates", timeout=POLL_TIMEOUT + 15, **params)
            for update in updates:
                offset = update["update_id"] + 1
                handle_update(update)
        except requests.RequestException as e:
            log.warning("network error: %s", e)
            time.sleep(3)
        except Exception:
            log.exception("polling error")
            time.sleep(5)


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not TOKEN:
        raise SystemExit("BOT_TOKEN env var is not set")

    me = api("getMe")
    log.info("running as @%s", me.get("username"))

    if WEBHOOK_URL:
        run_webhook()
    else:
        run_polling()


if __name__ == "__main__":
    main()
