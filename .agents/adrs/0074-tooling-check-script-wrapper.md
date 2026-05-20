---
status: active
category: tooling
created: 2026-05-14
---

# 0074. Tooling: Check Script Wrapper

## Context

ADR 0006 makes `mise run check` the default full local gate. ADR 0068 adds ADR
metadata validation to that gate.

Keeping a second hand-written gate in `scripts/check.sh` creates drift. A shell
script that repeats the individual check commands can fall behind the canonical
mise task and give agents false confidence.

## Decision

`mise run check` is the canonical full local gate.

`scripts/check.sh`, if present, is a compatibility wrapper only. It must invoke:

```text
mise run check
```

It must not duplicate the individual check steps.

Root docs and ADRs should point agents at `mise run check` for the canonical
gate. They may mention `scripts/check.sh` only as a wrapper for tools that
expect a shell script.

## Boundaries

This ADR does not change the contents of `mise run check`.

This ADR does not make coverage part of `mise run check`. Coverage remains a
separate gate.

This ADR does not require keeping `scripts/check.sh` forever. If no tool needs
it later, a future ADR may remove it.

## Required Checks

Implementation should run:

```text
scripts/check.sh
mise run check
git diff --check
```

## Consequences

There is one source of truth for the full local gate. Agents can still run the
shell script when convenient, but it exercises the same command surface as the
root mise task instead of a stale copy.
