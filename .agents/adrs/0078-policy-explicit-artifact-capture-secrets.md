---
status: active
category: policy
created: 2026-05-14
---

# 0078. Policy: Explicit Artifact Capture and Secrets

## Context

ADR 0012 says Situ must not persist secrets in product state. ADR 0057 adds
explicit local artifact file capture and says file contents are not scanned for
secrets.

Those statements need one clear target rule. Artifact capture intentionally
copies caller-selected bytes into Situ state. The app cannot know whether a
local file contains a secret without adding scanning, redaction, previews, or
workflow-specific policy.

## Decision

Situ must not automatically persist secrets.

Explicit artifact capture is the exception for caller-selected files:

```text
caller chooses a local file
  -> caller runs artifacts capture
  -> Situ preserves the selected bytes under Situ state
  -> the artifact record points at the captured copy
```

Situ does not inspect, scan, redact, summarize, log, preview, or classify the
captured file contents during capture. The caller is responsible for deciding
that the selected file should be preserved.

Captured artifact contents must be treated as sensitive local state:

- keep captured files under the Situ state home
- do not print file contents to stdout or stderr during capture
- do not copy captured file contents into comments, events, reports, eval
  fixtures, logs, or SQLite text fields automatically
- store only artifact metadata in SQLite: URI, byte size, SHA-256, title,
  summary, target, actor, and timestamps
- require a separate explicit product action when a caller wants to summarize
  or reference the captured content in Markdown

ADR 0012 should use this distinction:

- automatic persistence of secrets is prohibited
- explicit caller-directed artifact capture preserves selected bytes without
  content scanning

ADR 0057 remains the artifact file-capture contract.

## Boundaries

This ADR does not add secret scanning.

This ADR does not add redaction helpers.

This ADR does not add artifact previews, file serving, upload endpoints,
encryption, retention policy, or garbage collection.

This ADR does not change the local `artifacts capture` byte-preserving
behavior.

This ADR does not make artifact content safe to publish, upload, or include in
reports. Callers and later features must make that choice explicitly.

## Required Checks

Implementation should run:

```text
bun scripts/check_adrs.ts
mise run check
git diff --check
```

## Consequences

The security policy and artifact-capture feature now agree. Situ avoids hidden
secret persistence while still allowing local agents and humans to preserve
selected evidence files intentionally.
