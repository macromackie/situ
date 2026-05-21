---
status: active
category: feature
created: 2026-05-20
---

# 0100. Feature: Live Report UI

## Context

ADR 0002 allows a web UI as a read-mostly view over Situ records. ADR 0003
keeps agent runtime ownership outside Situ. ADR 0004 says collaboration should
flow through ordinary records, and ADR 0091 says long-running managers should
leave checkpoint reports while surfacing status and verification evidence.

The local UI should therefore make the evolving research report visible while
the manager and workers continue writing ordinary Situ records through the CLI
or Replicache. It should not resurrect the classic runtime dashboard shape
where the UI is organized around agents, work items, sessions, or task pages.

## Decision

`situ serve` exposes a read-only live report UI from the existing local HTTP
server.

The normal browser entry points are:

```text
GET /
GET /projects/<project-id>
GET /projects/<project-id>/
GET /assets/live-report.js
```

`GET /` returns the live report for the default project. `GET
/projects/<project-id>` and `GET /projects/<project-id>/` return the same shell
with the project id encoded in the path. The shell loads `GET
/assets/live-report.js`, a browser bundle built from
`projects/app/src/live-ui/main.tsx`.

The UI is a single live report surface over the active local product records:

```text
Replicache pull
  -> projects/tasks/baselines/experiments/measurements/reviews/artifacts/
     reports/briefings/comments/events/notifications
  -> derived live report model
  -> live report page
```

The UI uses Replicache as its local read model. It does not call primitive REST
endpoints, status endpoints, verification endpoints, or report-generation
endpoints for normal rendering. Status and verification indicators in the UI
are client-side derived views over the same records received from Replicache
pull.

The first UI is read-only. It defines no mutators and no product writes. Agents
communicate to the UI by creating ordinary comments, events, notifications,
measurements, reviews, project-targeted report records, and briefing records.
The UI renders those records as the evolving report, current authored briefing,
and recent activity stream.

## Product Shape

ADR 0103 refines the normal live rendering into a compact presentation
surface. The page answers these questions first:

- Is the run going well?
- What changed recently?
- What is the latest manager-written report or checkpoint?
- What evidence exists so far?
- What still needs attention before the run can be considered complete?

The normal main view includes:

- compact project chrome and project selection when multiple active projects
  exist
- a small signal strip derived from live presentation records, falling back to
  briefing/status/report evidence when no live signals exist
- the latest project briefing, treated as the manager's current authored
  presentation of whether the run is going well
- an interactive run map derived from live presentation records
- selected-node details on demand

The normal main view does not render a table of contents, raw record activity
feed, raw verification checklist, latest report body, full progress/outcomes
sections, evidence section, or appendix. Generated reports and future debug
routes may still expose those details. The live UI may reuse browser-safe
`@situ/reports-ui` primitives where they fit the compact presentation, but the
normal surface is not a full generated report page.

When multiple active projects exist, the UI may expose project selection as a
small report header control. That selector is navigation, not a task tracker.

Debug/detail pages for raw records may be added later, but they are not part of
the normal UI in this ADR.

## Component Contract

`@situ/reports-ui` exposes a browser-safe component entry point:

```text
@situ/reports-ui/browser
```

That entry point exports report components, report CSS, and report prop types
that are safe to bundle for a browser. It must not import Node-only font
embedding helpers or `react-dom/server`.

The live UI reuses that browser-safe report component layer for progress
charts, metric callouts, outcomes, evidence blocks, baseline blocks, sections,
figures, metadata, and Markdown-like attachment display. Live-only chrome and
status layout live in `projects/app/src/live-ui/`.

Static generated reports remain self-contained no-JavaScript documents. The
live UI is allowed to use client-side JavaScript because it is a local app view,
not a durable report artifact.

## Sync Contract

The live UI creates a Replicache client with:

- `pullURL: "/replicache/pull"`
- `pushURL: "/replicache/push"`
- an empty mutator set
- a fixed schema version owned by the live UI
- a short pull interval so the report evolves while agents write records

The server continues to return reset-style pull patches. The UI must tolerate
the reset patch by deriving its full view from the current Replicache contents.

This ADR does not require incremental cookies, SSE pokes, or new sync tables.

## HTTP Contract

The live UI HTTP routes are local static assets.

They must not open the database directly. The only database access during a
normal page load happens when the Replicache client calls `/replicache/pull`.

Unsupported methods on the live UI routes return `405` with an `Allow: GET`
header and the existing structured JSON error shape. Unknown paths keep the
existing `404` behavior.

## Boundaries

This ADR does not add:

- task, experiment, report, or notification CRUD pages as normal UI views
- write mutators in the browser UI
- REST endpoints for product records
- status or verification HTTP endpoints
- agent sessions, hosted model sessions, provider records, workers, leases,
  schedulers, heartbeats, queues, or background polling inside Situ
- UI-owned automation for creating checkpoint reports
- report editing, MDX editing, or final report approval

The UI may show actor attribution from records. Actor ids remain attribution
strings, not runtime handles.

## Tests

Expected evidence:

- ADR validation passes
- HTTP tests cover the live shell, client bundle route, method-not-allowed
  behavior, and no database creation for shell requests
- live UI tests cover project selection, status derivation, verification
  derivation, latest checkpoint selection, and activity ordering from
  Replicache-shaped records
- browser bundle building succeeds through the same helper used by the HTTP
  route
- existing Replicache push and pull tests continue to pass
- `mise run check` passes before this slice is considered complete

## Consequences

The default local browser experience becomes an evolving research report rather
than a task tracker. Managers and workers keep communicating by writing visible
records. Humans can watch the report mature without Situ owning agent runtime
or hidden workflow state.
