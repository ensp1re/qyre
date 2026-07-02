# FEATURES.md

[`FEATURES.json`](FEATURES.json) is the single source of truth for scope. It is not a memo: it is
read when choosing the next feature, judging whether a feature is done, and writing the session
handoff.

## The triple

Every feature entry must have:

- `behavior`: what the user-visible outcome is.
- `verification`: the exact command that proves it works.
- `state`: one of `not_started`, `active`, `blocked`, `passing`.

Plus metadata: `id`, `commitHash`, `evidence`, `blockedReason`, `spec`.

## State machine

```mermaid
flowchart TD
  notStarted["not_started"] --> active["active"]
  active --> verify{"verification passes?"}
  verify -->|"no"| active
  verify -->|"yes"| passing["passing"]
  active --> blocked["blocked (needs blockedReason)"]
  blocked --> active
```

## Rules (enforced by `scripts/check-features.mjs`)

- IDs are unique and match `F` followed by three digits (e.g. `F008`), or `DF-` followed by two or
  more digits (e.g. `DF-01`) for frontend/design-driven work - see `docs/NAMING.md`. Both series
  follow every rule on this page identically; `DF-` is purely a visual/organizational split, not a
  different process.
- `state` is one of the allowed states.
- At most one feature is `active` at a time, counting `F###` and `DF-##` together.
- A `passing` feature must have non-empty `evidence` (command output ref, commit SHA, or E2E artifact)
  **and** a `commitHash` (a real git SHA, 7-40 hex characters) — a dedicated, machine-checkable field
  so anyone can confirm the work was actually committed/pushed without parsing prose. `evidence`
  should still describe what was verified and how; `commitHash` is just the pointer to where.
- A feature only becomes `passing` once its commit is actually pushed — `commitHash` must be a real,
  pushed SHA, not a local-only one.
- A `blocked` feature must have a non-empty `blockedReason`.
- Every feature must have a non-empty `behavior` and `verification`.
- The agent does not flip a feature to `passing` from inspection; it only does so after the
  `verification` command actually passes, and records the evidence.

## Granularity

Each feature should be completable in roughly one session. Too broad will not finish; too narrow is
overhead.

If a requested feature turns out to be too broad once scoped, split it: implement and verify the
first slice, and add the rest as new `not_started` entries rather than trying to push everything
through `active` in one pass (see `docs/PLANS.md`).
