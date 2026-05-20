---
status: active
category: context
created: 2026-05-13
---

# 0004. Context: Linear-Like Human Primitives

## Context

Situ's actors are humans and local agent tools. Local agents should interact
with Situ in a human-like way: read the board, pick up work, leave notes, attach
evidence, ask for review, respond to feedback, and move visible state forward.

This is different from a workflow engine where each step emits a rigid schema
that triggers the next hidden function.

## Decision

Situ should model collaboration with simple product primitives, similar in
spirit to how humans use Linear:

- create a task
- write Markdown context
- assign or claim the task
- move the task through visible statuses
- comment with updates, questions, and handoffs
- get notified when something needs attention
- attach evidence or artifacts
- request review
- continue the same visible work item after feedback

The primitives should carry the coordination. The app should avoid hard-coded
workflow edges when a readable record and a capable actor can make the next
decision.

## Handoff Shape

A useful handoff is ordinary Markdown attached to an ordinary record.

It may contain headings, checklists, links, command output snippets, open
questions, or next-step suggestions, but it should not require a bespoke parser
to be useful.

Structured fields should exist only for concepts the app must filter, sort,
index, or enforce mechanically.

Core metadata is still structured: stable ids, project scope, actor
attribution, timestamps, target links, statuses, event types, and notification
state are product mechanics, not handoff prose.

## Notifications

Notifications are an inbox, not a job queue.

A notification tells an actor that something likely needs attention. It should
link to a visible record. Acting on the notification means reading and updating
that record through normal product commands.

Notification state should distinguish attention from action. Dismissing a
notification should not imply that the underlying task, review, or experiment
is complete.

## Events

Events are append-only timeline and audit records for meaningful product
changes.

They should make important status and ownership changes visible after the fact.
Actors may also create explicit timeline notes for review outcomes, artifact
attachments, generated reports, or other visible records when that extra
history is useful. Events are not a job queue and should not encode hidden
workflow edges.

## Back-And-Forth

Back-and-forth collaboration should happen on the same visible records whenever
possible.

If a reviewer requests changes on an experiment, the original actor should be
able to continue by reading the review and updating the experiment, comments,
measurements, or task. The model should not require creating a new workflow run
or hidden thread just to respond.

## Consequences

Prefer visible statuses, assignees, comments, labels, reviews, notifications,
and events over hidden jobs, leases, heartbeats, and orchestration graphs.

Prefer Markdown plus a few indexed fields over large handoff schemas.

Prefer polling or listing visible records over in-app runtime wakeup semantics.

Later contract and feature ADRs must define exact records, statuses, and
timeline behavior, but they should keep this human-like coordination model.
