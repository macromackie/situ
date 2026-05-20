#!/bin/sh

situ_release_version_pattern='^v[0-9]+[.][0-9]+[.][0-9]+$'
situ_local_development_version='0.0.0-dev'

situ_is_artifact_version() {
  situ_candidate=${1-}

  if [ "$situ_candidate" = "$situ_local_development_version" ]; then
    return 0
  fi

  awk -v value="$situ_candidate" -v pattern="$situ_release_version_pattern" \
    'BEGIN { exit(value ~ pattern ? 0 : 1) }'
}

situ_require_artifact_version() {
  situ_candidate=${1-}

  if situ_is_artifact_version "$situ_candidate"; then
    return 0
  fi

  echo "SITU_VERSION must be shaped vX.Y.Z or 0.0.0-dev, got: $situ_candidate" >&2
  return 1
}
