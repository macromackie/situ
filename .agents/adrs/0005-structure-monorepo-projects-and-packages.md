---
status: active
category: structure
created: 2026-05-13
---

# 0005. Structure: Monorepo Projects and Packages

## Context

Situ should be rebuildable by agents working on small, understandable pieces.
The repository should make ownership obvious from the filesystem.

Sub-packages should isolate product primitives, tooling, deterministic e2e
tests, real LLM evals, fixtures, and shared contracts so implementers can work
locally without loading the whole codebase into their head.

## Decision

Use a monorepo with top-level projects and small packages.

The expected root layout is:

```text
.
  .agents/
    adrs/
    adrs_reference/
    skills/
  projects/
    app/
      packages/
      src/
    e2e-tests/
      packages/
      src/
    evals/
      packages/
      src/
  scripts/
  config/
```

## App Project

`projects/app/` is the local backend and CLI project.

It contains:

- `src/cli/`: command-line entry point and command routing
- `src/http/`: optional local HTTP API
- `src/db/`: database composition, migrations, and install/open helpers
- `src/actions/`: application write/read actions shared by CLI and HTTP
- `src/sync/`: sync protocol adapters and client mutation state helpers
- `src/reports/`: report generation from durable records
- `src/maintenance/`: reusable maintenance inspection APIs over records
- `packages/`: primitive and shared packages

The app package layer should include support packages:

- `common`: ids, time, actor refs, target refs, sync metadata helpers
- `errors`: structured application errors

It should include primitive packages:

- `projects`: project records
- `tasks`: task records
- `comments`: Markdown comments and handoff notes
- `events`: append-only timeline records
- `notifications`: inbox records
- `baselines`: baseline reference records for autoresearch comparisons
- `experiments`: candidate experiment records
- `measurements`: measurement records
- `artifacts`: artifact records and file references
- `reviews`: review records
- `reports`: durable report records

It should include adapter packages:

- `worktrees`: git worktree command descriptors, path containment, and
  command environment filtering

Each primitive package owns its TypeScript types, schema fragment, repository,
mutations, README, and package-local tests.

Support packages must not become shared product model packages. `common` may
define generic ids, actor refs, target refs, time helpers, and sync metadata. It
must not define task, experiment, review, or artifact schemas.

Adapter packages should not own product truth unless a later feature ADR makes
them a product primitive. Worktree product records belong to `experiments` or a
later primitive package. Git command descriptors, path containment helpers, and
environment filtering belong to `worktrees`; actual command execution belongs
to an explicit runner contract, local agent CLI behavior, or an external tool.

Report product records belong to the `reports` primitive package. Report
generation orchestration and rendering helpers live in `src/reports/`.

## Workspace Contract

The monorepo uses one root package manager workspace. Project and package
manifests live at:

```text
package.json
projects/app/package.json
projects/app/packages/<name>/package.json
projects/e2e-tests/package.json
projects/e2e-tests/packages/<name>/package.json
projects/evals/package.json
projects/evals/packages/<name>/package.json
```

Internal packages use `@situ/<name>` import names unless a later tooling ADR
chooses a more specific namespace.

Each package should be independently testable. Root commands may run all
package commands, but packages should also expose local commands for their own
tests and checks.

## Dependency Direction

App dependencies flow inward:

```text
cli/http
  -> actions
    -> primitive packages
      -> support packages
```

Primitive packages may depend on support packages. Primitive packages should not
depend on other primitive packages unless a later contract ADR explicitly allows
that dependency.

Cross-primitive behavior belongs in `src/actions/`. Actions compose
repositories, own transactions, enforce business rules that touch more than one
primitive, and own cross-primitive side effects such as events or
notifications when feature ADRs call for them.

CLI and HTTP handlers should be thin adapters over actions.

## Schema And Migrations

Primitive packages own schema fragments for their records.

`src/db/` composes package schema fragments into the app database, owns
migrations, and owns database install/open helpers.

Do not create a central product schema file that redefines package-owned
schemas. The central database layer should import and compose package schema
fragments.

## E2E Tests Project

`projects/e2e-tests/` is a separate project for deterministic integration
checks that exercise Situ the way a user or local agent would touch it.

It contains:

- `packages/fixtures/`: reusable fixture repositories and expected world data
- `src/`: deterministic e2e tests over the CLI, local app server, temporary
  databases, and fixture repositories

E2E tests may depend on the app project. The app project must not depend on
e2e-tests. E2E tests should generally prefer real local integration points over
mocks when the real dependency is practical.

Deterministic CLI regression checks belong here, not in `projects/evals/`.

## Evals Project

`projects/evals/` is a separate project for real LLM evals and judge-driven
autoresearch quality checks.

It contains:

- `packages/`: reusable eval harness packages when they become necessary
- `src/`: eval runners, LLM judges, scoring helpers, laboratory scenarios, and
  real LLM evals

Evals may depend on the app project. The app project must not depend on evals.
Evals should exercise the app through the CLI, local app server, app records,
artifacts, and reports. Every product eval must include at least one real LLM
judge. Deterministic checks inside evals are setup/supporting checks only.

## Root Support

`scripts/` contains small repository scripts that wrap project commands.

`config/` contains install, release, and environment configuration that is not
owned by a single package.

`.agents/skills/` contains slim agent-facing skills. Skills should point agents
to the relevant ADRs and commands instead of duplicating policy.

## Boundaries

Do not put provider runtimes, managed-agent packages, agent session packages,
scheduler packages, worker packages, or lease packages in the app. External
local agent tools own those runtime concerns.

Do not create a shared `models` package that owns all product schemas. Product
primitive packages own their own schemas. The app composes those schema
fragments into one local database.

Do not add sync serializers to primitive packages until a sync contract ADR
defines the sync surface.

## Consequences

The initial scaffold should prefer empty-but-real package boundaries over a
large single app file.

Later contract and feature ADRs will fill in exact schemas and behavior inside
these packages.
