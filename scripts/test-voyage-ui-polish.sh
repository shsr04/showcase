#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
page_dir=$(cd "$script_dir/../public/voyage" && pwd)
html="$page_dir/index.html"
renderer="$page_dir/voyage.js"

grep -Fq 'Newsreader' "$html"
grep -Fq 'DM Sans' "$html"
! grep -Fq 'id="place-index"' "$html"
! grep -Fq 'id="place-search"' "$html"
grep -Fq 'controls.zoomSpeed = .68;' "$renderer"
grep -Fq 'controls.minDistance = 1.12;' "$renderer"
grep -Fq 'toVec(point.lat, point.lon, 1.008)' "$renderer"
! grep -Fq 'createElement('\''button'\'')' "$renderer"
grep -Fq 'hitRadius' "$renderer"
grep -Fq 'onError' "$renderer"

printf '%s\n' 'Voyage UI polish regression checks passed.'
