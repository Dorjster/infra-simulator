// CS2's clip sounds (fp-sounds.js): each event at its moment in the clip, moved with the clip when it is played longer
// (a reload stretched to the gun's time); cut off when the clip is (a reload broken off); a new clip replaces the old.
// And the room's table (when CS2's assets are imported on this computer): every gun has its reload sounds in order.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createClipChannel, setClipSounds } from '../dist/fp-sounds.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
setClipSounds({ ak: { reload: { dur: 2.4, ev: [[.4, ['out'], 1, 1, 0], [1.1, ['in'], 1, 1, 0], [1.6, ['bolt'], 1, 1, 0]] }, draw: { dur: .5, ev: [[0, ['draw'], 1, 1, 0]] } } });
const heard = [], ch = createClipChannel(e => heard.push(e[1][0]));
ok('a clip with sounds starts', ch.start('ak', 'reload', 2400, 0)); ok('no table entry: nothing', !createClipChannel().start('ak', 'inspect', 0, 0));
ch.step(399); ok('nothing before its first moment', heard.length === 0); ch.step(400); ok('the magazine comes out at 0.4 s', heard.join() === 'out');
ch.step(1599); ok('the magazine goes in at 1.1 s', heard.join() === 'out,in'); ch.step(2000); ok('the bolt at 1.6 s, each once', heard.join() === 'out,in,bolt');
ok('the clip done, the channel is free', !ch.playing);
heard.length = 0; ch.start('ak', 'reload', 4800, 0); ch.step(790); ok('played twice as long, its sounds come twice as late', heard.length === 0); ch.step(810); ok('…the magazine out at 0.8 s', heard.join() === 'out');
ch.stop(); ch.step(5000); ok('cut off (a reload broken off): the rest stays quiet', heard.join() === 'out');
heard.length = 0; ch.start('ak', 'reload', 2400, 0); ch.step(500); ch.start('ak', 'draw', 500, 600); ch.step(700); ch.step(3000); ok('a new clip replaces the old one', heard.join() === 'out,draw');
const man = new URL('../user-assets/manifest.json', import.meta.url);
if (existsSync(man)) { const F = JSON.parse(readFileSync(man)).models?.fpSounds;
  if (F) { const guns = ['pistol', 'usps', 'deagle', 'mp9', 'ak', 'm4', 'm4s', 'sniper', 'ssg08', 'famas', 'galil', 'negev'];
    for (const g of guns) { const ev = F[g]?.reload?.ev || []; ok(`${g}: CS2's reload has its sounds, in time order, within the clip`, ev.length >= 2 && ev.every((e, i) => e[0] >= 0 && e[0] <= F[g].reload.dur + .01 && (!i || e[0] >= ev[i - 1][0])) && ev.every(e => e[1].length), JSON.stringify(ev).slice(0, 120)); }
    ok('the AK: magazine out before magazine in before the bolt', (() => { const e = F.ak.reload.ev, at = re => e.find(x => re.test(x[1][0]))?.[0]; return at(/clipout/) < at(/addammo|clipin/) && at(/addammo|clipin/) < at(/bolt/); })()); } }
console.log(`PASS: CS2 clip sounds · ${n} checks (moments, stretched with the clip, cut off, replaced; every gun's reload)`);
