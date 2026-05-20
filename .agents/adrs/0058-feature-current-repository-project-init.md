---
status: active
category: feature
created: 2026-05-14
---

# 0058. Feature: Current Repository Project Init

## Context

ADR 0002 says Situ is a local autoresearch app for the git repository
containing the caller's current working directory. ADR 0028 adds explicit
project creation through `situ projects create`, where callers pass a
repository path themselves.

Local agents and humans still need one low-friction bootstrap command:

```text
cd target-repository
situ projects init --goal "Improve the benchmark score." ...
```

The command should infer the repository root, create one ordinary project
record, and stop there. It should not create tasks, experiments, branches,
worktrees, reports, scheduler work, or agent runtime state.

## Decision

Add:

```text
situ projects init [flags]
```

`projects init` creates an ordinary project through the existing project app
action. It differs from `projects create` only by deriving `repositoryPath`
from the git repository containing the invocation working directory and by
allowing `--name` to default from that repository directory name.

Expected files:

```text
projects/app/src/cli/types.ts
projects/app/src/cli/base.ts
projects/app/src/cli/commands/projects.ts
projects/app/src/cli/situ.test.ts
projects/app/src/repositories/current.ts
projects/app/src/repositories/current.test.ts
projects/app/src/repositories/index.ts
projects/app/src/index.ts
```

`projects create` remains the explicit command for callers that already know
the repository path they want to record.

## Invocation Cwd

The finite and main CLI input types include an optional working directory:

```ts
export type RunSituCliInput = {
  readonly args: readonly string[];
  readonly version?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly cwd?: string;
};

export type MainSituCliInput = {
  readonly args?: readonly string[];
  readonly version?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  // existing fields...
};

export type SituCliInvocation = {
  // existing fields...
  readonly cwd: string;
};
```

When `cwd` is omitted, the CLI uses `process.cwd()`.

The invocation `cwd` must be absolute after resolution. If a caller passes a
relative `cwd`, resolve it against `process.cwd()` before storing it on the
invocation.

## Repository Detection

Add `projects/app/src/repositories/current.ts`.

It exports:

```ts
export type FindCurrentRepositoryRootInput = {
  readonly cwd: string;
};

export function findCurrentRepositoryRoot(input: FindCurrentRepositoryRootInput): string;
```

The function resolves `cwd`, then walks upward until it finds a `.git` entry.

A `.git` entry may be either:

- a directory, as in ordinary git repositories
- a file, as in git worktrees

Use `lstatSync` for `.git` detection. A `.git` symlink, socket, FIFO, or other
entry type does not count as a detected repository root.

The function returns the directory containing that `.git` entry.

If no `.git` entry is found before the filesystem root, throw
`ValidationError` with:

```text
Current directory is not inside a git repository.
```

and details:

```ts
{
  cwd: resolvedCwd;
}
```

Use the same `ValidationError` when resolved `cwd` does not exist, is not a
directory, or cannot be inspected while walking.

The helper does not shell out to `git`, inspect branches, inspect remotes,
create repositories, create worktrees, or validate that the `.git` entry points
at a usable git database. It is a local repository-root locator only.

`projects/app/src/repositories/index.ts` exports the helper API, and
`projects/app/src/index.ts` exports `./repositories/index.js`.

## CLI Command

Flags:

```text
--id <project-id>
--event-id <event-id>
--name <project-name>
--goal <markdown>
--actor-kind <human|local_agent|system>
--actor-id <id>
--actor-display-name <name>
--now <iso-timestamp>
```

Required flags:

- `--goal`
- `--actor-kind`
- `--actor-id`

Optional flags:

- `--id`
- `--event-id`
- `--name`
- `--actor-display-name`
- `--now`

When `--name` is omitted, use the basename of the detected repository root.

`--goal` is required because Situ should not create an autoresearch project
without a visible goal. If a caller wants a placeholder, it must write the
placeholder explicitly.

Parser validation happens before repository detection and before opening the
database.

After parser validation:

1. detect the repository root from `invocation.cwd`
2. derive the project name from `--name` or repository root basename
3. open the database
4. create an app action context
5. call `createProjectAction`
6. close the database in `finally`

Repository detection errors must happen before opening the database.

Once the database has opened, it must close in `finally` for action success,
action validation errors, conflict errors, and event creation errors.

## Output Shape

`projects init` uses the existing global output-mode mechanism. JSON output is
selected by the global `--json` option and represented by
`invocation.outputMode`, the same as `projects create`.

JSON output matches `projects create`:

```json
{"project":<project>,"event":<event>}
```

Text output is:

```text
Initialized project <project-id> (event <event-id>)
```

Each non-empty output has a trailing newline.

## Parser Rules

`projects init` uses the same command-local scanning rules as existing project
commands:

- supported value flags consume the next token when it exists and does not
  start with `--`
- value flags followed by tokens beginning with `--` report
  `Missing value for <flag>.`
- single-dash tokens may be consumed as values
- duplicate scalar flags are allowed; the last value wins
- boolean flags, short flags, equals syntax, and `--` sentinel are unsupported

Parser errors use the existing CLI parser helper and message style:

- missing required flag: `Missing required flag <flag>.`
- unknown flag: `Unknown flag for projects init: <flag>.`
- missing flag value: `Missing value for <flag>.`
- extra positional args:
  `Command projects init received extra positional arguments: <args>`
- invalid actor kind: `Invalid actor kind for <flag>: <value>.`

Required presence checks happen before semantic parsing. Required flags are
checked in the listed Required flags order.

Validation order is:

1. scan argv left to right for unknown flags, missing flag values, and
   positional arguments
2. reject extra positional arguments
3. check required flags in the listed order
4. parse command-parser semantic values such as actor kind

Command-local help follows ADR 0092. For example,
`situ projects init --help` prints usage without detecting the repository or
opening the database.

## Tests

Add repository helper tests covering:

- detecting a repository root with a `.git` directory
- detecting a repository root from a nested child directory
- detecting a worktree-style repository root with a `.git` file
- returning the nearest repository root when repositories are nested
- throwing the documented validation error outside a git repository
- throwing the documented validation error for invalid `cwd` inputs
- ignoring `.git` symlinks as repository markers
- accepting a relative `cwd` by resolving it before walking

Add CLI tests covering:

- `projects init` text output
- `projects init` JSON output
- stored `repositoryPath` is the detected repository root
- omitted `--name` defaults to the repository directory basename
- explicit `--name` overrides the default
- duplicate scalar flags use the last value
- parser validation before repository detection and before opening the database
  for missing required flags, unknown flags, missing flag values, extra
  positionals, and invalid actor kind
- repository detection errors happen before opening the database
- database closure after post-open errors
- `mainSituCli` passes its `cwd` through to finite commands

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not create tasks, experiments, measurements, artifacts, comments,
notifications, reviews, reports, branches, commits, or worktrees.

Do not run `git`.

Do not add command execution, local agent execution, scheduler behavior,
workers, leases, heartbeats, provider sessions, or subagent orchestration.

Do not add repository sync, GitHub integration, remote detection, branch
selection, dirty-worktree inspection, or automatic project reuse.

Do not change `projects create`.

## Consequences

The first Situ command in a repository can be direct and obvious:

```text
cd repo
situ projects init --goal "Find a better implementation." --actor-kind human --actor-id scott
```

The result is still just an ordinary project plus event. Follow-up work remains
visible through normal task, experiment, measurement, artifact, review, comment,
notification, and report records.
