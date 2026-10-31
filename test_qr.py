"""Generates sample QR PNGs into test_out/ so you can scan them before deploying."""

import os

from bot import make_qr_png, normalize_config

WG = """[Interface]\r
PrivateKey = yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=\r
Address = 10.0.0.2/32\r
DNS = 1.1.1.1\r
\r
[Peer]\r
PublicKey = xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=\r
AllowedIPs = 0.0.0.0/0\r
Endpoint = example.com:51820\r
"""

os.makedirs("test_out", exist_ok=True)
samples = {"wireguard": normalize_config(WG), "link": "https://example.com/سلام", "long": "x" * 2500}
for name, text in samples.items():
    png = make_qr_png(text)
    with open(f"test_out/{name}.png", "wb") as f:
        f.write(png)
    print(name, len(png), "bytes")
