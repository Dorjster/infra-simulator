// v53 LOOK · the two Desktop pictures from gd-look-shots.mjs and gd-emblem-hud-shots.mjs output (no game is run here):
//   look    every map's two views on High and on Low, with the measured exposure / bloom, Dust II beside the user's
//           CS2 picture (scratchpad v53/ref/cs2-hud.png)
//   emblem  1:1 bottom-centre crops at 1, 3 and 5 kills (1920 × 1080) beside the user's two CS2 kill-tally pictures
//           brought to the same scale (their badge measured: 3-kill picture ring 242.5 px tall, ace 80 px → 64 px), and
//           the whole HUD at 1920 × 1080 beside cs2-hud.png scaled to 1920 × 1080
//   node tests/browser/gd-look-sheet.mjs <repo> <out> <look-dir> <emblem-dir> <look.jpg> <emblem.jpg>
import { chromium } from 'playwright-core'; import { readFileSync, existsSync } from 'node:fs';
const [, out, lookDir, emDir, lookJpg, emJpg] = process.argv.slice(2);
const REF = '/private/tmp/claude-501/-Users-dorjoht-Downloads-infra-lan-v31--2-/e36c7b43-670b-481d-8e6b-7efd02f58f36/scratchpad/v53/ref';
import { execFileSync } from 'node:child_process'; import os from 'node:os'; import path from 'node:path';
// a picture as a data URL; a big one (the 2940 × 1912 game pictures) first scaled to `w` px wide as a JPEG (ffmpeg)
const img = (f, w = 0) => { if (!existsSync(f)) return ''; if (w) { const t = path.join(os.tmpdir(), 'gdls-' + path.basename(f) + '-' + w + '.jpg'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', 'scale=' + w + ':-1', '-q:v', '3', t]); f = t; }
  return 'data:image/' + (f.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + readFileSync(f).toString('base64'); };
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--mute-audio'] });
const CSS = '<style>body{margin:0;padding:16px 20px;background:#14171b;color:#e8ecef;font:14px system-ui}h1{font-size:22px;margin:0 0 6px}h2{font-size:15px;margin:14px 0 6px;color:#9fd2ff}.r{display:flex;gap:6px;align-items:flex-start}figure{margin:0}figure img{display:block;border:1px solid #333}figcaption{font:12px ui-monospace,Menlo,monospace;color:#aab;margin-top:2px;max-width:470px}p{color:#aab;margin:2px 0 8px;max-width:1900px}</style>';
if (lookDir && lookJpg) {
  const rep = existsSync(lookDir + '/report.json') ? JSON.parse(readFileSync(lookDir + '/report.json', 'utf8')) : {};
  const cap = (pr, m, v) => { const r = rep[pr + '-' + m]?.['v' + v]; if (!r) return pr + ' · view ' + v; return `${pr} · view ${v} · exposure ${r.E?.[0] ?? '–'} (range ${r.look.lo}…${r.look.hi}) · frame L ${r.E?.[2] ?? '–'} · bloom ${r.bloom?.on ? (r.look.bloom.screen ? 'SCREEN ' : 'ADD ') + r.bloom.strength : 'off'}${r.passes.some(x => x.startsWith('SSAO')) ? ' · SSAO' : ''}`; };
  let h = `<h1>Global Defensive v53 LOOK · the CS2 maps from CS2's own data (1470×956 at 2×)</h1><p>CS2's auto exposure inside each map's post_processing_volume range (each map's key: the brightness our game shows at CS2's footage exposure in its spawn views — gd-exposure.js EXPOSURE_KEY_FIT), the map's .vpost bloom on Medium+ (off on Low), SSAO on High. Each map: High view 1, High view 2 (turned 180°, 3 s to adapt), Low view 1, Low view 2.</p>`;
  h += `<h2>Dust II, High · beside the user's CS2 picture</h2><div class="r"><figure><img src="${img(lookDir + '/High-dust2-1.png', 940)}" style="width:940px"><figcaption>ours · ${cap('High', 'dust2', 1)}</figcaption></figure><figure><img src="${img(REF + '/cs2-hud.png')}" style="width:940px"><figcaption>CS2 (cs2-hud.png)</figcaption></figure></div>`;
  for (const m of ['dust2', 'mirage', 'inferno', 'nuke', 'anubis', 'ancient', 'overpass']) { h += `<h2>${m}</h2><div class="r">`; for (const [pr, v] of [['High', 1], ['High', 2], ['Low', 1], ['Low', 2]]) h += `<figure><img src="${img(`${lookDir}/${pr}-${m}-${v}.png`, 466)}" style="width:466px"><figcaption>${cap(pr, m, v)}</figcaption></figure>`; h += '</div>'; }
  const s = await b.newPage({ viewport: { width: 1920, height: 1000 } }); await s.setContent(CSS + h); await s.waitForTimeout(500); await s.screenshot({ path: lookJpg, type: 'jpeg', quality: 86, fullPage: true }); await s.close(); console.log('look sheet:', lookJpg);
}
if (emDir && emJpg) {
  const rep = existsSync(emDir + '/report.json') ? JSON.parse(readFileSync(emDir + '/report.json', 'utf8')) : {};
  // (v53 LOOK review fix: the numbers MEASURED from pixels at 3× — gd-emblem-hud-shots.mjs measured1 / measured3 — where there are any)
  const g = k => { const m = rep['measured' + k.slice(1)]; return m ? `measured (pixels): card ${m.h.toFixed(3)} badge tall · top ${m.top.toFixed(3)} above the badge · fan ${m.fan.toFixed(3)} badges wide` : rep[k] ? `layout: top ${rep[k].top?.toFixed(3)} above the badge · fan ${rep[k].fan?.toFixed(3)} badges wide` : ''; };
  // the CS2 pictures at 1080 p's scale: the 3-kill one 617×480 with a 268 × 242.5 px ring (1.105× wide) → 64 px; the ace 161×158, ring 80 px
  const k3w = Math.round(617 * 64 / 268), k3h = Math.round(480 * 64 / 242.5), acw = Math.round(161 * 64 / 80), ach = Math.round(158 * 64 / 80), Z = 2;
  let h = `<h1>Global Defensive v53 LOOK · the kill-card fan at 1920 × 1080, 1:1 (shown ×${Z}), beside CS2's</h1><p>Our crops are from a real Dust II match (High) at 1920 × 1080, device scale 1: the tally module over the real frame, CS2's imported cards ${rep.art?.cs2Art ? 'in use' : 'NOT imported here (our drawing)'}. CS2's pictures brought to the same badge size (64 px) — the 3-kill one un-stretched (it is 1.105× wide).</p><div class="r">`;
  for (const n of [1, 3, 5]) h += `<figure><img src="${img(emDir + '/kills-' + n + '.png')}" style="width:${300 * Z}px;image-rendering:pixelated"><figcaption>ours · ${n} kill${n > 1 ? 's' : ''} · ${g('k' + n)}</figcaption></figure>`;
  h += `</div><div class="r" style="margin-top:8px"><figure><img src="${img(REF + '/cs2-kill-emblem.png')}" style="width:${k3w * Z}px;height:${k3h * Z}px"><figcaption>CS2 · 3 kills (cs2-kill-emblem.png, same scale)</figcaption></figure><figure><img src="${img(REF + '/cs2-kill-emblem-ace.png')}" style="width:${acw * Z}px;height:${ach * Z}px"><figcaption>CS2 · ace (cs2-kill-emblem-ace.png, same scale)</figcaption></figure></div>`;
  h += `<h2>The HUD at 1920 × 1080 · ours (left) and CS2's (right, cs2-hud.png 739×415 scaled to 1920×1080)</h2><div class="r"><figure><img src="${img(emDir + '/hud.png', 940)}" style="width:940px"><figcaption>ours · health / ammo in cl_hud_color (default Team Color), money white</figcaption></figure><figure><img src="${img(REF + '/cs2-hud.png')}" style="width:940px"><figcaption>CS2</figcaption></figure></div>`;
  const s = await b.newPage({ viewport: { width: 1920, height: 1000 } }); await s.setContent(CSS + h); await s.waitForTimeout(500); await s.screenshot({ path: emJpg, type: 'jpeg', quality: 88, fullPage: true }); await s.close(); console.log('emblem sheet:', emJpg);
}
await b.close();
