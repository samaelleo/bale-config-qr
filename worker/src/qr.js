import qrcode from "qrcode-generator";
import { qrToPng } from "./png.js";

qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

export class QrTooLargeError extends Error {}

/** Builds a QR PNG for text; tries higher error correction first, falls back to L for long data. */
export async function makeQrPng(text) {
  for (const level of ["M", "L"]) {
    try {
      const qr = qrcode(0, level);
      qr.addData(text, "Byte");
      qr.make();
      const n = qr.getModuleCount();
      const scale = Math.max(4, Math.min(12, Math.floor(1000 / (n + 8))));
      return await qrToPng((r, c) => qr.isDark(r, c), n, scale, 4);
    } catch (e) {
      if (!String(e).includes("overflow")) throw e;
    }
  }
  throw new QrTooLargeError("data too large for a QR code");
}
