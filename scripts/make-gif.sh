#!/usr/bin/env bash
# Turn a screen recording into <mod>/docs/demo.gif (MOD=side-ask by default).
# usage: scripts/make-gif.sh <recording.mov> [cuts] [crop w:h:x:y]
#   cuts: the seconds to keep, e.g. "0.5-13.5,17.5-29.5,34-37.5" (default: all of it)
# env:   MOD=side-ask FPS=15 WIDTH=900 SPEED=1.25 HOLD=1.5 MAX_MB=5
set -euo pipefail

in=${1:?usage: scripts/make-gif.sh <recording.mov> [cuts] [crop w:h:x:y]}
cuts=${2:-} crop=${3:-}
FPS=${FPS:-15} WIDTH=${WIDTH:-900} SPEED=${SPEED:-1.25} HOLD=${HOLD:-1.5} MAX_MB=${MAX_MB:-5}
docs="$(cd "$(dirname "$0")/.." && pwd)/${MOD:-side-ask}/docs"; mkdir -p "$docs"

for t in ffmpeg gifski; do command -v "$t" >/dev/null || brew install "$t"; done
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Screen recordings are variable-rate: fix the rate first, so the kept frames can be renumbered evenly.
keep=1
if [[ -n $cuts ]]; then
  keep=$(tr ',' '\n' <<<"$cuts" | awk -F- '{printf "%sbetween(t,%s,%s)", (NR>1 ? "+" : ""), $1, $2}')
fi
# keep the cuts → crop → speed up → hold the last frame → scale
vf="fps=$(awk "BEGIN{print $FPS / $SPEED}"),select='$keep',setpts=N/($FPS*TB),${crop:+crop=$crop,}tpad=stop_mode=clone:stop_duration=$HOLD,scale=$WIDTH:-1:flags=lanczos"
ffmpeg -loglevel error -i "$in" -vf "$vf" -fps_mode cfr -r "$FPS" "$tmp/f%04d.png"
frames=("$tmp"/f*.png)

# The highest quality that fits the budget: GitHub inlines up to ~10MB, and 5MB loads fast.
for q in 100 90 80 70 60; do
  gifski --quiet --fps "$FPS" --quality "$q" --width "$WIDTH" -o "$docs/demo.gif" "${frames[@]}"
  bytes=$(stat -f%z "$docs/demo.gif")
  (( bytes < MAX_MB * 1048576 )) && break
done

echo "demo.gif: $(( bytes / 1024 ))KB · quality $q · ${#frames[@]} frames"
