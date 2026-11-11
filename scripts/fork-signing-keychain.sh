#!/bin/bash
# Puts the fork's self-signed certificate in a throwaway keychain on the user search
# list (codesign looks nowhere else) and prints the identity for the desktop build.
#   eval "$(scripts/fork-signing-keychain.sh <cert.p12> <password>)"
#   scripts/fork-signing-keychain.sh --remove   # take it off the list again
set -euo pipefail
keychain="${TMPDIR:-/tmp}/t3-fork-signing.keychain-db"
others() { security list-keychains -d user | tr -d '"' | xargs -n1 | grep -vxF "$keychain" || true; }
if [[ ${1:-} == --remove ]]; then
  security list-keychains -d user -s $(others)
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  exit 0
fi
p12=$1
password=$2
keychain_password=$(openssl rand -hex 16)
security delete-keychain "$keychain" >/dev/null 2>&1 || true
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$p12" -k "$keychain" -P "$password" -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain" $(others)
identity=$(security find-identity -p codesigning "$keychain" | awk '/\)/ {print $2; exit}')
[[ -n $identity ]] || { echo "No signing identity in $p12" >&2; exit 1; }
echo "export T3CODE_MAC_SELF_SIGN_IDENTITY=$identity"
