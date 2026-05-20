---
status: active
category: feature
created: 2026-05-14
---

# 0089. Feature: Run Status CLI

## Context

ADR 0088 defines the native goal manager loop. The manager needs a single
read-only command that answers "is there still visible Situ work to handle?"
without scanning every primitive command by hand.

This command is especially important for external native goal evaluators. The
manager can print it into the conversation to show whether pending, running,
review, or attention work remains.

## Decision

Add:

```text
situ status [flags]
```

`situ status` is a read-only aggregate over existing Situ records. It does not
create records, execute checks, run agents, claim tasks, dismiss notifications,
generate reports, or decide the next action.

Supported flags:

```text
--project <project-id>
--now <iso-timestamp>
--stale-after-hours <positive-number>
```

Global `--json` selects machine-readable output.

When `--project` is present, the command reports status for that project.

When `--project` is absent, the command resolves the current git repository
from the invocation working directory and reports status for active projects
whose `repositoryPath` matches that repository root.

If no matching active project exists, the command returns a successful empty
status. It should not implicitly create a project.

`--now` controls the generated timestamp and stale-assignment comparison for
deterministic tests and repeatable manager output.

`--stale-after-hours` uses the same semantics as ADR 0041. The default is 24
hours.

## Expected Files

Expected files:

```text
projects/app/src/status/index.ts
projects/app/src/status/status.ts
projects/app/src/status/status.test.ts
projects/app/src/cli/base.ts
projects/app/src/cli/commands/status.ts
projects/app/src/cli/situ.test.ts
projects/app/src/index.ts
```

The status module exports:

```ts
export type GetSituStatusInput = {
  readonly database: Database;
  readonly projectId?: SituId<"project">;
  readonly repositoryPath?: string;
  readonly generatedAt?: IsoTimestamp;
  readonly staleAfterHours?: number;
};

export function getSituStatus(input: GetSituStatusInput): SituStatusOutput;
```

Exactly one of `projectId` or `repositoryPath` may be provided. If neither is
provided, the helper reports across all active projects.

`projects/app/src/status/index.ts` exports the status helper and types.
`projects/app/src/index.ts` exports `./status/index.js`.

`projects/app/src/cli/commands/status.ts` exports exactly:

```ts
export function runStatusCommand(input: { readonly invocation: SituCliInvocation }): SituCliResult;
```

`base.ts` dispatches the top-level `status` command to `runStatusCommand`.

## Status Semantics

`situ status` is a derived view. The source of truth remains the primitive
records and their package-owned schemas.

Pending work is:

- tasks in `triage` or `backlog`
- experiments in `planned`

Running work is:

- tasks in `in_progress`
- experiments in `running`

Review work is:

- tasks in `in_review`
- experiments in `ready_for_review`
- reviews with `verdict: "changes_requested"`

Attention work is:

- unread notifications
- stale assigned tasks or experiments using the staleness semantics from ADR
  0041

Completed work is:

- tasks in `done` or `canceled`
- experiments in `accepted`, `rejected`, or `abandoned`

These groups are intentionally broad. They help a manager decide whether more
work exists; they do not enforce a workflow graph.

## JSON Output

JSON output is:

```ts
export type SituStatusOutput = {
  readonly generatedAt: IsoTimestamp;
  readonly repositoryPath?: string;
  readonly projectIds: readonly SituId<"project">[];
  readonly projects: {
    readonly active: number;
    readonly archived: number;
  };
  readonly work: {
    readonly pending: number;
    readonly running: number;
    readonly review: number;
    readonly attention: number;
    readonly completed: number;
  };
  readonly tasks: {
    readonly triage: number;
    readonly backlog: number;
    readonly in_progress: number;
    readonly in_review: number;
    readonly done: number;
    readonly canceled: number;
  };
  readonly experiments: {
    readonly planned: number;
    readonly running: number;
    readonly ready_for_review: number;
    readonly accepted: number;
    readonly rejected: number;
    readonly abandoned: number;
  };
  readonly notifications: {
    readonly unread: number;
    readonly read: number;
    readonly dismissed: number;
  };
  readonly reviews: {
    readonly approved: number;
    readonly changes_requested: number;
    readonly rejected: number;
    readonly commented: number;
  };
  readonly staleAssignments: number;
  readonly isIdle: boolean;
};
```

`isIdle` is `true` only when `pending`, `running`, `review`, and `attention`
are all zero.

Counts include every listed key even when the count is zero. Key order should
match the type above.

## Text Output

Text output should be short and stable:

```text
projects active=<n> archived=<n>
work pending=<n> running=<n> review=<n> attention=<n> completed=<n> idle=<true|false>
tasks triage=<n> backlog=<n> in_progress=<n> in_review=<n> done=<n> canceled=<n>
experiments planned=<n> running=<n> ready_for_review=<n> accepted=<n> rejected=<n> abandoned=<n>
notifications unread=<n> read=<n> dismissed=<n>
reviews approved=<n> changes_requested=<n> rejected=<n> commented=<n>
stale_assignments <n>
```

The command appends one trailing newline.

## Implementation Boundaries

The status implementation may use direct SQL for aggregate counts. It must not
redefine primitive schemas or bypass repositories for writes.

Parser validation happens before opening the database. Repository detection
happens before opening the database when `--project` is absent.

The command should reuse current-repository detection from ADR 0058 and stale
assignment semantics from ADR 0041.

Invalid `--now` values and non-positive or non-numeric
`--stale-after-hours` values are parser errors.

## Consequences

Managers and humans get a single scan-friendly status surface while the product
model stays primitive-focused.

Goal evaluators can see a compact status snapshot without Situ owning the
external goal runtime.
