---
status: active
category: contract
created: 2026-05-13
---

# 0038. Contract: Worktree Adapter Package

## Context

Experiments need a way to refer to git worktrees and local commands without
turning the app into a hidden workflow runner.

Situ should keep this boundary primitive-focused:

```text
experiment records
  -> point at branches, commits, and worktree paths
  -> app actions decide when records change
  -> a thin adapter describes git worktree commands and safe path/env inputs
  -> an external local agent CLI or future explicit runner executes commands
```

The app needs reusable helpers for worktree command descriptions, path
containment, and command environment filtering. Those helpers are infrastructure
utilities, not product records.

ADR 0005 names `worktrees` as the adapter package for these concerns. This ADR
defines that adapter boundary narrowly: it describes command inputs and safe
caller inputs, but it does not execute commands.

## Decision

`projects/app/packages/worktrees/` is an adapter package named
`@situ/worktrees`.

Expected files:

```text
projects/app/packages/worktrees/README.md
projects/app/packages/worktrees/mise.toml
projects/app/packages/worktrees/package.json
projects/app/packages/worktrees/src/index.ts
projects/app/packages/worktrees/src/types.ts
projects/app/packages/worktrees/tests/worktrees.test.ts
projects/app/packages/worktrees/tsconfig.json
```

The package exports a small helper surface:

```ts
export const worktreesPackageName = "worktrees" as const;
export type WorktreesPackageName = typeof worktreesPackageName;

export type ResolveInsideRootInput = {
  readonly rootPath: string;
  readonly relativePath: string;
};

export type FilterCommandEnvironmentInput = {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly allowedSecretNames?: readonly string[];
};

export type CreateGitWorktreeCommandInput = {
  readonly args: readonly string[];
  readonly cwd?: string;
};

export type GitWorktreeCommand = {
  readonly command: "git";
  readonly args: readonly string[];
  readonly cwd?: string;
};

export function gitWorktreeCommand(input: CreateGitWorktreeCommandInput): GitWorktreeCommand;

export function resolveInsideRoot(input: ResolveInsideRootInput): string;

export function filterCommandEnvironment(
  input: FilterCommandEnvironmentInput,
): Record<string, string>;
```

## Command Descriptions

`gitWorktreeCommand` returns a command descriptor. It does not run the command.

For example:

```ts
gitWorktreeCommand({
  args: ["add", "../situ-exp-1", "main"],
  cwd: "/repo",
});
```

returns:

```ts
{
  command: "git",
  args: ["worktree", "add", "../situ-exp-1", "main"],
  cwd: "/repo",
}
```

The helper always prefixes `args` with `"worktree"` and preserves `cwd`.
When `cwd` is omitted, the returned descriptor preserves that absence as
`cwd: undefined`.

It does not validate git subcommands, quote shell arguments, read the current
repository, create branches, create worktrees, remove worktrees, or inspect git
state. Callers pass the returned descriptor to an explicit runner when a later
feature ADR defines one.

## Path Containment

`resolveInsideRoot` resolves `rootPath` and `relativePath` and returns an
absolute path inside the resolved root.

`rootPath` may be absolute or relative. The helper uses Node path resolution,
so a relative `rootPath` is resolved against the current working directory.
Empty `rootPath` is allowed and resolves the root to the current working
directory, but security-sensitive callers should pass an explicit root.

The helper rejects absolute `relativePath` values with `ValidationError` and
message:

```text
Path must be relative to the allowed root.
```

The helper rejects relative paths that escape the root with `ValidationError`
and message:

```text
Path escapes the allowed root.
```

This is a lexical containment helper. It does not create directories, write
files, read files, resolve symlinks, or make untrusted write paths safe by
itself. Filesystem writers must still follow ADR 0012 before writing.

Examples:

| `rootPath`  | `relativePath`   | Result                          |
| ----------- | ---------------- | ------------------------------- |
| `/tmp/situ` | `.`              | allowed, resolves to root       |
| `/tmp/situ` | ``               | allowed, resolves to root       |
| `/tmp/situ` | `subdir/../file` | allowed, normalizes inside root |
| `/tmp/situ` | `..foo/file`     | allowed, stays inside root      |
| `/tmp/situ` | `../outside`     | rejected as escaping root       |
| `/tmp/situ` | `/tmp/situ/file` | rejected as absolute input      |
| `workspace` | `artifact.txt`   | allowed after resolving root    |
| ``          | `artifact.txt`   | allowed under current directory |

The containment predicate must reject only:

- `relative(rootPath, resolvedPath) === ".."`
- `relative(rootPath, resolvedPath)` beginning with `"../"` on POSIX systems
  or the platform separator equivalent
- absolute relative results

A resolved path whose root-relative value starts with similar characters, such
as `..foo/file`, is still inside the root and must be allowed.

## Environment Filtering

`filterCommandEnvironment` returns a plain object containing non-undefined
environment variables after dropping likely secret names.

Likely secret names are case-insensitive names ending in one of these tokens:

```text
KEY
TOKEN
SECRET
PASSWORD
```

The token must be the full name or be preceded by `_`. For example, these names
are filtered by default:

```text
API_KEY
SITU_TOKEN
PASSWORD
database_secret
```

Names such as `MONKEY` are not filtered only because they end with the letters
`KEY`; the token boundary matters.

`allowedSecretNames` is an exact-name allowlist. Allowed names are preserved
even when they match the likely-secret pattern.
Allowlist matching is case-sensitive. For example, allowing `API_KEY` does not
allow `api_key`.

The helper does not inspect variable values, mutate `process.env`, redact
command output, or decide whether output is safe to persist.

## Repository Integration

The package must be integrated as a normal app workspace package:

- `package.json` package name is `@situ/worktrees`.
- the root package workspace glob includes `projects/app/packages/*`.
- the root TypeScript path map includes `@situ/worktrees` pointing to
  `projects/app/packages/worktrees/src/index.ts`.
- root `mise` task wrappers include `app:worktrees:check`,
  `app:worktrees:typecheck`, and `app:worktrees:test`.

## Package Boundary

The worktrees package must not own product truth.

It must not define:

- database schema
- repositories
- mutations
- app actions
- CLI commands
- HTTP handlers
- scheduler behavior
- agent runtime behavior
- experiment lifecycle rules
- measurements, artifacts, reviews, reports, comments, events, or
  notifications

Experiment records belong to `@situ/experiments`. Cross-primitive behavior
belongs in `projects/app/src/actions/`. Command execution belongs to a future
explicit runner contract, local agent CLI behavior, or an external tool.

The package may depend on `@situ/errors` for structured validation errors and
Node standard-library path helpers. It should not depend on primitive product
packages.

## Tests

Package-local tests must cover:

- the package marker
- git worktree command descriptors preserving args and cwd
- git worktree command descriptors preserving omitted cwd as `undefined`
- path resolution inside a root
- root-relative values such as `.` staying inside the root
- root-relative empty values staying inside the root
- paths with similar dot prefixes, such as `..foo/file`, staying inside the
  root
- normalized paths, such as `subdir/../file`, staying inside the root
- absolute `relativePath` rejection
- traversal outside the root rejection
- undefined environment values being dropped
- likely secret names being dropped
- lowercase likely secret names being dropped
- exact allowed secret names being preserved
- allowed secret names being matched case-sensitively
- non-secret names with similar suffixes, such as `MONKEY`, being preserved

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Consequences

Later experiment and eval features can describe worktree operations without
embedding shell execution, secret policy, or product-state changes into
low-level helpers.

This keeps the app primitive-oriented: records describe what happened or should
be inspected, while local agents and explicit runners decide when to execute
commands.
