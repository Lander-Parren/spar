---
name: spar
description: Make the user predict before you implement, then show them where their model was wrong and log the gap. Use whenever you are about to write or edit source code in a project the user is learning — adding an endpoint, service, data model, migration, background job, or wiring up a dependency. Also use when the user says "spar", asks to be quizzed before you code, mentions predicting before implementing, wants to stop passively accepting AI output, or says they are not learning anything from a codebase.
license: MIT
compatibility: Works on its own. The optional `spar` CLI (npm i -g spar-agent) adds levels, spaced repetition, and a dashboard.
allowed-tools: Bash(spar:*) Read
metadata:
  author: landerparren
  version: "0.1.0"
---

# spar

Reviewing finished, convincing code teaches almost nothing — there is no position to
judge it from. This skill inverts the order: **the user takes a position, then you
implement, then you compare.** Even a wrong prediction works; being wrong is the hook
memory hangs on.

## When NOT to use this

Skip it entirely for trivial changes. Gating a rename teaches nothing and trains the
user to resent the tool. Trivial means: rename, formatting, comment, import ordering,
test fixture data, or mechanically repeating a pattern that already exists in the file.

Non-trivial means a real decision was made: a new component or endpoint, dependency
wiring or lifetimes, data model or query shape, concurrency, error handling, or
anything crossing a layer boundary. See `references/triviality.md` when unsure.

If it is trivial and the CLI is present, run `spar mark --session <id> --trivial`
and carry on. Do not silently skip the judgement — it is recorded either way, so that
the ratio of "trivial" calls stays visible.

## The loop

**1. Name the concepts.** Say what this change actually touches, in 1–3 general terms
that would be recognisable outside this codebase: "transaction boundaries in an ORM",
not "the OrdersController fix".

**2. Get a level.** `spar suggest-level --session <id> --concept "<concept>"`.
Report it to the user *with its reason* — the reason is the point. They may override
with `spar level --session <id> <0-3>`. Without the CLI, use level 1.

**3. Ask the three questions.** Ask all three in one message, in the user's language,
and wait. Do not answer them yourself and do not hint.

> 1. Where does this belong, and why there?
> 2. How would you approach it? (two sentences)
> 3. **Where will this go wrong?**

Question 3 matters most: it is the failure model, the thing that normally takes years
on a codebase to build. **"No idea" is a complete and valid answer.** Record it
verbatim; never coach the user into a guess, and never make them feel behind for it.

Record with `spar predict --session <id> --q1 "..." --q2 "..." --q3 "..."`.

**4. Act according to the level.**

| Level | What you do |
|---|---|
| 0 rush | Implement normally. Afterwards, ask one 30-second question about a real decision point you hit. |
| 1 standard | Implement normally, then do step 5. |
| 2 skeleton | Write signatures, imports, and wiring. Leave every line that carries the decision as `TODO(spar: <precise instruction>)`. The user writes those 5–10 lines. Then stop and wait. |
| 3 transcript | **Write nothing.** Deliver the whole implementation in chat with enough explanation to place it: which file, where in it, why there. Record it, then stop and wait. |

At level 2 the skeleton is recorded for you when you write it. A post-write check
verifies you actually left a marker somewhere in the task — if it complains, you left
the user nothing to decide, so go back and hand over the decision, not the typing.

At level 3, record what you offered *before* the user starts writing:

```
spar propose --session <id> --file <path> < proposal.txt
```

Do this even though you can remember it. This task will take twenty minutes and your
context may be compacted in between; a review that compares their code against a hazy
recollection is exactly the soft, agreeable kind that makes the whole exercise
worthless.

When the user says they are done, run `spar done --session <id>`. It prints the actual
diff between what was proposed and what is on disk.

**5. Show the difference.** Not a verdict — a comparison. At levels 2 and 3 work from
the diff `spar done` prints; at level 1 compare against the prediction directly:

- Where their prediction held. Say so explicitly; calibration runs both ways.
- Where it diverged, **and why**. Give the reason the code has to be this way, not a
  correction. "The unit-of-work owns the transaction because the repository can be
  composed into a larger operation" — not "you were wrong about the repository."
- Whether their approach would also have worked. It often would. Say so when it is
  true; it is half of getting their confidence back.

**6. Log each divergence.**

```
spar log --session <id> --concept "<general concept>" \
  --model "<what they thought>" --reality "<what is true>" [--question 1|2|3]
```

Without the CLI, use the bundled `scripts/log.sh` with the same arguments.

## When a gap comes back

At session start you may be handed one gap that has come due. Two rules:

**Wait for a natural pause.** A quiz fired mid-debugging teaches nothing and gets the
tool switched off. A task finishing, a related file coming up, the user asking
something adjacent — those are the moments.

**Ask before you show.** Have them explain the concept in their own words first. Then
judge honestly and record `spar review --session <id> <gap-id> --ok` or `--nok`.
Marking a shaky answer correct promotes the gap out of the rotation and hides it —
and a hidden gap looks exactly like a learned one, which is the one failure this
system cannot detect on its own. Getting it wrong is not a setback; it is the
mechanism.

## What goes in the log

Log the **concept and the shape of the misunderstanding, never the business logic.**
No client names, no domain rules, no proprietary code. In a month what they need is
the idea, not the fragment — and this is what keeps the log safe to show a colleague.

**State the belief itself, with no framing words.** Views prefix these with "thought"
and "actually", so `--model "thought the repository..."` reads as "thought thought
the repository...".

Good: `--model "the repository decides the transaction boundary"`
      `--reality "the unit-of-work does; the repository is transaction-unaware"`
      `--concept "transaction boundaries in an ORM"`

Bad: `--model "they thought that maybe the repository..."` (framing, hedging)
Bad: pasting the actual `PlaceOrderAsync` body (business logic, not a concept)

## Honesty rules

- Never ask the questions and then answer them in the same message.
- Never soften the diff into "you were basically right" when they were not — a false
  positive on calibration is worse than a gap.
- Never mark something trivial just to avoid the friction. If you are unsure, it is
  not trivial.
