---
title: Concurrent writes
description: Make acknowledged changes recoverable and concurrent contributions safe.
---

# Concurrent writes

## Rules

- Commit each mutation and its journal receipt in one synchronous transaction.
- Require a request ID. Return the same receipt for the same command; reject ID reuse for different content.
- Require the observed record revision. Report conflicts instead of overwriting concurrent edits.
- Preserve command inputs when assigning server metadata.
- Validate references and roll back a whole measurement batch if one sample is invalid.
- Keep data outside checkouts and preserve it across restarts.
- Log request ID, status, and duration without research bodies.

## Checks

Run store tests. Exercise concurrent clients, retries, stale edits, live notifications, restart recovery,
and journal catch-up on the actual celld path. The development Factory maintains `pnpm test:live` for this check.
