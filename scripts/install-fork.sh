#!/bin/bash
# Installs the newest release of this T3 Code fork into /Applications, replacing
# the installed T3 Code (official or fork). Threads and settings are kept.
# After this, the app's own update button keeps it current.
#
#   curl -fsSL https://raw.githubusercontent.com/Shaurya-GitH/t3code/tasks/scripts/install-fork.sh | bash
#
# Run it from Terminal, not from inside T3 Code: it quits T3 Code.
set -euo pipefail

repo=${T3_FORK_REPO:-Shaurya-GitH/t3code}
app="/Applications/T3 Code (Beta).app"
latest="https://github.com/$repo/releases/latest/download"

[[ $(uname -m) == arm64 ]] || { echo "The fork is built for Apple silicon Macs only." >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

zip=$(curl -fsSL "$latest/latest-mac.yml" | awk '/^path:/ {print $2; exit}')
[[ -n $zip ]] || { echo "No release found at github.com/$repo/releases." >&2; exit 1; }
echo "Downloading $zip..."
curl -fL --progress-bar -o "$work/app.zip" "$latest/$zip"
ditto -x -k "$work/app.zip" "$work/app"

if pgrep -f "T3 Code \(Beta\).app/Contents/MacOS" >/dev/null; then
  echo "Quitting T3 Code..."
  osascript -e 'quit app "T3 Code (Beta)"' || true
  while pgrep -f "T3 Code \(Beta\).app/Contents/MacOS" >/dev/null; do sleep 1; done
fi

echo "Installing..."
rm -rf "$app.old"
[[ -d $app ]] && mv "$app" "$app.old"
if ditto "$work/app/T3 Code (Beta).app" "$app"; then
  rm -rf "$app.old"
else
  rm -rf "$app"
  [[ -d $app.old ]] && mv "$app.old" "$app"
  echo "Install failed; your previous T3 Code is back in place." >&2
  exit 1
fi
open "$app"
echo "Done. T3 Code ${zip#T3-Code-} is installed; it updates itself from github.com/$repo from now on."
