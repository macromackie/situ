#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)

. "$repo_root/config/scripts/release_version.sh"

require_env() {
  name=$1
  value=$(eval "printf '%s' \"\${$name:-}\"")

  if [ -z "$value" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

require_env SITU_VERSION
situ_require_artifact_version "$SITU_VERSION"
require_env SITU_TARGET
require_env SITU_PLATFORM

case "$SITU_PLATFORM:$SITU_TARGET" in
  darwin-arm64:bun-darwin-arm64 | linux-x64:bun-linux-x64 | linux-arm64:bun-linux-arm64)
    ;;
  *)
    echo "Unsupported platform/target pair: $SITU_PLATFORM $SITU_TARGET" >&2
    exit 1
    ;;
esac

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1"
    return
  fi

  echo "Need sha256sum or shasum to write checksums" >&2
  exit 1
}

release_dir="$repo_root/dist/release"
work_dir="$repo_root/dist/build/$SITU_PLATFORM"
archive_name="situ-$SITU_VERSION-$SITU_PLATFORM.tar.gz"
archive_path="$release_dir/$archive_name"
entry_file="$work_dir/situ-entry.ts"
binary_path="$work_dir/bin/situ"
git_sha=$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || printf '%s' "unknown")
build_date=$(date -u +%Y-%m-%dT%H:%M:%SZ)

rm -rf "$work_dir"
mkdir -p "$release_dir" "$work_dir/bin"

cat > "$entry_file" <<EOF
import { mainSituCli } from "../../../projects/app/src/cli/situ.ts";

process.exitCode = await mainSituCli({
  args: process.argv.slice(2),
  version: "$SITU_VERSION",
});
EOF

cd "$repo_root"
bun build \
  --compile \
  --target="$SITU_TARGET" \
  --no-compile-autoload-dotenv \
  --no-compile-autoload-bunfig \
  --outfile "$binary_path" \
  "$entry_file"

chmod 755 "$binary_path"
cp README.md "$work_dir/README.md"

# Pre-build the browser client app. The compiled CLI cannot invoke Vite from
# its embedded source filesystem, so `situ serve` ships this directory and
# serves it from disk. Keep the install path in sync with src/http/client-assets.ts.
mkdir -p "$work_dir/assets"
(cd "$repo_root/projects/app" && bun run client:build)
rm -rf "$work_dir/assets/client"
cp -R "$repo_root/projects/app/dist/client" "$work_dir/assets/client"

cat > "$work_dir/MANIFEST" <<EOF
situ-version: $SITU_VERSION
situ-platform: $SITU_PLATFORM
situ-target: $SITU_TARGET
situ-git-sha: $git_sha
situ-build-date: $build_date
situ-archive: $archive_name
EOF

tar -czf "$archive_path" -C "$work_dir" bin assets README.md MANIFEST

cd "$release_dir"
sha256_file "$archive_name" > checksums.txt

printf 'Built %s\n' "$archive_path"
printf 'Wrote %s\n' "$release_dir/checksums.txt"
