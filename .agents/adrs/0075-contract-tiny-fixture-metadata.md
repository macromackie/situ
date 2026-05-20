---
status: active
category: contract
created: 2026-05-14
---

# 0075. Contract: Tiny Fixture Metadata

## Context

`tinyAutoresearchFixture` is a small e2e fixture for base CLI checks and the
current-repository loop:

```text
materialize repository
  -> initialize project from current repository
  -> create and list tasks
  -> create an assigned task
  -> list the assigned actor inbox
```

The fixture metadata should describe that durable regression world so agents
reading only the fixture package understand what the fixture is meant to
preserve.

## Decision

`tinyAutoresearchFixture` metadata describes the Situ regression world.

The fixture still supports the base CLI regression e2e test. The metadata should
include expected assertions for both:

- base CLI inspection
- current-repository project, task, and notification behavior

The fixture goal should be a short human-readable autoresearch goal suitable
for project and task bodies. It should not mention "placeholder".

The expected assertions are prose regression memory. They are not a machine
manifest, scoring rubric, or complete test list. Keep them concise and aligned
with the deterministic e2e tests that use the fixture.

Minimum expected assertions:

- `situ --version returns the requested build version`
- `situ doctor returns a successful health message`
- `situ projects init creates a project for the materialized repository`
- `situ projects current recovers the active project from the current repository`
- `situ tasks current lists tasks for active projects in the current repository`
- `assigned tasks create unread notifications for the assigned actor`

## Boundaries

This ADR does not add a new fixture.

This ADR does not add LLM evals, LLM judges, model scoring, external command
execution, local agent CLI execution, scheduler behavior, or network access.

This ADR does not require every assertion in every e2e test to be duplicated
inside `expectedAssertions`.

This ADR does not remove the base `--version` and `doctor` regression e2e test.

## Required Checks

Implementation should run:

```text
bun test projects/e2e-tests/packages/fixtures/tests/fixtures.test.ts
bun test projects/e2e-tests/src/tiny-regression.test.ts
bun test projects/e2e-tests/src/current-repository-e2e.test.ts
mise run check
git diff --check
```

## Consequences

The fixture package now tells future agents why this tiny repository exists:
it is a compact deterministic world for verifying that Situ records can carry
an autoresearch project from local repository discovery through task handoff
and inbox attention.
