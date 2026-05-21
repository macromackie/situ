#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || pwd)

if [ -f "$script_dir/release_version.sh" ]; then
  . "$script_dir/release_version.sh"
else
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
fi

err() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '==> %s\n' "$*"
}

if [ "$#" -gt 1 ]; then
  err "install.sh accepts at most one version argument"
fi

if [ "${SITU_VERSION+x}" = "x" ]; then
  if [ -z "$SITU_VERSION" ]; then
    echo "Missing required environment variable: SITU_VERSION" >&2
    exit 1
  fi
  version_target=$SITU_VERSION
elif [ "$#" -gt 0 ]; then
  version_target=$1
else
  version_target=latest
fi

release_repo=${SITU_RELEASE_REPO:-macromackie/situ}

detect_platform() {
  os=$(uname -s)
  arch=$(uname -m)

  case "$os:$arch" in
    Linux:x86_64 | Linux:amd64)
      printf '%s\n' "linux-x64"
      ;;
    Linux:aarch64 | Linux:arm64)
      printf '%s\n' "linux-arm64"
      ;;
    Darwin:arm64 | Darwin:aarch64)
      printf '%s\n' "darwin-arm64"
      ;;
    *)
      err "unsupported install platform: $os $arch"
      ;;
  esac
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{ print $1 }'
    return
  fi

  err "Need sha256sum or shasum to verify release archives"
}

resolve_gh_token() {
  if [ -n "${GH_TOKEN:-}" ]; then
    printf '%s' "$GH_TOKEN"
    return 0
  fi

  if [ -n "${GITHUB_TOKEN:-}" ]; then
    printf '%s' "$GITHUB_TOKEN"
    return 0
  fi

  if command -v gh >/dev/null 2>&1; then
    gh auth token 2>/dev/null || true
  fi

  return 0
}

gh_auth_token=

download_asset() {
  url=$1
  output_path=$2

  if [ -n "$gh_auth_token" ]; then
    curl -fsSL \
      -H "Authorization: Bearer $gh_auth_token" \
      -H "Accept: application/octet-stream" \
      "$url" -o "$output_path"
    return
  fi

  curl -fsSL "$url" -o "$output_path"
}

resolve_latest_tag() {
  if command -v gh >/dev/null 2>&1; then
    tag=$(gh release view --repo "$release_repo" --json tagName --jq .tagName 2>/dev/null || true)
    if [ -n "$tag" ]; then
      printf '%s\n' "$tag"
      return
    fi
  fi

  latest_url="https://github.com/$release_repo/releases/latest"
  if [ -n "$gh_auth_token" ]; then
    effective_url=$(curl -fsSLI \
      -H "Authorization: Bearer $gh_auth_token" \
      -o /dev/null \
      -w '%{url_effective}' \
      "$latest_url") || err "failed to resolve latest release for $release_repo"
  else
    effective_url=$(curl -fsSLI \
      -o /dev/null \
      -w '%{url_effective}' \
      "$latest_url") || err "failed to resolve latest release for $release_repo"
  fi

  basename "$effective_url"
}

download_release_assets() {
  tag=$1
  tarball_name=$2

  if command -v gh >/dev/null 2>&1; then
    if gh release download "$tag" \
      --repo "$release_repo" \
      --pattern "$tarball_name" \
      --pattern checksums.txt \
      --dir "$tmp_dir" \
      --clobber >/dev/null 2>&1; then
      return
    fi
  fi

  release_base="https://github.com/$release_repo/releases/download/$tag"
  info "downloading $tarball_name"
  download_asset "$release_base/$tarball_name" "$tmp_dir/$tarball_name" \
    || err "failed to download $tarball_name"

  info "downloading checksums.txt"
  download_asset "$release_base/checksums.txt" "$tmp_dir/checksums.txt" \
    || err "failed to download checksums.txt"
}

if [ -n "${SITU_RELEASE_TARBALL:-}" ] && [ "$version_target" = "latest" ]; then
  err "SITU_RELEASE_TARBALL requires SITU_VERSION or a version argument"
fi

if [ "$version_target" = "latest" ]; then
  if [ -n "${SITU_RELEASE_TARBALL:-}" ]; then
    err "SITU_RELEASE_TARBALL requires an explicit version"
  fi

  info "resolving latest release"
  gh_auth_token=$(resolve_gh_token)
  artifact_version=$(resolve_latest_tag)
  situ_require_artifact_version "$artifact_version"
else
  artifact_version=$version_target
  situ_require_artifact_version "$artifact_version"
fi

if [ -n "${SITU_INSTALL_HOME:-}" ]; then
  install_home=$SITU_INSTALL_HOME
else
  if [ -z "${HOME:-}" ]; then
    err "Set HOME or SITU_INSTALL_HOME"
  fi
  install_home=$HOME/.local/share/situ
fi

if [ -n "${SITU_BIN_DIR:-}" ]; then
  bin_dir=$SITU_BIN_DIR
else
  if [ -z "${HOME:-}" ]; then
    err "Set HOME or SITU_BIN_DIR"
  fi
  bin_dir=$HOME/.local/bin
fi

platform=$(detect_platform)
tarball_name="situ-$artifact_version-$platform.tar.gz"
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/situ-install.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

if [ -n "${SITU_RELEASE_TARBALL:-}" ]; then
  if [ ! -f "$SITU_RELEASE_TARBALL" ]; then
    echo "SITU_RELEASE_TARBALL not found: $SITU_RELEASE_TARBALL" >&2
    exit 1
  fi

  info "using local tarball: $SITU_RELEASE_TARBALL"
  cp "$SITU_RELEASE_TARBALL" "$tmp_dir/$tarball_name"
  printf '%s  %s\n' "$(sha256_of "$tmp_dir/$tarball_name")" "$tarball_name" > "$tmp_dir/checksums.txt"
else
  info "installing $artifact_version from $release_repo"
  gh_auth_token=$(resolve_gh_token)
  download_release_assets "$artifact_version" "$tarball_name"
fi

expected_checksum=$(awk -v name="$tarball_name" '$2 == name || $2 == "*" name { print $1 }' "$tmp_dir/checksums.txt")
if [ -z "$expected_checksum" ]; then
  err "checksum for $tarball_name missing from checksums.txt"
fi

actual_checksum=$(sha256_of "$tmp_dir/$tarball_name")
if [ "$expected_checksum" != "$actual_checksum" ]; then
  err "checksum mismatch for $tarball_name (expected $expected_checksum, got $actual_checksum)"
fi
info "checksum verified"

versions_dir=$install_home/versions
version_dir=$versions_dir/$artifact_version
tmp_version_dir=$versions_dir/.tmp-$artifact_version-$$

rm -rf "$tmp_version_dir"
mkdir -p "$tmp_version_dir"
tar -xzf "$tmp_dir/$tarball_name" -C "$tmp_version_dir"

if [ ! -f "$tmp_version_dir/bin/situ" ]; then
  err "Archive does not contain bin/situ"
fi

chmod 755 "$tmp_version_dir/bin/situ"

rm -rf "$version_dir"
mv "$tmp_version_dir" "$version_dir"

mkdir -p "$install_home" "$bin_dir"
ln -sfn "versions/$artifact_version" "$install_home/current"
ln -sfn "$install_home/current/bin/situ" "$bin_dir/situ"

printf '\nSitu %s installed.\n' "$artifact_version"
printf '  versioned dir: %s\n' "$version_dir"
printf '  launcher:      %s\n' "$bin_dir/situ"

case ":${PATH:-}:" in
  *":$bin_dir:"*)
    ;;
  *)
    printf '\nAdd %s to your PATH, for example:\n' "$bin_dir"
    printf '  export PATH="%s:$PATH"\n' "$bin_dir"
    ;;
esac
