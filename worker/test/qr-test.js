// Generates sample QR PNGs into test/out so you can scan them before deploying.
import { mkdirSync, writeFileSync } from "node:fs";
import { makeQrPng } from "../src/qr.js";

const wg = `[Interface]
PrivateKey = yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=
Address = 10.0.0.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=
AllowedIPs = 0.0.0.0/0
Endpoint = example.com:51820`;

mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
const samples = { wireguard: wg, link: "https://example.com/سلام", long: "x".repeat(2500) };
for (const [name, text] of Object.entries(samples)) {
  const png = await makeQrPng(text);
  writeFileSync(new URL(`./out/${name}.png`, import.meta.url), png);
  console.log(name, png.length, "bytes");
}
