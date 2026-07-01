# PLANS.md

How execution plans are created, updated, completed, and archived.

## When a plan is required

Create an execution plan when work:

- spans more than one session,
- changes more than one package/subsystem,
- has non-trivial verification or rollout risk, or
- depends on open decisions that should be logged.

Small, single-session changes can be driven directly from a `docs/FEATURES.json` entry without a
full plan.

## Plan locations

- [`exec-plans/active/`](exec-plans/active/): plans currently driving work.
- [`exec-plans/completed/`](exec-plans/completed/): finished plans kept for future agent context.
- [`exec-plans/tech-debt-tracker.md`](exec-plans/tech-debt-tracker.md): deferred work and follow-ups.

## Splitting oversized work

If an approved task is bigger than one feature/session, do not try to queue and execute every
sub-part in the same pass:

- Scope and implement the first slice now; get it to `passing` on its own.
- Record the remaining sub-parts as new `not_started` entries in `docs/FEATURES.json` (or as
  additional scope items in the active plan) so they are visible and pick-up-able later.
- Only promote a queued slice to `active` when it is actually picked up, in this session or a future
  one. Do not silently start on deferred slices without saying so.

## Minimum plan sections

- objective
- scope and out-of-scope
- linked feature IDs
- verification path
- risks and blockers
- progress log
- open decisions

## Operating rules

- One active plan has one clearly owned current step.
- Update the plan as work progresses; it is not static prose.
- If a decision changes implementation direction, record it in the plan.
- Move finished plans to `completed/` (with evidence) so agents can discover prior context.
- Keep plans in sync with `docs/FEATURES.json`: the feature list is the source of truth for scope.
