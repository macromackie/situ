---
status: active
category: contract
created: 2026-05-13
---

# 0026. Contract: CLI Base Surface

## Context

Situ is a local app with a CLI-first integration surface. Humans and local
agent tools should be able to call `situ` repeatedly, get stable results, and
understand failures without learning hidden runtime state.

Before adding record-specific commands, the CLI needs a small base contract for
argument handling, output modes, database path selection, help, version, and
error formatting.

## Decision

`projects/app/src/cli/` owns the CLI base surface.

The base surface keeps command execution testable without process globals. The
process-level entry point should adapt `process.argv`, `process.env`,
`process.stdout`, and `process.stderr` into a pure command runner.

The CLI base does not create product records, run agents, poll for work, open
HTTP servers, start schedulers, or implement workflow behavior.

Expected imports:

- `resolveDatabasePath` from `../db/index.js`
- `serializeError`, `ValidationError`, and `type SerializedError` from
  `@situ/errors`

## Public API

The CLI package exports:

```ts
export type SituCliOutputMode = "text" | "json";

export type RunSituCliInput = {
  readonly args: readonly string[];
  readonly version?: string;
  readonly environment?: NodeJS.ProcessEnv;
};

export type MainSituCliInput = {
  readonly args?: readonly string[];
  readonly version?: string;
  readonly environment?: NodeJS.ProcessEnv;
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
  readonly version: string;
};

export type SituCliErrorOutput = {
  readonly error: SerializedError;
};

export const defaultSituVersion = "0.0.0-dev";

export function runSituCli(input: RunSituCliInput): SituCliResult;

export function mainSituCli(input?: MainSituCliInput): Promise<number>;
```

`src/cli/index.ts` must export the public API from `./situ.js`.

`runSituCli` must not write to process streams or call `process.exit`.
`mainSituCli` writes `stdout` and `stderr` from the result and returns the exit
code.

## Global Options

The base parser supports these global options before the command:

```text
--json
--db <path>
--database <path>
--help
--version
```

Global option behavior:

- `--json` sets `outputMode` to `"json"`.
- `--db <path>` and `--database <path>` set `databasePath`.
- `--db` and `--database` without a following value are validation errors.
- `--help` is equivalent to the `help` command.
- `--version` is equivalent to the `version` command.
- Unknown global flags are validation errors.

Options after the command are command arguments. The base parser does not try
to interpret command-specific flags.

The base parser does not need to support combined short flags.

## Parsing Rules And Edge Cases

`runSituCli({ args })` receives sliced command args. The binary name is not
included:

```ts
runSituCli({ args: ["doctor"] });
```

`mainSituCli({ args })` also receives sliced command args when provided. When
`mainSituCli` receives no `args`, it uses `process.argv.slice(2)`.

Both `runSituCli` and `mainSituCli` use `defaultSituVersion` when `version` is
absent.

`runSituCli` should not read `process.env`. If `environment` is absent, it
passes `undefined` through to helpers that accept an optional environment.
`mainSituCli` defaults `environment` to `process.env` when no environment is
provided.

The parser scans tokens left to right until it finds the command.

Duplicate `--json` is allowed and idempotent.

Duplicate `--db` or `--database` options are allowed; the last parsed database
path wins.

`--help` and `--version` are command aliases. The first command or command
alias wins. Tokens after that are command args, not global options.

Examples:

| Args                                 | Parsed Command | Rest              |
| ------------------------------------ | -------------- | ----------------- |
| `[]`                                 | `help`         | `[]`              |
| `["--help"]`                         | `help`         | `[]`              |
| `["--version"]`                      | `version`      | `[]`              |
| `["--json", "--version"]`            | `version`      | `[]`              |
| `["--help", "--version"]`            | `help`         | `["--version"]`   |
| `["doctor", "--db", "/tmp/situ.db"]` | `doctor`       | `["--db", "..."]` |
| `["--db", "/a.db", "--db", "/b.db"]` | `help`         | `[]`              |

Base commands reject extra args. For example, `situ doctor extra`,
`situ doctor --db x`, `situ help --json`, and `situ version --json` are
validation errors because those tokens are command args after the command.

`--db` and `--database` require a following value that does not start with
`--`. `situ --db --json doctor` is a validation error for missing database
path.

The CLI does not define a `--` option sentinel in this ADR. A leading `--` is
an unknown global flag. A `--` after a command is an extra command arg.

Output mode for parser errors is deterministic: the parser uses whichever
output mode has been parsed before the failing token. For example,
`situ --bad --json` returns a text error, while `situ --json --bad` returns a
JSON error.

## Base Commands

The base surface supports these commands:

```text
situ help
situ help <command>
situ help <command> <subcommand>
situ --help
situ version
situ --version
situ doctor
```

No command is also treated as `help`.

`help` prints plain text usage, even when `--json` is present. Root help text
is exactly:

```text
Usage: situ [global-options] <command>

Global options:
  --json             Print machine-readable JSON output for data commands.
  --db <path>        Use a specific SQLite database path.
  --database <path>  Use a specific SQLite database path.
  --help             Show this help text.
  --version          Print the Situ CLI version.

Commands:
  help     Show this help text.
  version  Print the Situ CLI version.
  doctor   Check local CLI configuration without mutating state.
```

The emitted help output appends one trailing newline to this text.

Command and subcommand help follows ADR 0092. Help must return before opening
SQLite, detecting a git repository, starting a server, or mutating records.

`version` prints the configured version.

`doctor` validates that the configured database path can be resolved. It should
not open the database or apply migrations in this ADR. That keeps `doctor`
non-mutating while still checking the local path contract.

Unknown commands are validation errors.

`help`, `version`, and successful `doctor` return exit code `0`.

## Text Output

Text output is optimized for humans reading a terminal.

Text `version` output:

```text
<version>
```

with a trailing newline.

Text `doctor` output:

```text
situ doctor ok
```

with a trailing newline.

Text `help` output is the usage text with a trailing newline.

Text errors return exit code `1`, write no stdout, and write stderr:

```text
Error [<kind>]: <message>
```

with a trailing newline.

Common text errors may include a short `hint:` line as defined by ADR 0092.

For unknown commands in text mode, append a blank line and the help text after
the error line. The exact shape is:

```text
Error [validation]: Unknown command: <command>

<help text>
```

where `<help text>` already includes its trailing newline.

## JSON Output

JSON output is optimized for local agent tools. It must be one JSON object plus
a trailing newline.

JSON `version` output:

```json
{ "version": "0.0.0-dev" }
```

JSON `doctor` output:

```json
{ "ok": true, "version": "0.0.0-dev", "databasePath": "/absolute/path/to/situ.db" }
```

The actual `databasePath` value comes from `resolveDatabasePath` with the
parsed `databasePath` option and caller-provided environment.

When no database path option is provided, `doctor` calls `resolveDatabasePath`
with `databasePath: undefined` and the caller-provided environment. Text
`doctor` intentionally suppresses the resolved path; JSON `doctor` includes it.

JSON errors return exit code `1`, write no stdout, and write stderr:

```json
{ "error": { "kind": "validation", "message": "...", "details": {} } }
```

with a trailing newline. Error objects are produced through `serializeError`.
The JSON output includes exactly the serialized error object nested under
`error`.

Help remains plain text in JSON mode because it is a human reference command,
not a record payload.

## Error Handling

`runSituCli` should catch command/parser errors and format them through the
selected output mode.

Text error kinds come from `serializeError(error).kind`, including unexpected
failures.

Errors thrown before `--json` is parsed use text output. Errors thrown after
`--json` is parsed use JSON output.

Validation failures use `ValidationError`. Unexpected failures are serialized
with `serializeError`.

`runSituCli` should not throw for ordinary CLI errors. It returns a
`SituCliResult`.

## Boundaries

Do not add project, task, comment, event, notification, experiment,
measurement, artifact, review, or report commands in this ADR's implementation.

Do not open SQLite connections in this ADR. Record commands added by later ADRs
will own database opening for those commands.

Do not add a CLI framework dependency unless a later ADR replaces this
contract.

Do not add agent runtime concepts, provider sessions, polling loops, scheduler
state, or workflow orchestration to the CLI base.

## Consequences

The CLI has a stable, testable base for future record commands. Later ADRs can
add commands that open the local app database, create an action context, and
read or write product records while preserving the same output and error
shape.
