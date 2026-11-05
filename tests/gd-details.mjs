// v53 DETAILS · the small CS2 items, in node (Global Defensive only).
// Checks:
//  · the PLANTED bomb's light (particles/explosions_fx/c4_timer_light.vpcf: red 255 75 75, radius 10, one particle per
//    trigger living 0.5 s on its alpha spline, at most 5 alive) and the DROPPED bomb's (c4_timer_light_dropped.vpcf:
//    yellow 255 255 96, radius 8, one particle a second, C4.LightFlash with each new one); the carried light stays CS2's
//    warm yellow (c4_holstered_light.vpcf, a user decision) — gd-c4-back.js createBombLights, no allocation per frame;
//  · the beep schedule (arena-defuse.js C4_BEEP / beepGapMs / beepEvent): 1 s apart at the plant, 0.15 s at the end, the
//    last 10 s on CS2's own _10sec events; each beep fires one flash; the planted bomb drawn at CS2's own size (1×);
//    arena-defuse.js bombStep stepped frame by frame: a host pause stands the bomb's clock still, a resume replays
//    nothing, a late joiner skips once-per-bomb sounds already past; no allocation;
//  · gd-sounds.js's C4 events as CS2's soundevents name them (C4.PlantSound + its B layer, the _10sec pair, C4.LightFlash);
//  · open-B#25: an in-eye spectator hears the watched player's clip sounds (reload, draw) as their own (2D), others placed;
//  · open-B#20: the Overpass snag's shape (a dip narrower than CS2's 32 HU hull before an 18 HU step) walks through, a
//    dip wider than the hull or a 20 HU step still stops you;
//  · open-B#16: impacts' wall traces (gd-impacts.js wallCut): a spark flying into a wall ends there, one flying away
//    doesn't, a floor isn't a wall, the frame's budget holds;
//  · open-B#19: the shot record's eye (`o`) reaches everyone through the room when within 20 units of the pose, dropped
//    otherwise;
//  · open-B#22: the death cam's local-contrast pass (gd-deathcam-post.js) carries death_cam_phase1.vpost's numbers and is
//    on only while the death cam drives it.
//   node --expose-gc tests/gd-details.mjs
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import { readFileSync, mkdtempSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
if (typeof globalThis.gc !== 'function') { const r = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
globalThis.self ??= globalThis; globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
{ const w = console.warn; console.warn = (...a) => { if (!/PropertyBinding|texture/i.test(String(a[0]))) w(...a); }; }
const THREE = await import('../dist/three.module.js');
const C = await import('../dist/gd-c4-back.js');
const { C4_TIMER_LIGHT: TL, C4_DROPPED_LIGHT: DL, C4_BLINK, plantedPulse, droppedPulse, createBombLights } = C;

// ── the planted and dropped bomb's lights ──
check('planted light = c4_timer_light.vpcf: red 255 75 75, radius 10, 0.5 s, at most 5 alive', TL.color.join() === '255,75,75' && TL.radius === 10 && TL.lifeMs === 500 && TL.max === 5 && /c4_timer_light\.vpcf/.test(TL.from));
check('dropped light = c4_timer_light_dropped.vpcf: yellow 255 255 96, radius 8, one a second, C4.LightFlash', DL.color.join() === '255,255,96' && DL.radius === 8 && DL.periodMs === 1000 && DL.sound === 'C4.LightFlash');
check('carried light stays CS2\'s warm yellow (c4_holstered_light 240 230 140 — user decision)', C4_BLINK.color.join() === '240,230,140' && /c4_holstered_light/.test(C4_BLINK.from));
{ const peak = plantedPulse(.0159 * 500), mid = plantedPulse(.18 * 500), end = plantedPulse(500), after = plantedPulse(600), before = plantedPulse(-1);
  check('planted flash: sharp to ~1 at 1.6 % of its life, 0.16 at 18 %, 0 at its end', peak > .97 && Math.abs(mid - .1616) < .02 && end < .01 && after === 0 && before === 0, [peak, mid, end].map(v => v.toFixed(3)).join(' ')); }
{ const a = droppedPulse(111), b = droppedPulse(1111), off = droppedPulse(700);
  check('dropped blink: periodic 1 s on the holstered spline, dark between', a > .8 && Math.abs(a - b) < 1e-9 && off < .1, [a, b, off].map(v => v.toFixed(3)).join(' ')); }
{ let now = 0, played = 0; const sc = new THREE.Scene(), L = createBombLights({ scene: sc, hostNow: () => now, play: () => { played++; } });
  const bomb = new THREE.Group(); sc.add(bomb); L.planted(bomb);
  check('the planted light hangs on the planted bomb\'s model (pooled group, kept across map clears)', L.P.g.parent === bomb && L.P.g.visible && L.P.g.userData.keep === true);
  L.update(0); const dark = L.state.planted; L.beep(0); now = 8; L.update(); const lit = L.state.planted; now = 520; L.update(); const gone = L.state.planted;
  check('a beep fires one flash: dark → lit → gone after 0.5 s', dark === 0 && lit > .95 && gone === 0, [dark, lit, gone].map(v => v.toFixed(3)).join(' '));
  for (let i = 0; i < 7; i++) L.beep(1000 + i * 150); now = 1000 + 6 * 150 + 8; L.update(); check('the last beeps\' flashes overlap (additive, capped at 1)', L.state.planted > .95 && L.state.planted <= 1 && L.state.flashes === 8, L.state.planted.toFixed(3));
  L.planted(null); check('planted off: the light parked', !L.P.g.visible && L.P.g.parent === sc);
  const drop = new THREE.Group(); sc.add(drop); now = 5000; L.dropped(drop, 4600); L.update(); const p0 = played;
  for (let t = 5000; t <= 8000; t += 16) { now = t; L.update(); }
  check('dropped (seen 400 ms after the drop): blinks once a second from the host\'s drop time, its chirp with each new particle (not the one already under way)', L.state.blinks === 4 && played - p0 === 3 && p0 === 0, JSON.stringify({ blinks: L.state.blinks, played }));
  { const d2 = new THREE.Group(); sc.add(d2); L.dropped(null); now = 20000; L.dropped(d2, 19990); const q0 = played; L.update(); const fresh = played - q0; for (let t = 20000; t <= 22100; t += 16) { now = t; L.update(); }
    check('a fresh drop chirps at once (CS2: m_nInitialParticles 1, its C_OP_RenderSound), then once a second', fresh === 1 && played - q0 === 3, JSON.stringify({ fresh, total: played - q0 })); L.dropped(null); }
  now = 99999; L.hold(4600 + 111); L.update(); const held = L.state.dropped; L.hold(null); check('hold(ms) draws the lights at a fixed host time (pictures: the blink\'s peak 0.111 s into its second)', held > .8, held.toFixed(3));
  // no allocation per frame
  L.planted(bomb); for (let i = 0; i < 8000; i++) { now = 9000 + i * 16; if (i % 20 === 0) L.beep(now); L.update(); }
  globalThis.gc(); const h0 = process.memoryUsage().heapUsed; for (let i = 0; i < 100000; i++) { now = 50000 + i * 16; if (i % 20 === 0) L.beep(now); L.update(); } globalThis.gc(); const dh = process.memoryUsage().heapUsed - h0;
  check('100 000 frames of both bomb lights (a beep every 20): heap growth under 512 KB (one 16-byte object a frame would be 1.6 MB)', dh < 524288, (dh / 1024).toFixed(1) + ' KB'); L.dispose(); }

// ── the beep schedule ──
const D = await import('../dist/arena-defuse.js');
{ const g0 = D.beepGapMs(D.DEFUSE.bombMs), gEnd = D.beepGapMs(1000), g20 = D.beepGapMs(20000);
  check('beeps: 1 s apart at the plant, 0.15 s at the end, 0.55 s half way (CS:GO\'s rule — CS2\'s is not in the files)', Math.abs(g0 - 1000) < 1e-6 && Math.abs(gEnd - 150) < 1e-6 && Math.abs(g20 - 550) < 1e-6, [g0, g20, gEnd].join(' '));
  check('the last 10 s use CS2\'s own _10sec events', D.beepEvent(10001) === 'c4.beep' && D.beepEvent(10000) === 'c4.beep.10' && D.beepEvent(500) === 'c4.beep.10');
  let t = 0, beeps = 0, last10 = 0; while (t < D.DEFUSE.bombMs) { beeps++; if (D.DEFUSE.bombMs - t <= 10000) last10++; t += D.beepGapMs(D.DEFUSE.bombMs - t); }
  check('a 40 s bomb beeps about 100 times, about half of them in the last 10 s', beeps > 90 && beeps < 110 && last10 > 40 && last10 < 60, beeps + ' / ' + last10); }
{ const src = readFileSync(new URL('../dist/arena-ui.js', import.meta.url), 'utf8'), bv = src.slice(src.indexOf('function bombView'), src.indexOf('const BEEP_OPTS'));
  check('the planted bomb is drawn at CS2\'s own size (weaponModel c4 at 1×, was 1.4×), along its planter\'s yaw, and fires a flash with each beep at the beep\'s host moment', /weaponModel\('c4', 1\)/.test(bv) && !/1\.4/.test(bv) && /bombLights\.beep\(BOMB_ST\.at\)/.test(bv) && /beepEvent\(bl\)/.test(bv) && /p\.yaw/.test(bv));
  check('…its frame is arena-defuse.js bombStep (paused: the host\'s pause moment; sounds 20 HU up, CS2\'s position_offset)', /bombStep\(BOMB_ST, p, hostNow\(\), lightsHeld\)/.test(bv) && /BOMB_EV\.TRIP\) gdPlay\('c4\.trip'/.test(bv) && /BOMB_EV\.WARN\) gdPlay\('c4\.explodewarn'/.test(bv) && /SND_UP = 20 \* 2\.54 \/ 16\.5/.test(src) && /bombLights\.hold\(ph\)/.test(bv)); }
{ // bombStep, stepped frame by frame (16 ms) through a whole bomb: no pause, a pause, a late join
  const bm = D.DEFUSE.bombMs, E = D.BOMB_EV;
  const run = ({ plant = 100000, firstSeen = plant + 80, pauseAtLeft = null, pauseMs = 0 } = {}) => {
    const p = { x: 0, y: 0, z: 0, at: plant, explodeAt: plant + bm }, st = D.bombState(), o = { beeps: [], ten: 0, trip: 0, warn: 0, pausedBeeps: 0, pausedEnd: 0, order: '' };
    let paused = null, resumed = false;
    for (let t = firstSeen; t < plant + bm + pauseMs + 500; t += 16) {
      if (pauseAtLeft !== null && !paused && !resumed && p.explodeAt - t <= pauseAtLeft) paused = { at: t };
      if (paused && t - paused.at >= pauseMs) { p.explodeAt += t - paused.at; paused = null; resumed = true; }   // (arena-logic.js 'pause' off: explodeAt += dt)
      const gone = !paused && t >= p.explodeAt, ev = D.bombStep(st, gone ? null : p, t, paused ? paused.at : null); if (gone) break;   // (paused, the host's bomb is frozen: it doesn't go off at the old explodeAt)
      if (ev & E.BEEP) { o.beeps.push(Math.round(st.left)); if (paused) o.pausedBeeps++; }
      if (ev & E.TEN) o.ten++; if (ev & E.TRIP) { o.trip++; o.order += 't'; } if (ev & E.WARN) { o.warn++; o.order += 'w'; } if (paused && ev & (E.TEN | E.TRIP | E.WARN)) o.pausedEnd++; }
    return o; };
  const A = run(), P1 = run({ pauseAtLeft: 35000, pauseMs: 30000 }), P2 = run({ pauseAtLeft: 7000, pauseMs: 30000 }), P3 = run({ pauseAtLeft: 600, pauseMs: 5000 });
  check('bombStep, no pause: ~100 beeps, C4.10Seconds once, the trip then the warning once each', A.beeps.length > 90 && A.beeps.length < 110 && A.ten === 1 && A.trip === 1 && A.warn === 1 && A.order === 'tw', JSON.stringify({ beeps: A.beeps.length, ten: A.ten, trip: A.trip, warn: A.warn, order: A.order }));
  const same = (x, y) => Math.abs(x.beeps.length - y.beeps.length) <= 1;
  check('…a 30 s host pause at 35 s / 7 s left: no beep, flash or end sound while paused, the same beeps over the bomb, nothing played twice after the resume', [P1, P2].every(q => q.pausedBeeps === 0 && q.pausedEnd === 0 && same(q, A) && q.ten === 1 && q.trip === 1 && q.warn === 1 && q.order === 'tw'), JSON.stringify([P1, P2].map(q => ({ beeps: q.beeps.length, paused: q.pausedBeeps + q.pausedEnd, ten: q.ten, trip: q.trip, warn: q.warn }))));
  check('…a pause in the last second (after the trip and warning): they don\'t replay after it', P3.trip === 1 && P3.warn === 1 && P3.pausedBeeps === 0 && same(P3, A), JSON.stringify({ beeps: P3.beeps.length, trip: P3.trip, warn: P3.warn }));
  const L5 = run({ firstSeen: 100000 + bm - 5000 }), L05 = run({ firstSeen: 100000 + bm - 500 }), L10 = run({ firstSeen: 100000 + bm - 10060 });
  check('…a late join at 5 s left: no C4.10Seconds late (it was 5 s ago), the trip and warning still; at 0.5 s: neither; at 10.06 s: C4.10Seconds still plays', L5.ten === 0 && L5.trip === 1 && L5.warn === 1 && L05.trip === 0 && L05.warn === 0 && L10.ten === 1, JSON.stringify({ L5: [L5.ten, L5.trip, L5.warn], L05: [L05.trip, L05.warn], L10: L10.ten }));
  check('…a late join beeps the tail of the same schedule (its last beeps = the full run\'s)', L5.beeps.length > 10 && A.beeps.slice(-L5.beeps.length).join() === L5.beeps.join(), L5.beeps.length);
  { const st = D.bombState(), p = { x: 0, y: 0, z: 0, at: 0, explodeAt: bm }; for (let t = 0; t < 4000; t += 16) D.bombStep(st, p, t, null);
    globalThis.gc(); const h0 = process.memoryUsage().heapUsed; for (let k = 0; k < 400; k++) { st.id = null; for (let t = 0; t < bm; t += 16) D.bombStep(st, p, t, (t > 20000 && t < 22000) ? 20000 : null); } globalThis.gc(); const dh = process.memoryUsage().heapUsed - h0;
    check('…bombStep allocates nothing (400 bombs, 1 M frames: heap growth under 512 KB)', dh < 524288, (dh / 1024).toFixed(1) + ' KB'); } }
{ // two computers that first see the bomb at different moments beep at the same host instants
  const at = 100000, ex = at + D.DEFUSE.bombMs, seq = from => { const out = []; let t = D.beepFrom(at, ex, from); while (t < ex && out.length < 400) { out.push(Math.round(t)); t += D.beepGapMs(ex - t, ex - at); } return out; };
  const A = seq(at), B = seq(at + 12345), C = seq(at + 38000); const tail = (x, n) => x.slice(-n).join();
  check('beeps from the plant time: a late viewer\'s beeps are the same host instants as one who saw the plant (first at the plant)', A[0] === at && B.length && A.slice(A.length - B.length).join() === B.join() && tail(A, C.length) === C.join(), [A.length, B.length, C.length].join(' / ')); }
{ const src = readFileSync(new URL('../dist/arena-defuse.js', import.meta.url), 'utf8');
  check('the host\'s planted record carries the planter\'s yaw (2 decimals, only when known)', /r\.planted = \{[^}]*by: r\.plant\.by, \.\.\.\(Number\.isFinite\(p\.yaw\) \? \{ yaw: Math\.round\(p\.yaw \* 100\) \/ 100 \}/.test(src)); }

// ── the sound events (CS2's soundevent names) and the in-eye spectator's clip sounds ──
const S = await import('../dist/gd-sounds.js');
{ const E = S.EVENTS; check('C4 events: C4.PlantSound (+B layer), C4.PlantSound_10sec (+B), C4.LightFlash, C4.10Seconds', E['c4.beep']?.cs === 'C4.PlantSound' && E['c4.beep'].with === 'c4.beep.b' && E['c4.beep.b']?.cs === 'C4.PlantSoundB' && E['c4.beep.10']?.cs === 'C4.PlantSound_10sec' && E['c4.beep.10'].with === 'c4.beep.b10' && E['c4.beep.b10']?.cs === 'C4.PlantSoundB_10sec' && E['c4.flash']?.cs === 'C4.LightFlash' && E['c4.warn']?.cs === 'C4.10Seconds');
  check('…C4.ExplodeTriggerTrip and C4.ExplodeWarning have events; C4.LightFlash carries its time-volume curve (0 s, 0) → (1 s, 1)', E['c4.trip']?.cs === 'C4.ExplodeTriggerTrip' && E['c4.explodewarn']?.cs === 'C4.ExplodeWarning' && JSON.stringify(E['c4.flash'].tvol) === '[[0,0],[1,1]]');
  const gs = readFileSync(new URL('../dist/gd-sounds.js', import.meta.url), 'utf8'), tv = E['c4.flash'].tvol;
  check('…the curve is read at the emitter\'s time (tvolT, the dropped bomb\'s ms since the drop / 1000): silent at the drop, half at 0.5 s, full from 1 s; no time: full', S.tvolAt(tv, 0) === 0 && Math.abs(S.tvolAt(tv, .5) - .5) < 1e-9 && S.tvolAt(tv, 1) === 1 && S.tvolAt(tv, 7) === 1 && S.tvolAt(tv, undefined) === 1 && /if \(r\.tvol\) gain \*= tvolAt\(r\.tvol, o\.tvolT\)/.test(gs));
  const cb = readFileSync(new URL('../dist/gd-c4-back.js', import.meta.url), 'utf8'), ui = readFileSync(new URL('../dist/arena-ui.js', import.meta.url), 'utf8');
  check('…the dropped chirp passes its ms since the drop, and is placed 20 HU above the LED (CS2\'s position_offset)', /play\(D\.on, t\)/.test(cb) && /FLASH_AT\.y = e\[13\] \+ SND_UP; FLASH_AT\.z = e\[14\]; FLASH_OPTS\.tvolT = sinceMs \/ 1000/.test(ui)); }
{ const at = { x: 1, y: 2, z: 3 }; S.gdWatch('p7');
  const mine = S.clipPlace(at, 'p7'), other = S.clipPlace(at, 'p8'), unplaced = S.clipPlace(null, 'p7'); S.gdWatch(null); const after = S.clipPlace(at, 'p7');
  check('open-B#25: the watched player\'s clip sounds play as your own (2D); anyone else\'s stay placed; not watching: placed', mine === null && other === at && unplaced === null && after === at && S.gdWatched() === null);
  S.gdWatch('p7', 'ann'); const plant = S.clipPlace(at, 'ann'), bo = S.clipPlace(at, 'bo'); S.gdWatch(null); const plantAfter = S.clipPlace(at, 'ann');
  check('…the bomb\'s plant clip (named by the planter\'s key, not the LAN id) is the watched player\'s too', plant === null && bo === at && plantAfter === at); }
{ const src = readFileSync(new URL('../dist/arena-spectate.js', import.meta.url), 'utf8');
  check('…arena-spectate.js sets the watched player in the in-eye view and clears it everywhere else', /gdWatch\(t\.id, t\.key\)/.test(src) && (src.match(/gdWatch\(null\)/g) || []).length >= 3); }

// ── the Overpass snag's shape ──
{ const { createMoveState, moveStep, HU } = await import('../dist/arena-move.js');
  const B = (a, b, top) => ({ minX: a * HU, maxX: b * HU, minZ: -100 * HU, maxZ: 100 * HU, y0: 0, y1: top * HU });
  const walk = boxes => { const s = createMoveState(20 * HU); s.x = 60 * HU; s.z = 0; s.y = 20 * HU; for (let t = 0; t < 96; t++) moveStep(s, { wish: [-1, 0], weapon: 'knife' }, { boxes, bounds: null }, 1 / 64); return s.x / HU; };
  const snag = walk([B(0, 200, 20), B(-24, 0, 18), B(-200, -24, 38)]), wide = walk([B(0, 200, 20), B(-40, 0, 18), B(-200, -40, 38)]), tall = walk([B(0, 200, 20), B(-200, 0, 40)]);
  check('open-B#20: a 2 HU dip narrower than the hull before an 18 HU step: walked through (CS2\'s hull stays on the ledge)', snag < -60, snag.toFixed(1) + ' HU');
  check('…a dip wider than the hull (the body really in it: then a 20 HU wall) and a 20 HU step still stop you', wide > -45 && tall > -5, wide.toFixed(1) + ' / ' + tall.toFixed(1)); }

// ── impact wall traces ──
{ const I = await import('../dist/gd-impacts.js'), PK = I.PK, out = new Float32Array(PK * 4);
  const set = (o, x, y, z, vx, vy, vz, life, g = 0, k = 0) => { out.fill(0, o, o + PK); out[o] = x; out[o + 1] = y; out[o + 2] = z; out[o + 3] = vx; out[o + 4] = vy; out[o + 5] = vz; out[o + 6] = life; out[o + 10] = g; out[o + 11] = k; };
  const WN0 = [0, 0, 0];
  // a wall plane z = 3 facing −z (toward the hit), and a floor y = −1 facing up
  const wall = (ax, ay, az, bx, by, bz, o) => { let best = Infinity; const tz = (3 - az) / (bz - az); if (bz !== az && tz >= 0 && tz <= 1) { best = tz; o[0] = 0; o[1] = 0; o[2] = -1; }
    const ty = (-1 - ay) / (by - ay); if (by !== ay && ty >= 0 && ty <= 1 && ty < best) { best = ty; o[0] = 0; o[1] = 1; o[2] = 0; } return best; };
  I.WALL.at = wall; I.WALL.left = 1000;
  set(0, 0, 0, 0, 0, 0, 10, 1); const tw = I.wallCut(0, out, 1);
  set(PK, 0, 0, 0, 0, 0, -10, 1); const away = I.wallCut(PK, out, 1);
  set(PK * 2, 0, 0, 0, 0, -10, 0, 1); const floor = I.wallCut(PK * 2, out, 1);
  check('open-B#16: a spark flying into a wall ends where it enters it (z = 3 at 0.3 s)', Math.abs(tw - .3) < .02, tw.toFixed(3));
  check('…one flying away from it isn\'t cut, and a floor is not a wall (the landing stays the floor\'s)', away === -1 && floor === -1, away + ' / ' + floor);
  I.WALL.left = 0; set(0, 0, 0, 0, 0, 0, 10, 1); const spent = I.wallCut(0, out, 1); check('…past the frame\'s trace budget nothing is traced (as before)', spent === -1 && I.WALL.left <= 0);
  I.WALL.left = 1e6; const MAIN = I.FX.metal.filter(e => e.wtc), PB = new Float32Array(64 * PK);
  const lives = () => { const c = I.planImpact(MAIN, 0, 0, 0, 0, 0, 1, 0, 0, -1, 77, 2, PB); let s = 0, life = 0, cut = 0, past = 0; for (let j = 0; j < c; j++) { const o = j * PK, cutAt = PB[o + 36] <= 0 && PB[o + 37] > 0 ? PB[o + 37] : 0, L = cutAt || PB[o + 6], k = PB[o + 11]; if (cutAt) cut++; s += L; life += PB[o + 6]; const z = k < .01 ? PB[o + 2] + PB[o + 5] * L : PB[o + 2] + PB[o + 5] * (1 - Math.exp(-k * L)) / k; if (z > 3.05) past++; } return { c, s: +s.toFixed(4), life: +life.toFixed(4), cut, past }; };
  const wallOnly = (ax, ay, az, bx, by, bz, o) => { const tz = (3 - az) / (bz - az); if (bz !== az && tz >= 0 && tz <= 1) { o[0] = 0; o[1] = 0; o[2] = -1; return tz; } return Infinity; };   // (no floor: a floor is the landing's, floorAt — a trace stops at its first face)
  I.WALL.at = null; const free = lives(); I.WALL.at = wallOnly; const walled = lives(); I.WALL.at = null;
  check('…CS2\'s metal impact (its WorldTraceConstraint systems: ' + MAIN.map(e => e.src).join(', ') + ') in front of a wall 3 units away: its sparks stop at the wall (none past it): drawn until the cut, their lives (size, colour and fade by age / life) unchanged', free.past > 0 && walled.past === 0 && walled.s < free.s && walled.c === free.c && walled.cut > 0 && free.cut === 0 && Math.abs(walled.life - free.life) < 1e-3, JSON.stringify({ free, walled }));
  const vs = readFileSync(new URL('../dist/gd-impacts.js', import.meta.url), 'utf8'); check('…the shader hides a cut particle from its cut on (aF.y with no landing) and times everything by its whole life', /age >= life \|\| \(aF\.x <= 0\.0 && aF\.y > 0\.0 && age >= aF\.y\)/.test(vs) && !/out\[o \+ 6\] = Math\.max\(1e-3, tw\)/.test(vs));
  check('…the frame\'s wall-trace budget is sized by particle detail (Low … Ultra)', I.WALL_BUDGETS.length === 4 && I.WALL_BUDGETS[0] < I.WALL_BUDGETS[2] && I.WALL_BUDGETS[2] <= 300 && I.WALL_BUDGETS[3] === I.WALL_BUDGET); void WN0; }

// ── the shot record's eye through the room ──
{ const { startRoom } = await import('../lan/room.mjs'), { startArena } = await import('../dist/arena-logic.js');
  const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdd-')), 's.json'), roomCode: 'GDDT01', hostKey: 'k', log: () => {}, error: () => {} });
  try {
    const base = 'http://127.0.0.1:' + room.port, post = (route, body, token) => fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json() }));
    const join = async (name, hostKey) => (await post('join', { code: 'GDDT01', name, ...(hostKey ? { hostKey } : {}) })).body, wait = ms => new Promise(r => setTimeout(r, ms));
    const ann = await join('Ann', 'k'), bo = await join('Bo'); let roster = []; const ctl = new AbortController();
    fetch(base + '/api/events?token=' + bo.token, { signal: ctl.signal }).then(async r => { const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value); let i;
        while ((i = buf.indexOf('\n\n')) >= 0) { const msg = buf.slice(0, i); buf = buf.slice(i + 2); const type = /^event: (.*)$/m.exec(msg)?.[1], data = /^data: (.*)$/m.exec(msg)?.[1]; if (type !== 'players' || !data) continue; try { roster = JSON.parse(data); } catch {} } } }).catch(() => {});
    room.stopEvents = () => ctl.abort(); await wait(200); const g = room.world.operations.game; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0, freezeS: 30 }, Date.now()); await wait(300); g.combat.d.teams.ann = 't';
    const { ARENA_MAPS } = await import('../dist/arena-maps.js'), { ARENA } = await import('../dist/facility-layout.js'), M = ARENA_MAPS.dust2, [sx, sz] = M.t[0], fl = M.nav.floorAt(sx, sz), X = ARENA.cx + sx, Z = ARENA.cz + sz, Y = fl + 9.7;
    let ct = 1000; const send = async shot => { ct += 33; await post('pose', { pose: { x: X, y: Y, z: Z, yaw: 0, active: true, ct, shot } }, ann.token); await wait(150); return roster.find(q => q.id === ann.id)?.pose?.shot; };
    const near = await send({ n: 1, o: [X + .5, Y + .1, Z - .3] }), far = await send({ n: 2, o: [X + 50, Y, Z] }), bad = await send({ n: 3, o: [X, 'a', Z] });
    const okNear = Array.isArray(near?.o) && Math.abs(near.o[0] - (X + .5)) < 1e-3, gotSome = near !== undefined;
    check('open-B#19: the shot record\'s eye reaches the room within 20 units of the pose; far or broken: dropped', gotSome ? okNear && far?.o === undefined && bad?.o === undefined : false, JSON.stringify({ near: near?.o, far: far?.o, bad: bad?.o }));
  } finally { room.stopEvents?.(); await room.close?.(); }
  const lab = readFileSync(new URL('../dist/lab.js', import.meta.url), 'utf8');
  check('…and others trace its impacts from it (lab.js traceRemote: the record\'s o before the pose)', /const so=ps\?\.shot\?\.o,rec=Array\.isArray\(so\)&&so\.length===3/.test(lab) && /ex=rec\?so\[0\]/.test(lab)); }

// ── the death cam's local contrast ──
{ const P = await import('../dist/gd-deathcam-post.js'), L = P.LOCAL_CONTRAST;
  check('open-B#22: death_cam_phase1.vpost\'s local contrast numbers (strength 2, edge 2, vignette −0.3092 → 0.9408, blur 0.9455)', L.strength === 2 && L.edge === 2 && L.vStart === -.3092 && L.vEnd === .9408 && L.vBlur === .9455);
  const pass = new P.DeathContrastPass(); P.DEATH_POST.amount = 0; pass.sync(true); const off = pass.enabled; P.DEATH_POST.amount = .6; pass.sync(true); const on = pass.enabled, amt = pass.mat.uniforms.uAmt.value; pass.sync(false); const notGd = pass.enabled; P.DEATH_POST.amount = 0;
  check('…the pass is off unless the death cam drives it, and never outside Global Defensive', !off && on && Math.abs(amt - .6) < 1e-9 && !notGd);
  pass.setSize(2560, 1440); check('…sized from the buffer (the wide blur scales with the lines)', Math.abs(pass.mat.uniforms.uWide.value - P.WIDE_PX * 1440 / 1080) < 1e-9 && Math.abs(pass.mat.uniforms.uAspect.value - 16 / 9) < 1e-9);
  const gsrc = readFileSync(new URL('../dist/graphics.js', import.meta.url), 'utf8');
  check('…graphics.js adds it only to a Global Defensive composer, warms it with the composer and syncs it per frame', /if \(gdLast\) composer\.addPass\(gdDeathPass \?\?= new DeathContrastPass\(\)\)/.test(gsrc) && /if \(gdLast\) gdDeathPass\?\.warm\(renderer, composer\.renderTarget2\)/.test(gsrc) && /gdDeathPass\?\.sync\(!!gdLast\)/.test(gsrc));
  pass.dispose(); }

console.log(`${ok}/${n}`); console.log((ok === n ? 'PASS' : 'FAIL') + ': gd-details · ' + n + ' checks (C4 planted / dropped lights and beeps, spectator clip sounds, Overpass snag, impact wall traces, shot eye, death-cam contrast)'); process.exit(ok === n ? 0 : 1);
