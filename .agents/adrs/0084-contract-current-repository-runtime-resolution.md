---
status: active
category: contract
created: 2026-05-14
---

# 0084. Contract: Current-Repository Runtime Resolution

## Context

ADR 0058, ADR 0059, and ADR 0063 define CLI commands that infer the current
git repository from `invocation.cwd`. ADR 0070 defines CLI validation phases
and says runtime context resolution happens only after command-local syntax and
scalar validation pass.

Rebuildability needs one clear contract for where current-repository detection
fits. It should be obvious that repository detection is not ordinary scalar
parsing, but it also should not force extra framework or workflow layers.

## Decision

Current-repository detection is CLI runtime context resolution.

The commands that may call `findCurrentRepositoryRoot` are:

- `situ projects init`
- `situ projects current`
- `situ tasks current`

These commands must complete all command-local validation before repository
detection:

- command or subcommand selection
- command-local token scanning
- positional shape validation
- required flag validation
- flag combination validation
- scalar value validation

Only after those checks pass may the command call `findCurrentRepositoryRoot`.
The command must still call `findCurrentRepositoryRoot` before opening the
database.

The command module owns this sequencing. It may implement the sequence in a
private parse, normalize, or command-resolution helper as long as the observable
contract holds:

```text
parse command tokens
  -> validate command shape and scalar values
  -> resolve current repository path
  -> open database
  -> create action context
  -> call app actions
```

The helper name does not make repository detection a parser error. Repository
detection failures are `ValidationError`s from the runtime environment and must
be formatted through the invocation's selected output mode.

For example, when `--json` has already been parsed:

```text
situ --json projects current
```

outside a git repository returns a JSON error object on stderr, not text.

Parser errors still use parser error formatting. For example, an invalid
`--status` value must fail before repository detection, even when the current
directory is not inside a repository.

## Boundaries

Do not move current-repository detection into primitive repositories, app
actions, database opening, or shared common helpers.

Do not run `git`. Detection remains filesystem-marker detection through
`findCurrentRepositoryRoot`.

Do not add process-wide current project state, a selected project cache, a
workspace registry, scheduler behavior, workers, leases, or hidden workflow
state.

Do not require every private helper named `parse*` to be filesystem-free. The
observable phase ordering matters more than helper naming.

## Verification

Tests must prove:

- syntax and scalar parser errors happen before repository detection
- repository detection happens before database opening
- post-open errors close the database
- repository detection failures respect JSON output mode after `--json`
- current-repository commands call app actions rather than primitive
  repositories directly

## Consequences

Current-repository commands stay simple and human-like: an actor standing in a
repository can ask Situ for the relevant project or task view without adding
workflow state.

The codebase still has a crisp phase contract, but it does not need a heavier
parser framework just to keep repository detection outside private helper names.
