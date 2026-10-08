#!/usr/bin/env bash
set -Eeuo pipefail
id=${1:?release id required}
archive=${2:?archive required}
checksum=${3:?checksum required}
[[ "$id" =~ ^[0-9]+-[a-f0-9]{12}$ && "$checksum" =~ ^[a-f0-9]{64}$ ]]
live=${RUNRACE_WEB_ROOT:-/var/www/runrace}
# The parent must be canonical; the final component may be a release symlink.
[[ "$live" = /*/runrace && "$(dirname "$live")" = "$(realpath -m "$(dirname "$live")")" ]]
releases="${live}-releases"
mkdir -p "$releases"
exec 9>"$releases/deploy.lock"
flock -n 9 || { echo 'Another web deploy is running' >&2; exit 1; }
release="$releases/$id"
[[ ! -e "$release" && ! -L "$release" ]]
previous=''
switched=0

point_to() {
  local target=$1
  ln -s "$target" "$live.next-$id" && mv -Tf "$live.next-$id" "$live"
}
verify_web() {
  local expected=$1 route file body
  for route in / /workout /training /login; do
    file="$expected${route%/}.html"
    [[ "$route" != / ]] || file="$expected/index.html"
    body=$(curl -fsS --max-time 10 --resolve runrace.co.kr:443:127.0.0.1 "https://runrace.co.kr$route") || return 1
    [[ "$body" = "$(cat "$file")" ]] || return 1
  done
}
finish() {
  local code=$?
  trap - EXIT
  if (( code != 0 && switched )); then
    echo "Web check failed; restoring $previous" >&2
    if [[ -L "$live" || ! -e "$live" ]]; then
      if [[ -L "$live.next-$id" ]]; then unlink "$live.next-$id"; fi
      if ! point_to "$previous"; then echo 'ROLLBACK FAILED: restore web pointer manually' >&2; exit 2; fi
    fi
    if verify_web "$previous"; then echo 'Web rollback verified' >&2;
    else echo 'ROLLBACK HEALTH FAILED: investigate immediately' >&2; exit 2; fi
  fi
  exit "$code"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

echo "$checksum  $archive" | sha256sum -c -
mkdir "$release"
tar -xzf "$archive" -C "$release" --no-same-owner
for file in index.html workout.html training.html login.html; do test -s "$release/$file"; done
test -d "$release/_next/static"
nginx -t
test -s "$live/index.html"
if [[ -L "$live" ]]; then
  previous=$(readlink -f "$live")
  [[ "$previous" = "$releases/"* ]]
else
  previous="$releases/legacy-$id"
  [[ ! -e "$previous" ]]
fi
# Keep hashed assets used by tabs opened before the deployment.
if [[ -d "$live/_next/static" ]]; then cp -an "$live/_next/static/." "$release/_next/static/"; fi
chmod -R a+rX,go-w "$release"
if command -v restorecon >/dev/null; then restorecon -R "$release"; fi
switched=1
if [[ ! -L "$live" ]]; then mv -T "$live" "$previous"; fi
point_to "$release"
verify_web "$release"
printf '%s\n' "$previous" > "$releases/previous"
echo "Web release verified: $release (rollback: $previous)"
