#!/usr/bin/env bash
# Exit 0 if the live tailnet URL serves the same build as the files on disk.
set -euo pipefail
URL="https://$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))'):9444"
disk=$(grep -o "metamorph-build\" content=\"[^\"]*" "$(dirname "$0")/../index.html" | cut -d'"' -f3)
live=$(curl -s "$URL/" | grep -o "metamorph-build\" content=\"[^\"]*" | cut -d'"' -f3)
echo "url:  $URL"; echo "disk: $disk"; echo "live: $live"
[ -n "$live" ] && [ "$disk" = "$live" ]
