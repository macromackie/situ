---
status: active
category: context
created: 2026-05-13
---

# 0003. Context: External Local Agent CLIs

## Context

Modern coding agents already provide local CLIs, subscriptions, authentication,
tool use, native subagents, and private working context. Situ should integrate
with those tools the way it integrates with `git` or `gh`: through visible
commands and durable records.

Situ previously considered owning agent orchestration directly. The target
architecture does not use that approach.

## Decision

Situ does not own model execution, hosted agent sessions, provider SDK calls,
agent workers, or subagent orchestration.

Local agent tools such as Codex or Claude Code may use the `situ` CLI to read
and write Situ records. Those tools decide whether to work directly, spawn
their own subagents, resume their own sessions, call their own tools, or ask a
human for help.

Situ provides stable records and commands. It does not provide an agent runtime.

## Ownership Boundary

Situ owns:

- product records
- local persistence
- CLI commands for reading and writing records
- optional local API and UI surfaces over the same records
- generated reports derived from records

External local agent tools own:

- model authentication and subscriptions
- model prompts and private conversation context
- native subagent spawning and scheduling
- tool execution strategy
- terminal sessions and runtime logs
- provider-specific capabilities

## Actor Identity

Situ records may attribute work to caller-provided actor identities. Actor
identity is product attribution, not a runtime handle.

An actor identity can represent a human, local agent, verifier, reviewer, or
other named participant. Situ should not assume it can wake, resume, stop, or
inspect the private runtime behind that actor.

The default representation should be plain attribution data, such as an actor
kind and caller-provided actor id. It should not be an executable object,
runtime registry entry, or provider session handle.

Provider session ids, chat URLs, transcript excerpts, or runtime logs may be
captured only as ordinary comments, artifacts, or external references when an
actor intentionally records them for handoff.

## Forbidden Runtime Concepts

Do not add product models whose primary purpose is owning external agent
runtime, such as:

- `Agent`
- `AgentSession`
- `ClaudeThread`
- `Worker`
- `Lease`
- subagent queues
- provider-specific session records

If a later ADR needs one of these concepts, it must explain why ordinary
projects, tasks, notifications, comments, experiments, reviews, artifacts, and
events are not enough.

## Consequences

The CLI must be comfortable for local agent tools to use repeatedly from a
shell.

Situ should guide agents with clear records, commands, and skills rather than
by controlling their runtime.

The product can still support back-and-forth agent collaboration. The
back-and-forth happens through visible records and notifications, not through
private in-app agent sessions.
