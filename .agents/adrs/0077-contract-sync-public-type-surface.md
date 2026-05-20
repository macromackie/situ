---
status: active
category: contract
created: 2026-05-14
---

# 0077. Contract: Sync Public Type Surface

## Context

The sync module owns Replicache request, response, and supported mutation arg
types. ADRs 0043, 0045, 0047, 0049, 0051, 0053, and 0055 define the supported
mutators and their TypeScript arg shapes.

If a mutator is supported and its arg type is part of the ADR contract,
callers should be able to import that type from the public `@situ/app` surface.
Otherwise reimplementers have to inspect private files to discover whether a
documented mutation is actually public.

## Decision

Export every supported Replicache mutation arg type from:

```text
projects/app/src/sync/index.ts
projects/app/src/index.ts
```

`projects/app/src/index.ts` already re-exports the sync barrel, so the sync
barrel is the main source of truth.

The public mutation arg type surface is:

```ts
CreateProjectMutationArgs;
CreateTaskMutationArgs;
MoveTaskMutationArgs;
ArchiveProjectMutationArgs;
AssignTaskMutationArgs;
CreateCommentMutationArgs;
CreateNotificationMutationArgs;
ReadNotificationMutationArgs;
DismissNotificationMutationArgs;
CreateEventMutationArgs;
CreateExperimentMutationArgs;
MoveExperimentMutationArgs;
AssignExperimentMutationArgs;
ReviseExperimentMutationArgs;
CreateMeasurementMutationArgs;
CreateArtifactMutationArgs;
CreateReviewMutationArgs;
CreateReportMutationArgs;
```

The existing Replicache envelope and result types remain public:

```ts
JsonValue;
ReplicacheMutation;
ReplicachePatchOperation;
ReplicachePermanentMutationError;
ReplicachePullRequest;
ReplicachePullResponse;
ReplicachePushRequest;
ReplicachePushResult;
```

Add a public-surface test that imports every supported mutation arg type from
`@situ/app`. This test may be type-focused; its main purpose is to make root
typechecking fail if a documented public type disappears.

## Boundaries

This ADR does not add mutators.

This ADR does not change runtime sync behavior.

This ADR does not export internal parser helpers, validation helpers,
prepared-mutation types, repository helpers, or transaction internals.

This ADR does not require exposing sync internals from primitive packages.

## Required Checks

Implementation should run:

```text
bun test projects/app/src/sync/index.test.ts
mise run typecheck
mise run check
git diff --check
```

If the public-surface test lives in a different file, replace the first command
with that file path.

## Consequences

The sync contract is easier to consume and reimplement. A future agent can read
the ADRs, import the documented mutation arg types from `@situ/app`, and write
push clients without reaching into private source files.
