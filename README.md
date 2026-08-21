# spar

**Keep learning while AI writes the code.**

Reviewing finished, convincing code teaches you almost nothing — you have no position
to judge it from. `spar` inverts the order: you predict where the change belongs, how
you'd do it, and where it will break. *Then* the agent implements, shows you the
difference, and logs every gap between your model and reality.

Those gaps become your curriculum. The concept you're wrong about most often rises to
the top on its own — and the friction moves there with it, so you never have to decide
to work hard.

> Status: slice 4 of 6 — feature-complete for one person. Gate, four levels,
> closing review, spaced repetition, `spar stats` and the dashboard. The second
> agent adapter, the MCP server and publishing are what remain.

## Install

| Tier | Install | What you get |
|---|---|---|
| **1** | the skill alone | The three questions and gap logging, in any skills-capable agent. No config. |
| **2** | `npm i -g spar-agent` | Levels, calibration, spaced repetition, dashboard. |
| **3** | wire the hooks | **Enforcement** — the gate actually stops the write. |

Tier 1 is a 30-second trial. Tier 3 is the one that works, because the whole premise
is that you won't do this voluntarily.

## Quick start (tiers 2 + 3, Claude Code)

```sh
npm i -g spar-agent
spar setup --project /path/to/repo --stack ".NET"
```

Then add the contents of `com.anthropic.claude-code/hooks/hooks.json` to your Claude
Code hooks. Nothing happens in any directory you haven't named — a fresh install is
completely inert.

## The levels

| Level | AI does | You do |
|---|---|---|
| 0 rush | everything | a 30-second question afterwards |
| 1 standard | implements | predict first, compare after |
| 2 skeleton | wiring and signatures; the core stays `TODO(spar:)` | write the 5–10 lines that carry the decision |
| 3 transcript | delivers in chat, writes nothing | write and place it yourself |

There is no off switch, only level 0. The level is suggested from your own gap log,
with the reason attached — you can always override it.

## Gaps come back

A logged gap returns at session start, once, as a question at a natural moment —
never a queue and never an interruption. Answer it well and it moves up a box
(1, 3, 7, 16, 35 days); answer it badly and it starts over tomorrow. There is no
separate app and no inbox: it arrives in the session you were already in.

```sh
spar stats        # in the terminal
spar dashboard    # one self-contained HTML file, opens in your browser
```

The headline is **calibration**: the share of your predictions that produced no
misconception, week by week. Not a gap count — that only ever goes up, and would read
as decline exactly while you improve. Below it sits the concept table, ordered by
weakness. That order is your curriculum, and nobody chose it.

The dashboard is one file with no network access of any kind — no CDN, no fonts, no
chart library, hand-written SVG. It opens offline, from a double-click, in five years.
Tick a concept to focus it and it hands you a `spar focus "..."` line to paste back;
focused concepts get their level raised by one and their gaps come back first, and the
focus expires after two weeks so that a priority list stays a priority list.

There are no streaks, points or badges. In a tool where "no idea" is a valuable
answer, a counter would only teach you to fake competence.

## When does the gate fire?

Once per task, not once per file — fifteen edits behind one prediction is one gate.

A task stays alive while there is movement in it and lapses after 30 minutes of
silence (`idleMinutes` in `~/.spar/config.json`). That measures idleness, not age, so
a long careful task is never interrupted halfway. Starting something new before then?
`spar next --session <id>`.

This leans deliberately towards "still the same task". Re-arming on a follow-up costs
you thirty seconds and pushes you towards `spar rush`; missing one task costs a single
gap, and that concept will come round again.

## Privacy

Everything is local, in `~/.spar/`. No account, no telemetry, no network. The log
records *concepts and misunderstandings*, never your business logic — which is what
makes it safe to show a colleague.

## Safety

`spar` fails open. Missing binary, corrupt config, a bug in its own code — the gate
opens. A learning tool must never be the reason you can't ship.

## Licence

MIT
