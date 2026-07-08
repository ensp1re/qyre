---
name: qyre-lean-output
description: Use for every Qyre response and verification run. Minimize response and tool-output tokens without reducing technical accuracy, verification, warnings, or necessary reasoning.
---

# Qyre Lean Output

## Responses

- Lead with the result. Use exact, normal sentences.
- Omit praise, request restatement, plan repetition, obvious transitions, command narration, and
  duplicate summaries.
- Send commentary only at tool-work start, a material finding, a blocker, or a changed direction;
  keep it to one sentence.
- Final responses contain only outcome, verification, risk/blocker, and next action. State each
  fact once.
- Preserve detail for errors, security, destructive actions, and ambiguous tradeoffs.

## Commands

- Start with `pnpm context`; read only routed files and matched symbol ranges.
- Prefer `pnpm check:quiet`; use `pnpm verify:pr` for delivery.
- Cap successful output. Show only actionable failure lines.
- Do not reread unchanged files or rerun a passing check without a change.
