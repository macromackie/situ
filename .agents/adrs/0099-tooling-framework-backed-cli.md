---
status: active
category: tooling
created: 2026-05-20
---

# 0099. Tooling: Framework-Backed CLI

## Context

Situ's CLI started with local hand-rolled parsing so that the first command
surface could stay small and precise. The command set is now broad enough that
hand-maintained token loops, scalar validation, prompts, and process execution
adapters create more local convention than useful product behavior.

Memex has converged on a stronger pattern for TypeScript command tooling:

- Optique owns command-line parser composition, option semantics, command
  discovery metadata, and parse errors.
- Valibot owns runtime command schemas and scalar validation.
- Clack owns explicit interactive CLI prompts.
- Execa owns subprocess execution behind a typed project adapter.

Situ should use the same stack. The target is a clean, opinionated CLI, not a
hybrid parser where every command invents its own conventions.

## Decision

Situ's CLI is framework-backed. `@situ/app` depends on:

- `@optique/core`
- `@optique/valibot`
- `valibot`
- `@clack/prompts`
- `execa`

These packages are not optional implementation details. They are the sanctioned
CLI/tooling stack for command parsing, runtime validation, prompts, and process
execution.

`runSituCli` and `mainSituCli` remain the stable public entry points described
by ADR 0087. The internal implementation may change, but callers still receive
`SituCliResult` with `exitCode`, `stdout`, and `stderr`, and unexpected errors
still serialize through the shared `SerializedError` shape.

## Parser Ownership

Optique owns command parser composition, option parsing, command metadata, and
parse-time user errors. Situ may preserve a stable public help formatter around
the framework metadata when an existing help contract is already public.
Command modules may compose reusable Optique parsers, but they must not
reintroduce bespoke token loops for new commands.

Valibot owns runtime validation for parsed command objects and scalar value
parsers where Optique receives a domain-specific value. Command schemas live
near the CLI layer, and command execution receives already-validated command
objects.

The existing command names, global flags, and public output contracts from ADR
0026, ADR 0087, ADR 0089, ADR 0090, ADR 0095, ADR 0096, ADR 0097, and ADR 0098
remain in force unless a later ADR changes them. This ADR changes the
implementation authority for parsing and validation; it does not remove user
commands.

## Intentional Supersession

ADR 0092 said Situ should not depend on a CLI framework. That boundary is
superseded by this ADR. Situ now intentionally uses a CLI framework.

ADR 0070 specified the exact mechanics of the hand-rolled parser. Those
mechanics are superseded where Optique has a defined behavior for the same
token shape. For example, framework-owned parsing may accept conventional
`--flag=value` forms, may report duplicate options using Optique wording, and
may reserve `-h` as a help alias where the parser enables it.

The durable contract is now:

- command help is available before repository, database, network, or server
  work;
- unknown or invalid options fail before command execution;
- JSON mode remains stable and machine-oriented;
- command execution receives validated typed inputs;
- parser behavior is owned by Optique plus Situ's Valibot schemas, not by
  duplicated manual scans.

## Interactive Prompts

Clack is the only prompt library used by Situ CLI code.

Prompts are allowed only for commands or flows that explicitly opt in to
interactive behavior. Prompted flows must provide a non-interactive path with
explicit flags or fail with a typed validation error when interaction is
disabled. JSON output mode must not emit prompt UI.

Clack helpers live behind a Situ-owned prompt adapter so command modules do not
depend directly on prompt display mechanics.

## Process Execution

Execa is the only subprocess library used by Situ application code.

Command execution goes through a Situ-owned runner adapter. Domain modules
depend on the runner interface, not on Execa directly, so tests can inject a
deterministic runner and production can preserve consistent error mapping,
stdout/stderr capture, cancellation, and working-directory behavior.

## Consequences

New CLI commands must start from Optique parsers and Valibot schemas. Existing
commands should be moved to that model rather than extending local parsing
helpers.

Tests should assert public CLI behavior and focused schema/adapter behavior,
not the internal shape of hand-written token scanning. When framework parse
wording differs from older local wording, tests should follow the framework
contract unless a domain-specific message is intentionally normalized.

The canonical verification gate remains `mise run check`.
