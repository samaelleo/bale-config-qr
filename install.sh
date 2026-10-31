#!/usr/bin/env bash
# Installs (or updates) the Bale QR bot as a systemd service.
#
#   curl -fsSL https://raw.githubusercontent.com/samaelleo/bale-config-qr/main/install.sh | sudo bash -s -- <BOT_TOKEN>
#
# Re-run without a token to update the code and keep the existing token.
set -euo pipefail

REPO="https://github.com/samaelleo/bale-config-qr.git"
APP_DIR="/opt/bale-config-qr"
ENV_FILE="/etc/bale-config-qr.env"
SERVICE="bale-config-qr"
TOKEN="${1:-${BOT_TOKEN:-}}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

echo "==> Installing system packages"
if command -v apt-get >/dev/null; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git python3 python3-venv >/dev/null
elif command -v dnf >/dev/null; then
  dnf install -y -q git python3
elif command -v yum >/dev/null; then
  yum install -y -q git python3
fi

echo "==> Fetching code into $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin
  git -C "$APP_DIR" reset -q --hard origin/main
else
  rm -rf "$APP_DIR"
  git clone -q "$REPO" "$APP_DIR"
fi

echo "==> Creating virtualenv"
python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install -q --upgrade pip
"$APP_DIR/.venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"

if [ -n "$TOKEN" ]; then
  echo "BOT_TOKEN=$TOKEN" > "$ENV_FILE"
elif [ ! -f "$ENV_FILE" ]; then
  echo "No token given and $ENV_FILE does not exist." >&2
  echo "Usage: ... | sudo bash -s -- <BOT_TOKEN>" >&2
  exit 1
fi
chmod 600 "$ENV_FILE"

echo "==> Writing systemd service"
cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Bale QR bot (WireGuard config / text to QR)
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=$ENV_FILE
ExecStart=$APP_DIR/.venv/bin/python $APP_DIR/bot.py
Restart=always
RestartSec=5
DynamicUser=yes
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable -q "$SERVICE"
systemctl restart "$SERVICE"
sleep 3
systemctl --no-pager --lines=10 status "$SERVICE" || true

echo
echo "Done. Logs: journalctl -u $SERVICE -f"
