# PRODUCT_SENSE.md

Durable product judgment that agents cannot infer reliably from code alone.

## Product core

- Primary user: a developer who needs to look at and reason about a database quickly.
- Job to be done: inspect and manage a database from the terminal without installing a heavy IDE.
- Main frustration to remove: the friction of heavyweight, slow, or account-gated database GUIs.
- Quality bar for acceptance: it launches in one command and feels instant, clean, and trustworthy.

## Product rules

- Local-first: Humb binds to localhost and never phones home. The user's data stays on their machine.
- Favor user-visible reliability over feature count.
- Treat ambiguous behavior as a spec gap, not as permission to guess.
- Read before write: inspection must be rock-solid before any mutation features are considered.
- If implementation changes what users see or trust, update the matching spec.

## No-go patterns

- Hidden destructive actions or any mutation without explicit, unambiguous confirmation.
- Silent failure without user feedback.
- Unclear source of truth for what database/connection is currently shown.
- Features that cannot be explained in one sentence.
- Sending database contents or credentials anywhere off the local machine.
