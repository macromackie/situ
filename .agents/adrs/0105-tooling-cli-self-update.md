---
status: active
category: tooling
created: 2026-05-21
---

# 0105. Tooling: CLI Self-Update

## Context

ADR 0098 distributes the CLI through `config/scripts/install.sh` and explicitly
deferred a `situ self-update` command. Updating therefore meant re-running the
installer by hand, and nothing told a user a newer release existed.

ADR 0092 keeps the CLI prompt-free because situ is constantly run as a subprocess
by agents — a blocking `[y/N]` would hang automation. So an update nudge cannot be
an unconditional prompt.

## Decision

Add `situ self-update` and a strictly TTY-gated interactive update prompt.

The installer (ADR 0098) stays the single source of truth for the actual
download → checksum → extract → symlink swap. The command does not re-implement
that; it resolves the target version and re-runs the canonical installer, exactly
as a human would. This supersedes the "no self-update command" boundary in
ADR 0098.

## `situ self-update`

```text
situ self-update            update to the latest release (or report up-to-date)
situ self-update --check    report whether a newer release exists; do not install
```

- Resolves the latest release tag from the GitHub releases API for the release
  repo, compares it to the running version, and is a no-op when already current.
- Performs the swap by running the published installer for the resolved version:
  `curl -fsSL <install.sh url> | sh -s -- <version>`.
- Honors `SITU_RELEASE_REPO` (default `macromackie/situ`), `SITU_INSTALL_HOME`,
  `SITU_BIN_DIR`, and `GH_TOKEN`/`GITHUB_TOKEN`, matching the installer contract.
- It is a runtime side-effecting command: like `serve`, it is validated in the
  pure `runSituCli` path but executed through `mainSituCli` with injected I/O
  dependencies, so the logic is unit-testable without network or filesystem.

## Interactive update prompt

After a normal product command, situ may offer an update. The check is gated so
only interactive humans ever see it:

- the command is a product command (not `help`, `version`, `doctor`, `runbook`,
  `serve`, or `self-update`)
- text mode, not `--json`
- both stdout and stdin are TTYs
- `CI` and `SITU_NO_UPDATE_NOTIFIER` are unset/falsey
- at least 24h since the last check, tracked in
  `$SITU_INSTALL_HOME/.update-check.json`

When eligible and a newer release exists, situ writes the notice and prompt to
stderr (`Update now? [y/N]`); on `y` it runs the same self-update path, otherwise
it points the user at `situ self-update`. The check is always throttled afterward.
Any failure (network, parse, unwritable state) is swallowed — an update check
never changes a command's output, exit code, or success.

This is a deliberate, narrow exception to ADR 0092's no-prompt rule: prompts are
allowed only on a real interactive terminal and never for agents, pipes, or CI.

## Non-Goals

- No silent background auto-install and no update daemon; updates are explicit or
  confirmed at an interactive prompt.
- No version pinning in `self-update` (it targets latest); a specific version is
  still installable through the installer directly.
- No new download/verify/swap implementation, no Windows support, no prerelease
  channel. Those remain installer concerns per ADR 0098.

## Consequences

Humans get a one-command update and a gentle, throttled nudge; agents and CI see
exactly the same prompt-free behavior they do today. The release/install
mechanics stay in one tested place, and the CLI gains only a thin orchestrator.
