---
status: active
category: tooling
created: 2026-05-22
---

# 0106. Tooling: Vite and TanStack Router Live UI

## Context

ADR 0100 defines the local live report UI as a read-only browser surface served
by `situ serve`. The first implementation kept the frontend bundle deliberately
small: the local HTTP server returned a hand-authored HTML shell, built one
browser entry with `Bun.build`, and parsed `window.location` directly to choose
the current project.

That shape is enough for a single page, but it makes the UI feel like a custom
adapter rather than a normal frontend application. The live UI now has
dedicated Storybook coverage, route-specific project selection, and a release
asset contract. It should use standard frontend tooling for browser bundling and
route ownership while keeping Situ's local server and Replicache API contracts
unchanged.

## Decision

The live UI is a Vite-built React application with TanStack Router owning
browser route matching and navigation.

`@situ/app` depends on:

- `@tanstack/react-router`
- `vite`

Vite owns the production browser bundle for the live UI. The source entry
remains under:

```text
projects/app/src/live-ui/
```

The Vite HTML entry point is:

```text
projects/app/src/live-ui/index.html
```

The Vite config is:

```text
projects/app/vite.live-ui.config.ts
```

The build output directory is:

```text
projects/app/dist/live-ui/
```

`situ serve` still uses Bun's local HTTP server. It does not start a Vite dev
server in production or normal local use. Instead, the HTTP layer serves the
Vite-built static app when available. When running from source and the build
directory is absent, the HTTP layer may build the Vite app on demand before
serving it so `situ serve` continues to work from a checkout.

This supersedes ADR 0098's release-specific assumption that the live UI is one
prebuilt `assets/app.js` file.

## Router Contract

TanStack Router owns the normal browser routes:

```text
/
/projects/$projectId
```

Both routes render the same live report surface. The root route renders the
default project. The project route passes `projectId` from route params into the
live report model.

The browser UI does not parse `window.location.pathname` to select projects.
Project selection uses TanStack Router navigation rather than assigning
`window.location.href`.

The legacy query-string form:

```text
/?project=<project-id>
```

may continue to select a project as a compatibility fallback, but it is not the
primary routing contract.

## HTTP Contract

The normal browser entry points remain:

```text
GET /
GET /projects/<project-id>
GET /projects/<project-id>/
```

These routes return the Vite HTML shell and do not open the database.

Static live UI assets are served from the Vite build output. Asset filenames may
be Vite-generated hashed paths under `/assets/`. The local HTTP server must
serve only files from the built live UI asset directory and must not expose
arbitrary filesystem paths.

Unsupported methods on live UI routes and static asset routes return `405` with
`Allow: GET` and the existing structured JSON error shape. Unknown paths keep
the existing `404` behavior.

The Replicache API remains unchanged:

```text
POST /replicache/pull
POST /replicache/push
```

The live UI continues to use Replicache as its local read model, with no browser
mutators in the normal UI.

## Release Contract

Release archives include the Vite-built live UI directory instead of a single
hand-built browser file:

```text
bin/situ
assets/live-ui/
README.md
MANIFEST
```

A compiled standalone `situ` binary serves the live UI from the installed asset
directory beside the binary:

```text
$SITU_INSTALL_HOME/versions/<version>/assets/live-ui/
```

The release workflow smoke test confirms that `situ serve` can return the live
UI shell and at least one referenced Vite asset.

## Boundaries

This ADR does not add frontend write mutators, REST CRUD routes, status HTTP
routes, verification HTTP routes, hosted UI development servers, background
workers, schedulers, agent sessions, provider sessions, or hidden runtime
coordination.

Vite is a frontend build tool here, not the Situ application server. Bun remains
the runtime and package manager from ADR 0006, and `mise run check` remains the
canonical local gate.

## Tests

Expected evidence:

- ADR validation passes.
- HTTP tests cover live UI shell serving, Vite asset serving, method-not-allowed
  behavior, and no database creation for shell requests.
- Live UI tests or typecheck cover TanStack Router project route params and
  router navigation replacing manual pathname parsing.
- The Vite live UI production build succeeds.
- Release asset build scripts package `assets/live-ui/` and smoke-test the live
  UI shell plus a referenced Vite asset.
- `mise run check` passes before the slice is considered complete.

## Consequences

The local browser UI becomes a normal React frontend with explicit routes and a
standard production bundle. `situ serve` remains a small local app server over
the same SQLite and Replicache contracts instead of becoming a frontend dev
server.
