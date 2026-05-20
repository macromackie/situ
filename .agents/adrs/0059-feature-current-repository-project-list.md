---
status: active
category: feature
created: 2026-05-14
---

# 0059. Feature: Current Repository Project List

## Context

ADR 0058 adds `situ projects init`, which creates an ordinary project for the
git repository containing the caller's current working directory.

After a project exists, local agents and humans need a direct way to rediscover
the relevant project ids from the same repository without remembering ids from
terminal scrollback or private model context.

Situ should make that lookup visible and primitive-focused:

```text
cd target-repository
situ projects current
```

The command should detect the current repository root, list matching project
records, and stop there. It must not create a project, pick a winner, claim
work, create tasks, or infer workflow state.

## Decision

Add:

```text
situ projects current [flags]
```

`projects current` is a read-only command. It detects the current repository
root with `findCurrentRepositoryRoot` from ADR 0058 and lists projects whose
stored `repositoryPath` equals that root.

Expected files:

```text
projects/app/packages/projects/src/repository.ts
projects/app/packages/projects/tests/projects.test.ts
projects/app/src/actions/projects.ts
projects/app/src/actions/projects.test.ts
projects/app/src/cli/commands/projects.ts
projects/app/src/cli/situ.test.ts
```

## Repository Root Detection

`projects current` uses the `findCurrentRepositoryRoot` helper from ADR 0058.

For this command, the required behavior is:

- resolve `invocation.cwd`
- walk upward until finding the nearest `.git` entry
- count `.git` directories and worktree-style `.git` files as repository
  markers
- do not count `.git` symlinks, sockets, FIFOs, or other entry types
- return the directory containing the detected `.git` entry
- throw `ValidationError` when no repository is found, when `cwd` does not
  exist, when `cwd` is not a directory, or when `cwd` cannot be inspected

The validation message for those failures is:

```text
Current directory is not inside a git repository.
```

with details:

```ts
{
  cwd: resolvedCwd;
}
```

## Repository Filter

Extend `@situ/projects` list input:

```ts
export type ListProjectsInput = {
  readonly status?: ProjectStatus;
  readonly repositoryPath?: string;
};
```

`repositoryPath` is an exact-match filter against the stored project
`repositoryPath`.

When both `status` and `repositoryPath` are provided, both filters apply.

Ordering remains unchanged:

```sql
ORDER BY created_at ASC, id ASC
```

The repository filter does not normalize paths, inspect the filesystem, detect
git roots, archive projects, or create projects. Callers that need current
repository detection do that before calling the repository.

`listProjectsAction` forwards `repositoryPath` to the project repository.

## CLI Command

Flags:

```text
--status <active|archived>
```

Optional flags:

- `--status`

The command has no required flags.

Parser validation happens before repository detection and before opening the
database.

All CLI validation, including semantic `--status` validation, completes before
repository detection and before opening the database.

After parser validation:

1. detect the repository root from `invocation.cwd`
2. open the database
3. create an app action context
4. call `listProjectsAction` with the detected repository path and optional
   status
5. close the database in `finally`

Repository detection errors must happen before opening the database.

Once the database has opened, it must close in `finally` for success and for
every error raised after opening.

## Output Shape

JSON output:

```json
{"projects":[<project>,...]}
```

JSON output uses the exact same project object shape as
`situ projects list --json`: each project includes `id`, `name`,
`repositoryPath`, `goalMarkdown`, `status`, `createdBy`, and `metadata`.

JSON output always emits `{"projects":[]}` for no matches and includes a
trailing newline.

Text output uses the same line format as `projects list`:

```text
<project-id>\t<status>\t<name>
```

When no projects match, text output is empty and the exit code is still `0`.

Each non-empty output has a trailing newline.

## Parser Rules

`projects current` uses the same command-local scanning rules as existing
project commands:

- supported value flags consume the next token when it exists and does not
  start with `--`
- value flags followed by tokens beginning with `--` report
  `Missing value for <flag>.`
- single-dash tokens may be consumed as values
- duplicate scalar flags are allowed; the last value wins
- boolean flags, short flags, equals syntax, and `--` sentinel are unsupported

Parser errors use the existing CLI parser helper and message style:

- unknown flag: `Unknown flag for projects current: <flag>.`
- missing flag value: `Missing value for <flag>.`
- extra positional args:
  `Command projects current received extra positional arguments: <args>`
- invalid status: `Invalid project status: <value>.`

Validation order is:

1. scan argv left to right for unknown flags, missing flag values, and
   positional arguments
2. reject extra positional arguments
3. parse semantic values such as status

Command-local help follows ADR 0092. For example,
`situ projects current --help` prints usage without detecting the repository or opening the database.

## Tests

Add package tests covering:

- listing projects by exact `repositoryPath`
- listing projects by combined `repositoryPath` and `status`
- preserving existing list ordering

Add action tests covering:

- forwarding the `repositoryPath` filter through `listProjectsAction`
- returning an empty list when no project uses that repository path

Add CLI tests covering:

- `projects current` text output
- `projects current` JSON output
- detection from nested cwd
- status filtering
- empty text output with exit code `0`
- duplicate scalar flags using the last value
- parser validation before repository detection and before opening the database
  for unknown flags, missing flag values, extra positionals, and invalid status
- repository detection errors happen before opening the database
- database closure after post-open errors

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not create, update, archive, or select projects.

Do not create tasks, experiments, measurements, artifacts, comments,
notifications, reviews, reports, branches, commits, or worktrees.

Do not run `git`.

Do not add automatic project reuse, default project selection, global current
project state, command execution, local agent execution, scheduler behavior,
workers, leases, heartbeats, provider sessions, or subagent orchestration.

Do not change `projects init` or `projects create`.

## Consequences

Local agents can now recover the visible project context from the repository:

```text
cd repo
situ projects current --status active
  -> project ids for this repository
situ tasks list --project-id <project-id>
```

The app remains explicit: it shows the projects for the current repo, but the
actor decides which project to use next.
