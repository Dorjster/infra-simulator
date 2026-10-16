#!/bin/zsh
# compare.sh <weapon> <anim> <video A|B> <video start s> [times...]: video frame | our render (on grey) for each time, one sheet.
S=/private/tmp/claude-501/-Users-dorjoht-Downloads-infra-lan-v31--2-/01f218aa-d861-4cab-acbd-07e6de584534/scratchpad; P=$S/fpanim/prev; C=$S/fpanim/cmp; mkdir -p $C
w=$1; an=$2; V=$3; st=$4; shift 4
[ $V = A ] && VF=~/Downloads/"All NEW CS2 Weapon Animations - July 2025 update - RobuLuS (1080p, h264).mp4" || VF=~/Downloads/"videoplayback (3).mp4"
items=()
for t in "$@"; do tt=$(printf "%.2f" $t); vt=$(python3 -c "print($st+$t)")
  ffmpeg -v error -y -ss $vt -i "$VF" -frames:v 1 -vf scale=960:-1 -q:v 3 $C/${w}_${an}_${tt}_v.jpg
  ffmpeg -v error -y -f lavfi -i color=c=0x8a9099:s=960x540 -i $P/${w}_${an}_${tt}.png -filter_complex "[1]format=rgba[o];[0][o]overlay=0:0:format=auto" -frames:v 1 -q:v 3 $C/${w}_${an}_${tt}_r.jpg
  ffmpeg -v error -y -i $C/${w}_${an}_${tt}_v.jpg -i $P/${w}_${an}_${tt}.png -filter_complex "[1]format=rgba,colorchannelmixer=aa=0.55[o];[0][o]overlay=0:0:format=auto" -q:v 3 $C/${w}_${an}_${tt}_o.jpg
  items+=("$C/${w}_${an}_${tt}_v.jpg::video $V $vt s (t=$tt)" "$C/${w}_${an}_${tt}_r.jpg::ours t=$tt" "$C/${w}_${an}_${tt}_o.jpg::overlay")
done
node $S/tools2/sheet.mjs $C/${w}_${an}.png "$w · $an · video vs ours" 3 "${items[@]}" >/dev/null && echo $C/${w}_${an}.png
