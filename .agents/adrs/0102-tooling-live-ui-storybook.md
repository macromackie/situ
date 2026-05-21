---
status: active
category: tooling
created: 2026-05-20
---

# 0102. Tooling: Live UI Storybook

## Context

ADR 0100 defines the live report UI and ADR 0101 defines live briefings. The UI
has several presentation states: no project, no briefing, on-track, watch,
blocked, complete, activity tone variations, status/verification variations, and
briefing replacement animation.

These states should be reviewable without creating local database records or
running Replicache.

## Decision

`@situ/app` has a Storybook configuration for app-owned live UI stories.

The app Storybook entry point is:

```text
projects/app/.storybook/main.ts
```

It loads stories from:

```text
projects/app/src/**/*.stories.tsx
```

The app package exposes scripts:

```text
bun run storybook
bun run storybook:build
```

`storybook` runs on port `6007` so it can coexist with the existing
`@situ/reports-ui` Storybook on port `6006`.

## Story Contract

Live UI stories build fixed `LiveProjectModel` fixtures in memory. They do not:

- open SQLite databases
- start the local HTTP server
- construct Replicache clients
- define browser mutators
- call CLI commands

The stories exercise:

- full live report pages for on-track, watch, blocked, complete, no briefing,
  and empty states
- briefing assessment variants
- status and verification variants
- recent activity tone variants
- briefing replacement animation by swapping fixed briefing models

The live UI entry module must be safe to import from Storybook. Importing it
must not mount the Replicache application unless the live UI shell root element
is present.

## Tests

Expected evidence:

- app typecheck includes live UI stories
- app Storybook static build succeeds
- existing live UI browser bundle still succeeds
- ADR validation and root checks continue to pass before committing the slice

## Consequences

Design review for the live UI can happen in Storybook with stable fixtures. The
normal local UI remains read-only and data-driven by Replicache records.
