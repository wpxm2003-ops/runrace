#!/usr/bin/env bash
set -euo pipefail

dem_dir="${1:-/home/ec2-user/runrace-dem}"
base_url="https://s3.amazonaws.com/elevation-tiles-prod/skadi"
expected_bytes=25934402
archive=""
expanded=""

cleanup() {
  [[ -z "$archive" ]] || rm -f "$archive"
  [[ -z "$expanded" ]] || rm -f "$expanded"
}
trap cleanup EXIT

mkdir -p "$dem_dir"

for lat in 33 34 35 36 37 38; do
  lat_band=$(printf 'N%02d' "$lat")
  for lng in 124 125 126 127 128 129 130 131; do
    tile=$(printf 'N%02dE%03d' "$lat" "$lng")
    target="$dem_dir/$tile.hgt"

    if [[ -f "$target" ]] && [[ $(stat -c '%s' "$target") -eq $expected_bytes ]]; then
      continue
    fi

    archive=$(mktemp "$dem_dir/.${tile}.XXXXXX.hgt.gz")
    expanded="$dem_dir/.${tile}.hgt.tmp"
    rm -f "$expanded"

    echo "Downloading $tile"
    curl -fsSL --retry 5 --retry-delay 2 \
      "$base_url/$lat_band/$tile.hgt.gz" \
      -o "$archive"
    gzip -dc "$archive" > "$expanded"
    rm -f "$archive"
    archive=""

    actual_bytes=$(stat -c '%s' "$expanded")
    if [[ $actual_bytes -ne $expected_bytes ]]; then
      rm -f "$expanded"
      echo "Invalid tile size for $tile: $actual_bytes" >&2
      exit 1
    fi

    mv -f "$expanded" "$target"
    expanded=""
  done
done

tile_count=$(find "$dem_dir" -maxdepth 1 -type f -name '*.hgt' | wc -l)
echo "DEM ready: $tile_count tiles in $dem_dir"
