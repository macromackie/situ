---
status: active
category: policy
created: 2026-05-14
---

# 0071. Policy: Filesystem Containment Levels

## Context

ADR 0012 requires filesystem helpers to resolve paths, reject traversal outside
allowed roots, and avoid following untrusted symlink paths for writes.

ADR 0038 introduced `resolveInsideRoot` in `@situ/worktrees`. That helper is
lexical: it resolves strings with Node path rules and rejects `..` escapes, but
it does not read the filesystem, resolve symlinks, create directories, or make
an untrusted destination path safe for writes.

Both behaviors are useful, but they must stay distinct. Otherwise a future
feature could accidentally treat a lexical path helper as a physical filesystem
safety boundary.

## Decision

Situ uses two containment levels:

1. Lexical containment for path references and command descriptors.
2. Physical containment for filesystem writes.

Callers must choose the level that matches the operation.

This ADR requires immediate updates only for:

- the `@situ/worktrees` lexical helper docs and tests
- the local artifact capture write helper docs and tests

It also sets the policy for future filesystem helpers. It does not require a
repo-wide rewrite of every filesystem use in this ADR.

## Lexical Containment

Lexical containment is for strings that describe paths.

Examples:

- git worktree command descriptors
- branch/worktree references stored in records
- paths that will be passed to an explicit runner later
- UI or report references to files that are not being written by the helper

`resolveInsideRoot` remains the lexical helper. It must:

- reject absolute `relativePath` values
- normalize `.` and `..` path segments with Node path rules
- reject paths that escape the resolved root lexically
- allow inside-root names that merely look similar to traversal, such as
  `..foo/file`
- avoid filesystem reads
- avoid `realpath`
- avoid creating directories or files

`resolveInsideRoot` must not be used as the only protection before writing to a
caller-controlled destination path.

The worktrees README must say this plainly because `resolveInsideRoot` lives in
an adapter package that future command-running code may reuse. It should
explicitly state that `resolveInsideRoot`:

- is lexical containment only
- does not call `realpath`
- does not check symlinks or path existence
- does not create directories or files
- must not be the sole guard before writes to caller-controlled destinations

## Physical Containment

Physical containment is for helpers that write files or directories.

Filesystem write helpers should avoid caller-controlled destination paths when
possible. Prefer deriving destinations from:

- a Situ-owned root, such as the state home
- stable product ids that are validated as safe path segments
- a limited basename when preserving a caller-selected source filename

Physical write helpers must not treat `resolveInsideRoot` as sufficient write
safety. They own their own filesystem rules and tests.

When a current helper writes under a Situ-owned root, it must:

- require an absolute root path
- validate every product-id-derived path segment
- create parent directories explicitly
- create new leaf directories or files without overwriting existing ones
- follow source symlinks only for source reads from a CLI/user-provided
  `sourcePath`
- avoid accepting arbitrary relative destination paths from callers
- clean up best-effort partial output when later steps fail

The current local artifact capture helper follows this pattern:

- `stateHomePath` is the Situ-owned root
- `projectId` and `artifactId` become validated storage segments
- the copied filename uses `basename(sourcePath)`
- the source path is allowed to be a symlink because it is a source read, not a
  destination write
- the destination directory is created for a new artifact id and existing
  artifact storage is a conflict

## State Home Trust Boundary

The Situ state home is a trusted local product root, not an untrusted upload
directory.

Situ should defend against malformed command inputs shaping arbitrary paths. It
does not need to defend against a malicious local process that can concurrently
rewrite the Situ state home while Situ is running. If a future feature accepts
untrusted archive extraction, remote uploads, or arbitrary destination paths,
that feature needs a stricter physical containment ADR.

## Implementation Guidance

Do not change `resolveInsideRoot` to call `realpath`. That would make a
string-only adapter helper depend on path existence and would make it less
useful for command descriptors.

Add docs or comments where needed so callers can see that `resolveInsideRoot`
is lexical containment only.

Tests for write helpers should exercise the helper's own write-safety contract
instead of relying on `resolveInsideRoot` tests.

For this ADR, tests must cover:

- `resolveInsideRoot` returning paths for nonexistent filesystem entries
- `resolveInsideRoot` not physically resolving symlinks
- artifact capture rejecting traversal-like product-id path segments
- artifact capture cleaning up the artifact directory when copying fails after
  the directory has been created

## Boundaries

Do not add a new filesystem abstraction layer in this ADR.

Do not change artifact storage paths.

Do not reject source symlinks for artifact capture.

Do not add command execution, sandboxing, archive extraction, upload handling,
or remote file serving.

## Required Checks

Implementation should run:

```text
bun test projects/app/packages/worktrees/tests/worktrees.test.ts
bun test projects/app/src/artifacts/files.test.ts
mise run check
git diff --check
```

## Consequences

Path references stay simple and testable, while write helpers remain
responsible for their own physical filesystem safety. Future agents can reason
about when a path operation is string containment and when it is an actual
write boundary.
