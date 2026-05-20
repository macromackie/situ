---
status: active
category: policy
created: 2026-05-13
---

# 0011. Policy: LLM Evals and Regression Memory

## Context

Situ is an experimental autoresearch app. Unit tests prove package contracts,
and deterministic e2e tests prove integration contracts, but they do not prove
that the overall agent-facing experience is useful.

The project needs durable LLM eval worlds that capture important workflows,
judgment criteria, and failures so future agents can tell whether changes
improve or regress the autoresearch experience.

## Decision

Keep evals in the separate `projects/evals/` project.

Use evals for real LLM tests of product behavior. An eval should exercise Situ
the way a local coding agent would use it: through the CLI, local app server,
records, reports, artifacts, and repository state.

Every eval must include at least one LLM judge. The LLM judge is not an
optional enhancement; it is the critical component that decides whether the
result is good enough for the product experience being evaluated.

Hard-coded assertions are allowed inside evals, but they are supporting checks
only. They can verify setup, integration points, record counts, command
success, parseability, and safety invariants such as protected-file diffs. They
should not be the main judge of product quality, agent strategy, report
usefulness, or whether a handoff was understandable.

Lean on LLM judges by default for qualitative behavior. When a result depends
on agent judgment, natural-language handoffs, research strategy, report
quality, fallback credibility, delegation quality, or whether the experience is
meaningfully better than a plain `/goal`, the eval should express that as one
or more judge facets instead of as hand-written assertions.

When in doubt, make the deterministic side smaller and the judge side richer.
If a hard-coded assertion is checking whether generated text, agent strategy,
research judgment, or a fallback explanation is "good," move that expectation
into an LLM judge facet. Deterministic eval checks should produce evidence for
the judge; they should not encode the product judgment themselves.

Avoid brittle assertions over exact generated prompt prose or exact agent
wording when the intent is qualitative. Prefer an LLM judge that reads the
evidence and applies a rubric. Deterministic tests may verify that the prompt
is wired, compact enough, and includes stable structural sections, paths, ids,
and command arguments, but the quality of the manager's behavior belongs in
eval judges.

Complex evals should prefer multiple judge facets over one large implicit
verdict. For an autoresearch eval, useful facets include:

- goal and baseline discipline
- delegation and subagent use
- research quality and measurement quality
- evidence clarity and report usefulness
- safety around protected data and files
- product advantage over a plain `/goal` prompt without Situ records

Deterministic checks that do not call an LLM belong in ordinary tests or
`projects/e2e-tests/`, not in `projects/evals/`.

## Tests Versus Evals

Use tests for deterministic correctness:

- unit tests for package-local contracts
- integration tests for app actions, sync, HTTP, and database behavior
- e2e tests for CLI and local integration flows
- coverage gates over deterministic code paths

Use evals for model-mediated quality:

- whether an autoresearch loop found a useful approach
- whether a generated report is faithful and actionable
- whether an agent handoff has enough context for another agent
- whether reviews catch meaningful issues
- whether the overall loop is improving toward a goal

The practical rule is:

```text
deterministic expectation -> test or e2e-test
quality judgment over agent output -> eval with LLM judge
```

## E2E Tests

CLI and local integration checks live in:

```text
projects/e2e-tests/
```

E2E tests may use real local services and real LLM calls when that is the
simplest honest integration check, but their purpose is integration coverage.
They should generally avoid mocks when the real dependency is practical.

Reusable deterministic fixtures live under the e2e-tests project:

```text
projects/e2e-tests/packages/fixtures/
```

A fixture may describe:

- a stable fixture name
- a repository shape or files to materialize
- a project goal
- expected actors
- expected records or assertions

Fixtures should be plain TypeScript data and helper functions. They should stay
small enough for agents to read and can be reused by evals when useful.

## Eval Commands

The root command surface should include:

```text
mise run evals
```

The evals project should include:

```text
cd projects/evals && mise run evals
```

The command runs real LLM evals. It may require local model subscriptions,
provider credentials, or explicit environment setup. It is not part of the
ordinary deterministic `mise run check` gate.

`mise run test` and `mise run e2e-tests` cover deterministic behavior.

## LLM Judges

Each eval defines one or more LLM judges. A judge should have:

- a clear name
- the evidence it reads
- the rubric it applies
- the output schema it returns
- a short rationale explaining the decision
- a pass/fail or score result that the eval runner can surface

When one LLM call handles multiple concerns, it should return structured facet
results rather than hiding all judgment in a single rationale paragraph. The
overall score may aggregate those facets, but the facet results should remain
visible in metadata so regressions are diagnosable. Prefer adding or refining
facets over growing deterministic assertion lists for agent-facing behavior.

At least one judge must inspect the output that matters most for the eval. For
example, an autoresearch eval should have a judge read the final report,
selected experiment records, measurements, and review notes. A deterministic
assertion that the report file exists is not enough.

## Scoring

Evals may produce scores or pass/fail verdicts.

When a score exists, the eval should explain what the score means, which judge
produced it, and which records or artifacts support it.

When multiple judges exist, the eval should describe how their results combine
into the final score or verdict.

## Regression Memory

When a bug or research failure teaches the project something durable, capture it
as one of:

- a unit/integration test near the package boundary
- an e2e test in `projects/e2e-tests/`
- an LLM eval with a judge in `projects/evals/`
- a new ADR if the failure changes the target architecture

Do not rely on private chat history or logbooks as the only memory of a
regression.

If a failure is deterministic, preserve it as a test. If the failure is about
quality, usefulness, judgment, or agent behavior, preserve it as an eval with an
LLM judge.

## Boundaries

Do not put deterministic CLI regression tests in `projects/evals/`.

Do not call a deterministic check an eval unless at least one LLM judge
participates in the result.

Do not mock the core model judgment in an eval and treat it as product evidence.
Mocks may be useful for testing judge parsers or harness code, but mocked
judges are tests of the harness, not evals.

## Consequences

The eval project may depend on the app project and fixture package. The app and
e2e-test projects must not depend on evals.

The first true eval should be small, real, and judge-driven. It should prove
that Situ can run an autoresearch loop, collect evidence, and have an LLM judge
evaluate the result.
