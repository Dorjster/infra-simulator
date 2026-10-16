#!/bin/zsh
# sbs.sh <weapon> <out png> <title> <clip:video:start ...>: video frame | in-game capture per captured time, one sheet.
S=/private/tmp/claude-501/-Users-dorjoht-Downloads-infra-lan-v31--2-/01f218aa-d861-4cab-acbd-07e6de584534/scratchpad; w=$1; OUT=$2; TITLE=$3; shift 3; D=$S/clips/$w; items=()
for spec in "$@"; do clip=${spec%%:*}; rest=${spec#*:}; V=${rest%%:*}; st=${rest#*:}
  [ $V = A ] && VF=~/Downloads/"All NEW CS2 Weapon Animations - July 2025 update - RobuLuS (1080p, h264).mp4" || VF=~/Downloads/"videoplayback (3).mp4"
  for f in $D/${clip}_*.png(N); do t=${${f:t:r}#${clip}_}; vt=$(python3 -c "print(round($st+$t,2))")
    ffmpeg -v error -y -ss $vt -i "$VF" -frames:v 1 -vf scale=1280:-1 -q:v 3 $D/v_${clip}_$t.jpg
    items+=("$D/v_${clip}_$t.jpg::CS2 video · $clip t=$t s" "$f::ours in game · $clip t=$t s"); done; done
node $S/tools2/sheet.mjs $OUT "$TITLE" 2 "${items[@]}" >/dev/null && echo $OUT
