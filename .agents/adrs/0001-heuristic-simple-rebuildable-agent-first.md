---
status: active
category: heuristic
created: 2026-05-13
---

# 0001. Heuristic: Simple, Rebuildable, Agent-First

## Context

Situ is an experimental autoresearch app. The project is optimizing for a high
ceiling, not a cautious migration from earlier implementations.

The codebase should be understandable and reconstructable by agents that read
the ADRs in order. Humans should be able to audit the same decisions without
needing private conversation history or hidden implementation notes.

## Decision

When making architecture, product, tooling, or implementation choices, optimize
for these heuristics in order:

1. Make the primitive obvious.
2. Make the state durable and inspectable.
3. Make the behavior reconstructable from ADRs.
4. Make agent handoffs feel like human handoffs.
5. Add machinery only when the primitive cannot carry the behavior.

## Primitive Test

Before adding a service, scheduler, workflow, custom protocol, or special case,
ask:

- Can this be represented as a small product record?
- Can the record be read and acted on by a human or local agent CLI?
- Can a later actor understand what happened from durable records and
  Markdown?
- Can staleness, ownership, or review be represented as visible state instead
  of hidden runtime coordination?
- Would deleting the implementation and rebuilding from ADRs produce the same
  concept?

If the answer is no, the ADR that introduces the concept must explain why the
extra machinery is worth the cognitive load.

## Agent-First Means Human-Legible

Agents should use Situ through the same visible primitives humans can inspect:
projects, tasks, comments, notifications, experiments, measurements, reviews,
artifacts, reports, and events.

Those names are the expected product primitive families. This ADR does not
define their schemas or lifecycle rules; later feature and contract ADRs define
the exact records.

Agent-first does not mean hiding state inside agent runtimes. Private model
context can help an actor work, but the product truth must live in Situ records
that another actor can pick up later.

## Handoff Test

A handoff is human-like enough when a later actor can answer these questions
from visible records:

- What is the goal?
- Who last touched the work?
- What state is it in?
- What evidence or artifact matters?
- What is the likely next action?
- What changed since the previous actor touched it?

If those answers require private agent context, logs, or hidden runtime state,
the implementation has not satisfied this ADR.

## Runtime Machinery

Hidden runtime machinery is allowed only as infrastructure for executing a
visible primitive. It must not become the source of product truth.

An ADR that introduces hidden machinery must state why visible records plus
explicit commands are not enough.

## Consequences

Prefer boring data models, explicit commands, Markdown handoffs, and small
packages over clever orchestration.

Prefer deleting a concept over explaining it with policy.

Prefer a weaker implementation of the right primitive over a polished
implementation of the wrong abstraction.

When later ADRs disagree, the more concrete later ADR wins for its scope, but
it should still explain how it satisfies these heuristics.
