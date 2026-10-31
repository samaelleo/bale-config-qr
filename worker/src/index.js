import { makeQrPng, QrTooLargeError } from "./qr.js";

const API = "https://tapi.bale.ai";
const MAX_FILE_BYTES = 20 * 1024;

const HELP =
  "سلام! 👋\n\n" +
  "• فایل کانفیگ وایرگارد (.conf) بفرست تا QR کدش رو بسازم.\n" +
  "• یا هر لینک/متنی (مثل vless:// یا vmess:// یا آدرس سایت) بفرست.\n\n" +
  "QR ساخته‌شده رو می‌تونی مستقیم با اپ WireGuard یا v2rayNG اسکن کنی یا برای بقیه بفرستی.";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // One-time helper: open https://<worker>/setup/<WEBHOOK_SECRET> in a browser to register the webhook.
    if (url.pathname === `/setup/${env.WEBHOOK_SECRET}`) {
      const hook = `${url.origin}/webhook/${env.WEBHOOK_SECRET}`;
      const res = await bale(env, "setWebhook", { url: hook });
      return new Response(JSON.stringify(res, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    if (url.pathname === `/webhook/${env.WEBHOOK_SECRET}` && request.method === "POST") {
      const update = await request.json().catch(() => null);
      if (update?.message) ctx.waitUntil(handleMessage(env, update.message).catch(console.error));
      return new Response("ok");
    }

    return new Response("Bale QR bot is running.");
  },
};

async function handleMessage(env, msg) {
  const chatId = msg.chat.id;
  const replyTo = msg.message_id;

  try {
    if (msg.document) {
      const doc = msg.document;
      if (doc.file_size && doc.file_size > MAX_FILE_BYTES) {
        return sendText(env, chatId, "❌ فایل خیلی بزرگه. فایل کانفیگ باید زیر ۲۰ کیلوبایت باشه.", replyTo);
      }
      const content = normalizeConfig(await downloadFile(env, doc.file_id));
      if (!content) return sendText(env, chatId, "❌ فایل خالیه.", replyTo);
      const name = doc.file_name || "config.conf";
      const png = await makeQrPng(content);
      return sendPhoto(env, chatId, png, `📄 ${name}\nاین QR رو با اپ WireGuard اسکن کن.`, replyTo, name);
    }

    const text = (msg.text ?? msg.caption ?? "").trim();
    if (!text) return sendText(env, chatId, "فقط فایل .conf یا متن/لینک می‌تونم تبدیل کنم.", replyTo);
    if (text === "/start" || text === "/help") return sendText(env, chatId, HELP);

    const png = await makeQrPng(looksLikeWireguard(text) ? normalizeConfig(text) : text);
    const preview = text.length > 200 ? text.slice(0, 200) + "…" : text;
    return sendPhoto(env, chatId, png, `✅ QR ساخته شد:\n${preview}`, replyTo, "qr");
  } catch (e) {
    if (e instanceof QrTooLargeError) {
      return sendText(env, chatId, "❌ متن خیلی طولانیه و توی یک QR جا نمی‌شه (حداکثر حدود ۲۹۰۰ بایت).", replyTo);
    }
    console.error(e);
    return sendText(env, chatId, "❌ خطایی پیش اومد، دوباره امتحان کن.", replyTo);
  }
}

function looksLikeWireguard(text) {
  return /^\s*\[Interface\]/im.test(text) && /^\s*\[Peer\]/im.test(text);
}

// Strip BOM / CRLF and trailing whitespace so the QR is as small and clean as possible.
function normalizeConfig(text) {
  return text
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();
}

async function bale(env, method, body) {
  const res = await fetch(`${API}/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function downloadFile(env, fileId) {
  const info = await bale(env, "getFile", { file_id: fileId });
  if (!info.ok) throw new Error(`getFile failed: ${JSON.stringify(info)}`);
  const res = await fetch(`${API}/file/bot${env.BOT_TOKEN}/${info.result.file_path}`);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return new TextDecoder("utf-8").decode(await res.arrayBuffer());
}

function sendText(env, chatId, text, replyTo) {
  return bale(env, "sendMessage", { chat_id: chatId, text, reply_to_message_id: replyTo });
}

async function sendPhoto(env, chatId, png, caption, replyTo, baseName) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", caption);
  if (replyTo) form.append("reply_to_message_id", String(replyTo));
  const fileName = baseName.replace(/\.[^.]*$/, "") + "-qr.png";
  form.append("photo", new Blob([png], { type: "image/png" }), fileName);
  const res = await fetch(`${API}/bot${env.BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
  const json = await res.json();
  if (!json.ok) throw new Error(`sendPhoto failed: ${JSON.stringify(json)}`);
  return json;
}
