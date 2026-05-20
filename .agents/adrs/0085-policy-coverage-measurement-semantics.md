---
status: active
category: policy
created: 2026-05-14
---

# 0085. Policy: Coverage Measurement Semantics

## Context

ADR 0010 sets the project coverage posture: coverage is visible across the
repo, line and function coverage have enforced thresholds, and branch coverage
has a target.

ADR 0069 makes the executable contract more precise for the current coverage
provider. Bun's LCOV output may omit branch totals entirely. In that case, a
branch percentage is not a real measured signal, even if a summary object can
still include a compatibility value.

The active ADR set should not imply that unmeasured branch data is enforced.

## Decision

Coverage policy distinguishes targets from enforceable measurements.

`mise run coverage` must:

- create `coverage/lcov.info`
- create `coverage/summary.json`
- report line, function, and branch coverage sections
- enforce the line threshold when line totals are present
- enforce the function threshold when function totals are present
- enforce the branch threshold when branch totals are present
- fail if line or function totals are absent
- not fail only because branch totals are absent
- make absent branch totals explicit with `measured: false` and
  `enforced: false`

Threshold targets remain:

- lines: 80%
- functions: 80%
- branches: 70%

Branch coverage is a target whenever branch totals are available from the
coverage provider. When LCOV contains no branch totals, `coverage/summary.json`
must still include the branch section, but the branch threshold is not enforced
because there is no measured branch denominator.

The project should not add a second coverage tool only to force branch totals.
If the current test runner begins emitting branch totals, the existing coverage
script should start enforcing the 70% branch threshold without a separate
policy change.

ADR 0010's coverage contract should read consistently with this distinction:
line and function thresholds are required enforced gates, while branch
threshold enforcement is conditional on measured branch totals.

## Verification

The repository should prove this with:

- `mise run coverage`
- `mise run check`
- `git diff --check`

`coverage/summary.json` is valid evidence only when each metric's `measured`
and `enforced` flags are considered alongside its percentage.

## Consequences

Coverage remains honest: an absent branch denominator is reported as absent
instead of being silently treated as a meaningful pass.

Agents can still use the line and function gates as hard local quality bars,
and can see when branch coverage becomes measurable later.
