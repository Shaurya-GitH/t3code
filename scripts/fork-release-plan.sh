#!/bin/bash
# Plans the next fork release from this checkout of the fork's tasks branch:
# moves the fork's own commits onto the newest official release (in this
# checkout only; nothing is pushed) and picks a version the app's updater sees
# as newer than every earlier fork release.
#
# Fork version for official X.Y.Z, release n of it: X.Y.(Z*1000+n), e.g. 0.1.8 -> 0.1.8001.
# Writes version, upstream and skip to $GITHUB_OUTPUT when set, else prints them.
set -euo pipefail

repo=${GITHUB_REPOSITORY:-Shaurya-GitH/t3code}
out=${GITHUB_OUTPUT:-/dev/stdout}
stable='^v[0-9]+\.[0-9]+\.[0-9]+$'

git remote get-url upstream >/dev/null 2>&1 || git remote add upstream https://github.com/pingdotgg/t3code.git
official_tags=$(git ls-remote --tags --refs upstream 'v*' | awk '{sub("refs/tags/", "", $2); print $2}' | grep -E "$stable" | sort -rV)
latest=$(head -1 <<<"$official_tags")
git fetch -q --no-tags upstream "+refs/tags/$latest:refs/tags/$latest"

# The official release the fork's commits sit on: the newest one HEAD contains.
base=""
for tag in $official_tags; do
  git rev-parse -q --verify "refs/tags/$tag" >/dev/null || git fetch -q --no-tags upstream "+refs/tags/$tag:refs/tags/$tag" || continue
  if git merge-base --is-ancestor "$tag" HEAD; then base=$tag; break; fi
done
[[ -n $base ]] || { echo "No official release is an ancestor of HEAD." >&2; exit 1; }

source_sha=$(git rev-parse HEAD)
marker="Built from official $latest and tasks@$source_sha."
last_notes=$(gh release view --repo "$repo" --json body -q .body 2>/dev/null || true)
if [[ ${FORCE:-false} != true && $last_notes == *"$marker"* ]]; then
  echo "Nothing new: the latest fork release already has official $latest and tasks@${source_sha:0:8}." >&2
  echo "skip=true" >>"$out"
  exit 0
fi

if [[ $latest != "$base" ]]; then
  echo "Moving the fork's commits from $base onto $latest." >&2
  if ! git -c user.name=fork-release -c user.email=fork-release@users.noreply.github.com \
    rebase -q --onto "$latest" "$base"; then
    git rebase --abort
    echo "The fork's commits do not apply cleanly on $latest." >&2
    exit 3
  fi
fi

IFS=. read -r major minor patch <<<"${latest#v}"
prefix="$major.$minor"
floor=$((patch * 1000))
last_n=$(gh release list --repo "$repo" --limit 200 --json tagName -q '.[].tagName' 2>/dev/null |
  awk -F. -v p="v$prefix" -v f="$floor" '$1"."$2 == p && $3 > f && $3 < f + 1000 {print $3 - f}' |
  sort -n | tail -1)
version="$prefix.$((floor + ${last_n:-0} + 1))"

{
  echo "skip=false"
  echo "version=$version"
  echo "upstream=$latest"
  echo "source_sha=$source_sha"
  echo "marker=$marker"
} >>"$out"
