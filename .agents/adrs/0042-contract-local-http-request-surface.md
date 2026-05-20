---
status: active
category: contract
created: 2026-05-14
---

# 0042. Contract: Local HTTP Request Surface

## Context

Situ is CLI-first, but it may also need a small local HTTP surface for a future
read-only UI or sync client.

The HTTP layer should not become a second application model. It should be a
thin adapter over app actions, reports, maintenance inspection, and later sync
contracts.

## Decision

`projects/app/src/http/` owns a pure local HTTP request handler.

The HTTP module exports a request handler contract. It should not expose a
surface that points callers at action modules.

The HTTP module should expose:

```ts
export type SituHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HandleSituHttpRequestInput = {
  readonly request: Request;
  readonly databasePath?: string;
  readonly environment?: NodeJS.ProcessEnv;
};

export function handleSituHttpRequest(input: HandleSituHttpRequestInput): Promise<Response>;
```

The handler uses standard Web `Request` and `Response` objects so callers can
adapt it to Bun, tests, or another local server wrapper without coupling the
app to a server runtime.

`databasePath` and `environment` are intentionally present even though the base
route does not use them. Later route ADRs may need to open the app database
through the same handler input. The base `/health` route must ignore those
fields and must not open or validate a database path.

The HTTP module should not start a listener, pick a port, own auth, open a
browser, run agents, schedule work, or define product behavior that does not
exist in app actions.

The public import path for now is the app package root re-export:

```ts
import { handleSituHttpRequest } from "@situ/app";
```

Do not add package subpath exports in this ADR.

## Base Routes

The base HTTP surface supports:

```text
GET /health
```

Path matching uses `new URL(request.url).pathname`.

Route matching rules:

- query strings are ignored for route matching
- paths are case-sensitive
- `/health` is the only health path
- `/health/` is a different path and returns `404`
- `GET /health?x=1` returns `200`

`GET /health` does not open the database. It returns status `200` and JSON:

```json
{ "ok": true }
```

All other routes return status `404` and JSON error output using
`NotFoundError` with message:

```text
HTTP route was not found.
```

Known paths with unsupported methods return status `405` and JSON error output.
The response should include an `Allow` header listing supported methods for
that path.

Unsupported methods for `/health`, including `POST`, `HEAD`, `OPTIONS`, and
any other `Request.method`, return status `405`. The serialized error uses a
`ValidationError` with message:

```text
HTTP method is not supported for this path.
```

The error details include:

- `method`
- `path`
- `allowedMethods`

The `Allow` header value for `/health` is:

```text
GET
```

## JSON Contract

Successful JSON responses use:

```text
content-type: application/json; charset=utf-8
```

Response bodies are one JSON object plus one trailing newline.

Error responses use the existing structured application error shape:

```ts
type SituHttpErrorOutput = {
  readonly error: SerializedError;
};
```

Error responses use the same content type and one-object-plus-trailing-newline
body rule as successful JSON responses.

Error status mapping:

- `ValidationError`: `400`
- `NotFoundError`: `404`
- `ConflictError`: `409`
- `ExternalError`: `502`
- unknown errors: `500`

The HTTP layer should call `serializeError` from `@situ/errors` rather than
inventing its own error serialization.

`InternalError` and ordinary `Error` values serialize through the existing
`serializeError` behavior. This ADR does not add extra message redaction on top
of `serializeError`.

Some responses, such as method-not-allowed, may override the status code while
still using an existing serialized error kind.

## Request Parsing

The base ADR does not add JSON request body parsing because `/health` has no
body.

Later ADRs that add write or sync routes must define:

- exact path
- exact method
- request body shape
- response body shape
- database transaction behavior
- error policy
- parser behavior before and after opening the database

## Boundaries

Do not add REST-style endpoints for every primitive in this ADR.

Do not add Replicache push or pull behavior in this ADR. Replicache requires
mutation ordering, client mutation ids, and pull cookies; that needs its own
contract.

Do not add a `situ server`, `situ worker`, or `situ agent` CLI command in this
ADR. A later tooling or feature ADR can define how a local HTTP listener is
started if the product needs one.

## Consequences

The app has a testable HTTP adapter without committing to a server runtime.

Future UI or sync work can add routes intentionally, one contract at a time,
without turning the HTTP layer into a parallel workflow system.
