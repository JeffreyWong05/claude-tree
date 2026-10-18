#!/bin/bash
# Double-click to start Claude Tree on a Mac. Keep the window open while you use the app; close it to stop.
cd "$(dirname "$0")" || exit 1

# Finder-launched shells may miss Homebrew/nvm paths.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "Claude Tree needs Node.js, which isn't installed yet."
  echo
  echo "Opening the download page: install the \"LTS\" version, then double-click this file again."
  open "https://nodejs.org/en/download"
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi

node scripts/launch.mjs || read -n 1 -s -r -p "Press any key to close."
