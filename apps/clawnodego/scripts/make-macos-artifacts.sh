#!/usr/bin/env bash
set -euo pipefail

arch="${1:-}"
if [[ "$arch" != "arm64" && "$arch" != "x64" ]]; then
    printf 'Usage: %s <arm64|x64>\n' "$0" >&2
    exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$(cd "$script_dir/.." && pwd)"
app_name="ClawNodeGo"
version="$(bun -e "const pkg = require('$app_dir/package.json'); console.log(pkg.version)")"
package_dir="$app_dir/out/${app_name}-darwin-${arch}"
app_path="$package_dir/${app_name}.app"
make_dir="$app_dir/out/make/darwin/${arch}"
dmg_path="$make_dir/${app_name}-${version}-${arch}.dmg"
zip_path="$make_dir/${app_name}-${version}-${arch}.app.zip"

if [[ ! -d "$app_path" ]]; then
    printf 'Missing packaged app: %s\n' "$app_path" >&2
    exit 1
fi

rm -rf "$make_dir"
mkdir -p "$make_dir"

staging_dir="$(mktemp -d)"
cleanup() {
    rm -rf "$staging_dir"
}
trap cleanup EXIT

ditto "$app_path" "$staging_dir/${app_name}.app"
ln -s /Applications "$staging_dir/Applications"

hdiutil create \
    -volname "$app_name" \
    -srcfolder "$staging_dir" \
    -ov \
    -format UDZO \
    "$dmg_path"

ditto -c -k --sequesterRsrc --keepParent "$app_path" "$zip_path"

printf 'Created %s\n' "$dmg_path"
printf 'Created %s\n' "$zip_path"
