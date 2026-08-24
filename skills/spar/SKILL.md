---
name: spar
description: Make the user predict before you implement, then show them where their model was wrong and log the gap. Use whenever you are about to write or edit source code in a project the user is learning, such as adding an endpoint, service, data model, migration, background job, or wiring up a dependency. Also use when the user says "spar", asks to be quizzed before you code, mentions predicting before implementing, wants to stop passively accepting AI output, or says they are not learning anything from a codebase.
license: MIT
compatibility: Works on its own. The optional `spar` CLI (npm i -g spar-agent) adds levels, spaced repetition, stats and a dashboard; its MCP server exposes the same as tools. Enforcement needs hooks, available in Claude Code and Cursor, and starts when this skill runs `spar on`.
allowed-tools: Bash(spar:*) Read
metadata:
  author: landerparren
  version: "0.1.0"
---

# spar

Reviewing finished, convincing code teaches almost nothing, because there is no position to
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
and carry on. Do not silently skip the judgement. It is recorded either way, so that
the ratio of "trivial" calls stays visible. That holds even with the gate dormant and
nothing to get past: the record is the point, and a run of trivial calls is how you find
out the tool is being talked out of its job.

## The loop

**1. Turn spar on.** `spar on`. Add `--session <id>` if the CLI asks for one. Nothing below
this line is enforced until you do: spar ships dormant, so the gate lets every write
through until a session says otherwise, and the loop would be yours to abandon at the
first inconvenient moment. It stays on for the rest of the session, which is deliberate,
because the tasks that follow the one you were asked about deserve the same treatment.
`spar off` when the user has had enough.

**2. Name the concepts.** Say what this change actually touches, in one to three general terms
that would be recognisable outside this codebase: "transaction boundaries in an ORM",
not "the OrdersController fix".

**3. Get a level.** `spar suggest-level --session <id> --concept "<concept>"`.
Report it to the user *with its reason*. The reason is the point. They may override
with `spar level --session <id> <0-3>`. Without the CLI, use level 1.

**4. Ask the three questions.** Ask all three in one message, in the user's language,
and wait. Do not answer them yourself and do not hint.

> 1. Where does this belong, and why there?
> 2. How would you approach it? (two sentences)
> 3. **Where will this go wrong?**

Question 3 matters most: it is the failure model, the thing that normally takes years
on a codebase to build. **"No idea" is a complete and valid answer.** Record it
verbatim; never coach the user into a guess, and never make them feel behind for it.

Record with `spar predict --session <id> --q1 "..." --q2 "..." --q3 "..."`.

**5. Act according to the level.**

| Level | What you do |
|---|---|
| 0 rush | Implement normally. Afterwards, ask one 30-second question about a real decision point you hit. |
| 1 standard | Implement normally, then do step 6. |
| 2 skeleton | Write signatures, imports, wiring, **and a test that fails**. Leave every line that carries the decision as `TODO(spar: <precise instruction>)`. The user writes those five to ten lines. Then stop and wait. |
| 3 transcript | **Write the test file and nothing else.** Deliver the implementation in chat with enough explanation to place it: which file, where in it, why there. Record it, then stop and wait. |

**At levels 2 and 3, always leave a failing test behind.** A marker with no test hands the
user a guess and nothing to check it against, so the only way for them to find out whether
they were right is to ask you, which is exactly the dependency this skill exists to break.
The test is what lets them work alone and know.

Make it fail first. A test that already passes against an empty stub pins no behaviour.
spar refuses the handover in both cases: no test at all, and a test that is already green.

At level 2 the skeleton is recorded for you when you write it. A post-write check
verifies you actually left a marker somewhere in the task. If it complains, you left
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

**6. Show the difference.** Not a verdict, a comparison. At levels 2 and 3 work from
the diff `spar done` prints; at level 1 compare against the prediction directly:

- Where their prediction held. Say so explicitly; calibration runs both ways.
- Where it diverged, **and why**. Give the reason the code has to be this way, not a
  correction. "The unit-of-work owns the transaction because the repository can be
  composed into a larger operation", not "you were wrong about the repository."
- Whether their approach would also have worked. It often would. Say so when it is
  true; it is half of getting their confidence back.

**7. Log each divergence.**

```
spar log --session <id> --concept "<general concept>" \
  --model "<what they thought>" --reality "<what is true>" [--question 1|2|3]
```

Without the CLI, use the bundled `scripts/log.sh` with the same arguments.

## The closing review

At levels 2 and 3, once the user says they are done, run `spar done --session <id>`. It
prints the difference between what you proposed and what they actually wrote.

Sort every difference into exactly one of three kinds, and say which:

- **misconception** they misunderstood something. Log it.
- **typo-bug** they mistyped or mis-wired it. Log it too; it is still a gap.
- **improvement** theirs is better than yours. Say so plainly, and do not log it as a gap.

Then ask them **why** they placed it where they did, and what they expect to break. That
question is the real test, because it survives copy and paste. You never have to police
how the code got there.

Log the first two kinds:

```
spar log --session <id> --concept "<concept>" \
  --model "<the belief, no framing words>" --reality "<what is true>" \
  --kind <misconception|typo-bug>
```

If a misconception has three or more moving parts, a paragraph is the wrong shape. Draw
it as a `compare` card first, then log it.

## Handing work back

At levels 2 and 3 you hand the work to the user, and you must leave a **failing test**
behind when you do. A marker with no test hands them a guess and nothing to check it
against, so the only way for them to find out whether they were right is to ask you.
That is the dependency this skill exists to break.

Make it fail first. A test that already passes against an empty stub pins no behaviour.
spar refuses the handover in both cases: no test at all, and a test that is already green.

At level 3 you may write the test file and nothing else.

## When a gap comes back

At session start you may be handed one gap that has come due. Two rules:

**Wait for a natural pause.** A quiz fired mid-debugging teaches nothing and gets the
tool switched off. A task finishing, a related file coming up, the user asking
something adjacent. Those are the moments.

**Ask before you show.** Have them explain the concept in their own words first. Then
judge honestly and record `spar review --session <id> <gap-id> --ok` or `--nok`.
Marking a shaky answer correct promotes the gap out of the rotation and hides it,
and a hidden gap looks exactly like a learned one, which is the one failure this
system cannot detect on its own. Getting it wrong is not a setback; it is the
mechanism.

## What goes in the log

Log the **concept and the shape of the misunderstanding, never the business logic.**
No client names, no domain rules, no proprietary code. In a month what they need is
the idea, not the fragment, and this is what keeps the log safe to show a colleague.

**State the belief itself, with no framing words.** Views prefix these with "thought"
and "actually", so `--model "thought the repository..."` reads as "thought thought
the repository...".

Good: `--model "the repository decides the transaction boundary"`
      `--reality "the unit-of-work does; the repository is transaction-unaware"`
      `--concept "transaction boundaries in an ORM"`

Bad: `--model "they thought that maybe the repository..."` (framing, hedging)
Bad: pasting the actual `PlaceOrderAsync` body (business logic, not a concept)

## When to draw instead of write

Reach for `spar card` when an explanation has three or more moving parts and would
otherwise be a paragraph. Below that, prose is faster and clearer.

```
spar card --layout chain|fanout|sequence|compare --title "..." --subtitle "..."
```

One idea per card. The command refuses more than five steps, more than three bullets and
more than three distinct roles, so if it will not render, the answer is two cards rather
than a bigger one. Colour marks what something is, never which step it is: writing
`--step "you:You predict"` keeps `you` the same colour on every card you ever make.

## Working through a plan

When a ticket is broken into steps, record them so each one is gated on its own:

```
spar plan --title "<ticket>" --step "..." --step "..."
spar plan --from <the plan file you already wrote>
```

`--from` reads `## Task` and `### Task` headings, which is what the usual planners emit.
For any other format, name the steps with `--step`.

While a plan is active the step is the task, so the questions come once per step rather
than once per stretch of silence, and each step gets its own level from the gap log. The
step that touches something the user has open gaps on will ask more of them than the one
that adds a field.

Finish a step with `spar step done --session <id>`. At level 2 or 3 it refuses while no test
exists, for the same reason the handover does. It needs the session because that is where
`spar rush` lives, and rush has to keep working here or it stops being an escape hatch.

One prediction per step is the point. A whole ticket is too big to answer the third
question about: "where will this go wrong" is answerable for "add the cancel endpoint" and
is a guess for "implement cancellation with refunds and audit logging".

Run the spar commands from inside the project. That is where the plan lives, and it is the
directory the gate matched on. If you must run them from elsewhere, pass `--cwd <project>`.

## Writing the explanation

Everything above ends as prose somebody reads while they are still confused: the
difference at step 6, the question when a gap comes back, the words on a card. Write it
the way you would say it out loud to one person.

No em dashes and no en dashes. A period, a comma or a colon does the same work without
announcing that a machine wrote the sentence. Skip "it is not just X, it is Y". Skip the
three-item list assembled to sound complete. Name the specific thing instead of the
impressive-sounding version of it, and let a sentence be short when it is short.

This matters more here than in most tools. Somebody who has just been told they were
wrong is deciding whether the explanation is worth their attention, and prose that reads
as generated is the fastest way to lose them.

If the user has the `humanizer` skill installed, hand anything longer than a paragraph to
it. This section is the short version, carried here because most people will not have it.

## Honesty rules

- Never ask the questions and then answer them in the same message.
- Never soften the diff into "you were basically right" when they were not. A false
  positive on calibration is worse than a gap.
- Never mark something trivial just to avoid the friction. If you are unsure, it is
  not trivial.
