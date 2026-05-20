---
status: active
category: policy
created: 2026-05-15
---

# 0092. Policy: CLI Design and Discoverability

## Context

Situ is a local app used by humans and local agent tools. The CLI is therefore
both a human terminal interface and a subprocess interface for agents.

The CLI should stay boring, explicit, and discoverable. A user or agent should
be able to start with `situ help`, drill into a command group, discover the
exact flags for a subcommand, and then run the command non-interactively.

## Decision

Situ CLI design follows these rules:

- command names use obvious noun-first groups and verb-like subcommands
- top-level aggregate commands are allowed only when they read like standard
  local tooling commands, such as `situ status`, `situ verify`, and
  `situ doctor`
- commands do not require TTY prompts
- command-local help is available before any database, filesystem repository,
  network, model, or server work
- JSON output remains the primary integration surface for agents
- text output stays concise and stable for humans
- validation errors happen before database opening whenever the invalid input
  can be detected from arguments alone
- hints may be added to common text errors when they reduce confusion without
  changing the structured error model

The CLI should not add clever aliases, short flags, interactive confirmation
flows, colors, spinners, progress bars, or shell completion machinery until a
later ADR proves they are worth the added surface area.

## Help Contract

Help is available through both the root `help` command and command-local
`--help`:

```text
situ help
situ help <command>
situ help <command> <subcommand>
situ <command> --help
situ <command> <subcommand> --help
```

Help behavior:

- returns exit code `0`
- writes plain text to stdout
- writes no stderr
- ignores global `--json` and stays plain text
- never opens the database
- never detects the current git repository
- never starts the HTTP server
- never mutates product records

Help text should be short usage reference, not a tutorial. It should show:

- usage
- subcommands for command groups
- supported flags for subcommands
- which flags are required when that keeps the help readable

Command-local help is recognized only for the simple forms above. For example,
`situ tasks create --help` prints help, while `situ tasks create --help extra`
is still parsed as an invalid command invocation.

## Output Discipline

Success output follows existing CLI conventions:

- record and aggregate data in JSON mode is one JSON object plus a trailing
  newline
- text output is stable, concise, and newline-terminated when non-empty
- success data goes to stdout
- errors go to stderr
- help is plain text even when global `--json` is present

No command should print decorative output by default. If a future command needs
progress feedback, it should have a non-interactive quiet mode and a separate
decision.

## Error Hints

Text-mode errors may include a short `hint:` line after the error line:

```text
Error [validation]: Current directory is not inside a git repository.
hint: Run from inside a git repository or pass an explicit project flag where supported.
```

Hints are not part of the structured `SerializedError` JSON shape. JSON errors
must keep returning:

```json
{ "error": { "kind": "validation", "message": "...", "details": {} } }
```

Add hints only for common failures where the next action is obvious. Do not
turn errors into long explanations.

## Boundaries

This ADR does not add:

- shell completions
- aliases such as `ls`
- short flags
- interactive prompts
- colorized output
- progress spinners
- a CLI framework dependency
- new product primitives

## Consequences

The CLI remains small and predictable while becoming easier to discover.

Agents can ask for local help without opening databases or triggering side
effects, then run the same command non-interactively with explicit flags.
