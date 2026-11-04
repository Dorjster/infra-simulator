// v53 stage 4 · Addendum 8: the bomb on the radar like CS2 (dist/gd-radar.js), in node on the same tiny DOM and synthetic map
// as tests/gd-radar.mjs (a wall along x = 0 that stops sight). Checks:
//  · the CARRIER: on a Terrorist's radar the C4 mark is drawn beside the carrier's dot, and follows him frame by frame;
//    a Counter-Terrorist's radar has no carrier mark;
//  · a DROPPED bomb: Terrorists see it at its exact spot with CS2's growing, fading ring (#DroppedBomb: 0.75 s cycle,
//    scale 0.01 → 0.6 of 110 px); Counter-Terrorists only while one of them has a line of sight to it;
//  · the PLANTED bomb blinks (RadarBombPlantPulse: 0.65 s, opacity 0.1 → 0.8) inside CS2's 70 px #D10000 ring;
//  · the host data: the carrier (combat.d.bomb.carrier) and a dropped bomb (combat.ground) reach every computer in the
//    existing combat frame (multiplayer.js mergeGdFrame) — no new field;
//  · no allocation per frame while the marks are drawn.
//   node --expose-gc tests/gd-radar-bomb.mjs   (without --expose-gc the allocation check is skipped)
import { existsSync, readFileSync } from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
// ---- a tiny DOM: just what the radar touches ---------------------------------------------------------------------
const calls = []; let tr = [0, 0]; const ctx = new Proxy({ translate(a, b) { tr = [a, b]; }, fillRect(x, y, w, h) { calls.push(['fillRect', tr[0], tr[1], x, y, w, h]); }, arc(x, y, r) { calls.push(['arc', tr[0], tr[1], r]); }, drawImage() { calls.push(['img', tr[0], tr[1]]); } }, { get: (t, k) => k in t ? t[k] : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
const classList = () => { const s = new Set(); return { toggle: (c, on) => { if (on ?? !s.has(c)) s.add(c); else s.delete(c); }, contains: c => s.has(c), add: c => s.add(c), remove: c => s.delete(c) }; };
const el = (tag = 'div') => ({ tagName: tag.toUpperCase(), style: {}, classList: classList(), hidden: false, children: [], textContent: '', width: 300, height: 150, clientWidth: 210, getContext: () => ctx, replaceChildren(...c) { this.children = c; }, append() {}, querySelector() { return null; } });
const radarEl = el(), mapEl = el(), canvas = el('canvas'), small = el('small'); canvas.width = canvas.height = 420; radarEl.hidden = true;
radarEl.querySelector = s => s === '.map' ? mapEl : s === 'canvas' ? canvas : s === 'small' ? small : null;
const spBar = el(), rootStyle = { setProperty(k, v) { this[k] = v; } }; globalThis.document = { head: el(), body: { ...el(), insertAdjacentHTML() {} }, documentElement: { style: rootStyle }, createElement: el, getElementById: id => id === 'gd-radar' ? radarEl : id === 'sp-bar' ? spBar : null };
// (v52 options: this computer's storage and the page's events — saveRadarPrefs → 'gd-radar-prefs' → the radar, live)
const store = new Map(); globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
{ const et = new EventTarget(); globalThis.addEventListener = et.addEventListener.bind(et); globalThis.removeEventListener = et.removeEventListener.bind(et); globalThis.dispatchEvent = et.dispatchEvent.bind(et); }
let T = 1000; performance.now = () => T;
const { createRadar, radarSight, inView } = await import('../dist/gd-radar.js');
const { ARENA_MAPS, mapBoxes } = await import('../dist/arena-maps.js'), { ARENA } = await import('../dist/facility-layout.js'), { radarCacheIds, radarCacheSrcs, radarImage } = await import('../dist/gd-radar-art.js');
const cx = ARENA.cx, cz = ARENA.cz;
// ---- the synthetic map: 200 × 200, a wall x ∈ [−1, 1], z ∈ [−60, 60] (map coordinates), which the nav's sight stops at -----
const crossesWall = (ax, az, bx, bz) => { if ((ax < -1 && bx < -1) || (ax > 1 && bx > 1)) return false; const t = Math.abs(bx - ax) < 1e-9 ? 0 : (0 - ax) / (bx - ax), z = az + (bz - az) * t; return Math.abs(z) < 60; };
const mk = id => ({ id, name: id, kind: 'defuse', size: [200, 200], solids: [], t: [[-80, 0]], ct: [[80, 0]], sites: {}, nav: { sight: (ax, ay, az, bx, by, bz) => !crossesWall(ax, az, bx, bz), floorAt: () => 0 } });
ARENA_MAPS.__radarA = mk('__radarA'); ARENA_MAPS.__radarB = mk('__radarB');
const G = { mode: 'arena', arena: { map: '__radarA', match: 1, startedAt: 1 }, combat: { d: { teams: { me: 'ct', mate: 'ct', foe: 't' }, round: { id: 'r1', phase: 'live' }, score: { t: 0, ct: 0 } }, down: { mate: { until: Date.now() + 1e9 } }, nades: [] } };   // (the team mate down until his own check: only your eyes count before it)
const world = { operations: { game: G } };
const pose = (x, z, yaw = 0, y = 9.7) => ({ x: cx + x, y, z: cz + z, yaw, crouched: false, fy: y - 9.7 });
const players = [{ name: 'Me', pose: pose(-50, 0) }, { name: 'Mate', pose: pose(-90, 90, Math.PI) }, { name: 'Foe', pose: pose(-20, 0) }];
const lan = { players }; let me = { x: cx - 50, y: 9.7, z: cz }, myYaw = -Math.PI / 2;   // facing +x (forward = (−sin yaw, −cos yaw))
let live = { movers: [] }; live.length = 0;
const radar = createRadar({ world, lan, name: () => 'Me', yaw: () => myYaw, where: () => me, active: () => true, boxes: () => live, ctBombSpotted: true });   // (the CS:GO "bomb spotted" rule on for its checks: off by default, unconfirmed in CS2)
const tick = (ms = 70) => { T += ms; radar.update(); };
const drawn = k => radar.drawn.find(o => o.k === k);
const { mergeGdFrame } = await import('../dist/multiplayer.js');
const lastImg = () => calls.filter(c => c[0] === 'fillRect' || c[0] === 'img');
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
// ── the carrier (Terrorists) ──
G.combat.d.teams = { me: 't', mate: 't', foe: 'ct' }; G.combat.d.round = { id: 'b1', phase: 'live' }; G.combat.d.bomb = { carrier: 'mate' }; G.combat.down = {}; G.combat.ground = [];
players[1].pose = pose(-90, 40, 0); tick(); calls.length = 0; tick();
{ const [px, pz] = radar.picturePoint(cx - 90, cz + 40), c4 = calls.find(c => c[0] === 'fillRect' && near(c[1], px) && near(c[2], pz) && near(c[5], 11) && near(c[6], 7));
  check('T radar: the carrier mark (C4) is drawn beside the carrier\'s dot', radar.bomb.carrier === 'mate' && !!c4, JSON.stringify(calls.slice(0, 6))); }
players[1].pose = pose(-70, 10, 0); calls.length = 0; tick();
{ const [px, pz] = radar.picturePoint(cx - 70, cz + 10), c4 = calls.find(c => c[0] === 'fillRect' && near(c[1], px) && near(c[2], pz) && near(c[5], 11)); check('…and moves with him the next frame', !!c4); }
G.combat.d.teams = { me: 'ct', mate: 'ct', foe: 't' }; G.combat.d.bomb = { carrier: 'foe' }; tick(); check('CT radar: no carrier mark', radar.bomb.carrier === null);
// ── a dropped bomb ──
G.combat.d.teams = { me: 't', mate: 't', foe: 'ct' }; G.combat.d.bomb = { carrier: null }; G.combat.ground = [{ id: 'g1', item: 'c4', x: cx + 40, y: 0, z: cz + 5 }];
me = { x: cx - 50, y: 9.7, z: cz }; tick();
check('T radar: a dropped bomb behind the wall is shown, at its exact spot', radar.bomb.dropped && near(radar.bomb.dx, cx + 40) && near(radar.bomb.dz, cz + 5));
{ const rs = []; for (let i = 0; i < 8; i++) { calls.length = 0; tick(90); const [px, pz] = radar.picturePoint(cx + 40, cz + 5), a = calls.find(c => c[0] === 'arc' && near(c[1], px) && near(c[2], pz)); rs.push(a ? a[3] : null); }
  const grew = rs.filter(Boolean); check('…pulsing: CS2\'s ring grows and restarts every 0.75 s', grew.length >= 5 && Math.max(...grew) > Math.min(...grew) * 3, JSON.stringify(rs.map(r => r && +r.toFixed(1)))); }
G.combat.d.teams = { me: 'ct', mate: 'ct', foe: 't' }; tick(); tick();
check('CT radar: the dropped bomb behind the wall (no line of sight) is hidden', radar.bomb.dropped === false);
me = { x: cx + 20, y: 9.7, z: cz }; tick(); tick(); check('…in sight of a CT: shown', radar.bomb.dropped === true);
me = { x: cx - 50, y: 9.7, z: cz }; tick(); tick(); check('…out of sight again: hidden', radar.bomb.dropped === false);
G.combat.ground = [];
// ── the planted bomb (Terrorists: always) blinks ──
G.combat.d.teams = { me: 't', mate: 't', foe: 'ct' }; G.combat.d.round = { id: 'b2', phase: 'planted', planted: { x: cx + 30, y: 0, z: cz, at: 900, explodeAt: Date.now() + 40000 } };
{ const lit = []; for (let i = 0; i < 26; i++) { tick(25); lit.push(radar.bomb.lit); }
  check('the planted bomb blinks: CS2\'s 0.65 s pulse, opacity 0.1 → 0.8', radar.bomb.planted && Math.min(...lit) < .2 && Math.max(...lit) > .75, lit.map(v => v.toFixed(2)).join(' '));
  const gl = []; for (let i = 0; i < 26; i++) { tick(25); gl.push(radar.bomb.glow?.s ?? 0); }
  check("…with CS2's red glow pulsing on it (PlantedBombAnimateRed: strength 1 → 3 → 1 every 0.65 s)", Math.min(...gl) < 1.3 && Math.max(...gl) > 2.7 && /^rgba\(\d+,[0-9],[0-9],/.test(radar.bomb.glow?.c || ''), gl.map(v => v.toFixed(1)).join(' ')); }
// ── the host's data reaches every computer in the existing combat frame ──
// (v53 HUD fix: the REAL host state — arena-logic.js runs a Defuse round on Dust II, the carrier drops the bomb — sent as
// the room sends it: lan/room.mjs gdFrame / broadcast('combat') is {...game.combat} as JSON; a guest merges it with
// multiplayer.js mergeGdFrame. No new field: the carrier is d.bomb.carrier, the dropped bomb a ground item.)
{ const { startArena, arenaApply, arenaTick } = await import('../dist/arena-logic.js'), { ARENA_MAPS } = await import('../dist/arena-maps.js');
  const M = ARENA_MAPS.dust2, hg = { levels: {} }; let t = 5e9; startArena(hg, { map: 'dust2', kind: 'defuse', bots: 0 }, t);
  const at = ([x, z]) => ({ x: cx + x, y: 9.7 + (M.nav ? M.nav.floorAt(x, z) || 0 : 0), z: cz + z, yaw: 0 });
  const P = [{ name: 'Ann', pose: at(M.t[0]) }, { name: 'Cy', pose: at(M.ct[0]) }]; arenaTick(hg, P, .05, t += 50);
  const wire = () => JSON.parse(JSON.stringify({ ...hg.combat, sent: Date.now() }));   // (what a guest's stream carries)
  const Gc = { mode: 'arena', arena: { map: 'dust2' } }, Rr = { combat: 0, arena: 0, loadout: 0 };
  mergeGdFrame(Gc, wire(), Rr); const carrier = hg.combat.d?.bomb?.carrier;
  check('host data (real host state): the carrier reaches a guest in the combat frame', !!carrier && Gc.combat?.d?.bomb?.carrier === carrier, carrier);
  for (let i = 0; i < 400 && hg.combat.d.round?.phase !== 'live'; i++) { t += 100; arenaTick(hg, P, .1, t); }   // (into the live round: a drop in the freeze time is a host matter of its own — see the report)
  const cp = P.find(p => p.name.toLowerCase() === hg.combat.d.bomb.carrier); arenaApply(hg, { type: 'drop', slot: 'bomb' }, cp.name, P, t += 50); cp.pose = { ...cp.pose, x: cp.pose.x + 40 }; arenaTick(hg, P, .05, t += 50);   // (the carrier walks away from it)
  const before = JSON.stringify(Gc.combat?.ground || []); mergeGdFrame(Gc, wire(), Rr); const gb = (Gc.combat?.ground || []).find(x => x.item === 'c4');
  check('…and the dropped bomb arrives as a ground item at its spot, with no carrier (no new field)', !!gb && !Gc.combat.d.bomb?.carrier && Number.isFinite(gb.x) && Number.isFinite(gb.z) && before !== JSON.stringify(Gc.combat.ground), JSON.stringify(gb));
  const bytes = JSON.stringify({ c: hg.combat.d.bomb, g: gb }).length; check(`…small: the bomb's own data is ${bytes} bytes of the frame`, bytes < 400, bytes); }
// ── no allocation per frame ──
{ G.combat.ground = [{ id: 'g1', item: 'c4', x: cx + 40, y: 0, z: cz + 5 }]; G.combat.d.bomb = { carrier: 'mate' }; G.combat.d.round = { id: 'b3', phase: 'live' }; for (let i = 0; i < 400; i++) tick(16);
  calls.length = 0; const n0 = calls.length; globalThis.gc?.(); const h0 = process.memoryUsage().heapUsed; for (let i = 0; i < 4000; i++) { tick(16); calls.length = 0; } globalThis.gc?.(); const dh = process.memoryUsage().heapUsed - h0;
  if (globalThis.gc) check('4000 frames with the carrier, a dropped bomb and its ring: heap growth under 1.5 MB', dh < 1.5e6, (dh / 1e6).toFixed(2) + ' MB'); else console.log('SKIP the allocation check: run with node --expose-gc'); }
console.log(`${ok}/${n}`); if (ok !== n) { console.log('FAIL: gd-radar-bomb'); process.exit(1); } console.log('PASS: gd-radar-bomb · ' + n + ' checks (carrier mark follows, dropped bomb for Ts with CS2\'s ring, hidden from CTs without sight, planted blink, host data, no per-frame allocation)');
