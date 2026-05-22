---
status: active
category: feature
created: 2026-05-22
---

# 0109. Feature: Client Project Index

## Context

ADR 0107 defines the browser code as the Situ client rather than a one-off
live UI. The client still inherited the original root route behavior from ADR
0100 and ADR 0106: `GET /` rendered a project overview by automatically
selecting the latest active project.

That makes the home page ambiguous when more than one project exists and hides
the route boundary between choosing work and inspecting one project. The client
should behave like a normal routed app: the home page lists projects, and the
project overview belongs to the project route.

The client source also still carries `Live*` names for client-owned model and
component types. Those names now conflict with the `@situ/live` domain package,
which specifically owns live presentation records.

## Decision

The client root route is a project index:

```text
/
```

The project index reads project records from Replicache and renders a clickable
list of projects. Each project links to:

```text
/projects/<project-id>
```

The project overview route is:

```text
/projects/$projectId
```

Only the project overview route renders the compact project status, briefing,
map, and activity surface. The client model does not auto-select a project when
no `projectId` is present. If `/projects/<project-id>` references a missing
project, the project route shows a missing-project state instead of falling
back to another project.

The legacy query-string form:

```text
/?project=<project-id>
```

is no longer a primary route-selection mechanism. A future compatibility
redirect may exist, but the normal client contract is explicit path-based
navigation.

## Naming

Client-owned types and components avoid the `Live*` prefix. Preferred names are
domain-specific to their client responsibility, such as `ClientRecords`,
`ProjectIndexSurface`, `ProjectOverviewModel`, `ProjectOverviewSurface`, and
`BriefingPanel`.

Types imported from `@situ/live` keep their existing names because those names
refer to the live presentation record domain.

CSS class names may keep existing stable selectors until the visual system has
a broader style rename; this ADR only governs TypeScript-owned public and local
names in the client source.

## Boundaries

This ADR does not add browser write mutators, project creation forms, REST CRUD
routes, hosted client development servers, auth filters, background workers,
or new server-side project APIs.

ADR 0106 still defines Vite and TanStack Router ownership. ADR 0107 still
defines the client source and asset paths. This ADR supersedes only the root
route auto-selection behavior from ADR 0100 and ADR 0106, and any client-owned
`Live*` type or component names used as examples in ADR 0100, ADR 0102, ADR
0103, and ADR 0106.

## Tests

Expected evidence:

- ADR validation passes.
- Client model tests cover that no requested project means no project overview
  model is selected.
- Client route/component tests or typecheck cover the project index linking to
  `/projects/<project-id>` and project route rendering by explicit id.
- Vite client build succeeds.
- `mise run check` passes before the slice is considered complete.

## Consequences

The client home page becomes predictable as the project chooser. Project
overview URLs become stable deep links, and the code no longer conflates the
client app with the live presentation record domain.
