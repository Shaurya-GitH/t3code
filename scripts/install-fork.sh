#!/bin/bash
# Installs the newest release of S3 Code (this fork of T3 Code) into /Applications,
# replacing the installed T3 Code or S3 Code. Threads and settings are kept.
# After this, the app's own update button keeps it current.
#
#   curl -fsSL https://raw.githubusercontent.com/Shaurya-GitH/t3code/tasks/scripts/install-fork.sh | bash
#
# Run it from Terminal, not from inside the app: it quits the app.
set -euo pipefail

repo=${T3_FORK_REPO:-Shaurya-GitH/t3code}
app="/Applications/S3 Code.app"
# The bundle before the rename; in-app updates keep its name, so it may hold S3 Code too.
old_app="/Applications/T3 Code (Beta).app"
latest="https://github.com/$repo/releases/latest/download"

[[ $(uname -m) == arm64 ]] || { echo "The fork is built for Apple silicon Macs only." >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

zip=$(curl -fsSL "$latest/latest-mac.yml" | awk '/^path:/ {print $2; exit}')
[[ -n $zip ]] || { echo "No release found at github.com/$repo/releases." >&2; exit 1; }
echo "Downloading $zip..."
curl -fL --progress-bar -o "$work/app.zip" "$latest/$zip"
ditto -x -k "$work/app.zip" "$work/app"

for name in "T3 Code (Beta)" "S3 Code"; do
  running="${name//[()]/.}\.app/Contents/MacOS" # pgrep reads a regex; the dots stand for the parentheses
  if pgrep -f "$running" >/dev/null; then
    echo "Quitting $name..."
    osascript -e "quit app \"$name\"" || true
    while pgrep -f "$running" >/dev/null; do sleep 1; done
  fi
done

echo "Installing..."
rm -rf "$app.old"
[[ -d $app ]] && mv "$app" "$app.old"
if ditto "$work/app/S3 Code.app" "$app"; then
  rm -rf "$app.old" "$old_app"
else
  rm -rf "$app"
  [[ -d $app.old ]] && mv "$app.old" "$app"
  echo "Install failed; your previous app is back in place." >&2
  exit 1
fi
open "$app"
echo "Done. S3 Code ${zip#T3-Code-} is installed; it updates itself from github.com/$repo from now on."
