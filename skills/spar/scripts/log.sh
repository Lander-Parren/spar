#!/bin/sh
# spar: append one gap to ~/.spar/gaps.jsonl without the CLI installed.
#
# This is the tier-1 fallback: it is what makes the skill worth installing on its own,
# in any agent, with nothing but a shell. It only ever appends. Levels, spaced
# repetition and the dashboard need the CLI (npm i -g spar-agent).
#
# Usage:
#   log.sh --concept "<general concept>" \
#          --model "<what you thought>" \
#          --reality "<what is true>" \
#          [--question 1|2|3] [--kind misconception|typo-bug|improvement] [--project name]

set -eu

CONCEPT=""; MODEL=""; REALITY=""; QUESTION=""; KIND="misconception"; PROJECT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --concept)  CONCEPT="${2:-}"; shift 2 ;;
    --model)    MODEL="${2:-}"; shift 2 ;;
    --reality)  REALITY="${2:-}"; shift 2 ;;
    --question) QUESTION="${2:-}"; shift 2 ;;
    --kind)     KIND="${2:-}"; shift 2 ;;
    --project)  PROJECT="${2:-}"; shift 2 ;;
    *) printf 'spar: unknown argument %s\n' "$1" >&2; exit 2 ;;
  esac
done

if [ -z "$CONCEPT" ] || [ -z "$MODEL" ] || [ -z "$REALITY" ]; then
  echo "spar: --concept, --model and --reality are all required" >&2
  exit 2
fi

SPAR_HOME="${SPAR_HOME:-$HOME/.spar}"
GAPS="$SPAR_HOME/gaps.jsonl"
mkdir -p "$SPAR_HOME"
[ -n "$PROJECT" ] || PROJECT="$(basename "$PWD")"

# Tomorrow, so the gap comes back. Portable across BSD and GNU date.
DUE="$(date -u -v+1d +%Y-%m-%d 2>/dev/null || date -u -d '+1 day' +%Y-%m-%d)"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ID="g-$(date -u +%s)"

# JSON escaping is the one thing not worth hand-rolling in sh. Prefer python3,
# fall back to node; both are near-universal on a machine running a coding agent.
if command -v python3 >/dev/null 2>&1; then
  ESC="python3 -c \"import json,sys;print(json.dumps(sys.stdin.read()))\""
elif command -v node >/dev/null 2>&1; then
  ESC="node -e \"let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(JSON.stringify(d)))\""
else
  echo "spar: needs python3 or node to write valid JSON" >&2
  exit 1
fi

esc() { printf '%s' "$1" | eval "$ESC"; }

{
  printf '{"id":%s,"ts":%s,"project":%s,"task":"","agent":"skill","level":1,' \
    "$(esc "$ID")" "$(esc "$TS")" "$(esc "$PROJECT")"
  printf '"kind":%s,' "$(esc "$KIND")"
  case "$QUESTION" in 1|2|3) printf '"question":%s,' "$QUESTION" ;; esac
  printf '"your_model":%s,"reality":%s,"concept":%s,' \
    "$(esc "$MODEL")" "$(esc "$REALITY")" "$(esc "$CONCEPT")"
  printf '"box":1,"due":%s,"hits":0,"misses":0}\n' "$(esc "$DUE")"
} >> "$GAPS"

printf 'logged %s: %s\n' "$ID" "$CONCEPT"
