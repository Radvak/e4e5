#!/usr/bin/env bash
# Runs a long command with its output also written to a log file, and shows the last lines of
# that log every minute in the check run $PROGRESS_CHECK ("Statistiques : progression", visible
# on the commit and through the API while the job runs: the job's own log is only readable
# through the API once the job is over).
#
#   with-progress.sh "<title>" <log file> <command> [args...]
set -uo pipefail
title=$1
log=$2
shift 2
: >>"$log"
"$@" > >(tee -a "$log") 2>&1 &
pid=$!
update() {
  [ -n "${PROGRESS_CHECK:-}" ] || return 0
  gh api -X PATCH "repos/$GITHUB_REPOSITORY/check-runs/$PROGRESS_CHECK" \
    -f "output[title]=$title" -f "output[summary]=$(tail -n 8 "$log" | tr '\r' '\n' | tail -n 8 | sed 's/^/    /')" >/dev/null 2>&1 || true
}
while kill -0 "$pid" 2>/dev/null; do
  update
  for _ in $(seq 60); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
done
wait "$pid"
code=$?
update
exit "$code"
