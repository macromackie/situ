---
status: active
category: structure
created: 2026-05-13
---

# 0029. Structure: CLI Command Modules

## Context

The CLI base and the first project/task commands are now useful, but the CLI
implementation should not keep growing in one large file. Future command groups
for comments, experiments, reviews, notifications, and reports
need an obvious place to live without making `situ.ts` harder to reason about.

The goal is structure only. This ADR does not add new commands or change CLI
behavior.

## Decision

Split `projects/app/src/cli/` into focused modules.

Target files:

```text
projects/app/src/cli/base.ts
projects/app/src/cli/commands/projects.ts
projects/app/src/cli/commands/tasks.ts
projects/app/src/cli/flags.ts
projects/app/src/cli/format.ts
projects/app/src/cli/help.ts
projects/app/src/cli/index.ts
projects/app/src/cli/situ.ts
projects/app/src/cli/situ.test.ts
projects/app/src/cli/types.ts
```

The existing public API remains exported from `projects/app/src/cli/index.ts`
through `./situ.js`.

## File Responsibilities

`types.ts` owns shared CLI types and constants:

- `SituCliOutputMode`
- `RunSituCliInput`
- `MainSituCliInput`
- `SituCliResult`
- `SituCliInvocation`
- `SituCliErrorOutput`
- `defaultSituVersion`

`base.ts` owns the base command runner:

- root help text
- global option parsing
- `runSituCli`
- `mainSituCli`
- base commands: `help`, `version`, `doctor`
- top-level dispatch to command groups
- process stream writes

`flags.ts` owns command-local parsing helpers:

- `ParsedFlags`
- `parseCommandFlags`
- `assertNoPositionals`
- `requireSinglePositional`
- `requireFlag`
- `optionalFlag`
- actor-kind validation
- actor parsing
- assignee parsing
- project status validation
- task status validation
- parser error throwing helpers

`format.ts` owns shared result formatting:

- `formatCliError`
- `formatDataResult`
- `formatProjectLines`
- `formatTaskLines`

`help.ts` owns static CLI help text:

- root help text
- command group help text
- subcommand help text
- help lookup for `situ help`, command groups, and subcommands

`commands/projects.ts` owns `projects` command parsing and execution.

`commands/tasks.ts` owns `tasks` command parsing and execution.

`situ.ts` becomes a small public entrypoint. It should re-export the public CLI
API and preserve the executable entrypoint:

```ts
export { mainSituCli, runSituCli } from "./base.js";
export type {
  MainSituCliInput,
  RunSituCliInput,
  SituCliErrorOutput,
  SituCliInvocation,
  SituCliOutputMode,
  SituCliResult,
} from "./types.js";
export { defaultSituVersion } from "./types.js";

import { mainSituCli } from "./base.js";

if (import.meta.main) {
  process.exitCode = await mainSituCli();
}
```

`index.ts` continues to export from `./situ.js`.

## Implementation Contract

`types.ts` imports `type SerializedError` from `@situ/errors` for
`SituCliErrorOutput`. It may also import `type SituHttpServer` and
`type StartSituHttpServerInput` from the local HTTP server module, only to type
the optional `serve` test hooks on `MainSituCliInput`. It may reference
`NodeJS.ProcessEnv` in public input types. It must not import app actions,
database helpers, primitive packages, command modules, `base.ts`, `situ.ts`, or
`index.ts`.

`base.ts` exports only:

```ts
export function runSituCli(input: RunSituCliInput): SituCliResult;

export function mainSituCli(input?: MainSituCliInput): Promise<number>;
```

It may keep local non-exported helpers for global parsing and base command
formatting.

Command modules export exactly these runner functions:

```ts
export function runProjectsCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult;

export function runTasksCommand(input: { readonly invocation: SituCliInvocation }): SituCliResult;
```

The command modules own command-local parsing, command-local validation,
database open/action-context/close lifecycle, app action calls, and command
result formatting for their command group.

All command-local syntax validation must finish before a command module opens
the database. This includes positional, flag, status, actor, and assignment
validation.

If a shared `withActionContext` helper exists, it belongs in the command module
or a command-only helper file introduced by this ADR only when it keeps the
dependency rules simple. It must not live in `flags.ts`, `format.ts`, or
`types.ts`.

## Public API

The public API is:

```ts
export type SituCliOutputMode = "text" | "json";

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
  readonly writeStdout?: (text: string) => void;
  readonly writeStderr?: (text: string) => void;
  readonly waitForShutdown?: (server: SituHttpServer) => Promise<void>;
  readonly startHttpServer?: (input?: StartSituHttpServerInput) => SituHttpServer;
};

export type SituCliResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type SituCliInvocation = {
  readonly command?: string;
  readonly rest: readonly string[];
  readonly outputMode: SituCliOutputMode;
  readonly databasePath?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly cwd: string;
  readonly version: string;
};

export type SituCliErrorOutput = {
  readonly error: SerializedError;
};

export const defaultSituVersion = "0.0.0-dev" as const;

export function runSituCli(input: RunSituCliInput): SituCliResult;

export function mainSituCli(input?: MainSituCliInput): Promise<number>;
```

The package must preserve imports like:

```ts
import { runSituCli } from "./situ.js";
import { runSituCli } from "./index.js";
```

## Module Boundaries

Command modules may import app actions and database helpers as needed for their
command group.

`base.ts` may import command group runners from `commands/projects.ts` and
`commands/tasks.ts`. It may import help text and lookup helpers from
`help.ts`.

`commands/projects.ts` and `commands/tasks.ts` must not import from
`situ.ts` or `index.ts`. They should import shared types and helpers from
`types.ts`, `flags.ts`, and `format.ts`.

`flags.ts` and `format.ts` must not import app actions, primitive packages, or
database helpers.

`help.ts` must not import app actions, primitive packages, database helpers, or
command modules.

`format.ts` may import `serializeError` from `@situ/errors`.

`flags.ts` may import `ValidationError` from `@situ/errors` and shared types
from `@situ/common`.

`types.ts` may import `type SerializedError` from `@situ/errors` and the local
HTTP server types needed by the optional `serve` hooks only.

Avoid circular imports.

## Behavior Preservation

This ADR must preserve all behavior covered by the current CLI tests:

- root help text and base commands
- global option parsing
- project commands
- task commands
- JSON and text output shape
- error formatting
- command-local validation before database open
- database open/action-context/close behavior for record commands

Do not add new commands or new flags.

Do not change command output strings.

Do not change error messages unless required to keep existing behavior after
the split.

## Testing

Keep the existing CLI tests in `situ.test.ts`.

Add focused export tests that verify the public API still works from both
`./index.js` and `./situ.js`.

Do not move `situ.test.ts`. Edit it only as needed for import paths and export
coverage.

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not add comments, events, notifications, experiments, measurements,
artifacts, reviews, reports, HTTP handlers, scheduler behavior, agent runtime
behavior, or workflow enforcement in this ADR's implementation.

Do not add a CLI framework dependency.

Do not rewrite the CLI parser into a generic framework. Keep the split obvious
and boring.

## Consequences

Future command groups can be added as new files under `src/cli/commands/`
without making the entrypoint or shared parser harder to navigate.
