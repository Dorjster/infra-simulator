// The play space from a CS2 radar (tools/maps/radar-mask.mjs): a picture see-through outside the map, placed by its
// overview (pos_x, pos_y: the top-left corner in Hammer units; scale: units a pixel). Here a made-up radar, 200 × 200
// pixels at 10 units a pixel from (−1000, 1000), drawn only in its middle 40 × 40 pixels (Hammer −200…200 each way):
// in play there and up to the margin past it, not further; Nuke's second (lower level) picture counts as well.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'; import { execFileSync } from 'node:child_process'; import os from 'node:os'; import path from 'node:path';
import { radarMask } from '../tools/maps/radar-mask.mjs';
let pass = 0, fail = 0; const check = (name, c, d = '') => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + d : '')); };
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { console.log('SKIP: radar mask (no ffmpeg)'); process.exit(0); }
const dir = mkdtempSync(path.join(os.tmpdir(), 'radar-')), pics = path.join(dir, 'panorama', 'images', 'overheadmaps'); mkdirSync(pics, { recursive: true }); mkdirSync(path.join(dir, 'resource', 'overviews'), { recursive: true });
writeFileSync(path.join(dir, 'resource', 'overviews', 'de_test.txt'), '"de_test"\n{\n\t"pos_x"\t"-1000"\n\t"pos_y"\t"1000"\n\t"scale"\t"10"\n}\n');
const square = (file, x, y) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black@0.0:s=200x200,format=rgba', '-f', 'lavfi', '-i', 'color=c=white:s=40x40,format=rgba', '-filter_complex', `[0][1]overlay=${x}:${y},format=rgba`, '-frames:v', '1', file]);
square(path.join(pics, 'de_test_radar_psd.png'), 80, 80);
const m = radarMask(dir, 'test', 128);
check('the overview is read', !!m && m.scale === 10 && m.pos[0] === -1000 && m.pos[1] === 1000, JSON.stringify(m && { pos: m.pos, scale: m.scale }));
check('in play on its drawn floor', m.inPlay(0, 0) && m.inPlay(-190, 190) && m.inPlay(190, -190));
check('…and up to the margin past it (100 units out)', m.inPlay(300, 0) && m.inPlay(0, -300));
check('not past the margin (250 units out)', !m.inPlay(450, 0) && !m.inPlay(0, 450) && !m.inPlay(-450, -450));
check('off the picture: out', !m.inPlay(5000, 5000) && !m.inPlay(-5000, 0));
square(path.join(pics, 'de_test_lower_radar_psd.png'), 140, 80);   // (a lower level, drawn further east: Hammer 400…800)
const m2 = radarMask(dir, 'test', 128);
check('a lower level\'s picture adds its floor', m2.pictures === 2 && m2.inPlay(600, 0) && !m.inPlay(600, 0));
check('no overview: no bound', radarMask(dir, 'nothere') === null);
console.log((fail ? 'FAIL' : 'PASS') + ': radar mask · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1;
