---
status: active
category: context
created: 2026-05-14
---

# 0088. Context: Native Goal Manager Loop

## Context

ADR 0003 says Situ does not own local agent runtime, provider sessions,
subagent scheduling, or model authentication. ADR 0004 says Situ should feel
like a human-readable collaboration surface instead of a hidden workflow
engine.

Modern local agent tools also provide their own long-running intent mechanisms,
such as a native `/goal` command or an equivalent "keep going until this is
done" mode. Situ should use those tool-native mechanisms at the outer edge
instead of trying to recreate them inside the product database.

## Decision

The primary autoresearch interaction is:

```text
one top-level native goal in the external agent tool
  -> one manager agent session in that tool
  -> Situ as the durable state of record
  -> bounded worker subagents chosen by the manager tool
  -> visible Situ records, reports, status, and verification output
```

The top-level native goal belongs to the external local agent tool, not Situ.
For example, a user may start a coding agent with:

```text
/goal Use Situ to run autoresearch until every accepted experiment is complete,
verified, and summarized. Keep going until situ status shows no pending or
running work, all required checks pass, and a final report has been written.
```

After that, the root agent session acts as the manager. It reads and writes
Situ records, creates tasks and experiments, delegates independent packets to
subagents when the external tool supports it, collects their results, records
evidence, runs checks, and decides whether the overall Situ run is done.

Situ remains the canonical record of product state. The external agent tool
remains the owner of private conversation context, native goal continuation,
subagent spawning, and model execution.

## Delegation Default

The manager should bias toward subagents for independent autoresearch work.
Candidate experiments, verification passes, and focused review tasks are good
subagent packets because they can proceed in parallel after shared setup exists.

The root manager should normally keep responsibility for:

- reading the overall project state
- creating the shared baseline before candidate work
- deciding the independent packets to delegate
- making final synthesis and acceptance decisions
- surfacing `situ status` and `situ verify` evidence

Direct manager implementation work remains valid when the external tool has no
subagent capability, when a task is genuinely sequential, or when delegating
would consume more of a short time budget than it saves. In those cases, the
manager should leave visible evidence in Situ comments, reports, or terminal
output explaining why it continued directly.

A valid fallback explanation should include:

- the worker mechanism the manager considered
- whether it was unavailable, inappropriate, or too costly for the budget
- why direct root-session work was still faithful to the project goal

When delegation does happen, useful worker evidence includes a distinct actor
id, a bounded task packet, a separate worktree or working directory when
applicable, visible worker output or transcript, and Situ records updated by or
for that worker.

Assigning a Situ task or experiment to a worker actor is not enough by itself.
Assignments are durable product handoffs; they do not wake or run a worker
unless the external agent tool actually starts one. After creating an
independent packet, the manager should either start a real worker immediately
through the local agent tool or record a fallback reason and execute the packet
itself. It should not wait for an imaginary background worker to poll Situ.

## Role Boundaries

The manager is a runtime role in the external agent tool. It is not a Situ
model.

Workers are bounded execution roles created by the external agent tool. They
are not Situ models.

Situ may record actor attribution such as:

```text
actorKind: local_agent
actorId: manager
actorId: verifier-123
actorId: scientist-1
```

Those ids are product attribution strings. They do not imply that Situ can
wake, resume, inspect, or stop the underlying agent runtime.

## Worker Packets

Subagents do not need native goals of their own. They need precise task
packets from the manager.

A useful worker packet includes:

```text
Experiment: exp_123
Task: task_456
Worktree: /path/to/worktree
Objective: try approach X
Done when: checks pass and evidence is recorded in Situ
Report back with: changed files, verification, recommendation, and blockers
```

The packet may be sent through the external agent tool's subagent mechanism.
The durable version of the handoff should also be recoverable from ordinary
Situ records: task Markdown, experiment summary Markdown, comments, reviews,
measurements, artifacts, reports, and events.

The manager should create and assign the durable packet before implementation
starts when the work is independent enough to delegate. This keeps the handoff
human-readable even if the external tool's private subagent transcript is not
available later.

## Visible Goal Evidence

Native goal evaluators generally judge from visible conversation evidence, not
from hidden SQLite state.

The manager should regularly surface concise Situ evidence into the outer
conversation:

```text
situ status --json
situ experiments list --status running
situ experiments list --status ready_for_review
situ verify --json
```

ADR 0089 defines `situ status`. ADR 0090 defines `situ verify`. ADR 0091
defines the manager reporting loop that makes this evidence visible during a
long-running native goal.

## Non-Goals

Situ should not add:

- a native goal system
- subagent-native goals
- provider session models
- agent runtime handles
- a scheduler for waking agent sessions
- hidden workflow edges between experiments, reviews, and reports

Coordination happens through visible product records and external agent tool
runtime behavior.

## Consequences

The same Situ project can be driven by Codex, Claude Code, another local agent
tool, or a human using shell commands.

Situ's portability comes from durable records and stable CLI output, not from
unifying every vendor's goal or subagent semantics.
