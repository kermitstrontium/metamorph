#!/usr/bin/env bash
# Stamp a build id into index.html and sw.js. The service worker only updates
# when its own bytes change, so run this on every deploy.
set -euo pipefail
cd "$(dirname "$0")/.."
B=$(date +%Y%m%d-%H%M%S)
sed -i "s/metamorph-build\" content=\"[^\"]*\"/metamorph-build\" content=\"$B\"/" index.html
sed -i "s/const VERSION = 'metamorph-[^']*'/const VERSION = 'metamorph-$B'/" sw.js
echo "build $B"
