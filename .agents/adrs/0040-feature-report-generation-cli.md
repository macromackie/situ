---
status: active
category: feature
created: 2026-05-13
---

# 0040. Feature: Report Generation CLI

## Context

ADR 0039 defines deterministic project report generation helpers. Those helpers
collect visible project records and render a read-only report view, but they do
not create a durable report record.

Situ is CLI-first. Local agents should be able to ask the app for the default
generated Markdown through the same ordinary `situ reports` command group they
use to create, list, and inspect report records.

This should remain a visible primitive:

```text
situ reports generate --project-id project_1
  -> reads visible records
  -> prints generated Markdown
  -> caller decides whether to create a report record
```

## Decision

Add a `generate` subcommand to the existing `situ reports` command group.
Markdown is the default generated format. ADR 0096 extends the same command
with the optional HTML visual report format.

Expected files:

```text
.agents/adrs/0040-feature-report-generation-cli.md
projects/app/src/cli/commands/reports.ts
projects/app/src/cli/situ.test.ts
```

The default Markdown path uses `generateProjectReportMarkdown` from
`projects/app/src/reports/index.ts`.

It does not call primitive repositories directly. It opens the app database,
creates an app action context, calls the report generation helper, formats the
result, and closes the database in a `finally` block.

This is the explicit exception to ADR 0037's report record CLI action pattern:
`reports generate` calls report generation helpers because it renders a
read-only view. The `create`, `list`, `recent`, and `get` report record
commands continue to call report app actions.

The root help text does not need to change in this ADR. `reports generate` is
command-local behavior under the existing `reports` command group.

## CLI Command

The CLI supports:

```text
situ reports generate [flags]
```

Global options still appear before the command group:

```text
situ --json --db /tmp/situ.db reports generate --project-id project_123
```

`reports generate` flags:

```text
--project-id <project-id>
--generated-at <iso-timestamp>
--format <markdown|html>
```

Required flags:

- `--project-id`

Optional flags:

- `--generated-at`
- `--format`

Action call:

```ts
generateProjectReportMarkdown({
  context,
  projectId,
  generatedAt,
});
```

`--generated-at` maps to `generatedAt`. `--format` defaults to `markdown`.
ADR 0096 owns the HTML format contract.

The CLI does not validate the project id prefix or parse `generatedAt` as a
date. The generation helper receives the provided string as the visible
timestamp label.

## Parser Contract

Command-specific syntax validation must complete before opening the database.
This includes:

- unknown report subcommands
- missing required flags
- unknown flags
- missing flag values
- extra positional args

Command-local help follows ADR 0092. For example,
`situ reports generate --help` prints usage without opening the database.

Duplicate scalar flags are allowed; the last value wins.

Command-local flags and positionals may be interleaved. Tokens beginning with
`--` are treated as command-local flags regardless of position. A supported
value flag consumes the next token as its value when that token exists and does
not start with `--`.

A supported value flag followed by any token beginning with `--` reports
`Missing value for <flag>.` before evaluating the following token. For example,
`situ reports generate --project-id --bad` reports
`Missing value for --project-id.`.

A supported value flag may consume a single-dash token as its value. For
example, `situ reports generate --project-id -x` passes `-x` as the project id.

The parser does not support boolean flags, short flags, equals syntax, or a
`--` sentinel for the generate command.

Validation order:

1. scan command-local flags left-to-right
2. fail on missing flag values or unknown flags during the scan
3. reject extra positional arguments
4. check required flags

Examples:

- `situ reports generate project_1` reports
  `Command reports generate received extra positional arguments: project_1`
- `situ reports generate project_1 --project-id project_2` reports
  `Command reports generate received extra positional arguments: project_1`
- `situ reports generate` reports `Missing required flag --project-id.`

Parser errors use `ValidationError` through the CLI parser error helper, with
the existing command-local message style:

- missing required flag: `Missing required flag --project-id.`
- unknown flag: `Unknown flag for reports generate: <flag>.`
- missing flag value: `Missing value for <flag>.`
- extra positional args:
  `Command reports generate received extra positional arguments: <args>`

## Output Shape

JSON output uses:

```ts
{
  projectId,
  generatedAt,
  format: "markdown",
  bodyMarkdown,
}
```

`generatedAt` is omitted by `JSON.stringify` when `--generated-at` is absent.
Each JSON output is one JSON object plus a trailing newline.

Text output is the raw generated Markdown returned by
`generateProjectReportMarkdown`. It is not wrapped in a summary line and is not
tab-separated.

The generated Markdown already ends with one trailing newline. The CLI must not
add a second trailing newline.

`reports generate` text output should bypass `formatDataResult`, because that
shared helper appends a trailing newline to non-empty text outputs.

## Database Lifecycle

`reports generate` opens the app database:

```ts
const database = openAppDatabase({
  databasePath: invocation.databasePath,
  environment: invocation.environment,
});
```

It creates an action context with `createAppActionContext({ database })`, calls
`generateProjectReportMarkdown`, and closes the database in a `finally` block.

After command-local parsing succeeds and the database is opened, the database
must close in `finally` for generation success, missing project errors,
inconsistent experiment/task state errors, and unexpected repository errors.

## Tests

Add CLI tests covering:

- text `reports generate` output for a project with no tasks
- JSON `reports generate` output wraps `{ projectId, generatedAt, bodyMarkdown }`
- missing `--generated-at` omits `generatedAt` from JSON output
- duplicate scalar flags using the last value
- raw text output has exactly one trailing newline
- generation does not create a report record
- missing project errors after opening the database, while still closing the
  database
- command-local syntax validation before opening the database
- missing required flag validation before opening the database
- missing flag value validation before opening the database
- unknown flag validation before opening the database
- extra positional validation before opening the database
- positional-before-required validation before opening the database
- representative unsupported syntax errors for short flags, equals syntax, and
  `--` sentinel
- value-token edge cases for `--project-id --bad` and `--project-id -x`

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not create report records, comments, events, artifacts, measurements,
reviews, notifications, files, PDFs, project state changes, task state changes,
experiment state changes, scheduler behavior, agent runtime behavior, workers,
leases, or command execution in this ADR.

HTML generation is not part of this ADR's original Markdown default. The active
target state for HTML visual reports is defined by ADR 0096.

Do not add a separate `situ generate-report` command. Report generation belongs
under the existing `situ reports` command group because it produces report
Markdown.

## Consequences

Local agents can now do the whole visible report loop from the CLI:

```text
situ reports generate --project-id project_1
  -> inspect or edit Markdown
  -> situ reports create --project-id project_1 --body ...
```

Generation remains separate from durable creation, preserving the distinction
between rendering a view and recording a written output.
