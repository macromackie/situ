---
status: active
category: feature
created: 2026-05-13
---

# 0036. Feature: Review Actions and CLI

## Context

Reviews are the visible feedback primitive from ADR 0023. They let one actor
record feedback on an experiment revision with a small decision and a Markdown
body.

The primitive package already stores review records. The app still needs a
small action surface and CLI commands so local agents and humans can record,
inspect, and list reviews through ordinary Situ commands.

A review should feel like a simple pull-request review: approve the revision,
request changes, reject it, or leave a non-blocking comment. Creating a review
through this ADR does not move experiments, move tasks, create comments, create
events, create notifications, run commands, or decide final task completion.

The review create action only requires the parent experiment row to exist
through the database foreign key. It does not compare `revisionNumber` with the
experiment's current revision number. Agents can review historical revisions,
future-planned revision numbers, or externally understood candidate revisions,
and later context can clarify mistakes with another review, comment, or event.

## Decision

Add review app actions and a `situ reviews` CLI command group.

Expected files:

```text
projects/app/src/actions/index.ts
projects/app/src/actions/reviews.test.ts
projects/app/src/actions/reviews.ts
projects/app/src/cli/base.ts
projects/app/src/cli/commands/reviews.ts
projects/app/src/cli/format.ts
projects/app/src/cli/situ.test.ts
```

Review CLI commands are thin adapters. They parse command-local args, open the
local database, call review app actions, format results, and close the database.
They do not call primitive repositories directly.

## Action API

`projects/app/src/actions/reviews.ts` exports:

```ts
export type CreateReviewActionInput = CreateReviewInput & {
  readonly context: AppActionContext;
};

export type CreateReviewActionResult = {
  readonly review: ReviewRecord;
};

export function createReviewAction(input: CreateReviewActionInput): CreateReviewActionResult;

export type GetReviewActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"review">;
};

export function getReviewAction(input: GetReviewActionInput): ReviewRecord | undefined;

export type ListReviewsActionInput = ListReviewsForExperimentInput & {
  readonly context: AppActionContext;
};

export function listReviewsAction(input: ListReviewsActionInput): readonly ReviewRecord[];

export type ListRecentReviewsActionInput = ListRecentReviewsInput & {
  readonly context: AppActionContext;
};

export function listRecentReviewsAction(
  input: ListRecentReviewsActionInput,
): readonly ReviewRecord[];
```

The action module imports:

- `SituId` from `@situ/common`
- `CreateReviewInput`, `ListRecentReviewsInput`,
  `ListReviewsForExperimentInput`, and `ReviewRecord` from `@situ/reviews`
- `AppActionContext` from `./context.js`

`createReviewAction` calls `context.repositories.reviews.create` and returns
`{ review }`.

It forwards these fields to `reviews.create`:

- `id`
- `experimentId`
- `revisionNumber`
- `decision`
- `bodyMarkdown`
- `reviewer`
- `now`

It does not forward `context`.

`getReviewAction` calls `context.repositories.reviews.getById` and returns the
repository result directly.

`listReviewsAction` calls `context.repositories.reviews.listForExperiment` and
returns the repository result directly.

`listRecentReviewsAction` calls `context.repositories.reviews.listRecent` and
returns the repository result directly.

These actions do not emit events or create notifications. A review record is
already visible feedback. Future composite actions may create reviews,
comments, events, notifications, experiment movements, task movements, or
reports together when the product action itself needs those effects.

`projects/app/src/actions/index.ts` exports the review actions from
`./reviews.js`.

## CLI Commands

The CLI supports these commands:

```text
situ reviews create [flags]
situ reviews list [flags]
situ reviews recent [flags]
situ reviews get <review-id>
```

Global options still appear before the command group:

```text
situ --json --db /tmp/situ.db reviews list --experiment-id experiment_123
```

`projects/app/src/cli/commands/reviews.ts` exports exactly:

```ts
export function runReviewsCommand(input: { readonly invocation: SituCliInvocation }): SituCliResult;
```

`base.ts` dispatches the `reviews` command group to
`runReviewsCommand({ invocation })`.

The root help text includes:

```text
  reviews  Manage review records.
```

## CLI Flags

### `reviews create`

Flags:

```text
--id <review-id>
--experiment-id <experiment-id>
--revision-number <positive-integer>
--decision <approved|changes_requested|rejected|commented>
--body <markdown>
--reviewer-kind <human|local_agent|system>
--reviewer-id <id>
--reviewer-display-name <name>
--now <iso-timestamp>
```

Required flags:

- `--experiment-id`
- `--revision-number`
- `--decision`
- `--body`
- `--reviewer-kind`
- `--reviewer-id`

Optional flags:

- `--id`
- `--reviewer-display-name`
- `--now`

Action call:

```ts
createReviewAction({
  context,
  id,
  experimentId,
  revisionNumber,
  decision,
  bodyMarkdown,
  reviewer,
  now,
});
```

`--body` maps to `bodyMarkdown`.

`--reviewer-*` flags map to `reviewer`.

### `reviews list`

Flags:

```text
--experiment-id <experiment-id>
--revision-number <positive-integer>
--decision <approved|changes_requested|rejected|commented>
```

Required flags:

- `--experiment-id`

Optional flags:

- `--revision-number`
- `--decision`

Action call:

```ts
listReviewsAction({
  context,
  experimentId,
  revisionNumber,
  decision,
});
```

### `reviews recent`

Flags:

```text
--limit <positive-integer>
```

Optional flags:

- `--limit`

`--limit` is parsed as a positive integer before opening the database. Missing
limits are passed as `undefined`, so the primitive repository owns the default
and cap.

Action call:

```ts
listRecentReviewsAction({
  context,
  limit,
});
```

### `reviews get <review-id>`

No flags are supported.

Action call:

```ts
getReviewAction({
  context,
  id,
});
```

When the action returns `undefined`, throw `NotFoundError` with message
`Review was not found.` and details `{ id }`.

## Review Decision Parsing

Review decision parsing is command-local CLI validation. Valid values are:

- `approved`
- `changes_requested`
- `rejected`
- `commented`

Invalid values fail before opening the database with message
`Invalid review decision: <value>.`

The parsed value is passed to app actions as a `ReviewDecision`.

## Parser Contract

Command-specific syntax validation must complete before opening the database.
This includes:

- unknown review subcommands
- missing subcommands
- missing required positional args
- extra positional args
- missing required flags
- unknown flags
- missing flag values
- invalid reviewer kinds
- invalid review decisions
- invalid positive integer revision numbers
- invalid positive integer limits

Command-local help follows ADR 0092. For example,
`situ reviews --help` and `situ reviews create --help` print usage without
opening the database.

Duplicate scalar flags are allowed; the last value wins.

Command-local flags and positionals may be interleaved. For example,
`situ reviews get --unused review_1` fails because `--unused` is an unknown
flag, while `situ reviews get review_1 extra` fails because there is an extra
positional argument.

Command-local tokens are scanned left-to-right before higher-level validation.
Tokens beginning with `--` are treated as command-local flags regardless of
position. A supported value flag consumes the next token as its value when that
token exists and does not start with `--`.

A supported value flag followed by any token beginning with `--` reports
`Missing value for <flag>.` before evaluating the following token. For example,
`situ reviews create --body --bogus` reports `Missing value for --body.`, and
`situ reviews recent --limit --bad` reports `Missing value for --limit.`.

A supported value flag may consume a single-dash token as its value. For
example, `situ reviews create --body -x ...` passes `-x` as the body value
rather than treating `-x` as a short flag.

The parser does not support boolean flags, short flags, equals syntax, or a
`--` sentinel for review commands.

The CLI does not trim string flag values, validate id prefixes, or validate ISO
timestamps. Action and repository helpers own timestamp validation and
string-field normalization after the database is opened. This includes blank or
whitespace-only values for `--body`, `--reviewer-id`, and
`--reviewer-display-name`.

Parser errors use `ValidationError` through the CLI parser error helper, with
the existing command-local message style:

- missing subcommand: `Command reviews requires a subcommand.`
- unknown subcommand: `Unknown reviews subcommand: <subcommand>.`
- missing required positional arg: `Command <command> requires <<name>>.`
- missing required flag: `Missing required flag <flag>.`
- unknown flag: `Unknown flag for <command>: <flag>.`
- missing flag value: `Missing value for <flag>.`
- extra positional args:
  `Command <command> received extra positional arguments: <args>`
- invalid reviewer kind: `Invalid actor kind for <flag>: <value>.`
- invalid review decision: `Invalid review decision: <value>.`
- invalid revision number: `Expected a positive integer revision number.`
- invalid limit: `Expected a positive integer limit.`

In parser error messages, `<command>` is the literal command path, for example
`reviews create`, `reviews list`, `reviews recent`, or `reviews get`.

Required flag validation is deterministic and follows the order documented in
each command's Required flags list. Required presence checks happen before
semantic parsing of enum-like values such as `decision` and `reviewer-kind`.
For example, a `reviews create` command with invalid `--decision` and a missing
`--reviewer-id` reports the missing `--reviewer-id` first.

## Numeric Parsing

Revision numbers and limits use decimal digit strings only:

- accepted examples: `1`, `01`, `50`
- rejected examples: `0`, `-1`, `+1`, `1.5`, `1e2`, `abc`

After the decimal digit string is converted to a number, it must be a safe
integer greater than zero. Non-safe integers are rejected. The CLI does not trim
the numeric value before validation.

The CLI passes accepted revision numbers and limits as JavaScript numbers to
app actions.

## Output Shape

JSON command outputs use `JSON.stringify` on the object shown below. Write
commands serialize action return values directly. Read and list commands wrap
read action results as `{ review }` and `{ reviews }`.

JSON command outputs:

| Command          | JSON Output                  |
| ---------------- | ---------------------------- |
| `reviews create` | `{"review":<review>}`        |
| `reviews list`   | `{"reviews":[<review>,...]}` |
| `reviews recent` | `{"reviews":[<review>,...]}` |
| `reviews get`    | `{"review":<review>}`        |

Each JSON output is one JSON object plus a trailing newline.

Text output:

| Command          | Text Output           |
| ---------------- | --------------------- |
| `reviews create` | `Created review <id>` |
| `reviews list`   | review lines          |
| `reviews recent` | review lines          |
| `reviews get`    | one review line       |

Review lines use:

```text
<id>\t<experiment-id>\tr<revision-number>\t<decision>\t<reviewer-kind>/<reviewer-id>\t<body>
```

`<body>` is `bodyMarkdown`.

Text list output for an empty list is an empty string.

Text outputs include a trailing newline when they contain at least one line.

Text fields are emitted raw. Local agents that need robust parsing should use
`--json`.

## Database Lifecycle

Review CLI commands open the app database:

```ts
const database = openAppDatabase({
  databasePath: invocation.databasePath,
  environment: invocation.environment,
});
```

They create an action context with `createAppActionContext({ database })`, run
one review app action, and close the database in a `finally` block.

After command-local parsing succeeds and the database is opened, the database
must close in `finally` for action success, not-found errors,
action/repository validation errors, and repository conflict errors.

`doctor` remains non-mutating and does not open the database.

## Tests

Add action tests covering:

- creating a review through the app action without emitting events or
  notifications, without creating comments, and without changing the parent
  experiment or task
- creating a review through the app action for a positive revision number that
  is greater than the experiment's current revision number
- getting an existing and missing review without emitting events or
  notifications or creating comments
- listing reviews for an experiment with combined revision and decision filters
- listing recent reviews
- repository errors propagate from the app action

Add CLI tests covering:

- create, list, recent, and get review commands
- JSON output for create
- JSON output for get wraps the record as `{ review }`
- JSON output wraps list and recent results as `{ reviews: [...] }`
- text review line formatting
- combined `reviews list --revision-number ... --decision ...` filter wiring
- not-found errors for `reviews get`
- database lifecycle after success by running another command against the same
  database after successful review creation
- database lifecycle after not-found by running another command against the same
  database after a missing `reviews get`
- command-local syntax validation before opening the database
- missing required flag validation before opening the database
- missing flag value validation before opening the database
- unknown flag validation before opening the database
- extra positional validation before opening the database
- invalid reviewer kind validation before opening the database
- invalid decision validation before opening the database
- invalid revision number validation before opening the database
- invalid limit validation before opening the database
- accepted revision number examples including `1` and `01`
- safe-integer revision number rejection before opening the database
- duplicate scalar flags using the last value
- representative unsupported syntax errors for short flags, equals syntax, and
  `--` sentinel
- value-token edge cases for `--body --bogus`, `--body -x`, and
  `--limit --bad`
- required-presence validation before semantic decision/reviewer validation
- after-open repository validation for at least one non-parser field such as
  blank `--body`, while still closing the database
- after-open repository conflict for a missing parent experiment, while still
  closing the database

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not add experiment status updates, task status updates, comments,
notifications, events, measurements, artifacts, report generation, command
execution, target existence checks beyond the database foreign key, scheduler
behavior, agent runtime behavior, workers, leases, runtime sessions, provider
threads, or workflow enforcement in this ADR's implementation.

Do not automatically create events when reviews are created in this ADR. Use
direct event commands or a future composite feature action when a product
workflow needs timeline entries around a review.

Do not treat a review decision as proof that app actions updated the experiment
or task. Review records preserve feedback; target records preserve their own
current state.

## Consequences

Local agents can record and inspect review feedback through the CLI:

```text
create review
  -> list reviews attached to an experiment
  -> original actor reads the Markdown body
  -> original actor continues the experiment or records follow-up context
```

The app can now preserve pull-request-like feedback without making reviews a
workflow engine.
