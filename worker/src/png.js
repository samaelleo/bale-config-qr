// Minimal PNG encoder (1-bit grayscale) for QR matrices, using CompressionStream.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function zlibDeflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * @param {(row:number, col:number) => boolean} isDark
 * @param {number} modules  QR module count
 * @param {number} scale    pixels per module
 * @param {number} margin   quiet zone in modules
 */
export async function qrToPng(isDark, modules, scale = 10, margin = 4) {
  const size = (modules + margin * 2) * scale;
  const rowBytes = Math.ceil(size / 8);
  const raw = new Uint8Array((rowBytes + 1) * size); // each row: filter byte + bits

  for (let y = 0; y < size; y++) {
    const offset = y * (rowBytes + 1);
    raw[offset] = 0; // filter: none
    const r = Math.floor(y / scale) - margin;
    for (let x = 0; x < size; x++) {
      const c = Math.floor(x / scale) - margin;
      const dark = r >= 0 && c >= 0 && r < modules && c < modules && isDark(r, c);
      // 1-bit grayscale: 1 = white, 0 = black
      if (!dark) raw[offset + 1 + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }

  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, size);
  v.setUint32(4, size);
  ihdr[8] = 1; // bit depth
  ihdr[9] = 0; // color type: grayscale

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", await zlibDeflate(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    png.set(p, pos);
    pos += p.length;
  }
  return png;
}
