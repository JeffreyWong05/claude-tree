#!/bin/bash
# Double-click to stop Claude Tree when it's running in the background.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
node scripts/launch.mjs --stop
sleep 2
