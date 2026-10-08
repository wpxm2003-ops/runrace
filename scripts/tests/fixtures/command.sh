#!/usr/bin/env bash
set -eu
name=$(basename "$0")
case "$name" in
  sudo) exec "$@" ;;
  sleep|restorecon) exit 0 ;;
  nginx) [[ "$TEST_FAIL" != nginx ]] ;;
  systemctl)
    echo "$*" >> "$TEST_LOG"
    if [[ "$1" = restart && "$TEST_FAIL" = restart && $(cat "$RUNRACE_REPO/backend/target/backend-0.0.1-SNAPSHOT.jar") = new-jar ]]; then exit 1; fi ;;
  curl)
    url=${!#}
    if [[ "$url" = *actuator/health ]]; then
      if [[ "$TEST_FAIL" = backend && $(cat "$RUNRACE_REPO/backend/target/backend-0.0.1-SNAPSHOT.jar") = new-jar ]]; then exit 22; fi
      printf '{"status":"UP"}'
    else
      if [[ "$TEST_FAIL" = web && "$(readlink -f "$RUNRACE_WEB_ROOT")" = */"$TEST_WEB_BAD_ID" ]]; then exit 22; fi
      route=${url#https://runrace.co.kr}
      file="$RUNRACE_WEB_ROOT${route%/}.html"
      [[ "$route" != / ]] || file="$RUNRACE_WEB_ROOT/index.html"
      cat "$file"
    fi ;;
  *) exit 127 ;;
esac
