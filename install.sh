#!/usr/bin/env bash
# Installs (or updates) the Bale QR bot as a systemd service.
#
#   sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/samaelleo/bale-config-qr/main/install.sh)"
#
# Asks for the bot token and webhook settings interactively. For unattended installs,
# pass them as env vars instead: BOT_TOKEN, WEBHOOK_URL, WEBHOOK_SECRET, WEBHOOK_PORT.
set -euo pipefail

REPO="https://github.com/samaelleo/bale-config-qr.git"
APP_DIR="/opt/bale-config-qr"
ENV_FILE="/etc/bale-config-qr.env"
SERVICE="bale-config-qr"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

# Reads a line from the terminal even when the script itself is piped in.
ask() {
  local prompt="$1" default="${2:-}" reply
  if [ -n "$default" ]; then prompt="$prompt [$default]"; fi
  read -r -p "$prompt: " reply < /dev/tty || true
  printf '%s' "${reply:-$default}"
}

[ "$(id -u)" -eq 0 ] || fail "Please run as root (use sudo)."

bold "Bale QR bot installer"
echo

# ---------- configuration ----------
KEEP_CONFIG=n
if [ -f "$ENV_FILE" ] && [ -z "${BOT_TOKEN:-}" ]; then
  answer=$(ask "Existing config found in $ENV_FILE. Keep it? (Y/n)" "Y")
  case "$answer" in [nN]*) KEEP_CONFIG=n ;; *) KEEP_CONFIG=y ;; esac
fi

if [ "$KEEP_CONFIG" = n ]; then
  TOKEN="${BOT_TOKEN:-}"
  while [ -z "$TOKEN" ]; do
    TOKEN=$(ask "Bot token (from @BotFather in Bale)")
    [ -n "$TOKEN" ] || echo "Token is required."
  done

  if [ -n "${WEBHOOK_URL+x}" ]; then
    MODE=$([ -n "$WEBHOOK_URL" ] && echo 2 || echo 1)
  else
    echo
    echo "How should the bot receive messages?"
    echo "  1) Long polling  - simplest, no domain or SSL needed (recommended)"
    echo "  2) Webhook       - needs a public HTTPS URL (e.g. behind nginx/Caddy)"
    MODE=$(ask "Choose 1 or 2" "1")
  fi

  W_URL="" W_SECRET="" W_PORT=""
  if [ "$MODE" = 2 ]; then
    W_URL="${WEBHOOK_URL:-}"
    while [[ ! "$W_URL" =~ ^https:// ]]; do
      W_URL=$(ask "Public webhook base URL (must start with https://, e.g. https://bot.example.com)")
    done
    W_URL="${W_URL%/}"
    W_SECRET="${WEBHOOK_SECRET:-$(ask "Webhook secret (random if empty)" "$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')")}"
    W_PORT="${WEBHOOK_PORT:-$(ask "Local port for the webhook server" "8080")}"
    [[ "$W_PORT" =~ ^[0-9]+$ ]] || fail "Port must be a number."
  fi
fi

# ---------- packages & code ----------
echo
info "Installing system packages"
if command -v apt-get >/dev/null; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git python3 python3-venv >/dev/null
elif command -v dnf >/dev/null; then
  dnf install -y -q git python3
elif command -v yum >/dev/null; then
  yum install -y -q git python3
else
  command -v git >/dev/null && command -v python3 >/dev/null || fail "Install git and python3 first."
fi

info "Fetching code into $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin
  git -C "$APP_DIR" reset -q --hard origin/main
else
  rm -rf "$APP_DIR"
  git clone -q "$REPO" "$APP_DIR"
fi

info "Creating Python virtualenv"
python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install -q --upgrade pip
"$APP_DIR/.venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"

if [ "$KEEP_CONFIG" = n ]; then
  info "Saving config to $ENV_FILE"
  umask 077
  {
    printf 'BOT_TOKEN=%s\n' "$TOKEN"
    printf 'WEBHOOK_URL=%s\n' "$W_URL"
    printf 'WEBHOOK_SECRET=%s\n' "$W_SECRET"
    printf 'WEBHOOK_PORT=%s\n' "$W_PORT"
  } > "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

# ---------- service ----------
info "Writing systemd service"
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

echo
if systemctl is-active -q "$SERVICE"; then
  bold "Bot is running."
else
  echo "Service failed to start. Last log lines:"
  journalctl -u "$SERVICE" -n 20 --no-pager || true
fi

# shellcheck disable=SC1090
. "$ENV_FILE"
if [ -n "${WEBHOOK_URL:-}" ]; then
  echo
  echo "Webhook mode: Bale will call ${WEBHOOK_URL}/webhook/<secret>"
  echo "Point your HTTPS reverse proxy for that URL to http://127.0.0.1:${WEBHOOK_PORT:-8080}"
fi
echo
echo "Logs:     journalctl -u $SERVICE -f"
echo "Restart:  systemctl restart $SERVICE"
echo "Config:   $ENV_FILE"
