---
status: active
category: contract
created: 2026-05-14
---

# 0082. Contract: Root CLI Help

## Context

ADR 0026 defines the base CLI surface, ADR 0028 adds project and task commands,
and later ADRs add more command groups. Those ADRs are useful in sequence, but
the final root help text should have one current contract so implementers do
not have to merge partial historical help blocks by hand.

## Decision

The root Situ CLI help text is exactly:

```text
Usage: situ [global-options] <command>

Global options:
  --json             Print machine-readable JSON output for data commands.
  --db <path>        Use a specific SQLite database path.
  --database <path>  Use a specific SQLite database path.
  --help             Show this help text.
  --version          Print the Situ CLI version.

Commands:
  help      Show this help text.
  version   Print the Situ CLI version.
  doctor    Check local CLI configuration without mutating state.
  serve     Start the local Situ HTTP server.
  artifacts  Manage artifact records.
  baselines  Manage baseline records.
  comments  Manage comments attached to records.
  events    Manage event timeline records.
  experiments  Manage experiment records.
  measurements  Manage measurement records.
  notifications  Manage notification inbox records.
  projects  Manage project records.
  reports  Manage report records.
  reviews  Manage review records.
  status    Summarize project and repository work status.
  tasks     Manage task records.
  verify    Verify project and repository completion evidence.
```

The emitted help output appends one trailing newline to this text.

The command list order is intentional:

1. base commands: `help`, `version`, `doctor`
2. runtime adapter command: `serve`
3. product command groups in alphabetical order

`help`, `--help`, no command, and JSON-mode help all emit the same plain text
help output. Help output is never JSON.

Unknown top-level commands return a validation error. In text mode, unknown
top-level command errors include this root help text after the error. In JSON
mode, unknown top-level command errors do not include the help text in the JSON
payload.

Adding, removing, or renaming a top-level command requires updating this ADR and
the root help assertion in the CLI test suite in the same checkpoint.

## Consequences

The earlier help snippets remain valid for understanding how the CLI grew, but
this ADR is the source of truth for the current root help contract.

Subagents can verify CLI discoverability by checking one ADR and one test
fixture instead of reconstructing the final command list from scattered feature
ADRs.
