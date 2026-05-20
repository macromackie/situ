---
status: active
category: contract
created: 2026-05-14
---

# 0072. Contract: Public API Surface Alignment

## Context

The ADRs are the source of truth for public package surfaces. A fresh
implementer should not discover exported APIs by reverse-engineering tests or
by assuming that every existing export is intentional.

`@situ/common` owns generic timestamp helpers that higher layers can reuse.
The app action context owns repository composition and transaction helpers, not
marker types for action modules.

## Decision

The public surfaces are:

1. Keep `diffIsoTimestampsInHours` as an intentional `@situ/common` helper.
2. Do not export `AppActionModule`.

Source-of-truth ADR text describes the same public surface.

## Common Duration Helper

ADR 0013 should include `diffIsoTimestampsInHours` in the `@situ/common` time
helper contract.

The helper signature is:

```ts
export type DiffIsoTimestampsInHoursInput = {
  readonly earlier: IsoTimestamp;
  readonly later: IsoTimestamp;
};

export function diffIsoTimestampsInHours(input: DiffIsoTimestampsInHoursInput): number;
```

The helper:

- parses both ISO timestamps with Luxon
- returns fractional hours between `earlier` and `later`
- returns a negative number when `later` represents an earlier instant
- throws `ValidationError` for invalid ISO timestamp input
- does not export Luxon `DateTime` or `Duration`

This helper is still generic common infrastructure. It does not know about
maintenance, stale records, tasks, or any primitive package.

## Action Context Surface

`projects/app/src/actions/context.ts` does not export `AppActionModule`.

The action-context public API remains the exact ADR 0025 surface:

- `AppRepositories`
- `CreateAppRepositoriesInput`
- `createAppRepositories`
- `AppActionContext`
- `CreateAppActionContextInput`
- `createAppActionContext`
- `RunAppTransactionInput`
- `runAppTransaction`

Do not replace `AppActionModule` with another marker type. If a future feature
needs action module metadata, it should add a real ADR that explains the caller
and behavior.

## Boundaries

Do not change timestamp storage formats.

Do not move the duration helper into maintenance in this ADR.

Do not add new action-context behavior.

Do not change repository bundle keys or action transaction behavior.

## Required Checks

Implementation should run:

```text
bun test projects/app/packages/common/tests/common.test.ts
bun test projects/app/src/actions/context.test.ts
mise run check
mise run coverage
git diff --check
```

## Consequences

Public exports are intentional again. The common package owns generic timestamp
math, and the app action context exposes only the composition surface that
actions actually use.
