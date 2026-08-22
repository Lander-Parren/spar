<div align="center">

# spar

**Keep learning while AI writes the code.**

[![npm](https://img.shields.io/npm/v/spar-agent?logo=npm&logoColor=white&label=spar-agent&color=3a6b4f)](https://www.npmjs.com/package/spar-agent)
[![license](https://img.shields.io/badge/license-MIT-3a6b4f)](LICENSE)
[![node](https://img.shields.io/node/v/spar-agent?color=3a6b4f)](https://nodejs.org)

</div>

Reviewing finished, convincing code teaches you almost nothing. You have no position to
judge it from, so you read it, nod, and move on.

`spar` puts the position back. Before the agent writes anything, you say where the change
belongs, how you would do it, and where it will break. Then it implements, shows you the
difference, and writes down every place your model was wrong.

Those gaps pile up into a curriculum you never had to choose. The concept you miss most
often rises to the top by itself, and the friction follows it there, so you never have to
decide to work hard.

## What it looks like

```
› add an endpoint for cancelling an order

  spar: level 2 (skeleton), 2 open gaps on "transaction boundaries in an ORM"

  Before I write anything:
    1. Where does this belong, and why there?
    2. How would you approach it? (two sentences)
    3. Where will this go wrong?

› 1. Orders controller, calling into the service
  2. load the order, set status, save
  3. no idea

  [writes the controller, the DI wiring and the error handling,
   and leaves the one line that matters]

  // TODO(spar: decide the transaction boundary. Who opens it,
  //             and what happens if the refund call fails halfway?)
```

You write those five lines yourself. Then `spar done` compares them against what the agent
would have written and sorts each difference into one of three buckets: you misunderstood
something, you mistyped something, or your version is better. Only the first two are logged
as gaps.

Three weeks later, in the middle of unrelated work:

```
spar: one gap has come due. Ask them to explain "transaction boundaries in an ORM"
in their own words at the next natural pause. Do not show them the answer first.
```

Answering "no idea" is fine, by the way. It gets recorded as-is, and it is a strong enough
signal that the next task touching that concept will ask more of you, not less.

## Install

```sh
npm i -g spar-agent
spar install                                       # finds your agents, backs up, merges
spar setup --project /path/to/repo --stack ".NET"
```

That last line matters: **nothing happens in a directory you have not named.** A fresh
install is completely inert. It will not even create `~/.spar` until you point it at a
project.

`spar install` is careful with files it did not write. It merges into what is already
there, backs the file up first, and only ever replaces entries it put there itself. Run it
twice and the second run changes nothing. Use `--dry-run` to see what it would do.

## Where you stand

```sh
spar stats        # in the terminal
spar dashboard    # one self-contained HTML file
```

```
CALIBRATION, share of predictions that held, by week
  2026-07-13  ███████▁▁▁   67%     4/6   clean   mean level 2.3
  2026-07-20  ████▁▁▁▁▁▁   44%     4/9   clean   mean level 2.3
  2026-08-03  ████████▁▁   83%    10/12  clean   mean level 0.8
  2026-08-17  ██████████  100%     9/9   clean   mean level 0.3

CURRICULUM, concepts by weakness. The top row is what to learn next.
  * idempotency in webhooks              3 open / 3   box 1.3
    transaction boundaries in an ORM     8 open / 8   box 2.0
    EF change tracking                   0 open / 3   box 5.0
```

The number that matters is calibration: the share of your predictions that produced no
misconception at all. Deliberately not a gap count, because a count only ever climbs, and
would read as decline exactly while you get better.

![The spar dashboard](https://raw.githubusercontent.com/Lander-Parren/spar/main/docs/dashboard.png)

<sup>Six weeks of a fictional .NET onboarding. The page follows your system theme.</sup>

The dashboard is a single file that never touches the network. No CDN, no web fonts, no
chart library, and the charts are hand written SVG. Every number sits in the markup, so the
page reads the same with scripting off, behind a strict CSP, or in an attachment preview.
Script only adds multi select to the focus bar. It will still open, offline, from a double
click, in five years.

There are no streaks, points or badges anywhere in it. In a tool where "no idea" is a useful
answer, a counter would just teach you to fake competence.

## Explaining with a picture

```sh
spar card --layout chain --title "Predict before you're told" \
  --subtitle "The gap between your guess and what was true is worth writing down." \
  --step "you:You predict" --step "agent:AI implements" --step "you:You compare"
```

One idea per card, written to `~/.spar/cards/`. Four layouts cover most explanations: a
chain of steps, a fan-out, a sequence between two parties, and a comparison.

The limits are enforced rather than suggested. More than five steps, more than three
bullets, or a fourth colour role and the command refuses to render. That is deliberate,
because the whole value of a small picture is that it stayed small, and a rule that only
lives in a prompt drifts. If it will not render, the answer is two cards.

Colour marks what something is, never which step it is, so `--step "you:..."` keeps `you`
the same colour on every card you make. `cards.theme` in `~/.spar/config.json` picks the
look: `neon` (the default, dark with outlined boxes) or `plain`.

## The levels

| Level | The agent does | You do |
|---|---|---|
| **0** rush | everything | one 30 second question afterwards |
| **1** standard | implements | predict first, compare after |
| **2** skeleton | wiring, signatures and a failing test, leaving `TODO(spar:)` | write the 5 to 10 lines that carry the decision |
| **3** transcript | writes the test and nothing else, delivers the rest in chat | write and place it yourself |

At levels 2 and 3 the agent always leaves a failing test behind, and spar refuses the
handover if it does not. A marker with no test hands you a guess and nothing to check it
against, so the only way to find out whether you were right is to ask the agent, which is
the dependency the whole tool exists to break. The test is what lets you work alone for
twenty minutes and still know.

Set `testCommand` on a project and spar also runs the suite at handover and expects it to
be red, because a test that already passes against an empty stub pins nothing:

```sh
spar setup --project "$(pwd)" --test-command "npm test"
```

That check is off by default. Running someone else's suite automatically is invasive and
can be slow.

There is no off switch, only level 0. Your own gap log suggests the level and tells you why,
and you can always overrule it. Overrules get counted, because someone constantly correcting
the suggestion is telling you the thresholds are wrong.

## What each agent gets

| | Claude Code | Cursor | Any MCP client | Any skills client |
|---|:-:|:-:|:-:|:-:|
| The three questions | ✅ | ✅ | ✅ | ✅ |
| Gap log, spaced repetition, stats | ✅ | ✅ | ✅ | via `scripts/log.sh` |
| The gate, actual enforcement | ✅ | ✅ | ✗ | ✗ |

MCP is standardised where hooks are not, so the server reaches every MCP client without an
adapter. The one thing it cannot do is the gate, because an MCP server offers tools and
never intercepts the host's own writes. That limitation is the whole argument for
maintaining per agent hook adapters, and the reason the voluntary tiers make a good trial
but a poor substitute.

## What it will not do

Everything stays on your machine, in `~/.spar/`. No account, no telemetry, no network calls,
no API key of its own. The log holds concepts and misunderstandings rather than your
business logic, which is what makes it safe to screenshot for a colleague.

And it fails open, always. A missing binary, a corrupt config, a bug in its own code: the
gate opens and you carry on. A learning tool should never be the reason you cannot ship.

<details>
<summary><b>How often the gate actually fires</b></summary>

Once per task, not once per file. Fifteen edits behind one prediction is one gate.

It watches shell commands as well as write tools, because an agent reaches for
`cat > file <<EOF` or `perl -0pi` far more often than for a dedicated write tool, and some
setups tell it to prefer exactly that. A shell command is only stopped when it actually
writes somewhere inside a tracked project: redirects, `tee`, in-place `sed` and `perl`,
`cp` and `mv` destinations, and interpreter one-liners that open a file for writing. Reads
and test runs go through untouched. Shell is not parseable by regex, so this is
deliberately conservative and misses exotic forms rather than stopping ordinary work.

A task stays alive as long as there is movement in it, and lapses after 30 minutes of
silence (`idleMinutes` in `~/.spar/config.json`). That measures idleness rather than age, so
a long careful task never gets interrupted halfway through. If you are starting something
new before the timer runs out, `spar next --session <id>` re-arms it immediately.

The bias is deliberate. Re-arming on a follow up costs you thirty seconds and nudges you
towards `spar rush`, which is how these tools die. Missing one task costs a single gap, and
that concept will come round again.

</details>

<details>
<summary><b>How a gap comes back</b></summary>

One gap returns at session start, phrased as a question for the next natural pause. Never a
queue, never an interruption. Answer it well and it moves up a box (1, 3, 7, 16 and 35 days).
Answer it badly and it starts over tomorrow.

There is no separate app and no inbox to ignore, because it arrives in the session you were
already working in.

</details>

## Trying it without risking anything

`example/` is a small TypeScript project with no dependencies, built to be pointed at.

```sh
cd example
spar setup --project "$(pwd)" --stack "TypeScript"
```

Then ask your agent to add order cancellation and watch the gate stop it. `example/README.md`
explains what to look for.

<details>
<summary><b>Development</b></summary>

```sh
npm install
npm test              # spar's own suite
npm run build
npm run emit          # regenerate the checked-in hook configs
npm run validate:example   # drive every hook end to end against example/
```

`validate:example` is the one that catches wiring problems. The unit tests prove the
pieces; that script proves a real hook payload produces the decision it should, in a
throwaway home, against the built binary.

The same hook definition is checked in three times over: Claude Code's plugin layout, the
Agent Plugins namespace, and Cursor's. The two standards disagree about where client
specific files belong, so there is no single location that satisfies both. All three are
generated from `src/core/hookconfig.ts` by `npm run emit`, and a test fails the moment they
drift apart.

</details>

## License

MIT
