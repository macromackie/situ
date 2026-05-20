---
status: active
category: policy
created: 2026-05-13
---

# 0012. Policy: Security, Filesystem, and Secrets

## Context

Situ runs locally against a user's repository and will eventually execute local
commands, write artifacts, and store durable records. That makes filesystem and
secret handling part of the product boundary.

The app should be useful to local agents without becoming a place where secrets,
private model context, or arbitrary filesystem writes are silently stored.

## Decision

Situ should keep product state inside a Situ-owned state home and treat the
target repository as a separate work subject.

The default state home is:

```text
$SITU_HOME
```

If `SITU_HOME` is unset, use:

```text
$HOME/.situ
```

Situ may create project workspaces, artifact directories, databases, and reports
under the state home. It may read and write inside explicit repository
worktrees when a command or feature ADR allows it.

## Filesystem Rules

All filesystem helpers should:

- resolve paths before use
- reject path traversal outside the allowed root
- create parent directories explicitly
- avoid following untrusted symlink paths for writes
- use atomic writes where practical for product state
- keep generated artifacts under a project-specific artifact directory

Functions that accept paths should use object arguments and name the allowed
root:

```ts
resolveInsideRoot({
  rootPath,
  relativePath,
});
```

## Secrets

Situ must not require model-provider API keys for normal operation.

Situ must not automatically persist secrets in product records, comments,
events, artifacts, reports, eval fixtures, logs, or SQLite tables.

Explicit caller-directed artifact capture is the exception. When a caller
chooses a local file and runs artifact capture, Situ preserves the selected
bytes under the Situ state home without content scanning. The captured copy is
sensitive local state. Capture must not print file contents to stdout or stderr,
and must not automatically copy file contents into comments, events, reports,
eval fixtures, logs, or SQLite text fields.

Captured artifact records store metadata rather than file contents: URI, byte
size, SHA-256, title, summary, target, actor, timestamps, and other
caller-provided artifact metadata allowed by the artifact record contract. If a
caller wants to summarize or reference captured content in Markdown, that
requires a separate explicit product action.

Environment variables should be passed to child commands only when explicitly
allowed. Default command execution should use a filtered environment that
removes obvious secret names such as:

```text
*_KEY
*_TOKEN
*_SECRET
*_PASSWORD
```

If a feature needs to capture command output, it should treat output as
potentially sensitive and require an explicit product action to attach it as an
artifact, measurement, comment, or report.

## External References

Situ may store references to external URLs, commits, branches, and file paths.
Those references are product state, but the external content is not guaranteed
to be preserved unless copied into a Situ artifact or summary.

## Consequences

Storage, artifact, worktree, command execution, and report ADRs must build on
this policy.

Tests should cover path containment and environment filtering once those helpers
exist.
