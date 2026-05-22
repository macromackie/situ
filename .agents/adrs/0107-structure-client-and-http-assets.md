---
status: active
category: structure
created: 2026-05-22
---

# 0107. Structure: Client and HTTP Assets

## Context

ADR 0106 introduced a Vite and TanStack Router browser surface under
`projects/app/src/live-ui/`. That name described the first read-only report
screen, but the browser package is now the Situ client application served by
`situ serve`, not a one-off live report adapter.

The static file serving code also belongs to the HTTP boundary. Keeping the
Vite app source and the local HTTP asset adapter in the same directory blurs
frontend ownership with server request handling.

## Decision

The browser application source lives under:

```text
projects/app/src/client/
```

The Vite HTML entry point is:

```text
projects/app/src/client/index.html
```

The Vite config for the browser client is:

```text
projects/app/vite.client.config.ts
```

The Vite production output directory is:

```text
projects/app/dist/client/
```

The local HTTP static asset adapter lives under:

```text
projects/app/src/http/client-assets.ts
```

The HTTP handler imports client asset helpers from the HTTP package boundary.
Browser client modules do not import the HTTP asset adapter.

The app package exposes a client build script:

```text
bun run client:build
```

## HTTP Contract

The browser entry points remain:

```text
GET /
GET /projects/<project-id>
GET /projects/<project-id>/
```

Static browser assets remain served from Vite-generated paths under:

```text
/assets/
```

The HTTP adapter serves only files below the built client asset directory.
Unsupported methods on client shell and asset paths return `405` with
`Allow: GET` and the structured JSON error shape used by the rest of the HTTP
layer.

## Release Contract

Release archives include:

```text
bin/situ
assets/client/
README.md
MANIFEST
```

A compiled standalone `situ` binary serves the browser client from:

```text
$SITU_INSTALL_HOME/versions/<version>/assets/client/
```

The release workflow smoke test verifies that the installed binary can return
the browser shell and at least one referenced Vite asset.

## Boundaries

This ADR only renames and clarifies ownership. It does not add hosted frontend
development servers, frontend write mutators, new browser routes, REST CRUD
routes, background workers, schedulers, or runtime orchestration.

ADR 0106 still defines Vite, TanStack Router, and the route contract. This ADR
supersedes only the `live-ui` source, build, script, and release asset names in
ADR 0106.

## Tests

Expected evidence:

- ADR validation passes.
- Client build succeeds through `bun run client:build`.
- HTTP tests cover shell serving, asset serving, method-not-allowed behavior,
  and no database creation for shell requests.
- Release build scripts package `assets/client/` and smoke-test a referenced
  Vite asset.
- `mise run check` passes before the slice is considered complete.

## Consequences

The browser code can grow as a normal frontend client without carrying the
legacy live UI name. Server-side asset serving is owned by the HTTP layer, which
keeps the client directory focused on browser code.
