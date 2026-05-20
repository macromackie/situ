---
status: active
category: policy
created: 2026-05-13
---

# 0009. Policy: Structured Application Errors

## Context

Situ will have many small packages and shared app actions. Errors should remain
consistent across package boundaries, CLI output, HTTP responses, tests, and
future sync surfaces.

Throwing ad hoc `Error` instances makes failures harder for agents to inspect
and harder for callers to handle.

## Decision

Use a shared `@situ/errors` support package for application errors.

Application code should throw `BaseError` subclasses or helpers from
`@situ/errors` when the error is expected, user-facing, or useful to handle
programmatically.

Unexpected low-level failures may still be caught as unknown values, but they
should be normalized before crossing app action, CLI, or HTTP boundaries.

## Error Contract

The `@situ/errors` package exports:

```ts
export enum ErrorKind {
  Validation = "validation",
  NotFound = "not_found",
  Conflict = "conflict",
  External = "external",
  Internal = "internal",
}

export type ErrorDetails = Readonly<Record<string, unknown>>;

export abstract class BaseError extends Error {
  readonly kind: ErrorKind;
  readonly details: ErrorDetails;
}
```

It should also export concrete classes:

- `ValidationError`
- `NotFoundError`
- `ConflictError`
- `ExternalError`
- `InternalError`

Concrete errors take object arguments:

```ts
new ValidationError({
  message: "Task title is required",
  details: { field: "title" },
});
```

## Serialization

Errors crossing process or network boundaries should serialize to:

```ts
export type SerializedError = {
  readonly kind: ErrorKind;
  readonly message: string;
  readonly details: ErrorDetails;
};
```

The package exports:

- `isBaseError(value)`
- `serializeError(error)`

`serializeError` preserves `BaseError` kind, message, and details. Unknown
errors become `Internal` errors with a generic message unless the unknown value
is an ordinary `Error`, in which case the message may be preserved.

## Consequences

Primitive packages and app actions should use the shared package instead of
creating their own error hierarchies.

Tests should assert stable `kind` values rather than relying only on message
strings.

Later CLI and HTTP ADRs should map `ErrorKind` to exit codes and status codes.
