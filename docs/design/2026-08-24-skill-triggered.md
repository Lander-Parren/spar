# spar waits to be asked

The gate is dormant until a session turns it on, and the skill is what turns it on.

Status: shipped in 0.5.0.

## Why

The old default gated every write in every named project. That is the design the rest of
this repo argues for, and the argument is sound: an involuntary gate catches you on the day
you are busy, which is the day the learning is worth most and the day you are least willing
to pay for it.

It also has a failure mode that no amount of tuning reaches. A tool that fights you on
every unrelated edit gets turned off, and not turned off in the small way, by dropping to
level 0 or marking a task trivial. It gets turned off by emptying `projects` out of
`~/.spar/config.json`, which is what happened, and then the curriculum stops growing while
the install still looks healthy.

So the concession is deliberate: a gate you have to invite in will be left uninvited on
exactly the days it was written for. It is still the better trade, because the honest
comparison is not "always on" against "on demand". It is "on demand" against "uninstalled".

## What changes

One config value and one session flag.

```jsonc
// ~/.spar/config.json
{ "activation": "skill" }   // the default. "always" is the old behaviour.
```

```jsonc
// ~/.spar/state/<session>.json
{ "engaged": true }         // this session asked to be gated
```

With `activation: skill` the gate returns `allow` unless the session is engaged. Nothing
else about the gate moves: levels, predictions, the idle boundary, shell-write detection and
the plan machinery all behave exactly as before once it is on.

`engaged` is session-scoped, sitting next to `rush` and excluded from `TASK_FIELDS` and
`RESET` for the same reason. A task boundary must not stand spar down, or the second task of
a sitting would go ungated with nobody having said so.

## What turns it on

The skill, on its first step, with `spar on`. That is the whole mechanism.

`spar on` takes `--session <id>` and falls back to `CLAUDE_CODE_SESSION_ID`, which Claude
Code exports and which matches the id its hooks report. Without that fallback the skill
could not arm anything: the session id used to arrive in the gate's own deny message, and
under this default there is no deny message to read it out of.

Rejected: detecting the invocation from the hook payload. A `PreToolUse` matcher on `Skill`
does see `tool_input.skill_name`, so it is possible. It needs a new field on
`NormalizedEvent`, a change in both adapters, a matcher change, three regenerated hook
files, and it still would not fire for a slash command that injects the skill body without
a tool call. One command in the skill covers every client, including Cursor.

Rejected: arming implicitly on the first `suggest-level` or `predict`. It would work, and it
would mean two ways in with different failure modes, one of them silent. `spar mark
--trivial` would also arm the session, which is precisely backwards.

## What stays loud

`due` is untouched. A gap that has come due is still injected at session start, whether or
not anything is engaged. Session start happens before anyone could have invoked the skill,
so gating it on `engaged` would mean never seeing a review again, and the spaced repetition
is the half of spar that survives the gate being off.

`skeleton` and `handover` needed no change. Both require a level, and nothing sets a level
while dormant, so they were already inert. `boundary` needed none either: it only resets
task state, and `engaged` is not task state.

## Migration

An upgraded config has no `activation` key, and `loadConfig` reads that as `skill`. Existing
installs therefore go quiet on upgrade. The alternative, reading a missing key as `always`,
keeps gating someone who never asked to be gated and leaves two silently different defaults
depending on install date. `spar activation always` is the one line back.

## Testing

`test/gate.test.ts`, `test/deny-channel.test.ts` and `test/plan-regressions.test.ts` exist to
test the gate, so their fixtures now say `activation: always` and keep asserting exactly what
they asserted before. The new default gets its own block: dormant in a tracked project,
gating once engaged, dormant for shell writes too, dormant for a config written before the
key existed, and engaged surviving `spar next`.

`scripts/validate-example.sh` proves the same thing end to end against the built binary,
then switches the sandbox to `activation always` so the eleven deny checks below it still
mean what they meant.

## Not in this design

- Per-project activation. The knob is global. A project that should always gate is a
  reasonable want and a separate change.
- A notice on upgrade. The package is days old; the README and the release notes carry it.
- Any MCP surface for `spar on`. The MCP tools are the gap log and the level suggestion;
  enforcement is hooks, and hooks are the CLI's half of the tool.
