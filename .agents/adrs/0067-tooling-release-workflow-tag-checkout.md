---
status: active
category: tooling
created: 2026-05-14
---

# 0067. Tooling: Release Workflow Tag Checkout

## Context

ADR 0007 says the release workflow runs on version tags and manual dispatch,
and that manual dispatch must rebuild an explicit version tag.

The version string alone is not enough. A manual dispatch that labels artifacts
as `vX.Y.Z` while building whatever commit the workflow happened to run from
would publish misleading archives.

## Decision

The release workflow must build from the requested release tag commit.

The workflow keeps these triggers:

```yaml
on:
  push:
    tags:
      - "v*.*.*"
  workflow_dispatch:
    inputs:
      tag:
        description: "Release version tag, shaped vX.Y.Z"
        required: true
        type: string
```

Manual dispatch accepts only a bare tag name shaped `vX.Y.Z`, for example
`v1.2.3`. Values such as `refs/tags/v1.2.3`, empty strings, prerelease tags,
build metadata, branch names, and arbitrary refs are invalid.

`X`, `Y`, and `Z` are one or more decimal digits. Leading zeros are accepted for
now because the existing release scripts use the same shell pattern and do not
normalize versions.

For tag-push releases:

```text
github.ref = refs/tags/vX.Y.Z
checkout ref = github.ref
version = github.ref_name
```

For manual dispatch releases:

```text
inputs.tag = vX.Y.Z
checkout ref = inputs.tag
version = inputs.tag
```

The workflow should validate the version tag shape before build commands run.
Checkout may happen after a small ref-resolution step, but build scripts,
dependency installation, checks, archive creation, and install verification
must not run until the version/ref is validated.

The build job must check out the same release ref it uses for:

- `SITU_VERSION`
- release archive names
- install verification
- uploaded artifact names

Do not rely on the workflow dispatch branch, default branch, or current workflow
file ref as the build source when `inputs.tag` is provided.

## Workflow Shape

Keep the existing workflow file:

```text
.github/workflows/situ-release.yml
```

The `build` job should resolve the release version and checkout ref before
checkout, then use `actions/checkout` with that explicit ref.

The resolved checkout ref must not use an expression that can fall back to the
dispatch branch when `inputs.tag` is missing or empty.

Example shape:

```yaml
- name: Resolve release ref
  id: release_ref
  env:
    DISPATCH_TAG: ${{ inputs.tag }}
  run: |
    if [ "$GITHUB_EVENT_NAME" = "workflow_dispatch" ]; then
      version="$DISPATCH_TAG"
      checkout_ref="$DISPATCH_TAG"
    else
      version="$GITHUB_REF_NAME"
      checkout_ref="$GITHUB_REF"
    fi

    if ! printf '%s\n' "$version" | grep -Eq '^v[0-9]+[.][0-9]+[.][0-9]+$'; then
      echo "Release version must be shaped vX.Y.Z, got: $version" >&2
      exit 1
    fi

    echo "version=$version" >> "$GITHUB_OUTPUT"
    echo "checkout_ref=$checkout_ref" >> "$GITHUB_OUTPUT"

- name: Check out repository
  uses: actions/checkout@v4
  with:
    ref: ${{ steps.release_ref.outputs.checkout_ref }}
```

The build job may combine the current version-resolution step with the new
ref-resolution step. The important contract is that all build, check, and
install-verification steps use the checked-out tag workspace and the same
`version` output.

The `publish` job does not build code, so it does not need to check out the
release ref for this ADR. It still independently resolves and validates the
same version string from the event/input, then publishes the artifacts produced
by the build job.

## Boundaries

Do not change release artifact platform tokens.

Do not change release archive layout.

Do not change install script behavior.

Do not change the release trigger set.

Do not add model-provider credentials, agent runtime secrets, scheduler
behavior, or app runtime behavior to release automation.

Do not add a new release workflow file.

## Required Checks

Implementation should run:

```text
mise run check
git diff --check
```

If a lightweight workflow syntax check is already available locally, run it.
Do not require network access or GitHub-hosted runners to validate this ADR.

## Consequences

Manual release dispatch rebuilds the exact tag it claims to release. The
archive version, GitHub release tag, and source commit stay aligned.
