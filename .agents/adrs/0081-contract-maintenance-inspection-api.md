---
status: active
category: contract
created: 2026-05-14
---

# 0081. Contract: Maintenance Inspection API

## Context

ADR 0041 defines maintenance inspection as a read-only feature over existing
records. Rebuildability also needs the exact module surface and output shape so
an implementer does not have to infer those contracts from an existing
implementation.

## Decision

The app owns maintenance inspection under:

```text
projects/app/src/maintenance/
```

The package root `projects/app/src/index.ts` re-exports the maintenance module
so callers may import the public API from `@situ/app`.

The maintenance module exports these public functions:

```ts
export function normalizeMaintenanceInspectionOptions(
  input?: MaintenanceInspectionOptions,
): NormalizedMaintenanceInspectionOptions;

export function inspectMaintenance(input: InspectMaintenanceInput): MaintenanceInspection;
```

The public input and normalized option types are:

```ts
export type MaintenanceInspectionOptions = {
  readonly now?: IsoTimestamp;
  readonly staleAfterHours?: number;
};

export type InspectMaintenanceInput = MaintenanceInspectionOptions & {
  readonly context: AppActionContext;
};

export type NormalizedMaintenanceInspectionOptions = {
  readonly generatedAt: IsoTimestamp;
  readonly staleAfterHours: number;
};
```

`MaintenanceInspection`, `PrimitiveRecordCounts`, `TaskStatusCounts`,
`ExperimentStatusCounts`, `NotificationInspectionCounts`, `StaleAssignment`,
`StaleTaskAssignment`, and `StaleExperimentAssignment` are public types matching
the shapes in ADR 0041.

`normalizeMaintenanceInspectionOptions` validates caller-provided options
without reading application state. It returns:

- `generatedAt`: `nowTimestamp()` when `now` is absent, otherwise `now`
  validated and normalized through the common timestamp helpers
- `staleAfterHours`: `24` when absent, otherwise the positive finite number
  provided by the caller

Invalid timestamps and non-positive or non-finite stale thresholds throw
`ValidationError`.

`inspectMaintenance` accepts an existing `AppActionContext`. It must not open or
close the database itself. It reads records through repositories or direct
read-only SQL, returns a `MaintenanceInspection`, and must not create, update,
delete, claim, assign, notify, execute commands, or run scheduling logic.

## Verification

The implementation must have tests that prove:

- the maintenance API is importable from `@situ/app`
- option normalization validates timestamps and stale thresholds without
  requiring a database
- inspection returns the full result shape, deterministic count key order, stale
  assignment order, and two-decimal floored ages
- inspection does not mutate domain records

## Consequences

Maintenance stays a read API over ordinary primitives. Auto-research agents
should use simpler CLI surfaces such as `situ status` unless a future ADR adds
a new public maintenance command.
