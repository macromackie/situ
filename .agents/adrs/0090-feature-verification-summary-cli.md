---
status: active
category: feature
created: 2026-05-14
---

# 0090. Feature: Verification Summary CLI

## Context

ADR 0088 defines a native goal manager loop where the root manager must prove
progress through visible evidence. ADR 0089 answers whether active Situ work
remains, but it does not answer whether the finished records are coherent
enough to trust.

The manager needs a second read-only command that summarizes whether Situ's
records satisfy the target completion invariants for a project or current
repository.

## Decision

Add:

```text
situ verify [flags]
```

`situ verify` is a read-only verification summary over Situ records. It checks
record-level completion and evidence invariants. It does not execute shell
commands, run test suites, call models, spawn agents, mutate records, create
reports, or approve work.

Supported flags:

```text
--project <project-id>
--now <iso-timestamp>
```

Global `--json` selects machine-readable output.

When `--project` is present, the command verifies that project.

When `--project` is absent, the command resolves the current git repository
from the invocation working directory and verifies active projects whose
`repositoryPath` matches that repository root.

`--now` controls the generated timestamp for deterministic tests and repeatable
manager output.

## Expected Files

Expected files:

```text
projects/app/src/verification/index.ts
projects/app/src/verification/verify.ts
projects/app/src/verification/verify.test.ts
projects/app/src/cli/base.ts
projects/app/src/cli/commands/verify.ts
projects/app/src/cli/situ.test.ts
projects/app/src/index.ts
```

The verification module exports:

```ts
export type VerifySituInput = {
  readonly database: Database;
  readonly projectId?: SituId<"project">;
  readonly repositoryPath?: string;
  readonly generatedAt?: IsoTimestamp;
};

export function verifySitu(input: VerifySituInput): SituVerifyOutput;
```

Exactly one of `projectId` or `repositoryPath` may be provided. If neither is
provided, the helper verifies all active projects.

`projects/app/src/verification/index.ts` exports the verification helper and
types. `projects/app/src/index.ts` exports `./verification/index.js`.

`projects/app/src/cli/commands/verify.ts` exports exactly:

```ts
export function runVerifyCommand(input: { readonly invocation: SituCliInvocation }): SituCliResult;
```

`base.ts` dispatches the top-level `verify` command to `runVerifyCommand`.

## Verification Checks

The verification result is a set of named checks.

Required checks:

| Check                                | Meaning                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `has-project`                        | At least one target project exists.                                      |
| `no-active-tasks`                    | No target task is in `triage`, `backlog`, `in_progress`, or `in_review`. |
| `no-active-experiments`              | No target experiment is in `planned`, `running`, or `ready_for_review`.  |
| `accepted-experiments-reviewed`      | Every accepted experiment has at least one approved review.              |
| `accepted-experiments-have-evidence` | Every accepted experiment has at least one measurement or artifact.      |
| `final-report-present`               | Each target project has at least one report whose target is the project. |

The checks are structural product checks. They do not replace local command
execution. When a manager runs tests, benchmarks, or other repository checks,
it should attach the resulting evidence as measurements, artifacts, comments,
or reports so `situ verify` can see that evidence in product state.

## JSON Output

JSON output is:

```ts
export type SituVerifyOutput = {
  readonly generatedAt: IsoTimestamp;
  readonly repositoryPath?: string;
  readonly projectIds: readonly SituId<"project">[];
  readonly ok: boolean;
  readonly checks: readonly SituVerifyCheck[];
};

export type SituVerifyCheck = {
  readonly name:
    | "has-project"
    | "no-active-tasks"
    | "no-active-experiments"
    | "accepted-experiments-reviewed"
    | "accepted-experiments-have-evidence"
    | "final-report-present";
  readonly ok: boolean;
  readonly summary: string;
  readonly blockingRecords: readonly SituVerifyBlockingRecord[];
};

export type SituVerifyBlockingRecord = {
  readonly targetKind:
    | "project"
    | "task"
    | "experiment"
    | "review"
    | "measurement"
    | "artifact"
    | "report";
  readonly targetId: string;
  readonly reason: string;
};
```

`ok` is `true` only when every check is `ok`.

`blockingRecords` should contain enough ids for a manager to inspect the
problem with existing primitive commands. It should not include large Markdown
bodies or artifact content.

## Text Output

Text output should be compact:

```text
verify ok=<true|false>
has-project ok=<true|false> <summary>
no-active-tasks ok=<true|false> <summary>
no-active-experiments ok=<true|false> <summary>
accepted-experiments-reviewed ok=<true|false> <summary>
accepted-experiments-have-evidence ok=<true|false> <summary>
final-report-present ok=<true|false> <summary>
```

If a check has blocking records, the command may print short indented lines
after that check:

```text
  task task_123 in_progress
  experiment exp_456 accepted without measurement or artifact evidence
```

The command appends one trailing newline.

## Boundaries

`situ verify` should be deterministic for a fixed database state and fixed
clock. The generated timestamp may come from the normal app clock.

The command may use direct SQL for cross-primitive existence checks. It must
remain read-only.

Parser validation happens before opening the database. Repository detection
happens before opening the database when `--project` is absent.
Invalid `--now` values are parser errors.

## Consequences

Managers get a clear "can I stop?" signal that is distinct from raw status.

External native goal evaluators can see concise verification evidence without
Situ owning model execution, shell execution, or hidden workflow state.
