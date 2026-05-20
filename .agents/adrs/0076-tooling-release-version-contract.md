---
status: active
category: tooling
created: 2026-05-14
---

# 0076. Tooling: Release Version Contract

## Context

ADR 0007 defines the GitHub release path. ADR 0067 tightens manual release
dispatch so release artifacts are built from an explicit `vX.Y.Z` tag.

The workflow and shell scripts must agree on what a release version is. A
workflow that rejects malformed tags is not enough if the scripts accept looser
values such as `v1x.2.3`, `v1.2.3-beta`, or `refs/tags/v1.2.3`.

The release contract describes the real base CLI surface. It should not treat
`--version` or `doctor` as temporary behavior.

## Decision

Release versions are strict semantic release tags shaped:

```text
vX.Y.Z
```

where `X`, `Y`, and `Z` are one or more decimal digits.

The release workflow, release build script, and installer must all reject:

- empty values
- values with prefixes such as `refs/tags/v1.2.3`
- prerelease or build metadata such as `v1.2.3-beta` or `v1.2.3+build`
- loose shell-glob matches such as `v1x.2.3`
- arbitrary strings

The release build script and installer may also accept:

```text
0.0.0-dev
```

for local development artifacts. GitHub release workflow dispatch and tag
builds must still require `vX.Y.Z`.

Use one shared validation shape in shell scripts:

```text
^v[0-9]+[.][0-9]+[.][0-9]+$
```

Do not use shell globs for release version validation.

## CLI Artifact Contract

The release artifact exposes the real base CLI commands:

```text
situ --version
situ doctor
```

Expected behavior:

- `situ --version` prints exactly the build version and exits `0`
- `situ doctor` prints a short success message and exits `0`
- unknown commands print an error to stderr and exit nonzero
- `doctor` must not require model-provider credentials or a git repository

Do not describe these commands as placeholders in active target-state ADRs.

## Script Tests

Add lightweight tests for release-script version validation. The tests should
exercise validation before any expensive build, install, download, or network
operation.

At minimum, tests should cover both scripts rejecting:

- `v1x.2.3`
- `v1.2.3-beta`
- `refs/tags/v1.2.3`

Tests should also prove that strict release versions and `0.0.0-dev` pass the
version-validation phase. They may do this by supplying intentionally invalid
later inputs and asserting the error moves past version validation.

If the tests live outside `projects/**`, update tooling configuration so the
root `mise run check` gate includes them in test discovery, typechecking, and
unused-code analysis.

## Boundaries

This ADR does not change release platform tokens.

This ADR does not change archive layout.

This ADR does not add prerelease support.

This ADR does not change GitHub workflow triggers.

This ADR does not add model-provider credentials, agent runtime secrets,
scheduler behavior, or app runtime behavior to release automation.

## Required Checks

Implementation should run:

```text
bun test <release-script-test-file>
mise run check
git diff --check
```

If release script tests are not TypeScript tests, replace the first command
with the script-specific test command.

## Consequences

The release path has one version contract. Agents can read the ADRs, workflow,
scripts, and tests and arrive at the same rule without relying on shell-glob
edge cases.
