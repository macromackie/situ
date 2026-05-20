---
status: active
category: contract
created: 2026-05-13
---

# 0013. Contract: Common Types

## Context

Situ packages need a small shared vocabulary for identifiers, actors, targets,
timestamps, and sync metadata. Without this, primitive packages will invent
slightly different shapes and make cross-package actions harder to reason
about.

The shared package must not become a central product model package.

## Decision

The `@situ/common` support package owns generic shared types and helpers only.

It may export:

- branded id strings
- id creation helpers
- actor refs
- target refs
- ISO timestamp helpers
- sync metadata helpers

It must not export task, experiment, review, artifact, or other primitive
schemas.

`@situ/common` may depend on `@situ/errors` for structured validation errors.
`@situ/errors` remains the foundational support package and must not depend on
`@situ/common`.

## IDs

IDs are strings with stable prefixes:

```ts
export type IdPrefix =
  | "project"
  | "task"
  | "comment"
  | "event"
  | "notification"
  | "baseline"
  | "experiment"
  | "measurement"
  | "artifact"
  | "review"
  | "report";

export type SituId<TPrefix extends IdPrefix = IdPrefix> = `${TPrefix}_${string}` & {
  readonly __situIdPrefix?: TPrefix;
};
```

The brand is compile-time only. IDs remain strings in storage, JSON, CLI output,
and Replicache payloads.

`createId({ prefix })` returns a prefixed id:

```ts
export type CreateIdInput<TPrefix extends IdPrefix> = {
  readonly prefix: TPrefix;
  readonly randomUUID?: () => string;
};

export function createId<TPrefix extends IdPrefix>(input: CreateIdInput<TPrefix>): SituId<TPrefix>;
```

The suffix is `crypto.randomUUID()` with hyphens removed. The optional
`randomUUID` seam is only for deterministic tests. `createId` does not check for
database collisions; repositories and app actions own uniqueness checks where
they persist records.

## Actors

Actor refs are visible product attribution, not runtime handles:

```ts
export type ActorKind = "human" | "local_agent" | "system";

export type ActorRef = {
  readonly actorKind: ActorKind;
  readonly actorId: string;
  readonly displayName?: string;
};
```

`actorId` is a stable human-readable or tool-chosen identifier such as
`scott`, `scientist-1`, or `system`. It is intentionally not a `SituId` because
actors are attribution labels, not Situ-owned runtime records.

Do not add provider, session, worker, lease, or thread fields to actor refs.

## Targets

Target refs link comments, events, notifications, artifacts, and reviews to
ordinary product records:

```ts
export type TargetKind =
  | "project"
  | "task"
  | "comment"
  | "event"
  | "notification"
  | "baseline"
  | "experiment"
  | "measurement"
  | "artifact"
  | "review"
  | "report";

export type TargetRef<TKind extends TargetKind = TargetKind> = {
  readonly targetKind: TKind;
  readonly targetId: SituId<TKind>;
};
```

`TargetKind` intentionally matches `IdPrefix` for now. If a later product
record can be targeted but should not share the id prefix list, a later ADR
should split the lists.

Do not add target kinds for agent sessions, workers, leases, or provider
threads.

## Time And Sync Metadata

Use UTC ISO timestamp strings at package boundaries:

```ts
export type IsoTimestamp = string;

export type SyncMetadata = {
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
};
```

Use Luxon inside helpers for timestamp creation and comparison. Do not export
Luxon `DateTime` or `Duration` values from this package.

The package exports:

- `nowTimestamp()`
- `createSyncMetadata({ now? })`
- `touchSyncMetadata({ metadata, now? })`
- `compareIsoTimestamps({ left, right })`
- `diffIsoTimestampsInHours({ earlier, later })`

Exact helper signatures are:

```ts
export type CreateSyncMetadataInput = {
  readonly now?: IsoTimestamp;
};

export type TouchSyncMetadataInput = {
  readonly metadata: SyncMetadata;
  readonly now?: IsoTimestamp;
};

export type CompareIsoTimestampsInput = {
  readonly left: IsoTimestamp;
  readonly right: IsoTimestamp;
};

export type DiffIsoTimestampsInHoursInput = {
  readonly earlier: IsoTimestamp;
  readonly later: IsoTimestamp;
};

export function nowTimestamp(): IsoTimestamp;

export function createSyncMetadata(input?: CreateSyncMetadataInput): SyncMetadata;

export function touchSyncMetadata(input: TouchSyncMetadataInput): SyncMetadata;

export function compareIsoTimestamps(input: CompareIsoTimestampsInput): -1 | 0 | 1;

export function diffIsoTimestampsInHours(input: DiffIsoTimestampsInHoursInput): number;
```

`nowTimestamp()` returns a UTC ISO timestamp with millisecond precision.

When `now` is provided to sync metadata helpers, the helper validates it and
normalizes it to the same UTC ISO format.

`createSyncMetadata` sets `createdAt` and `updatedAt` to the same timestamp.

`touchSyncMetadata` preserves `createdAt` and replaces `updatedAt` with `now` or
`nowTimestamp()`.

`compareIsoTimestamps` is a sort comparator: it returns `-1` when `left` is
earlier, `1` when `left` is later, and `0` when they represent the same
instant.

`diffIsoTimestampsInHours` returns fractional hours between `earlier` and
`later`. It returns a negative number when `later` represents an earlier
instant.

Helpers that parse caller-provided timestamps throw `ValidationError` when an
input is not valid ISO.

## Consequences

Primitive package schemas should import these generic contracts instead of
creating local variants.

The common package stays intentionally small. If a type includes primitive
business meaning, it belongs in the primitive package or a later contract ADR.
