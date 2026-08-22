# spar example

A deliberately small TypeScript project to point spar at, so you can feel the gate
before you turn it on anywhere that matters.

No dependencies and no build step. Node 22 runs the TypeScript directly.

```sh
npm test     # ten tests, via node --test
npm run check
```

## Point spar at it

```sh
npm i -g spar-agent          # or, from the repo root: npm link
spar install                 # required: without this nothing is wired up at all
spar setup --project "$(pwd)" --stack "TypeScript"
```

Both steps matter and they do different things. `spar install` puts the hooks in your
agent's settings; `spar setup` names the project they apply to. With only the second, the
config looks right and nothing ever fires.

Check it took:

```sh
grep -c 'spar hook' ~/.claude/settings.json    # should be 4
```

Then open your agent here and ask for something real:

> add a way to cancel a paid order and refund it

## What should happen

The gate stops the first write and asks you three questions. Answer them honestly,
including "no idea" if that is the truth, because that answer is worth more to spar than
a guess you did not mean.

The interesting one is the third question, and this project is built so it has a real
answer. `UnitOfWork` owns the transaction boundary and `OrderRepository` knows nothing
about transactions, so a cancellation has to decide: who opens the transaction, and what
happens if the refund succeeds but the status write fails?

Afterwards, `spar stats` shows one prediction recorded. Log a few gaps on the same
concept and `spar suggest-level` starts asking more of you on that concept and only that
one.

## Resetting

Everything spar wrote lives in `~/.spar/`. To start over:

```sh
rm -rf ~/.spar
```

To stop gating this project without removing anything else, drop it from
`projects` in `~/.spar/config.json`.

## A note on the code

`OrderService` writes its constructor out by hand instead of using parameter properties.
Node strips types without a compiler, and a parameter property emits real code, so it is
not something type stripping can do. The same applies to enums and namespaces if you
extend this.

`cancel()` refunds before it commits, the same way `place()` charges before it commits.
That ordering owns one failure and rules out the other: a refund that fails leaves the
order `paid` and untouched, but a refund that succeeds ahead of a commit that throws hands
back the money while the order still reads `paid`. A second `cancel()` is a no-op rather
than an error, so a retry cannot refund twice.
