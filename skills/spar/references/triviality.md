# Is this change trivial?

The gate exists to catch decisions, not keystrokes. Gating trivia teaches nothing and
trains the user to switch the tool off, so this judgement matters.

**When unsure, treat it as non-trivial.** A wasted 5 minutes costs less than a missed
gap — but see the honesty rule: do not use uncertainty as an excuse to gate everything
either, or the ratio will show it.

## Trivial

- Renames, formatting, import ordering, comments
- Test fixture data, obvious assertions on existing behaviour
- Repeating a pattern that already exists verbatim in the same file or a sibling
- Mechanical application of a decision already made and predicted earlier this task
- Config value changes with no behavioural branch

## Non-trivial

Ask: *did someone have to decide something that could reasonably have gone another way?*

- A new component, endpoint, route, handler, or public function
- Dependency wiring: registration, lifetimes, scopes, injection boundaries
- Data model or query shape; anything touching persistence semantics
- Concurrency: async boundaries, locking, ordering, cancellation
- Error handling: what is caught, what propagates, what the caller sees
- Anything crossing a layer boundary, or deciding where a boundary is
- Anything the user has an open gap on (the level suggestion will say so)

## Per-stack examples

**.NET** — service lifetimes (`AddScoped` vs `AddSingleton`), `DbContext` scope,
`SaveChanges` placement, `IAsyncEnumerable` vs materialising, middleware ordering,
`ConfigureAwait`, model binding and validation boundaries.

**Kotlin / JVM** — coroutine scope and dispatcher choice, structured concurrency,
nullability at API boundaries, Spring bean scope, transaction propagation.

**Go** — context propagation and cancellation, goroutine ownership, interface
placement (consumer side), error wrapping, channel buffering.

**TypeScript / Node** — module boundaries, sync vs async I/O, error typing, ORM
transaction scope, framework lifecycle hooks, serialisation boundaries.

**Python** — session/transaction scope, sync vs async framework mixing, dependency
injection boundaries, generator vs list materialisation.
