---
title: Boundaries
description: Keep each durable fact and runtime responsibility with one owner.
---

# Boundaries

## Rules

- Keep schemas and deterministic retrieval in `workspaces/core`; import through `src/index.ts`.
- Keep SQL, transactions, and the journal in `workspaces/server`. The server owns record revisions.
- Let agent hosts own messaging/delegation and runners own job execution/budgets.
- Keep CLI and web clients on the same HTTP API.
- Prefer modules within existing workspaces before adding packages or services.
- Keep product code independent of private configuration and personal paths.
- Export an explicit allowlist. Preserve unowned destination files and never push as an export side effect.

## Checks

Run `pnpm check`. Review imports when moving ownership. Verify the exported product independently.
Ask whether a change introduces another owner for a job, budget, or research fact.
