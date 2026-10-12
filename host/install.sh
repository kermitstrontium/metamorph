#!/usr/bin/env bash
# Idempotent: installs the user unit and the tailnet-only serve rule for :9444.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"
install -m 644 "$HERE/metamorph.service" "$UNIT_DIR/metamorph.service"
systemctl --user daemon-reload
systemctl --user enable --now metamorph.service
systemctl --user restart metamorph.service
sleep 1
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8089/)
echo "local :8089 -> $code"
[ "$code" = 200 ] || { echo "local server not answering"; exit 1; }
if ! tailscale serve status 2>/dev/null | grep -q ':9444'; then
  tailscale serve --bg --https=9444 http://127.0.0.1:8089
fi
tailscale serve status | sed -n '/:9444/,/proxy/p'
