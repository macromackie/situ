# situ - local autoresearch app

Situ is organized as an ADR-led monorepo. Active architecture decisions live in
`.agents/adrs/`; ADR 0005 defines the current project and package structure.

## Layout

```text
projects/
  app/      local backend and CLI project
  evals/    eval runners, fixtures, and regression worlds
scripts/   repository-level command wrappers
config/    repository-level install, release, and environment config
```

## Checks

Run the full local gate with:

```text
mise run check
```

`scripts/check.sh` is a compatibility wrapper for tools that expect a shell
script; it delegates to `mise run check`.

## Install

Released CLI builds are published as GitHub Release archives for
`darwin-arm64`, `linux-x64`, and `linux-arm64`.

```text
curl -fsSL https://raw.githubusercontent.com/scott-goodfire/situ/main/config/scripts/install.sh | sh -s -- vX.Y.Z
```

For private repository access, the same installer can be fetched through `gh`:

```text
gh api -H "Accept: application/vnd.github.raw" \
  repos/scott-goodfire/situ/contents/config/scripts/install.sh | sh -s -- vX.Y.Z
```

The installer writes versioned files under `$SITU_INSTALL_HOME` or
`$HOME/.local/share/situ`, then links `situ` into `$SITU_BIN_DIR` or
`$HOME/.local/bin`.
