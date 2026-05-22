---
status: active
category: contract
created: 2026-05-22
---

# 0110. Contract: Outer Agent Live Map Publisher

## Context

ADR 0103 defines live presentation records as authored product state, and ADR
0104 tells the manager agent to publish each baseline and experiment to the
curated run map. The project overview must not reconstruct a run map from raw
experiment or measurement rows. The manager, or outer agent, owns the live
presentation just as it owns baseline locking, candidate selection, and final
reporting.

A live map that has nodes but no plottable metric facts is incomplete product
state. The browser should make that visible as a publisher-contract gap rather
than silently presenting an empty chart.

## Decision

The live map publisher contract is explicit:

- The outer agent publishes one live node for each baseline, candidate
  experiment, verification decision, and result that should appear in the
  normal project overview.
- Each measured baseline or experiment node has a live detail record with at
  least one structured numeric metric fact.
- Edges, focus, and signal-strip records are authored by the outer agent as
  presentation state; the client does not infer them from raw Situ records.
- The client renders the current live record set and reports missing numeric
  facts as a diagnostic state.

The live node fact shape supports optional metric metadata:

```ts
type LiveMetricDirection = "higher_is_better" | "lower_is_better";

type LiveNodeFact = {
  readonly label: string;
  readonly value: string;
  readonly tone?: LiveTone;
  readonly metricName?: string;
  readonly numericValue?: number;
  readonly unit?: string;
  readonly direction?: LiveMetricDirection;
};
```

`value` remains the human-readable display string. `numericValue` is the exact
number the run map may plot. `direction` tells the run map whether the frontier
is a running maximum or a running minimum. If `numericValue` is absent, the
client may fall back to parsing `value` as a number for older records.

## CLI Contract

The existing append-only set commands remain available. The CLI also exposes a
one-shot publishing command for the common manager path:

```text
situ live attempts publish [flags]
```

It creates a live map node and a live node detail in one app transaction. When
edge flags are present, it also creates the connecting edge. When focus flags
are present, it also creates a focus record.

Required flags:

```text
--project-id <project-id>
--authored-by-kind <human|local_agent|system>
--authored-by-id <id>
--node-key <key>
--kind <baseline|branch|verification|finding|blocker|decision|result>
--title <title>
--summary <summary>
--tone <neutral|good|watch|blocked|done>
--body <markdown>
--metric-label <label>
--metric-value <number>
```

Optional metric and link flags:

```text
--metric-name <name>
--metric-unit <unit>
--metric-direction <higher_is_better|lower_is_better>
--experiment-id <experiment-id>
--baseline-id <baseline-id>
--measurement-id <measurement-id>
--refs-json <json-array>
--from-node-key <key>
--edge-key <key>
--edge-relation <led_to|depends_on|blocked_by|supersedes|verifies>
--edge-tone <neutral|good|watch|blocked>
--focus-mode <overview|node|comparison|blocked>
--focus-summary <summary>
--related-node-keys-json <json-array>
```

The `--experiment-id`, `--baseline-id`, and `--measurement-id` convenience
flags add typed target refs alongside any `--refs-json` refs.

## Eval Contract

The terminal workspace autoresearch eval captures:

```text
situ live list --project-id <project-id>
```

The deterministic support scorer reports live-map metadata:

- live node count
- live detail count
- plottable live detail count
- count of measured experiment ids referenced by live records
- focus and signal counts

Full deterministic support credit requires live map coverage for the measured,
baseline-comparable candidate experiments in addition to the existing baseline,
measurement, worktree, report, and protected-file evidence.

## Boundaries

This ADR does not add browser write mutators, a scheduler, hidden workflow
state, automatic derivation of live maps from raw records, or a new
experiment/measurement schema.

## Tests

Expected evidence:

- ADR validation passes.
- `@situ/live` tests cover structured numeric fact normalization and invalid
  metric directions/values.
- CLI tests cover `situ live attempts publish`, including node/detail/edge/focus
  creation and typed refs.
- Client build or component tests cover the missing numeric-facts diagnostic and
  the running-minimum/running-maximum frontier behavior.
- Eval harness tests cover live record capture.
- Deterministic eval evidence tests cover live map coverage and plottable metric
  fact counting.
- `mise run check` passes before this slice is considered complete.

## Consequences

The normal project overview becomes a faithful rendering of the manager's
authored live state. If the chart is blank, the fix is to publish complete live
records, not to make the client infer a hidden story from unrelated tables.
