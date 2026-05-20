---
status: active
category: contract
created: 2026-05-14
---

# 0070. Contract: CLI Validation Phases

## Context

Situ's CLI is an integration surface for local agents. Those agents should be
able to recover from syntax errors by reading one clear error at a time.

Earlier CLI ADRs require command-local syntax validation before opening the
database. As the command surface grows, each command should also validate in a
consistent order. Otherwise equivalent mistakes can produce different first
errors depending on how a command happens to build its action input.

## Decision

Command-local parsers validate in phases:

0. Select the command or subcommand.
1. Parse command-local tokens.
2. Validate positional shape.
3. Validate required flags.
4. Validate flag combinations.
5. Validate scalar values.
6. Resolve runtime context, open the database, and run the action.

These phases apply to finite product commands implemented under
`projects/app/src/cli/commands/`.

`serve` is a long-running command. It follows the same command-local token,
positional, and scalar ordering before starting the server, but it does not run
an app action.

Commands with no required flags still use phases 0, 1, 2, 5, and 6.

## Phase 0: Select Command or Subcommand

Command group dispatch happens before command-local token parsing.

Missing and unknown subcommands fail before command-local flags are parsed:

- missing subcommand: `Command <group> requires a subcommand.`
- unknown subcommand: `Unknown <group> subcommand: <subcommand>.`

A token such as `--help` in a command or subcommand help position is handled
by the contextual help contract in ADR 0092. Other flag positions continue
through normal command-local token parsing.

## Phase 1: Parse Command Tokens

Token parsing handles only command-local token mechanics:

- known value flags
- known boolean flags
- duplicate scalar flags where the last value wins
- duplicate boolean flags as idempotent presence
- missing values for value flags
- unknown flags
- non-flag positionals

Value flags use `--flag value` form only. Equals syntax such as
`--flag=value` is an unknown flag. Short flags are unknown. `--` is not a
sentinel and is parsed as an unknown flag when it appears where a command-local
flag would appear.

Value flags reject missing values and values that start with `--`.

Missing flag values and unknown flags fail during this phase because the parser
cannot reliably understand the remaining command shape.

Token parsing does not validate required flags, actor kinds, target kinds,
statuses, numeric limits, paths, id prefixes, ISO timestamps, or repository
existence.

## Phase 2: Validate Positional Shape

After token parsing, the command validates positional arity:

- commands with no positionals reject any positional token
- commands with one required positional reject zero positionals
- commands with one required positional reject extra positionals

For commands that allow interleaved flags and positionals, positional validation
still happens after token parsing and before required flags.

This keeps command shape errors independent from product field errors.

## Phase 3: Validate Required Flags

After positional shape validation, the command validates required flags.

Required flag checks happen before enum, status, target-kind, actor-kind,
numeric, timestamp, path, repository, database, and action validation.

When a command has multiple required flags, checks follow the order documented
in that command's feature ADR. If a command's feature ADR does not yet list
required flags, update that ADR before changing the command behavior.

For the current command surface, the required-flag order is:

| Command               | Required Flag Order                                      |
| --------------------- | -------------------------------------------------------- |
| `projects create`     | `--name`, `--repository-path`, `--goal`, `--actor-kind`, |
|                       | `--actor-id`                                             |
| `projects init`       | `--goal`, `--actor-kind`, `--actor-id`                   |
| `projects archive`    | `--actor-kind`, `--actor-id`                             |
| `tasks create`        | `--project-id`, `--title`, `--body`, `--actor-kind`,     |
|                       | `--actor-id`                                             |
| `tasks move`          | `--status`, `--actor-kind`, `--actor-id`                 |
| `tasks assign`        | `--actor-kind`, `--actor-id`                             |
| `comments create`     | `--target-kind`, `--target-id`, `--actor-kind`,          |
|                       | `--actor-id`, `--body`                                   |
| `comments list`       | `--target-kind`, `--target-id`                           |
| `events create`       | `--target-kind`, `--target-id`, `--actor-kind`,          |
|                       | `--actor-id`, `--summary`                                |
| `events list`         | `--target-kind`, `--target-id`                           |
| `notifications list`  | `--recipient-id`                                         |
| `experiments create`  | `--project-id`, `--task-id`, `--title`, `--summary`,     |
|                       | `--actor-kind`, `--actor-id`                             |
| `experiments move`    | `--status`, `--actor-kind`, `--actor-id`                 |
| `experiments assign`  | `--actor-kind`, `--actor-id`                             |
| `experiments revise`  | `--actor-kind`, `--actor-id`                             |
| `measurements create` | one of `--baseline-id` or `--experiment-id` plus         |
|                       | `--revision-number`; `--metric-name`, `--value`,         |
|                       | `--summary`, `--actor-kind`, `--actor-id`                |
| `measurements list`   | one of `--baseline-id` or `--experiment-id`              |
| `reviews create`      | `--experiment-id`, `--revision-number`, `--decision`,    |
|                       | `--body`, `--reviewer-kind`, `--reviewer-id`             |
| `reviews list`        | `--experiment-id`                                        |
| `reports generate`    | `--project-id`                                           |
| `reports create`      | `--project-id`, `--target-kind`, `--target-id`,          |
|                       | `--title`, `--body`, `--generated-by-kind`,              |
|                       | `--generated-by-id`                                      |
| `artifacts create`    | `--target-kind`, `--target-id`, `--title`, `--summary`,  |
|                       | `--uri`, `--actor-kind`, `--actor-id`                    |
| `artifacts capture`   | `--project-id`, `--target-kind`, `--target-id`,          |
|                       | `--source-path`, `--title`, `--summary`, `--actor-kind`, |
|                       | `--actor-id`                                             |
| `artifacts list`      | `--target-kind`, `--target-id`                           |

If a required flag is missing, the parser reports:

```text
Missing required flag <flag>.
```

and stops before validating any provided scalar values.

## Phase 4: Validate Flag Combinations

After individually required flags are present, the command validates
multi-flag relationships such as:

- assignee create filters requiring both `--assigned-to-kind` and
  `--assigned-to-id`
- assignment requiring either `--clear` or assignee flags
- `--clear` being mutually exclusive with assignee flags
- selectors that require exactly one of two shapes, such as `reports list`
  requiring either `--project-id` or both target flags

Combination validation may report a custom command-specific message when the
relationship is clearer than reporting a single missing required flag.

For example:

```text
Assignee flags require both --assigned-to-kind and --assigned-to-id.
```

## Phase 5: Validate Scalar Values

After the command shape and required fields are complete, the command validates
scalar values that the CLI owns:

- actor kind literals
- target kind literals
- project status literals
- task status literals
- experiment status literals
- positive integer limits
- finite numeric command values
- non-negative safe integer byte sizes
- positive integer revision numbers
- absolute source paths when the command parser explicitly owns that check
- ISO timestamp strings only when the command's feature ADR explicitly says the
  command parser owns that check

Scalar validation should not mask missing required fields. For example, if
`events create` includes `--target-kind nope` but omits `--summary`, the
first error is:

```text
Missing required flag --summary.
```

The invalid target kind is reported after the command includes every required
field.

The CLI still does not validate id prefixes unless a feature ADR explicitly
says a command-local parser owns that check.

## Phase 6: Resolve Runtime Context, Open Database, and Run Action

Only after phases 0-5 pass may a finite command open the database, detect the
current repository, start a long-running server, or call an app action.

Repository detection counts as runtime environment validation, not command
syntax validation. Commands that infer repository context, such as current
repository project or task commands, perform repository detection after command
syntax phases succeed and before opening the database when their existing ADR
requires that order.

## Implementation Guidance

Prefer small parser helpers over command-local ad hoc ordering.

Shared helpers may include required-flag collection helpers when that keeps the
documented order obvious. Do not introduce a CLI framework dependency.

Helpers that parse actor, recipient, or target references should separate
required-field collection from scalar parsing. For example, actor helpers first
require the kind and id fields, then parse the kind literal.

Tests should cover representative mixed-error cases so future command changes
do not accidentally validate scalar values before required fields.

## Boundaries

Do not change command names, output shapes, action behavior, database schema,
or product records in this ADR.

Do not add aggregated multi-error reporting. The CLI reports one first error
per invocation.

Do not make `mise run check` run coverage.

## Required Checks

Implementation should run:

```text
bun test projects/app/src/cli/situ.test.ts
mise run check
mise run coverage
git diff --check
```

## Consequences

CLI behavior becomes easier for local agents to predict. Commands fail on
shape, completeness, combinations, and scalar values in that order, while still
remaining thin adapters over app actions.
