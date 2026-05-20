---
status: active
category: feature
created: 2026-05-14
---

# 0091. Feature: Manager Reporting Loop

## Context

ADR 0088 defines the native goal manager model. ADR 0089 defines the aggregate
status command. ADR 0090 defines the verification summary command.

Those pieces need one product interaction contract for how a root manager
session should make progress visible while using Situ.

## Decision

Situ's canonical long-running interaction is a visible manager reporting loop:

```text
external native goal starts
  -> manager reads Situ state
  -> manager creates or updates ordinary records
  -> manager delegates independent bounded packets aggressively
  -> workers report through ordinary records and conversation output
  -> manager records evidence and review decisions
  -> manager prints status and verification evidence
  -> manager repeats until status is idle and verification is ok
  -> manager generates or records the final report
```

This loop is a product interaction pattern, not a hidden Situ runtime. Situ
provides the commands and records that make the loop durable and inspectable.
The external local agent tool decides how to continue the native goal and how
to spawn or resume workers.

## Manager Rhythm

A manager should repeatedly run and surface:

```text
situ status --json
situ verify --json
```

It may also run targeted list commands when the aggregate output says work
remains:

```text
situ tasks list --status triage
situ tasks list --status in_progress
situ experiments list --status running
situ experiments list --status ready_for_review
situ notifications list --recipient-id manager
```

The exact list commands depend on the state shown by `situ status`. The
important contract is that the manager makes enough product state visible for a
native goal evaluator and a human reader to understand why the loop should
continue or stop.

## Parallelism Default

After shared setup is complete, especially after a dynamic baseline has been
recorded, the manager should look for independent work that can run in
parallel. In autoresearch, this usually means creating candidate task and
experiment records first, writing clear handoff Markdown, then assigning those
records to distinct worker actor ids before asking native subagents to work the
packets.

The manager should use direct root-session work as a fallback, not as the
default shape for independent candidate exploration. A direct fallback is
appropriate when native subagents are unavailable, the work is too sequential,
or a very small remaining time budget makes delegation overhead counterproductive.
When the manager falls back, the reason should be visible in a Situ comment,
report, or terminal summary.

Visible fallback evidence should name the worker mechanism considered, the
reason it was unavailable or skipped, and why direct work remained the right
choice for the current goal. This prevents direct work from silently replacing
the subagent-first interaction pattern.

The manager should not treat assignment as execution. If it assigns a packet to
`scientist-1` but does not actually start a native worker for `scientist-1`,
the manager still owns progress on that packet. In a bounded run, it should
quickly fall back to direct work rather than leaving tasks and experiments
running with no measurements.

## Checkpoint Reports

The manager should leave durable written summaries during long autoresearch
runs, not only at the very end. After the first candidate has baseline-
comparable measurements and has been moved to a review-ready checkpoint, the
manager should create a project-targeted report that summarizes:

- the dynamic baseline
- the measured candidate result
- the current best branch or worktree
- open tasks or experiments
- the next intended step

This report is a Situ record, not a private scratch file. The manager may also
write the same Markdown under the run output directory for easy inspection, but
the project-targeted `situ reports create` record is the durable primitive.

The report should be honest about whether the run is complete. A checkpoint
report can say "current checkpoint" or "partial report"; a final report should
only claim finality when the manager has completed the run's intended review,
synthesis, and verification work.

## Bounded Candidate Coverage

For bounded autoresearch runs, the manager should prioritize one measured
result for each requested independent candidate before spending the remaining
budget on deeper refinement of a single candidate. A shallow but measured
candidate across each independent direction is more useful to future turns than
one polished candidate and several assigned-but-unmeasured packets.

When workers stall, the manager should fall back quickly enough to preserve
candidate coverage. The fallback should be visible in the checkpoint report,
task or experiment Markdown, or another ordinary Situ record.

## Delegation Shape

When the manager uses a worker subagent, it should provide a bounded packet
with:

- Situ project id
- task id
- experiment id when applicable
- worktree path when applicable
- exact objective
- done condition
- commands or checks to run
- records to update
- report-back requirements

The worker should use normal Situ commands and records. It should not depend on
private manager context that is absent from the task, experiment, comments,
reviews, measurements, artifacts, reports, or visible prompt packet.

## Completion Rule

The manager can treat the Situ run as complete only when:

- `situ status --json` reports `isIdle: true`
- `situ verify --json` reports `ok: true`
- required repository checks have been run by the manager or workers
- evidence from those checks is attached to Situ records
- the final report is present in Situ records or written by the manager and
  linked from Situ records

`situ status` and `situ verify` are necessary manager-visible signals. They are
not a substitute for human or agent judgment about the quality of the final
answer.

## Final Report

The final report should be derived from Situ records whenever possible:

- project goal and context
- completed tasks
- accepted and rejected experiments
- measurements and artifacts
- review outcomes
- unresolved risks or follow-up work

Reports should read like the manager explaining the run to a human. They should
not expose hidden implementation machinery.

## Consequences

The user experience stays simple:

```text
install Situ
open a local coding agent
start one native goal
tell the agent to use Situ
watch Situ records, status, verification, and reports accumulate
```

Subagents remain execution workers with bounded contracts. Situ remains the
durable collaboration surface. The root native goal remains the thing that
keeps the manager going.
