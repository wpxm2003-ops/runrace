#!/usr/bin/env bash
set -Eeuo pipefail
id=${1:?release id required}
sha=${2:?commit required}
[[ "$id" =~ ^[0-9]+-[a-f0-9]{12}$ && "$sha" =~ ^[a-f0-9]{40}$ ]]
repo=${RUNRACE_REPO:-/home/ec2-user/runrace}
repo=$(realpath "$repo")
[[ "$repo" = /*/runrace ]]
releases="${repo}-backend-releases"
mkdir -p "$releases"
exec 9>"$releases/deploy.lock"
flock -n 9 || { echo 'Another backend deploy is running' >&2; exit 1; }
jar="$repo/backend/target/backend-0.0.1-SNAPSHOT.jar"
backup="$releases/$id-previous.jar"
candidate="$releases/$id.jar"
[[ -s "$jar" && ! -e "$backup" && ! -e "$candidate" ]]
available_kb=$(df -Pk "$releases" | awk 'NR==2 {print $4}')
needed_kb=$(( $(du -k "$jar" | cut -f1) * 3 + 262144 ))
(( available_kb >= needed_kb )) || { echo 'Insufficient disk space for build and rollback artifacts' >&2; exit 1; }
build=$(mktemp -d "$releases/build-$id-XXXXXX")
switched=0
health() {
  local attempt
  for ((attempt=0; attempt<30; attempt++)); do
    if sudo systemctl is-active --quiet runrace &&
      curl -fsS --max-time 3 http://127.0.0.1:8081/actuator/health |
        grep -Eq '"status"[[:space:]]*:[[:space:]]*"UP"'; then return 0; fi
    sleep 2
  done
  return 1
}
finish() {
  local code=$?
  trap - EXIT
  if (( code != 0 && switched )); then
    echo "Backend deploy failed; restoring $backup" >&2
    if cp "$backup" "$jar.next-$id" && mv -Tf "$jar.next-$id" "$jar" &&
      sudo systemctl restart runrace && health; then
      echo 'Backend rollback verified (database changes are NOT rolled back)' >&2
    else
      echo 'ROLLBACK FAILED: restore the saved JAR and investigate' >&2
      code=2
    fi
  fi
  # Only this unique build directory is disposable. Keep both release JARs.
  if [[ "$build" = "$releases/build-$id-"* && -d "$build" && ! -L "$build" ]]; then
    rm -rf -- "$build"
  fi
  exit "$code"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

cd "$repo"
git fetch origin main
[[ "$(git rev-parse origin/main)" = "$sha" ]] || { echo 'origin/main changed; refusing different code' >&2; exit 1; }
git merge --ff-only origin/main
[[ "$(git rev-parse HEAD)" = "$sha" ]]
cp "$jar" "$backup"
git archive "$sha" backend | tar -x -C "$build"
(cd "$build/backend" && MAVEN_OPTS=-Xmx512m bash ./mvnw -q package -DskipTests)
test -s "$build/backend/target/backend-0.0.1-SNAPSHOT.jar"
cp "$build/backend/target/backend-0.0.1-SNAPSHOT.jar" "$candidate"
cp "$candidate" "$jar.next-$id"
switched=1
mv -Tf "$jar.next-$id" "$jar"
sudo systemctl restart runrace
health
printf '%s\n' "$backup" > "$releases/previous"
echo "Backend release verified: $sha (rollback JAR: $backup)"
