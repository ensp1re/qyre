# Live feature queue

[`FEATURES.json`](FEATURES.json) stores current work, not permanent history. Use `pnpm features` for
the compact queue and `pnpm features <id>` for one full entry.

## Entry contract

Every live entry has `id`, `behavior`, `verification`, `state`, `commitHash`, `evidence`,
`blockedReason`, and `spec`. Passing entries also have an ISO UTC `completedAt`.

States are `not_started -> active -> passing`, with `active -> blocked -> active` when necessary.
At most one entry is active. A feature becomes passing only after its verification passes and a
pushed commit/PR is recorded.

## Retention

Run `pnpm features:prune` during session closeout. It removes passing entries completed more than
24 hours ago. This is deliberately not a CI validation step: time passing must not make an
otherwise unchanged build fail.

Durable behavior stays in product specs; implementation and verification evidence stay in Git and
PR history. `nextIds` remains after pruning so IDs are never reused. `pnpm features:prune --dry-run`
previews removal.

## Rules enforced by `check-features`

- IDs match `F###` or `DF-##` and are unique among live entries.
- `nextIds.F` and `nextIds.DF` exceed all corresponding live IDs.
- Behavior and verification are non-empty.
- At most one feature is active.
- Passing entries have evidence, a 7-40 character commit SHA, and `completedAt`.
- Blocked entries have `blockedReason`.

Keep slices small enough to complete and verify independently. Use an execution plan when work
crosses packages or sessions.
