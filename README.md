# spar

**Keep learning while AI writes the code.**

Reviewing finished, convincing code teaches you almost nothing — you have no position to
judge it from. `spar` inverts the order: you predict where the change belongs, how you
would do it, and where it will break. *Then* the agent implements, shows you the
difference, and logs every gap between your model and reality.

Those gaps become your curriculum. The concept you are wrong about most often rises to
the top on its own — and the friction moves there with it, so you never have to decide
to work hard.

## What it looks like

```
› add an endpoint for cancelling an order

  spar: level 2 (skeleton) — 2 open gaps on "transaction boundaries in an ORM"

  Before I write anything:
    1. Where does this belong, and why there?
    2. How would you approach it? (two sentences)
    3. Where will this go wrong?

› 1. Orders controller, calling into the service
  2. load the order, set status, save
  3. no idea

  [writes the controller, the DI wiring and the error handling,
   and leaves the one line that matters]

  // TODO(spar: decide the transaction boundary — who opens it,
  //             and what happens if the refund call fails halfway?)
```

You write those five lines. Then `spar done` diffs what you wrote against what it would
have written, and sorts every difference into *misconception*, *typo*, or *your version
is better* — and only the first two become gaps.

Three weeks later, mid-session:

```
spar: one gap has come due. Ask them to explain "transaction boundaries in an ORM"
in their own words at the next natural pause — do not show them the answer first.
```

## Install

| Tier | Install | What you get |
|---|---|---|
| **1** | the skill alone | The three questions and gap logging, in any skills-capable agent. No config. |
| **2** | `npm i -g spar-agent` | Levels, calibration, spaced repetition, stats, dashboard. |
| **3** | `spar install` | **Enforcement** — the gate actually stops the write. |

Tier 1 is a 30-second trial. Tier 3 is the one that works, because the whole premise is
that you will not do this voluntarily.

```sh
npm i -g spar-agent
spar install                                       # detects your agents, backs up, merges
spar setup --project /path/to/repo --stack ".NET"
```

`spar install` never overwrites: it merges into what is already there, backs the file up
first, and only ever replaces entries it put there itself. Run it twice and nothing
changes the second time. `--dry-run` shows what it would write.

**Nothing happens in any directory you have not named.** A fresh install is completely
inert — it does not even create `~/.spar` until you name a project.

## What each agent gets

| | Claude Code | Cursor | Any MCP client | Any skills client |
|---|---|---|---|---|
| The three questions | ✅ | ✅ | ✅ | ✅ |
| Gap log, spaced repetition, stats | ✅ | ✅ | ✅ | via `scripts/log.sh` |
| **The gate — actual enforcement** | ✅ | ✅ | ✗ | ✗ |

MCP is standardised where hooks are not, so the server works everywhere with no adapter.
What it cannot do is the gate: an MCP server offers tools, it does not intercept the
host's writes. That single limitation is why the per-agent hook adapters exist — and why
the voluntary tiers make a good trial but not a substitute.

## The levels

| Level | AI does | You do |
|---|---|---|
| 0 rush | everything | a 30-second question afterwards |
| 1 standard | implements | predict first, compare after |
| 2 skeleton | wiring and signatures; the core stays `TODO(spar:)` | write the 5–10 lines that carry the decision |
| 3 transcript | delivers in chat, writes nothing | write and place it yourself |

There is no off switch, only level 0. The level is suggested from your own gap log with
the reason attached, and you can always override it — overrides are counted, because a
user constantly correcting the suggestion is telling you the thresholds are wrong.

## Seeing where you stand

```sh
spar stats        # in the terminal
spar dashboard    # one self-contained HTML file
```

```
CALIBRATION — share of predictions that held, by week
  2026-07-13  ███████▁▁▁   67%     4/6   clean   mean level 2.3
  2026-07-20  ████▁▁▁▁▁▁   44%     4/9   clean   mean level 2.3
  2026-08-03  ████████▁▁   83%    10/12  clean   mean level 0.8
  2026-08-17  ██████████  100%     9/9   clean   mean level 0.3

CURRICULUM — concepts by weakness. The top row is what to learn next.
  * idempotency in webhooks              3 open / 3   box 1.3
    transaction boundaries in an ORM     8 open / 8   box 2.0
    EF change tracking                   0 open / 3   box 5.0
```

The headline is **calibration**: the share of your predictions that produced no
misconception. Not a gap count — that only ever climbs, and would read as decline exactly
while you improve. Below it the concept table, ordered by weakness. That order is your
curriculum, and nobody chose it.

![The spar dashboard](https://raw.githubusercontent.com/Lander-Parren/spar/main/docs/dashboard.png)

*Six weeks of a fictional .NET onboarding. The page follows your system theme.*

The dashboard is one file with no network access of any kind — no CDN, no fonts, no chart
library, hand-written SVG. Every number is static markup, so it reads the same with
scripting disabled, behind a strict CSP, or in an attachment preview; script only adds
multi-select to the focus bar. It opens offline, from a double-click, in five years.

**No streaks, points or badges.** In a tool where "no idea" is a valuable answer, a
counter would only teach you to fake competence.

## Gaps come back

A logged gap returns at session start, once, as a question at a natural moment — never a
queue and never an interruption. Answer it well and it moves up a box (1, 3, 7, 16, 35
days); answer it badly and it starts over tomorrow. There is no separate app and no
inbox: it arrives in the session you were already in.

## When does the gate fire?

Once per task, not once per file — fifteen edits behind one prediction is one gate.

A task stays alive while there is movement in it and lapses after 30 minutes of silence
(`idleMinutes` in `~/.spar/config.json`). That measures idleness, not age, so a long
careful task is never interrupted halfway. Starting something new before then?
`spar next --session <id>`.

This leans deliberately towards "still the same task". Re-arming on a follow-up costs you
thirty seconds and pushes you towards `spar rush`; missing one task costs a single gap,
and that concept will come round again.

## Privacy

Everything is local, in `~/.spar/`. No account, no telemetry, no network, no API key of
its own. The log records *concepts and misunderstandings*, never your business logic —
which is what makes it safe to screenshot for a colleague.

## Safety

`spar` fails open. Missing binary, corrupt config, a bug in its own code — the gate
opens. A learning tool must never be the reason you cannot ship.

## Development

```sh
npm install
npm test          # 118 tests
npm run build
npm run emit      # regenerate the checked-in hook configs from one definition
```

The hook configs are checked in three times over — Claude Code's plugin layout, the Agent
Plugins namespace, and Cursor's — because the two standards disagree about where client
files live. They are generated from `src/core/hookconfig.ts`, and a test fails if they
drift.

## Licence

MIT
