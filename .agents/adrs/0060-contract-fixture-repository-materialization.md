---
status: active
category: contract
created: 2026-05-14
---

# 0060. Contract: Fixture Repository Materialization

## Context

ADR 0010 and ADR 0011 split deterministic e2e tests from real LLM evals. Both
can benefit from small repository fixtures, but deterministic CLI checks belong
in `projects/e2e-tests/`.

The fixture package describes repository files as plain TypeScript data, but
callers still need a standard way to materialize those files on disk.

ADR 0058 and ADR 0059 use the repository containing the caller's current
working directory as a product boundary. Fixture repositories should be able to
exercise that same path without requiring `git init` or a real remote.

## Decision

Add a small materialization helper to `@situ/fixtures`.

Expected files:

```text
projects/e2e-tests/packages/fixtures/package.json
projects/e2e-tests/packages/fixtures/src/index.ts
projects/e2e-tests/packages/fixtures/src/materialize.ts
projects/e2e-tests/packages/fixtures/src/types.ts
projects/e2e-tests/packages/fixtures/tests/fixtures.test.ts
```

The helper writes the fixture's repository files under a caller-provided root
and creates a `.git` directory marker so app code that detects the current
repository can treat the materialized fixture as a git repository.

It does not run `git`.

The `.git` marker is intentionally minimal. This helper supports app code whose
repository detection treats the existence of a `.git` directory as sufficient.
It is not intended for code paths that invoke `git`, use libgit2, use
isomorphic-git, parse git metadata, or read files such as `.git/HEAD`.

## API

`projects/e2e-tests/packages/fixtures/src/materialize.ts` exports:

```ts
export type MaterializeFixtureRepositoryInput = {
  readonly fixture: TestFixture;
  readonly rootPath: string;
};

export type MaterializedFixtureFile = {
  readonly relativePath: string;
  readonly path: string;
};

export type MaterializedFixtureRepository = {
  readonly fixtureName: string;
  readonly repositoryPath: string;
  readonly files: readonly MaterializedFixtureFile[];
};

export function materializeFixtureRepository(
  input: MaterializeFixtureRepositoryInput,
): MaterializedFixtureRepository;
```

`projects/e2e-tests/packages/fixtures/src/index.ts` exports the materialization
API.

## Storage Shape

The helper writes one repository per fixture under:

```text
<root-path>/<fixture-name>/repository
```

Define:

```ts
fixturePath = join(rootPath, fixture.name);
repositoryPath = join(fixturePath, "repository");
```

Example:

```text
rootPath: /tmp/situ-e2e-tests
fixture.name: tiny-autoresearch
fixturePath: /tmp/situ-e2e-tests/tiny-autoresearch
repositoryPath: /tmp/situ-e2e-tests/tiny-autoresearch/repository
```

Fixture file paths are slash-separated POSIX-style relative paths. For each
fixture repository file:

```ts
{
  path: "README.md",
  content: "# Tiny Autoresearch Fixture\n",
}
```

the helper writes:

```text
<repositoryPath>/README.md
```

File content is written as UTF-8 text.

The helper creates parent directories explicitly.

The helper creates:

```text
<repositoryPath>/.git/
```

as an empty directory marker. It does not create real git metadata.

## Validation

`rootPath` must be absolute. Otherwise throw `ValidationError` with:

```text
Expected an absolute fixture root path.
```

`fixture.name` is used as a path segment. It must be non-empty and contain only
letters, numbers, `_`, and `-`. Otherwise throw `ValidationError` with:

```text
Expected a safe fixture name.
```

Each fixture file path must be a relative path that stays inside the repository
root after POSIX normalization.

Reject file paths with `ValidationError` and:

```text
Fixture file path escapes the repository root.
```

when they:

- are absolute POSIX paths
- contain backslashes
- contain Windows drive prefixes such as `C:`
- contain empty path segments
- contain `.` path segments
- contain `..` path segments after POSIX normalization

Each fixture file path must refer to a file path, not the repository root or a
directory path. Reject an empty path, `"."`, and paths ending in `/` with
`ValidationError` and:

```text
Expected fixture file path to name a file.
```

The helper validates all fixture names and file paths before creating any
filesystem entries.

Reject duplicate normalized fixture file paths with `ValidationError` and:

```text
Duplicate fixture file path.
```

Reject file/directory path conflicts with `ValidationError` and:

```text
Conflicting fixture file paths.
```

For example, `docs` conflicts with `docs/index.md` because one path would need
to be both a file and a parent directory.

If `fixturePath` already exists, throw `ConflictError` with:

```text
Fixture repository already exists.
```

The helper may assume `fixture.repositoryFiles` are text files. It does not
support binary files, executable modes, symlinks, deletions, empty directory
entries, permissions, file timestamps, branches, commits, remotes, or package
installation.

## Atomicity And Cleanup

The helper creates `fixturePath` as a new directory before writing files. If
creating `.git` or writing any later file fails, the helper removes
`fixturePath` before rethrowing the original error.

Validation errors happen before `fixturePath` is created and should not create
filesystem entries.

The returned `files` array preserves the input `fixture.repositoryFiles` order
after each path is normalized.

## Tests

Add fixture package tests covering:

- materializing `tinyAutoresearchFixture`
- creating a `.git` directory marker
- writing fixture files with nested parent directories
- returning materialized file paths
- rejecting relative `rootPath`
- rejecting unsafe fixture names
- rejecting absolute file paths
- rejecting traversal file paths
- rejecting backslash, Windows-drive, empty-segment, and dot-segment paths
- rejecting empty, `"."`, and directory-like file paths
- rejecting duplicate normalized file paths
- rejecting file/directory path conflicts
- rejecting already-existing fixture storage
- cleaning up fixture storage when a later file write fails, when feasible
  without brittle platform behavior

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not run `git`.

Do not create projects, tasks, experiments, measurements, artifacts, reviews,
reports, comments, events, or notifications.

Do not call the app CLI or app actions in this ADR.

Do not add LLM eval execution, LLM judges, scoring, command execution, local
agent execution, scheduler behavior, workers, leases, provider sessions, or
subagent orchestration.

Do not add cleanup commands. Callers own their temporary root lifecycle.

## Consequences

Deterministic e2e tests can create real local directories that look enough like
git repositories for Situ's current-repository commands:

```text
materialize fixture
  -> cd materialized repository
  -> run app-facing CLI or action code in a deterministic test
```

The fixture package remains a small data-and-filesystem helper, not an eval
harness, judge harness, or workflow engine.
