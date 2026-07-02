---
name: humb-lean-output
description: Use for every response and verification run in the Humb repo. Cuts token usage by trimming narration and duplicate log output. Does not change what gets verified, checked, or how carefully code is written - only how results are reported.
---

# Humb Lean Output

Scope: this skill governs communication style only. It never reduces verification rigor,
test coverage, or the thoroughness of a change. Run every check you would normally run, in full.
Only the reporting changes.

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
