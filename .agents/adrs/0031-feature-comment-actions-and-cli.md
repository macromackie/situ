---
status: active
category: feature
created: 2026-05-13
---

# 0031. Feature: Comment Actions and CLI

## Context

Comments are the plain Markdown back-and-forth primitive from ADR 0017. They
let a human or local agent leave context, answer a question, explain a review,
or hand work back to another actor without adding comment kinds, workflow
states, hidden jobs, or structured handoff schemas.

The primitive package already stores comment records. The app still needs a
small action surface and CLI commands so external local agent harnesses can
write and read comments through ordinary Situ commands.

A comment record has an id, a target, a Markdown body, an author, and sync
metadata. This ADR does not change that primitive shape.

## Decision

Add comment app actions and a `situ comments` CLI command group.

Expected files:

```text
projects/app/src/actions/comments.ts
projects/app/src/actions/comments.test.ts
projects/app/src/actions/index.ts
projects/app/src/cli/base.ts
projects/app/src/cli/commands/comments.ts
projects/app/src/cli/flags.ts
projects/app/src/cli/format.ts
projects/app/src/cli/situ.test.ts
```

Comment CLI commands are thin adapters. They parse command-local args, open the
local database, call comment app actions, format results, and close the
database. They do not call primitive repositories directly.

## Action API

`projects/app/src/actions/comments.ts` exports:

```ts
export type CreateCommentActionInput = CreateCommentInput & {
  readonly context: AppActionContext;
};

export type CreateCommentActionResult = {
  readonly comment: CommentRecord;
};

export function createCommentAction(input: CreateCommentActionInput): CreateCommentActionResult;

export type GetCommentActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"comment">;
};

export function getCommentAction(input: GetCommentActionInput): CommentRecord | undefined;

export type ListCommentsActionInput = ListCommentsForTargetInput & {
  readonly context: AppActionContext;
};

export function listCommentsAction(input: ListCommentsActionInput): readonly CommentRecord[];
```

The action module imports:

- `SituId` from `@situ/common`
- `CommentRecord`, `CreateCommentInput`, and `ListCommentsForTargetInput` from
  `@situ/comments`
- `AppActionContext` from `./context.js`

`createCommentAction` calls `context.repositories.comments.create` and returns
`{ comment }`.

It forwards these fields to `comments.create`:

- `id`
- `target`
- `bodyMarkdown`
- `author`
- `now`

It does not forward `context`.

`getCommentAction` calls `context.repositories.comments.getById` and returns
the repository result directly.

`listCommentsAction` calls `context.repositories.comments.listForTarget` and
returns the repository result directly.

These actions do not emit events or notifications. A comment is itself visible
back-and-forth on the target record. Future feature ADRs may compose comment
creation with notification creation when a product action explicitly needs to
ask another actor for attention.

`projects/app/src/actions/index.ts` exports the comment actions from
`./comments.js`.

## CLI Commands

The CLI supports these commands:

```text
situ comments create [flags]
situ comments list [flags]
situ comments get <comment-id>
```

Global options still appear before the command group:

```text
situ --json --db /tmp/situ.db comments list --target-kind task --target-id task_123
```

`projects/app/src/cli/commands/comments.ts` exports exactly:

```ts
export function runCommentsCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult;
```

`base.ts` dispatches the `comments` command group to
`runCommentsCommand({ invocation })`.

The root help text includes:

```text
  comments  Manage comments attached to records.
```

## CLI Flags

### `comments create`

Flags:

```text
--id <comment-id>
--target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
--target-id <target-id>
--actor-kind <human|local_agent|system>
--actor-id <id>
--actor-display-name <name>
--body <markdown>
--now <iso-timestamp>
```

Required flags:

- `--target-kind`
- `--target-id`
- `--actor-kind`
- `--actor-id`
- `--body`

Optional flags:

- `--id`
- `--actor-display-name`
- `--now`

The CLI maps target flags to:

```ts
target: {
  targetKind,
  targetId,
}
```

The CLI maps actor flags to:

```ts
author: {
  actorKind,
  actorId,
  displayName: actorDisplayName,
}
```

When `--actor-display-name` is absent, omit `displayName` or pass
`displayName: undefined`.

The command calls:

```ts
createCommentAction({
  context,
  id,
  target,
  bodyMarkdown,
  author,
  now,
});
```

`--body` maps to `bodyMarkdown`.

`--now` maps to `now`. When `--now` is absent, pass `undefined` or omit the
property.

The CLI validates `target-kind` and `actor-kind` before it opens the database.

The CLI does not trim flag values, validate id prefixes, or validate ISO
timestamps. Action and repository helpers own those validations.

### `comments list`

Flags:

```text
--target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
--target-id <target-id>
```

Required flags:

- `--target-kind`
- `--target-id`

The command calls:

```ts
listCommentsAction({
  context,
  target,
});
```

### `comments get`

The command accepts one positional id:

```text
situ comments get comment_123
```

The CLI casts the positional value to `SituId<"comment">` and does not validate
the id prefix before opening the database.

When the comment is not found, the CLI throws `NotFoundError` with:

```text
Comment was not found.
```

and details `{ id }`.

The command calls `getCommentAction({ context, id })` and wraps the result as
`{ comment }` after checking for `undefined`.

## Parser Contract

Command-specific syntax validation must complete before opening the database.
This includes:

- unknown comment subcommands
- missing subcommands
- missing required positional args
- extra positional args
- missing required flags
- unknown flags
- missing flag values
- invalid actor kinds
- invalid target kinds

Command-local help follows ADR 0092. For example,
`situ comments create --help` prints usage without opening the database.

Duplicate scalar flags are allowed; the last value wins.

Command-local tokens are scanned left-to-right before higher-level validation.
Tokens beginning with `--` are treated as command-local flags regardless of
position. A supported value flag consumes the next token as its value when that
token exists and does not start with `--`.

For example, `situ comments get --unused comment_1` and `situ comments get
comment_1 --unused` both fail with:

```text
Unknown flag for comments get: --unused.
```

`situ comments get comment_1` is the supported shape.

The parser does not support boolean flags, short flags, equals syntax, or a
`--` sentinel for comment commands.

Parser errors use `ValidationError` through the CLI parser error helper, with
the existing command-local message style:

- missing subcommand: `Command comments requires a subcommand.`
- unknown subcommand: `Unknown comments subcommand: <subcommand>.`
- missing required positional arg: `Command <command> requires <<name>>.`
- missing required flag: `Missing required flag <flag>.`
- unknown flag: `Unknown flag for <command>: <flag>.`
- missing flag value: `Missing value for <flag>.`
- extra positional args:
  `Command <command> received extra positional arguments: <args>`
- invalid actor kind: `Invalid actor kind for <flag>: <value>.`
- invalid target kind: `Invalid target kind: <value>.`

In parser error messages, `<command>` is the literal command path, for example
`comments create`, `comments list`, or `comments get`.

Required flag validation is deterministic and follows the order documented in
each command's Required flags list.

Parser validation order is deterministic:

1. Require the subcommand to exist.
2. Scan tokens left-to-right for unknown flags and missing flag values.
3. Validate positional arity.
4. Validate required flags in the documented order.
5. Validate enum-like flag values such as actor kind and target kind.

This means malformed syntax can fail before a missing required flag if the
malformed token is discovered during the left-to-right scan. For example,
`situ comments create --bad` fails with the unknown flag error before it fails
for missing `--target-kind`.

## Output Shape

JSON command outputs use `JSON.stringify` on the object shown below. Write
commands serialize action return values directly. Read and list commands wrap
read action results as `{ comment }` and `{ comments }`.

JSON command outputs:

| Command           | JSON Output                    |
| ----------------- | ------------------------------ |
| `comments create` | `{"comment":<comment>}`        |
| `comments list`   | `{"comments":[<comment>,...]}` |
| `comments get`    | `{"comment":<comment>}`        |

Each JSON output is one JSON object plus a trailing newline.

Text output:

| Command           | Text Output            |
| ----------------- | ---------------------- |
| `comments create` | `Created comment <id>` |
| `comments list`   | comment lines          |
| `comments get`    | one comment line       |

`comments get` and `comments list` both use the same comment-line formatter.
Multiple comment lines are joined with `\n`, and the final CLI result appends a
trailing newline when at least one line exists.

Comment lines use:

```text
<id>\t<target-kind>/<target-id>\t<author-kind>/<author-id>\t<body>
```

Text list output for an empty list is an empty string.

Text outputs include a trailing newline when they contain at least one line.

Text fields are emitted raw. If a comment body contains tabs or newlines, text
output may contain extra physical columns or lines. This is acceptable for this
ADR because text output is for quick terminal inspection. Local agents that
need robust parsing should use `--json`.

## Database Lifecycle

Comment CLI commands open the app database:

```ts
const database = openAppDatabase({
  databasePath: invocation.databasePath,
  environment: invocation.environment,
});
```

They create an action context with `createAppActionContext({ database })`, run
one comment app action, and close the database in a `finally` block.

`doctor` remains non-mutating and does not open the database.

## Tests

Add action tests covering:

- creating a comment through the app action
- getting an existing and missing comment
- listing comments for a target
- no events are emitted by comment actions

Add CLI tests covering:

- create, list, and get comment commands
- JSON output for create
- JSON output wraps list results as `{ comments: [...] }`
- text comment line formatting
- not-found errors for `comments get`
- command-local syntax validation before opening the database
- missing required flag validation before opening the database
- missing flag value validation before opening the database
- unknown flag validation before opening the database
- extra positional validation before opening the database
- invalid target kind validation before opening the database
- invalid actor kind validation before opening the database
- duplicate scalar flags using the last value

The parser contract above is broader than the minimum test list. The tests
should cover the risky edges listed here, but they do not need one separate
test per possible unsupported syntax form when the shared command-local parser
already has coverage elsewhere.

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not add comment kinds, workflow statuses, reaction records, edit history,
threading, markdown parsing, notification delivery, scheduler behavior,
runtime sessions, provider threads, or target existence checks.

Do not automatically create comments from project, task, review, experiment, or
report actions in this ADR.

Do not automatically create notifications from comments in this ADR. A later
product action can compose a comment with notifications when it needs an
explicit handoff.

Do not make comment creation imply that target work was performed. Target
records, reviews, measurements, artifacts, reports, notifications, and events
carry their own evidence.

## Consequences

Local agent harnesses can now use Situ for ordinary back-and-forth:

```text
open notification
  -> inspect target
  -> write comment with Markdown context
  -> optionally create a notification for another actor in a later product action
```

This keeps collaboration visible and text-first without turning comments into a
workflow engine.
