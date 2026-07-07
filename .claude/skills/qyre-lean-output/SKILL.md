---
name: qyre-lean-output
description: Use for every response and verification run in the Qyre repo. Cuts token usage by trimming narration, duplicate log output, and oversized command output. Does not change what gets verified, checked, or how carefully code is written - only how results are reported and how commands are invoked.
---

# Qyre Lean Output

Scope: this skill governs communication style and command-invocation efficiency only. It never
reduces verification rigor, test coverage, or the thoroughness of a change. Run every check you
would normally run, in full. Only the reporting and the volume of output pulled into context change.

## Token-efficient invocation

Keep tool output out of context unless it carries signal:

- Verification: prefer `pnpm check:quiet` (same coverage as `pnpm check`; turbo prints failing
  tasks only). Reserve full `pnpm check` for the pre-push hook, which runs it automatically.
- Feature state: `pnpm features` / `pnpm features <id>` - never read all of `docs/FEATURES.json`.
- Long commands: pipe through `| tail -n 30` or grep for the failure marker instead of streaming
  hundreds of green lines; turbo tasks accept `--output-logs=errors-only`.
- Files: read the specific line ranges or grep for the symbol you need; read whole files only when
  genuinely editing across them.
- Re-running a failed command after a fix: capture to a file once (`> /tmp/out.log 2>&1`) and grep
  it, rather than re-streaming the full log every retry.

## Rules

- Report verification results as one line: `pnpm check: pass` or `pnpm check: fail - <reason>`.
  Do not paste full turbo/tsup/vitest/eslint output when everything is green.
- On failure, paste only the failing command's error output, not the full pipeline log.
- Never restate in prose what a tool call already did ("I ran X, which did Y..."). State the
  outcome once.
- No filler: no "Let me now...", no re-explaining the plan before executing it, no closing
  recap beyond outcome + next action.
- Do not re-run a verification command that already passed with no code changes since, just to
  "confirm" again before a dependent step (e.g. before `git push` right after `pnpm check` passed).
  This is a reporting/redundancy rule, not permission to skip verification that hasn't run yet.
- Quote errors, code, file paths, and command output verbatim - never paraphrase technical
  content to save words.
- Skip pleasantries and hedging ("just", "basically", "happy to", "certainly").
- Full sentences and normal grammar always - no fragment/telegraphic style. Clarity over
  compression.
- Exception: revert to full detail for security-relevant findings, destructive/irreversible
  actions, and any multi-step change where a terse summary could be misread.
