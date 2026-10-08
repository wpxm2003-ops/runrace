#!/usr/bin/env bash
# Linux integration test: real files/symlinks/git/flock; mocked service/network/build.
set -Eeuo pipefail
scripts=$(cd "$(dirname "$0")/.." && pwd)
root=$(mktemp -d /tmp/runrace-deploy-tests-XXXXXX)
trap '[[ "$root" = /tmp/runrace-deploy-tests-* ]] && rm -rf -- "$root"' EXIT
mkdir "$root/bin"
cp "$scripts/tests/fixtures/command.sh" "$root/bin/command"
chmod +x "$root/bin/command"
for name in curl nginx sudo systemctl sleep restorecon; do ln -s command "$root/bin/$name"; done
export PATH="$root/bin:$PATH"
export TEST_LOG="$root/commands.log"
export TEST_FAIL=none
id=100-aaaaaaaaaaaa
count=0
pass() { count=$((count+1)); echo "PASS $count: $1"; }
expect_failure() {
  if "$@" >"$root/output" 2>&1; then cat "$root/output"; echo 'Expected failure' >&2; exit 1; fi
}
web_fixture() {
  local dir=$1
  mkdir -p "$dir/runrace/_next/static" "$dir/new/_next/static"
  for file in index workout training login; do
    printf 'old-%s' "$file" > "$dir/runrace/$file.html"
    printf 'new-%s' "$file" > "$dir/new/$file.html"
  done
  printf old > "$dir/runrace/_next/static/old.js"
  printf new > "$dir/new/_next/static/new.js"
  export RUNRACE_WEB_ROOT="$dir/runrace"
  tar -czf "$dir/site.tar.gz" -C "$dir/new" .
  archive="$dir/site.tar.gz"
  checksum=$(sha256sum "$archive" | cut -d' ' -f1)
}
web_fixture "$root/bad-hash"
expect_failure bash "$scripts/deploy-web-remote.sh" "$id" "$archive" "$(printf '%064d' 0)"
[[ ! -L "$RUNRACE_WEB_ROOT" && $(cat "$RUNRACE_WEB_ROOT/index.html") = old-index ]]
pass 'checksum failure keeps the old site'

web_fixture "$root/incomplete"
rm "$root/incomplete/new/login.html"
tar -czf "$archive" -C "$root/incomplete/new" .
checksum=$(sha256sum "$archive" | cut -d' ' -f1)
expect_failure bash "$scripts/deploy-web-remote.sh" "$id" "$archive" "$checksum"
[[ ! -L "$RUNRACE_WEB_ROOT" ]]
pass 'missing route refuses activation'

web_fixture "$root/nginx-failure"
export TEST_FAIL=nginx
expect_failure bash "$scripts/deploy-web-remote.sh" "$id" "$archive" "$checksum"
[[ ! -L "$RUNRACE_WEB_ROOT" ]]
pass 'invalid nginx configuration keeps the old site'

web_fixture "$root/bootstrap-rollback"
export TEST_FAIL=web
export TEST_WEB_BAD_ID=$id
expect_failure bash "$scripts/deploy-web-remote.sh" "$id" "$archive" "$checksum"
[[ $(cat "$RUNRACE_WEB_ROOT/index.html") = old-index ]]
grep -q 'Web rollback verified' "$root/output"
pass 'first directory-to-symlink activation rolls back on HTTP failure'

web_fixture "$root/web-success"
export TEST_FAIL=none
bash "$scripts/deploy-web-remote.sh" "$id" "$archive" "$checksum" >"$root/output" 2>&1
[[ -L "$RUNRACE_WEB_ROOT" && $(cat "$RUNRACE_WEB_ROOT/index.html") = new-index ]]
test -s "$RUNRACE_WEB_ROOT/_next/static/old.js"
test -s "${RUNRACE_WEB_ROOT}-releases/legacy-$id/index.html"
pass 'activation retains previous release and old hashed assets'
previous=$(readlink -f "$RUNRACE_WEB_ROOT")
export TEST_FAIL=web
export TEST_WEB_BAD_ID=101-aaaaaaaaaaaa
expect_failure bash "$scripts/deploy-web-remote.sh" 101-aaaaaaaaaaaa "$archive" "$checksum"
[[ $(readlink -f "$RUNRACE_WEB_ROOT") = "$previous" ]]
grep -q 'Web rollback verified' "$root/output"
pass 'subsequent failed activation restores previous symlink'
export TEST_FAIL=none
bash "$scripts/deploy-web-remote.sh" 102-aaaaaaaaaaaa "$archive" "$checksum" >"$root/output" 2>&1
[[ $(readlink -f "$RUNRACE_WEB_ROOT") = "${RUNRACE_WEB_ROOT}-releases/102-aaaaaaaaaaaa" ]]
pass 'subsequent successful activation switches symlink'
(
  exec 8>"${RUNRACE_WEB_ROOT}-releases/deploy.lock"
  flock -n 8
  expect_failure bash "$scripts/deploy-web-remote.sh" 103-aaaaaaaaaaaa "$archive" "$checksum"
  grep -q 'Another web deploy' "$root/output"
)
pass 'concurrent web deployment is refused'

backend_fixture() {
  local dir=$1
  export RUNRACE_REPO="$dir/runrace"
  mkdir -p "$RUNRACE_REPO/backend"
  cp "$scripts/tests/fixtures/mvnw" "$RUNRACE_REPO/backend/mvnw"
  git -C "$RUNRACE_REPO" init -q -b main
  git -C "$RUNRACE_REPO" -c user.name=DeployTest -c user.email=test@invalid add backend/mvnw
  git -C "$RUNRACE_REPO" -c user.name=DeployTest -c user.email=test@invalid commit -qm fixture
  git clone -q --bare "$RUNRACE_REPO" "$dir/origin.git"
  git -C "$RUNRACE_REPO" remote add origin "$dir/origin.git"
  sha=$(git -C "$RUNRACE_REPO" rev-parse HEAD)
  mkdir -p "$RUNRACE_REPO/backend/target"
  printf old-jar > "$RUNRACE_REPO/backend/target/backend-0.0.1-SNAPSHOT.jar"
  : > "$TEST_LOG"
}
backend_fixture "$root/backend-build-fail"
export TEST_FAIL=build
expect_failure bash "$scripts/deploy-backend-remote.sh" "$id" "$sha"
[[ $(cat "$RUNRACE_REPO/backend/target/backend-0.0.1-SNAPSHOT.jar") = old-jar ]]
! grep -q restart "$TEST_LOG"
pass 'failed isolated build neither replaces running JAR nor restarts'

backend_fixture "$root/backend-health-fail"
export TEST_FAIL=backend
expect_failure bash "$scripts/deploy-backend-remote.sh" "$id" "$sha"
[[ $(cat "$RUNRACE_REPO/backend/target/backend-0.0.1-SNAPSHOT.jar") = old-jar ]]
[[ $(grep -c restart "$TEST_LOG") = 2 ]]
grep -q 'Backend rollback verified' "$root/output"
pass 'unhealthy new backend restores old JAR and verifies restart'

backend_fixture "$root/backend-restart-fail"
export TEST_FAIL=restart
expect_failure bash "$scripts/deploy-backend-remote.sh" "$id" "$sha"
[[ $(cat "$RUNRACE_REPO/backend/target/backend-0.0.1-SNAPSHOT.jar") = old-jar ]]
grep -q 'Backend rollback verified' "$root/output"
pass 'restart command failure also rolls back'

backend_fixture "$root/backend-success"
export TEST_FAIL=none
bash "$scripts/deploy-backend-remote.sh" "$id" "$sha" >"$root/output" 2>&1
[[ $(cat "$RUNRACE_REPO/backend/target/backend-0.0.1-SNAPSHOT.jar") = new-jar ]]
[[ $(cat "${RUNRACE_REPO}-backend-releases/$id-previous.jar") = old-jar ]]
[[ $(grep -c restart "$TEST_LOG") = 1 ]]
pass 'healthy backend keeps rollback artifact and succeeds'
(
  exec 8>"${RUNRACE_REPO}-backend-releases/deploy.lock"
  flock -n 8
  expect_failure bash "$scripts/deploy-backend-remote.sh" 101-aaaaaaaaaaaa "$sha"
  grep -q 'Another backend deploy' "$root/output"
)
pass 'concurrent backend deployment is refused'
backend_fixture "$root/backend-wrong-sha"
expect_failure bash "$scripts/deploy-backend-remote.sh" "$id" bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
[[ $(cat "$RUNRACE_REPO/backend/target/backend-0.0.1-SNAPSHOT.jar") = old-jar ]]
! grep -q restart "$TEST_LOG"
pass 'different origin/main revision is refused before building'
echo "$count deployment integration tests passed"
