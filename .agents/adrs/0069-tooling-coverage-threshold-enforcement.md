---
status: active
category: tooling
created: 2026-05-14
---

# 0069. Tooling: Coverage Threshold Enforcement

## Context

ADR 0010 defines coverage thresholds:

- lines: 80%
- functions: 80%
- branches: 70%

The current coverage command produces `coverage/lcov.info` and
`coverage/summary.json`, but it should also enforce the thresholds that are
measurable by the current coverage provider.

Bun's LCOV output may contain no branch records. When branch totals are absent,
the coverage command should say that plainly instead of treating absent branch
data as a meaningful pass.

## Decision

The root coverage script is:

```text
scripts/coverage.sh
```

`mise run coverage` continues to run this script.

The script still:

- removes and recreates `coverage/`
- runs `bun test --coverage --coverage-reporter=lcov --coverage-dir=coverage`
- requires `coverage/lcov.info` to exist
- writes `coverage/summary.json`
- prints the summary JSON to stdout, even when threshold enforcement fails

The script may continue to use shell, awk, Bun, and standard POSIX utilities
already available to repository scripts. Do not add a new coverage parser
dependency.

## Summary Shape

`coverage/summary.json` should include line, function, and branch sections:

```json
{
  "lines": {
    "covered": 10664,
    "total": 10870,
    "percent": 98.1,
    "threshold": 80,
    "measured": true,
    "enforced": true
  },
  "functions": {
    "covered": 745,
    "total": 748,
    "percent": 99.6,
    "threshold": 80,
    "measured": true,
    "enforced": true
  },
  "branches": {
    "covered": 0,
    "total": 0,
    "percent": 100.0,
    "threshold": 70,
    "measured": false,
    "enforced": false
  }
}
```

`measured` is `true` when the corresponding LCOV total is greater than zero.

`enforced` is `true` when the threshold is actually checked.

LCOV field mapping:

- lines use `LH` covered and `LF` total
- functions use `FNH` covered and `FNF` total
- branches use `BRH` covered and `BRF` total

For branches, `measured` and `enforced` are `false` when the summed `BRF` total
is zero. This treats no `BRF` records and `BRF:0` records the same way: branch
coverage is not measurable from the current LCOV file.

Keep `percent` numeric for every section. When total is zero, `percent` remains
`100.00` for compatibility with the existing summary shape, but `measured:
false` makes the absence explicit.

JSON numbers do not preserve trailing zeroes semantically. The summary writer
may format numbers with two decimals, but consumers should treat the value as a
number.

## Threshold Behavior

The script enforces:

- line coverage is at least 80% when line totals are present
- function coverage is at least 80% when function totals are present
- branch coverage is at least 70% when branch totals are present

If the summed `LF` or `FNF` totals are zero, the script fails after writing and
printing the summary. Those totals are required for the project coverage
command to be meaningful.

If branch totals are absent, the script does not fail. It must print a concise
warning to stderr:

```text
Branch coverage was not measured because lcov.info contained no branch totals.
```

Threshold comparison uses the raw calculated percent, not the rounded display
value. For example, `79.995%` is below an `80%` threshold and fails.

If any enforced threshold fails, the script prints concise errors to stderr and
exits nonzero after writing and printing `coverage/summary.json`.

When multiple enforced thresholds fail, print all failures.

Error messages should include the metric name, measured percent, and threshold.

Example:

```text
Line coverage 79.99% is below threshold 80.00%.
```

## Boundaries

Do not add a new coverage tool or dependency in this ADR.

Do not make `mise run check` run coverage. Coverage remains a separate command.

Do not remove `coverage/lcov.info`.

Do not hide missing branch data by silently treating it as enforced.

Do not add per-file thresholds in this ADR.

## Required Checks

Implementation should run:

```text
mise run coverage
mise run check
git diff --check
```

## Consequences

Coverage now fails when measured line or function coverage falls below the
project bar. Branch coverage remains visible and explicitly unmeasured until
the coverage provider emits branch totals, at which point the same script starts
enforcing the 70% branch threshold automatically.
