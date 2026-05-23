---
status: active
category: contract
created: 2026-05-22
---

# 0111. Contract: Live Frontier and Overfit Evidence

## Context

ADR 0110 makes the outer agent the publisher for the live run map. The browser
may compute a running-best line from numeric facts so the chart can stay live as
records arrive, but that visual frontier is not the same thing as an authored
accept/reject decision.

Autoresearch runs can also produce suspicious metric wins. A branch that
maximizes the optimized development set by training on, memorizing, or
implicitly looking up development labels may still improve a held-out metric,
but it is not a clean generalizing result. The manager must surface that risk
instead of accepting the branch as if the held-out evidence validated it.

## Decision

The live chart uses neutral live-progress vocabulary:

- The green running-best points are labeled `Frontier`.
- Non-frontier plotted points are labeled `Other attempts`.
- The stepped line remains `Running best`.
- The chart title counts `Attempts` and `Frontier Points`.

The browser may derive the visual frontier from ordered numeric metric facts,
but it must not call derived non-frontier points `discarded` or derived
frontier points `kept`. `Kept`, `discarded`, `accepted`, and `rejected` are
authored run decisions, not browser-inferred chart states.

Live attempts have an explicit lifecycle:

- When a baseline or experiment begins, the outer agent publishes a visible
  attempt node with `situ live attempts start`. This node has descriptive title,
  summary, refs, and detail body, but no numeric metric facts.
- When measurement finishes, the outer agent appends a measured record for the
  same `nodeKey` with `situ live attempts publish`. The measured detail includes
  the numeric metric fact the chart may plot.
- The browser keeps started-but-unmeasured attempts visible as live work awaiting
  a metric. It must not plot them by copying the baseline, using zero, or
  inventing any placeholder value.
- The chart counts all visible attempt nodes as `Attempts`, but only numeric
  measured facts participate in `Frontier Points` and the `Running best` line.

When publishing live nodes, the outer agent should use titles that describe what
changed or what was tried, not only the score. Examples:

```text
baseline
error-model scoring
candidate heuristics
dev-trained lookup frontier
RoPE base frequency 10000->5000
```

## Overfit Contract

When a run has an optimized development metric and a held-out/final metric, the
manager treats held-out as a two-sided generalization check. A candidate is
overfit-risky when:

- it reaches a near-perfect optimized development accuracy/score while held-out
  is materially lower, or
- it has a large development-vs-held-out accuracy/score gap, or
- its implementation or report says it trains on, memorizes, or directly looks
  up development labels.

An overfit-risky candidate may be recorded as a dev frontier, but it must not be
presented as the clean accepted generalizing result. The manager should mark it
with a watch/rejected/changes-requested decision or an explicit overfit caveat,
and should prefer the best non-leaky branch when reporting generalization. The
only exception is a user objective that explicitly says the run optimizes the
development metric alone and that held-out generalization is out of scope; in
that case the report still calls the held-out gap out plainly.

## Eval Contract

The terminal autoresearch eval collects deterministic overfit evidence from
experiment statuses and measurement rows. Full deterministic support credit
requires:

- no accepted experiment with a suspicious optimized-dev-vs-held-out gap, unless
  the workspace case explicitly allows dev-only acceptance
- started live attempt records that reference started experiment ids
- plottable live detail facts for measured experiment ids
- LLM judge evidence that asks whether the manager recognized overfit risk,
  protected held-out data, and avoided presenting a leaky dev frontier as a
  clean generalizing result

The deterministic scorer reports at least:

- whether overfit evidence passes
- accepted overfit-risk experiment ids
- dev and held-out metric names, values, and gaps for flagged experiments

## Tests

Expected evidence:

- ADR validation passes.
- Client typecheck/build or Storybook build covers the live chart wording.
- CLI tests cover `situ live attempts start` as a metric-free started state and
  `situ live attempts publish` as the measured update path.
- Client typecheck/build or Storybook build covers visible started-but-unmeasured
  attempts mixed with measured chart points.
- Eval deterministic tests cover accepted overfit-risk detection and non-accepted
  risky candidates, started experiment live coverage, and plottable measured
  experiment coverage.
- Eval prompt tests cover overfit guidance and publish-on-start/update-on-measure
  live guidance in the manager prompt.
- `mise run check` passes before this slice is considered complete.

## Consequences

The chart stays live and useful without pretending the browser has authored
research decisions. The eval harness also starts penalizing a manager that
accepts suspicious dev-set wins without the caveats a human researcher would
expect.
