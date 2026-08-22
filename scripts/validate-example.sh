#!/usr/bin/env bash
#
# Drive every part of spar against example/, end to end, in a throwaway home.
#
# The unit tests prove the pieces. This proves the wiring: that a real hook payload
# produces the decision it should, that the loop closes, and that the guarantees the
# README makes out loud are actually true of the built binary.
#
# Usage: npm run validate:example

set -uo pipefail
cd "$(dirname "$0")/.."

SANDBOX="$(mktemp -d)"
# Deliberately a path that does not exist: the inert claim is that spar creates
# nothing until a project is named, and mktemp -d would have answered that for it.
SPAR_HOME="$SANDBOX/home"
PROJECT="$SANDBOX/example"
export SPAR_HOME
cp -R example "$PROJECT"

CLI="node dist/cli.js"
PASS=0
FAIL=0

cleanup() { rm -rf "$SPAR_HOME" "$SANDBOX"; }
trap cleanup EXIT

check() { # check <description> <expected> <actual>
  if [ "$2" = "$3" ]; then
    printf '  \033[32mok\033[0m   %s\n' "$1"
    PASS=$((PASS + 1))
  else
    printf '  \033[31mFAIL\033[0m %s\n       expected %s, got %s\n' "$1" "$2" "$3"
    FAIL=$((FAIL + 1))
  fi
}

gate() { # gate <cwd> <file> -> allow|deny
  local out
  out=$(printf '{"session_id":"%s","cwd":"%s","tool_name":"Write","tool_input":{"file_path":"%s"}}' \
    "${3:-s1}" "$1" "$2" | $CLI hook gate --agent claude-code 2>/dev/null)
  [ -z "$out" ] && { echo allow; return; }
  printf '%s' "$out" | python3 -c 'import json,sys;print(json.load(sys.stdin)["hookSpecificOutput"]["permissionDecision"])'
}

section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

FILE="$PROJECT/src/orders/order-service.ts"

section "the example itself"
# In place, not in the copy: the copy has no node_modules above it, so tsc is not
# resolvable there. The copy exists only so gate scenarios can write into it.
( cd example && npm test >/dev/null 2>&1 )
check "its own tests pass"                       0 $?
( cd example && npm run check >/dev/null 2>&1 )
check "it typechecks"                            0 $?

section "inert until a project is named"
check "gate is silent with no config"            allow "$(gate "$PROJECT" "$FILE")"
check "~/.spar is not even created"              absent "$([ -d "$SPAR_HOME" ] && echo present || echo absent)"

$CLI setup --project "$PROJECT" --stack TypeScript >/dev/null

section "the gate"
check "fires on the first write"                 deny  "$(gate "$PROJECT" "$FILE")"
check "fires from a parent directory too"        deny  "$(gate "$SANDBOX" "$FILE")"
check "stays out of an untracked directory"      allow "$(gate "$SANDBOX" "$SANDBOX/loose.ts")"
bash_gate() { printf '{"session_id":"s1","cwd":"%s","tool_name":"Bash","tool_input":{"command":%s}}' \
    "$PROJECT" "$1" | $CLI hook gate --agent claude-code 2>/dev/null \
    | python3 -c 'import json,sys; d=sys.stdin.read().strip(); print(json.loads(d)["hookSpecificOutput"]["permissionDecision"] if d else "allow")'; }
# An agent writes files with the shell far more often than with a write tool, so these
# are the ones that actually matter.
check "catches a heredoc write"                  deny  "$(bash_gate "\"cat > src/orders/x.ts <<'EOF'\\nbody\\nEOF\"")"
check "catches an in-place rewrite"              deny  "$(bash_gate "\"perl -0pi -e 's/a/b/' src/orders/x.ts\"")"
check "catches tee"                              deny  "$(bash_gate "\"echo x | tee src/orders/x.ts\"")"
check "leaves a plain test run alone"            allow "$(bash_gate "\"npm test\"")"
check "leaves a redirect outside the project"    allow "$(bash_gate "\"npm test > /tmp/out.txt\"")"
check "leaves a read alone"                      allow "$(bash_gate "\"grep -n foo src/orders/x.ts\"")"
check "ignores tools that do not write"          allow "$(printf '{"session_id":"s1","cwd":"%s","tool_name":"Read","tool_input":{}}' "$PROJECT" | $CLI hook gate --agent claude-code >/dev/null 2>&1 && echo allow)"

section "predicting opens it, once per task"
$CLI suggest-level --session s1 --concept "transaction boundaries in an ORM" >/dev/null
$CLI predict --session s1 --q1 "the service layer" --q2 "open a unit of work" --q3 "no idea" >/dev/null
check "opens after a prediction"                 allow "$(gate "$PROJECT" "$FILE")"
check "stays open for the rest of the task"      allow "$(gate "$PROJECT" "$PROJECT/src/orders/types.ts")"
printf '{"session_id":"s1","cwd":"%s","user_prompt":"now add cancellation"}' "$PROJECT" \
  | $CLI hook boundary --agent claude-code >/dev/null 2>&1
check "a fresh follow-up leaves the task alone"  allow "$(gate "$PROJECT" "$FILE")"
python3 -c "
import json, datetime
p = '$SPAR_HOME/state/s1.json'
s = json.load(open(p))
s['predictedAt'] = (datetime.datetime.now(datetime.timezone.utc)
                    - datetime.timedelta(minutes=45)).isoformat().replace('+00:00', 'Z')
json.dump(s, open(p, 'w'))"
printf '{"session_id":"s1","cwd":"%s","user_prompt":"something new"}' "$PROJECT" \
  | $CLI hook boundary --agent claude-code >/dev/null 2>&1
check "re-arms after the task goes quiet"        deny  "$(gate "$PROJECT" "$FILE")"
$CLI predict --session s1 --q1 a --q2 b --q3 c >/dev/null
$CLI next --session s1 >/dev/null
check "spar next re-arms immediately"            deny  "$(gate "$PROJECT" "$FILE")"

section "levels"
$CLI level --session s2 2 >/dev/null
$CLI predict --session s2 --q1 a --q2 b --q3 c >/dev/null
printf 'const x = 1\n' > "$PROJECT/src/bare.ts"
printf '{"session_id":"s2","cwd":"%s","tool_name":"Write","tool_input":{"file_path":"%s"}}' \
  "$PROJECT" "$PROJECT/src/bare.ts" | $CLI hook skeleton --agent claude-code >/dev/null 2>&1
check "level 2 complains without a marker"       2 $?
printf '// TODO(spar: pick the transaction boundary)\n' > "$PROJECT/src/bare.ts"
rm -f "$SPAR_HOME/state/s2-proposals.json"
printf '{"session_id":"s2","cwd":"%s","tool_name":"Write","tool_input":{"file_path":"%s"}}' \
  "$PROJECT" "$PROJECT/src/bare.ts" | $CLI hook skeleton --agent claude-code >/dev/null 2>&1
check "level 2 accepts a marker"                 0 $?
$CLI level --session s3 3 >/dev/null
$CLI predict --session s3 --q1 a --q2 b --q3 c >/dev/null
check "level 3 refuses every write"              deny  "$(gate "$PROJECT" "$FILE" s3)"
$CLI rush --session s4 >/dev/null
check "rush degrades instead of blocking"        allow "$(gate "$PROJECT" "$FILE" s4)"

section "handing work back"
handover() { printf '{"session_id":"%s","cwd":"%s"}' "$1" "$PROJECT" \
  | $CLI hook handover --agent claude-code 2>/dev/null \
  | python3 -c 'import json,sys; d=sys.stdin.read().strip(); print(json.loads(d).get("decision","?") if d else "allow")'; }
$CLI level --session s6 2 >/dev/null
$CLI predict --session s6 --q1 a --q2 b --q3 c >/dev/null
printf '{"session_id":"s6","cwd":"%s","tool_name":"Write","tool_input":{"file_path":"%s/src/orders/new.ts"}}' \
  "$PROJECT" "$PROJECT" | $CLI hook gate --agent claude-code >/dev/null
check "refuses a handover with no test"          block "$(handover s6)"
check "and never refuses the same task twice"    allow "$(handover s6)"
$CLI level --session s7 2 >/dev/null
$CLI predict --session s7 --q1 a --q2 b --q3 c >/dev/null
printf '{"session_id":"s7","cwd":"%s","tool_name":"Write","tool_input":{"file_path":"%s/test/new.test.ts"}}' \
  "$PROJECT" "$PROJECT" | $CLI hook gate --agent claude-code >/dev/null
check "accepts one once a test exists"           allow "$(handover s7)"
$CLI level --session s8 3 >/dev/null
$CLI predict --session s8 --q1 a --q2 b --q3 c >/dev/null
check "level 3 still lets the test through"      allow "$(gate "$PROJECT" "$PROJECT/test/x.test.ts" s8)"
check "level 3 still refuses the source"         deny  "$(gate "$PROJECT" "$PROJECT/src/x.ts" s8)"

section "the log and the return"
for i in 1 2 3; do
  $CLI log --session s1 --concept "transaction boundaries in an ORM" \
    --model "the repository opens it ($i)" --reality "the unit of work does" >/dev/null
done
check "gaps.jsonl is valid jsonl"                3 "$(python3 -c "
import json;print(sum(1 for l in open('$SPAR_HOME/gaps.jsonl') if json.loads(l)))")"
check "three gaps escalate the level to 3"       3 "$($CLI suggest-level --session s9 \
  --concept 'transaction boundaries in an ORM' | grep -o 'level [0-3]' | grep -o '[0-3]')"
check "nothing is due the day it was logged"     0 "$(printf '{"session_id":"s5","cwd":"%s"}' "$PROJECT" \
  | $CLI hook due --agent claude-code | grep -c 'transaction boundaries')"
python3 -c "
import json
rows = [json.loads(l) for l in open('$SPAR_HOME/gaps.jsonl') if l.strip()]
rows[0]['due'] = '2020-01-01'
open('$SPAR_HOME/gaps.jsonl', 'w').write('\n'.join(json.dumps(r) for r in rows) + '\n')"
DUE=$(printf '{"session_id":"s5","cwd":"%s"}' "$PROJECT" | $CLI hook due --agent claude-code)
check "an overdue gap comes back at session start" 1 "$(printf '%s' "$DUE" | grep -c 'transaction boundaries')"
GAP=$(head -1 "$SPAR_HOME/gaps.jsonl" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
$CLI review --session s5 "$GAP" --ok >/dev/null
check "a correct answer moves it up a box"       2 "$(python3 -c "
import json
print([json.loads(l) for l in open('$SPAR_HOME/gaps.jsonl') if json.loads(l)['id']=='$GAP'][0]['box'])")"

section "one source for the procedure"
$CLI guide the-closing-review >/dev/null 2>&1
check "guide prints a section"                   0 $?
$CLI guide no-such-thing >/dev/null 2>&1
check "and refuses one that does not exist"      1 $?
# The point of the guide: a hook names a section, so that section has to exist.
check "every section a hook points at resolves"  0 "$(node -e "
const { GUIDE, section } = require('./dist/core/guide.js');
process.exit(Object.values(GUIDE).every((s) => section(s)) ? 0 : 1)" >/dev/null 2>&1; echo $?)"

section "working through a plan"
SPAR_ABS="$PWD/dist/cli.js"
in_project() { ( cd "$PROJECT" && node "$SPAR_ABS" "$@" ); }
check ".spar/ was gitignored by setup"           1     "$(grep -c '^\.spar/$' "$PROJECT/.gitignore")"
in_project plan --title "PROJ-1" --step one --step two >/dev/null
check "a plan can be created"                    0     $?
in_project plan --step three >/dev/null 2>&1
check "an unfinished plan is not replaced"       1     $?
check "the gate fires on the active step"        deny  "$(gate "$PROJECT" "$FILE" p1)"
$CLI level --session p1 --cwd "$PROJECT" 2 >/dev/null
$CLI predict --session p1 --cwd "$PROJECT" --q1 a --q2 b --q3 c >/dev/null
check "predicting opens the active step"         allow "$(gate "$PROJECT" "$FILE" p1)"
check "and the step holds in a new session"      allow "$(gate "$PROJECT" "$FILE" p2)"
in_project step done --session p1 >/dev/null 2>&1
check "a level 2 step needs a test to finish"    1     $?
gate "$PROJECT" "$PROJECT/test/orders.test.ts" p1 >/dev/null
in_project step done --session p1 >/dev/null
check "and finishes once a test exists"          0     $?
check "the next step re-arms the gate"           deny  "$(gate "$PROJECT" "$FILE" p1)"
in_project plan --clear >/dev/null
check "clearing returns to the idle boundary"    0     $?

section "the views"
$CLI stats >/dev/null 2>&1
check "stats renders"                            0 $?
$CLI dashboard --no-open >/dev/null 2>&1
check "dashboard renders"                        0 $?
check "dashboard reaches no network"             0 "$(grep -cE 'https?://' "$SPAR_HOME/dashboard.html")"
$CLI card --layout chain --no-open --title "Transaction boundaries" \
  --subtitle "Who opens it, and what happens on failure." \
  --step "you:You predict" --step "agent:AI implements" --step "you:You compare" >/dev/null 2>&1
check "a card renders"                           0 $?
$CLI card --layout chain --no-open --title "Too big" --subtitle x \
  --step a:1 --step a:2 --step a:3 --step a:4 --step a:5 --step a:6 >/dev/null 2>&1
check "a card over the limit refuses"            1 $?

section "fail open"
printf 'not json at all' > "$SPAR_HOME/config.json"
check "a corrupt config opens the gate"          allow "$(gate "$PROJECT" "$FILE")"

printf '\n\033[1m%s passed, %s failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
