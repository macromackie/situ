---
status: active
category: context
created: 2026-05-21
---

# 0104. Context: Agent Operating Runbook

## Context

ADR 0088 defines the native goal manager loop: a human starts an external agent
tool with one `/goal`, that session becomes the manager, and Situ is the durable
record. ADR 0092 keeps the CLI discoverable but says command help stays a terse
usage reference, not a tutorial. ADR 0082 pins the exact root help text.

That leaves a gap. An agent told to "use Situ" can discover _what_ commands exist
from `situ help`, but not _how_ to operate Situ as an autoresearch manager: lock a
baseline before changing anything, keep a running-best frontier, stay honest about
held-out data, respect a soft time budget, and finish with a report. Re-teaching
that operating model inside every `/goal` prompt is fragile and easy to forget.

Observed autoresearch runs also fail in consistent, harness-level ways: accepting
changes that sit inside the metric's run-to-run noise, overfitting the eval metric
across many selection events, and greedy single-axis search that buries ideas and
never pivots off an exhausted knob. The runbook is the place to encode the
discipline that counters them, so it does not have to be rediscovered per run.

## Decision

Situ ships one static operating runbook, printed by:

```text
situ runbook
```

It is the bootstrap an agent reads before driving a run. The intended entry point
pairs it with the native goal from ADR 0088:

```text
/goal Run `situ runbook` and follow it. <objective>. <budget>.
```

The runbook is skill-like content delivered as a command, so it is tool-agnostic
(Codex, Claude Code, or a human shell all read the same text) and writes nothing
into the user's workspace.

## Behavior

`situ runbook` follows the help-document contract, not the data-command contract:

- exit code `0`, plain text to stdout, no stderr
- ignores global `--json` and stays plain text; it is prose to read, not a payload
- never opens the database, detects a repository, or mutates records
- listed in `situ help` between `doctor` and `serve` (see ADR 0082)

The content is a runbook, not a tutorial and not a reference:

- it states the manager role: you run the loop, Situ is memory, there is no
  `situ run`
- it gives the loop: orient; lock the baseline and its noise floor before any
  change; hypothesize and measure in worktrees; keep only changes that clear the
  noise floor and re-validate the running-best frontier; search wide before deep
  (revisit rejected ideas, test interactions, pivot off an exhausted axis);
  publish each baseline and experiment to the live run map (`situ live`, which is
  curated rather than derived) so the dashboard renders it; delegate independent
  candidates; stay honest with a two-sided held-out check; mind a self-managed
  budget; finish with a briefing
- it points to `situ help <group>` for exact flags instead of duplicating them
- it ends with one concrete worked example

The runbook stays generic. Workspace-specific facts — the metric, the eval
command, the interface that must not break — are discovered by the agent in the
workspace, not encoded in Situ.

## Non-Goals

`situ runbook` does not:

- accept parameters or tailor itself to a goal; the `/goal` carries the specifics
- create or track a run, enforce a budget, or run anything; per ADR 0088 Situ does
  not own the loop
- replace `situ help`, which stays the terse per-command reference (ADR 0092)

## Consequences

The native goal in ADR 0088 shrinks to intent plus a pointer to the runbook, and
every agent tool gets the same operating model from one durable, versioned
surface. The eval harness uses the same bootstrap, so the runbook is exercised on
the same path users take rather than drifting from a separate prompt.
