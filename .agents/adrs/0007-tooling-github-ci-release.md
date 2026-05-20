---
status: active
category: tooling
created: 2026-05-13
---

# 0007. Tooling: GitHub CI and Release

## Context

Situ is a local CLI-first app. GitHub should verify the repository and publish
installable CLI artifacts, but it should not become the runtime coordinator for
research work.

The release path should be boring enough that a local agent can inspect, run,
and debug it with shell commands.

## Decision

Use GitHub Actions for repository checks and release artifact publication.

CI should run the same non-mutating gate that developers run locally:

```text
mise run check
```

Release builds should produce installable `situ` CLI archives for these
platform tokens:

```text
darwin-arm64
linux-x64
linux-arm64
```

The archive should contain a single Bun-compiled executable entry point.

## Workflows

The repository should contain:

```text
.github/workflows/check.yml
.github/workflows/situ-release.yml
```

`check.yml` runs on pull requests and pushes to `main`.

`situ-release.yml` runs on version tags and manual dispatch.

Both workflows should install tools through mise, run `bun install
--frozen-lockfile`, and reuse repository scripts instead of duplicating complex
shell logic inline.

`situ-release.yml` should create or update a GitHub Release for the tag and
upload the platform archives plus `checksums.txt`. It may use a manual
`workflow_dispatch` input named `tag`, but manual dispatch must rebuild an
explicit version tag.

## Release Scripts

Release script ownership:

```text
config/scripts/build_release_assets.sh
config/scripts/install.sh
```

`build_release_assets.sh` builds platform-specific archives into:

```text
dist/release/situ-<version>-<platform>.tar.gz
dist/release/checksums.txt
```

It reads:

- `SITU_VERSION`: required artifact version; `vX.Y.Z` for releases, with
  `0.0.0-dev` allowed for local development artifacts
- `SITU_TARGET`: required Bun compile target
- `SITU_PLATFORM`: required platform token used in artifact names

It runs from the repository root, creates `dist/release/`, writes a standard
SHA-256 `checksums.txt`, and exits non-zero on failure.

`install.sh` installs a released archive into a local bin directory.

It reads:

- `SITU_VERSION`: artifact version to install; `vX.Y.Z` for releases, with
  `0.0.0-dev` allowed for local artifact installs
- `SITU_RELEASE_TARBALL`: optional local archive path
- `SITU_RELEASE_REPO`: optional GitHub `owner/repo` for downloads
- `SITU_BIN_DIR`: optional destination directory, defaulting to
  `$HOME/.local/bin`
- `SITU_INSTALL_HOME`: optional temporary install directory

If `SITU_RELEASE_TARBALL` is set, the installer uses that local archive. If it
is not set, the installer downloads the archive for the current platform from
the GitHub release. The installer overwrites the destination `situ` executable
atomically where practical.

Scripts should be plain POSIX-oriented shell where practical. They should fail
fast, print useful errors, and avoid hidden network calls except where the
script's purpose is downloading a release artifact.

## CLI Artifact Contract

The installable artifact exposes the base CLI commands:

```text
situ --version
situ doctor
```

Archive layout:

```text
situ
README.md
```

The `situ` file must be executable.

Base CLI behavior:

- `situ --version` prints exactly the build version and exits `0`
- `situ doctor` prints a short success message and exits `0`
- unknown commands print an error to stderr and exit non-zero
- `doctor` must not require model-provider credentials or a git repository

## Versioning

Release versions come from strict git tags shaped like `vX.Y.Z`, where `X`,
`Y`, and `Z` are one or more decimal digits.

Artifacts and `situ --version` use the tag string with the leading `v`. Local
dev builds may report `0.0.0-dev`; release workflow dispatch and tag builds
still require `vX.Y.Z`.

## Consequences

CI and release scripts should stay thin over the root mise/Bun command surface.

The workflows must not require model-provider keys or agent runtime secrets.

Release automation should verify each archive on the runner that builds it by
installing it and running `situ --version` and `situ doctor`.
