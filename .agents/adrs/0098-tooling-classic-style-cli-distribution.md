---
status: active
category: tooling
created: 2026-05-16
---

# 0098. Tooling: Classic-Style CLI Distribution

## Context

The previous Situ implementation distributed the CLI through GitHub Releases.
The installer could be run from a checked-out repository, piped from GitHub
through `curl` or `gh api`, or pointed at a local release tarball for smoke
tests. It installed into a versioned directory under the user's local install
home and placed a stable `situ` launcher in the user's local bin directory.

ADR 0007, ADR 0067, and ADR 0076 define the current release workflow, strict tag
checkout, and version validation contract. This ADR narrows the installer and
post-publish verification shape so the new repository is installable in the
same GitHub-distributed way while keeping the current CLI surface.

## Decision

Situ releases are installed through `config/scripts/install.sh`.

The installer supports these invocation forms:

```text
config/scripts/install.sh
config/scripts/install.sh vX.Y.Z
curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/config/scripts/install.sh | sh
curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/config/scripts/install.sh | sh -s -- vX.Y.Z
gh api -H "Accept: application/vnd.github.raw" \
  repos/<owner>/<repo>/contents/config/scripts/install.sh | sh -s -- vX.Y.Z
```

The version target comes from `SITU_VERSION` when set, then the first positional
argument, then `latest`. Explicit versions must be strict `vX.Y.Z`; local
artifact smoke tests may use `0.0.0-dev`. `SITU_RELEASE_TARBALL` requires an
explicit non-`latest` version target.

`SITU_RELEASE_REPO` defaults to `macromackie/situ`.

The installer detects the current platform token using the same release tokens
as ADR 0007:

```text
darwin-arm64
linux-x64
linux-arm64
```

For GitHub installs, the installer downloads both the platform tarball and
`checksums.txt` for the selected release. It prefers `gh release download` when
`gh` is available, then falls back to direct GitHub release URLs through `curl`.
When direct `curl` download is used, `GH_TOKEN` or `GITHUB_TOKEN` is included as
a bearer token if available so private repository installs work.

The installer verifies the tarball SHA-256 against `checksums.txt` before
extracting.

## Archive And Install Layout

Release archives contain:

```text
bin/situ
assets/app.js
README.md
MANIFEST
```

`bin/situ` is the single Bun-compiled CLI executable and must be executable.

`assets/app.js` is the pre-built live UI browser bundle. A compiled standalone
binary cannot run `Bun.build` at request time because its source lives in an
embedded virtual filesystem, so `situ serve` serves this file from
`$SITU_INSTALL_HOME/versions/<version>/assets/app.js`.

The installer extracts each version to:

```text
$SITU_INSTALL_HOME/versions/<version>/
```

`SITU_INSTALL_HOME` defaults to `$HOME/.local/share/situ`.

After extraction, the installer atomically updates:

```text
$SITU_INSTALL_HOME/current -> versions/<version>
$SITU_BIN_DIR/situ -> $SITU_INSTALL_HOME/current/bin/situ
```

`SITU_BIN_DIR` defaults to `$HOME/.local/bin`.

Local archive installs use the same versioned layout. They may synthesize a
temporary checksum file from the local archive because the goal is installer
smoke testing, not proving a local file came from GitHub.

## Workflow Verification

`.github/workflows/situ-release.yml` keeps the tag and manual-dispatch contract
from ADR 0067.

The build matrix still smoke-tests each locally built archive before upload by
installing the local tarball and running:

```text
situ --version
situ doctor
```

It also starts `situ serve` and confirms `GET /assets/app.js` returns 200, so a
missing or broken live UI bundle fails the build before anything is published.

After publishing the GitHub Release, the workflow also verifies installation
from the published release on each platform by fetching `install.sh` through
GitHub, installing the release tag, and running the same CLI smoke checks. This
post-publish job must install from the GitHub release assets, not from the build
workspace tarball.

## Boundaries

This ADR does not add a `situ self-update` command; ADR 0105 adds it later and
reuses this installer as the update mechanism. The current active CLI surface
otherwise remains the source of truth for product commands.

This ADR does not add npm publishing, Homebrew formulas, shell completions,
Windows builds, prerelease tag support, hosted update services, or model
provider credentials.

This ADR does not change the version tag validation rule from ADR 0076.

## Required Checks

Implementation should run:

```text
bun test scripts/release_scripts.test.ts
SITU_VERSION=0.0.0-dev SITU_PLATFORM=darwin-arm64 SITU_TARGET=bun-darwin-arm64 config/scripts/build_release_assets.sh
SITU_VERSION=0.0.0-dev SITU_RELEASE_TARBALL=<built-tarball> SITU_BIN_DIR=<temp-bin> SITU_INSTALL_HOME=<temp-install> config/scripts/install.sh
<temp-bin>/situ --version
<temp-bin>/situ doctor
bun scripts/check_adrs.ts
mise run check
git diff --check
```

Run the platform-specific build command with the host platform's token and Bun
compile target when not on Darwin arm64.

## Consequences

The release path remains GitHub Actions plus shell scripts, but the public
installer now behaves like the classic repository's distribution path: curlable,
usable with `gh api`, checksum-verifying, versioned on disk, and verified after
the GitHub release is published.
