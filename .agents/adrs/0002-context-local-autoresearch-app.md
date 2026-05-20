---
status: active
category: context
created: 2026-05-13
---

# 0002. Context: Local Autoresearch App

## Context

Situ helps a person or local agent tool run autoresearch against a repository.
The core job is to preserve the research state that lets many actors explore,
compare, review, and continue work over time.

Situ is not the model runtime. It does not need to own a model session, hosted
agent, or provider account to be useful.

## Decision

Situ is a local stateful app with a CLI-first surface.

It runs on the user's machine, stores durable project state locally, and treats
the current repository as the work subject. Actors use Situ to create work
items, record candidate experiments, attach evidence, request review, and
generate reports.

The canonical product state lives in Situ records, not in terminal scrollback,
model chat history, process memory, or private agent state.

Autoresearch means iterative search over possible repository improvements. It
does not imply that Situ autonomously executes the whole loop. Situ preserves
the records that let humans and local agent tools continue the loop.

The current repository means the git repository containing the caller's current
working directory. Non-git folders are outside the target product until a later
ADR explicitly includes them.

A Situ project belongs to one repository. One repository may have many Situ
projects. Cross-repository research should be represented as separate projects
until a later ADR defines a multi-repository project.

## Product Loop

The normal loop is:

```text
goal
  -> project
  -> tasks
  -> experiments
  -> measurements and artifacts
  -> reviews
  -> revised tasks or accepted findings
  -> report
```

The loop is not a hard-coded workflow. Actors may move between records in any
reasonable order as long as the visible state remains understandable.

Automatic behavior may create or update visible records, derive views, surface
notifications, or generate reports from records. It must not advance important
state invisibly.

Important state includes task status, task ownership, experiment status,
experiment revisions, review outcomes, accepted findings, and generated
reports. Changes to important state must be visible as product records.

## Local Boundaries

Situ should assume:

- The repository being improved is on the same machine.
- Product state is local to the machine by default.
- The CLI is the primary integration surface for humans and local agent tools.
- A web UI may exist as a read-mostly view over the same product records.
- External agent tools keep their own authentication, subscriptions, runtime
  logs, and private model context.

The default local state home is a Situ-owned app data directory. The app may
store references to repository paths, commits, branches, command outputs,
artifact files, and external URLs, but those references become product truth
only when captured in Situ records.

Runtime logs and private model conversations remain outside Situ unless an
actor intentionally summarizes or attaches part of them as a comment,
measurement, artifact, review, or report.

Intentional capture means a human, local agent tool, or automatic backend
behavior writes through a Situ product command. Backend automation may capture
state, but the captured result must still appear as an ordinary Situ record.

If a web UI writes state, it must use the same backend write path as the CLI.
The UI must not define a second product model.

## Non-Goals

Situ should not become:

- a hosted research platform
- a model provider abstraction layer
- a hidden workflow engine
- a durable store for private model conversation history
- a replacement for git, GitHub, local shells, or local agent CLIs

## Consequences

The backend must be easy to start, inspect, back up, and delete locally.
Backing up the Situ state home plus the referenced repository should be enough
to preserve product truth. External URLs, provider logs, and private agent
sessions are not guaranteed to be preserved unless captured as Situ artifacts
or summaries.

Later ADRs should define the exact storage, command, sync, and data model
contracts that make this context concrete.
