// Global Defensive jump-throws and the grenade's release (v53, SPEC 1.2.2–1.2.5, 1.2.7): what a release gives the throw.
//   · The movement's own state at the release (arena-move.js pressThrow), never the drawn camera: the tick the release
//     falls in, its sub-tick fraction — the same packet at 30 / 60 / 144 / 240 fps (any frame phase, ±10 % jitter), also
//     when the release is registered a frame late (weapons.js sees it in its next update).
//   · Jump-throw: a jump and a release at one moment (the bindable 'jumpthrow', or the "Jump + release" helper) → the
//     take-off's state: feet on the floor, upward speed exactly the jump impulse (MOVE.jump: 301.993 u/s — sv_jump_impulse,
//     √(2 · 800 · 57) for the 57-unit jump under sv_gravity 800). A plain jump and a release within one CS2 tick (15.6 ms,
//     by the time between them, either order) are one too; 16 ms or more apart is not (thrown on the way up / from the floor). Standing, running, crouched.
//   · A standing throw after running: the movement stops dead (Source's 1 u/s ground stop), so nothing of the walk carries.
//   · The throw leaves from CS2's eye (64.06 standing / 46.04 crouched over the feet) along the raw view angles.
//   · weapons.js: the release keeps its moment and its raw angles; left = full (1), right = underhand (0), both = medium
//     (0.5) — the preview's strength follows the buttons while holding; the jump-throw lets go with whatever is held.
//   · The bindable action: 'Jump-throw' in Global Defensive's controls only, unbound by default; lab.js wires it.
//   node tests/gd-jumpthrow.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
let T = 1000; globalThis.performance = { now: () => T, mark() {}, measure() {}, getEntriesByName: () => [] };   // (weapons.js reads the page clock: a fake one)
const THREE = await import('../dist/three.module.js');
const { createWeapons } = await import('../dist/weapons.js');
const { weaponById, THROW } = await import('../dist/weapons-data.js');
const { createMoveState, createMoveClock, moveTicks, pressJump, pressThrow, MOVE, TICK, HU } = await import('../dist/arena-move.js');
const { throwPacket, launch, throwEye, NADE_EYE, POWER, THROW: NADE_SPEED, simThrow, NADE_MS } = await import('../dist/arena-nades.js');
const { ACTIONS, actionsIn } = await import('../dist/input.js');
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// ── The movement: frames at a frame rate (seeded jitter, a phase), events (jump presses, releases) at their own moments ──
// events: [{ t (s), jump?, release?, late? }] — a late release is registered at the first frame after it (as weapons.js
// does), else at its moment (an event handler runs between frames). keys(t) → the wish at that moment's frame.
// The clock starts at 0 for every run (the same tick grid); the first frame comes `phase` of a frame later. init(s): a
// starting state (a speed already, so the keys never change mid-test: key changes count per frame, releases per moment).
function run({ fps, phase = 0, seed = 1, events, keys = () => [0, 0], duck = () => false, until = 2, init = null }) {
  const s = createMoveState(0), clk = createMoveClock(), I = { wish: [0, 0], weapon: 'smoke', look: [0, -1], duck: false }, W = { boxes: [], bounds: null };
  let t = 0, sd = seed, first = true; const ev = events.map(e => ({ ...e, done: false })); let thr = null; s.x = 0; s.z = 0; init?.(s);
  moveTicks(s, clk, I, W, 0, t);
  while (t < until && !thr) { sd = (sd * 16807) % 2147483647; const dt = first && phase ? phase / fps : 1 / fps * (.9 + .2 * sd / 2147483647), nt = t + dt; first = false;
    for (const e of ev) if (!e.done && !e.late && e.t <= nt) { e.done = true; if (e.jump) pressJump(clk, e.t); if (e.release) pressThrow(clk, e.t); }
    const w = keys(nt); I.wish[0] = w[0]; I.wish[1] = w[1]; I.duck = duck(nt);
    moveTicks(s, clk, I, W, dt, nt); t = nt;
    for (const e of ev) if (!e.done && e.late && e.t <= nt) { e.done = true; if (e.release) pressThrow(clk, e.t); }   // (registered in this frame's update, after the movement ran)
    if (clk.thr?.[0]) { thr = Array.from(clk.thr); clk.thr[0] = 0; } }
  return { thr, s };
}
const FPS = [30, 60, 144, 240];
const sweep = (opts) => { const out = []; for (const fps of FPS) for (let ph = 0; ph < 6; ph++) out.push({ fps, ph, ...run({ ...opts, fps, phase: ph / 6, seed: fps * 31 + ph }) }); return out; };
const same = (A, k, e = 1e-9) => A.every(r => r.thr && near(r.thr[k], A[0].thr[k], e));

// ── Jump-throw, standing: the take-off state, at every frame rate ──
{ const R = sweep({ events: [{ t: .5037, jump: 1, release: 1 }] });
  ok('the jumpthrow (a jump and a release at one moment) is resolved at every frame rate and phase', R.every(r => r.thr), R.filter(r => !r.thr).map(r => r.fps + '/' + r.ph).join(' '));
  ok('…as a jump-throw', R.every(r => r.thr[9] === 1));
  ok('…upward exactly the jump impulse: 301.993 u/s (MOVE.jump — sv_jump_impulse, √(2·800·57) = ' + Math.sqrt(2 * 800 * 57).toFixed(3) + ')', R.every(r => near(r.thr[5], MOVE.jump)) && near(MOVE.jump / HU, 301.993, 1e-9) && near(Math.sqrt(2 * 800 * 57), 301.993, 5e-4), R[0].thr[5] / HU);
  ok('…from the feet on the floor (the take-off), standing still', R.every(r => near(r.thr[2], 0) && near(r.thr[4], 0) && near(r.thr[6], 0) && near(r.thr[7], 0)), JSON.stringify(R[0].thr.slice(1, 8)));
  ok('…the release fraction kept (0…1)', R.every(r => r.thr[8] >= 0 && r.thr[8] <= 1)); }
// ── Running jump-throw: the same packet at any frame rate (the keys pressed from the start, the jumpthrow at 0.6 s) ──
{ const R = sweep({ events: [{ t: .6041, jump: 1, release: 1 }], keys: () => [0, -1] });
  ok('a running jump-throw: a jump-throw at every frame rate, upward the full impulse', R.every(r => r.thr?.[9] === 1 && near(r.thr[5], MOVE.jump)));
  ok('…the same take-off position and speed at 30 / 60 / 144 / 240 fps (≤ 1e-9)', [1, 2, 3, 4, 6].every(k => same(R, k)), JSON.stringify(R.map(r => +(r.thr[3] / HU).toFixed(6))).slice(0, 200));
  ok('…running speed carried (≈ 245 u/s with a grenade)', Math.abs(Math.hypot(R[0].thr[4], R[0].thr[6]) / HU - 245) < 3, Math.hypot(R[0].thr[4], R[0].thr[6]) / HU); }
// ── Plain jump + release in the same CS2 tick → a jump-throw; 40 ms apart → not ──
// (the window is the time between the two moments — |release − jump| ≤ 1/64 s — whatever the phase in the 128 Hz grid:
// each gap is tried at 8 phases inside a movement tick as well as the 6 frame phases; negative: the release first)
{ for (const [dtMs, want] of [[0, 1], [5, 1], [-5, 1], [12, 1], [14, 1], [15.5, 1], [-14, 1], [-15.5, 1], [16, 0], [-16, 0], [18, 0], [20, 0], [22, 0], [40, 0]]) {
    const R = []; for (let p = 0; p < 8; p++) R.push(...sweep({ events: [{ t: .5037 + p * TICK / 8, jump: 1 }, { t: .5037 + p * TICK / 8 + dtMs / 1000, release: 1 }] }));
    ok(`a jump and a release ${dtMs} ms apart: ${want ? 'a jump-throw (within one CS2 tick)' : dtMs > 0 ? 'thrown on the way up, not a jump-throw' : 'thrown from the floor before the jump, not a jump-throw'} at every frame rate and tick phase`, R.every(r => r.thr?.[9] === want), R.map(r => r.thr?.[9]).join(''));
    if (!want && dtMs > 0) ok('…on the way up: higher than the floor, slower than the impulse', R.every(r => r.thr[2] > 0 && r.thr[5] < MOVE.jump), JSON.stringify([R[0].thr[2] / HU, R[0].thr[5] / HU]));
    if (!want && dtMs < 0) ok('…from the floor, nothing upward', R.every(r => near(r.thr[2], 0) && r.thr[5] === 0)); } }
// ── A release registered a frame late (weapons.js's next update) is read off its own tick: the same as on time ──
{ const init = s => { s.vz = -245 * HU; };   // running speed, no keys: decelerating at the release
  const onTime = sweep({ events: [{ t: .0531, release: 1 }], init }), late = sweep({ events: [{ t: .0531, release: 1, late: 1 }], init });
  ok('a release while slowing down: position, velocity at its sub-tick moment — the same at every frame rate', [1, 2, 3, 4, 6].every(k => same(onTime, k, 1e-6)), JSON.stringify(onTime.map(r => (r.thr[4] / HU).toFixed(4))).slice(0, 200));
  ok('…and when registered a frame late (≤ 1e-9 from on time)', late.every((r, i) => [1, 2, 3, 4, 5, 6, 7, 8].every(k => near(r.thr[k], onTime[i].thr[k]))));
  ok('…not a jump-throw, on the floor', onTime.every(r => r.thr[9] === 0 && near(r.thr[2], 0) && r.thr[5] === 0)); }
// ── Standing still after a run: exactly 0 (Source's stop under 1 u/s) ──
{ const R = sweep({ events: [{ t: 1.4013, release: 1 }], keys: t => t < .8 ? [-1, 0] : [0, 0] });
  ok('stopped 0.6 s after running: the velocity at the release is exactly 0 (no leftover walk carried ×1.25)', R.every(r => r.thr[4] === 0 && r.thr[6] === 0), R[0].thr[4] / HU); }
// ── Crouched: the duck at the release; the eye from it ──
{ const R = sweep({ events: [{ t: 1.0029, release: 1 }], duck: () => true });
  ok('crouched (held from the start): duck 1 at the release, at every frame rate', R.every(r => near(r.thr[7], 1)));
  const P = throwPacket({ x: 1, y: 2, z: 3, duck: 1, pitch: 0, yaw: 0, strength: 'long' }), Q = throwPacket({ x: 1, y: 2, z: 3, duck: 0, pitch: 0, yaw: 0, strength: 'long' });
  ok('the throw leaves from CS2\'s eye: feet + 64.06 standing, + 46.04 crouched (game units ' + NADE_EYE.stand.toFixed(4) + ' / ' + NADE_EYE.duck.toFixed(4) + ')', near(Q.y - 2, 64.0626 * HU) && near(P.y - 2, 46.045 * HU) && near(throwEye(.5), (NADE_EYE.stand + NADE_EYE.duck) / 2)); }
// ── The packet: raw angles → direction; strengths; nothing rounded ──
{ const pitch = -0.6623987, yaw = 3.0794511, P = throwPacket({ x: 10.123456789012, y: 0, z: -7.000000001, pitch, yaw, strength: 'medium', frac: .37, vx: .1234567891, vy: 0, vz: 0, jt: 1 });
  ok('the packet keeps every number as computed (JSON round trip exact)', JSON.stringify(JSON.parse(JSON.stringify(P))) === JSON.stringify(P) && P.x === 10.123456789012 && P.vx === .1234567891 && P.frac === .37 && P.jt === 1);
  ok('…its direction is the raw angles\' (pitch up positive, yaw as the camera\'s)', near(P.dy, Math.sin(pitch)) && near(P.dx, -Math.sin(yaw) * Math.cos(pitch)) && near(P.dz, -Math.cos(yaw) * Math.cos(pitch)));
  ok('CS2\'s strengths: left 1, both 0.5, right 0 (m_flThrowStrength) — speed 675 × (s × 0.7 + 0.3)', POWER.long === 1 && POWER.medium === .5 && POWER.short === 0 && near(Math.hypot(...Object.values(launch({ dx: 1, dy: 0, dz: 0, strength: 'medium' }))) / NADE_SPEED, .65, 1e-9));
  const v0 = launch({ dx: 0, dy: 0, dz: -1, strength: 'long' }), vj = launch({ dx: 0, dy: 0, dz: -1, strength: 'long', vy: MOVE.jump }), vf = launch({ dx: 0, dy: 0, dz: -1, strength: 'long', vy: -600 * HU });
  ok('the thrower\'s velocity × 1.25, unclamped (a jump-throw adds 1.25 × 301.993 up; a fall of 600 u/s is no longer cut at 390)', near(vj.vy - v0.vy, 1.25 * MOVE.jump) && near(vf.vy - v0.vy, -1.25 * 600 * HU), [(vj.vy - v0.vy) / HU, (vf.vy - v0.vy) / HU]);
  const a = simThrow('smoke', throwPacket({ x: 0, y: 0, z: 0, pitch: .3, yaw: 0, strength: 'long' })), b = simThrow('smoke', throwPacket({ x: 0, y: 0, z: 0, pitch: .3, yaw: 0, strength: 'long', vy: MOVE.jump, jt: 1 }));
  ok('a jump-throw flies further than the same standing throw (flat ground)', Math.hypot(b.x, b.z) > Math.hypot(a.x, a.z) + 5, [Math.hypot(a.x, a.z) / HU, Math.hypot(b.x, b.z) / HU].map(v => v.toFixed(1)).join(' → ')); }

// ── weapons.js: the release's moment and angles; strengths; the jump-throw ──
function rig(id = 'smoke', look = { pitch: -.25, yaw: 1.1 }) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(74, 1.6, .1, 1000); scene.add(camera); const thrown = [];
  const P = createWeapons({ scene, camera, effects: { shoot() {}, shootAt() {} }, arsenal: () => [id], report: () => {}, canFire: () => true, targets: () => [], aim: () => look, move: () => ({ speed: 0, max: 245 * HU, onGround: true, landedAgo: 9, ducked: false }), throwNade: (k, strength, rel) => thrown.push({ k, strength, rel }) });
  P.equip(id); T += (weaponById(id).deployMs || 1000) + 50; P.update(.016); return { P, thrown, look };
}
const frames = (P, ms) => { for (let left = ms; left > 0; left -= 7) { T += 7; P.update(.007); } };
for (const [btns, want] of [[[0], 'long'], [[2], 'short'], [[0, 2], 'medium']]) {
  // a mouse release: its moment and angles, though the throw goes out in the next update
  { const { P, thrown, look } = rig(); for (const b of btns) P.button(b, true); frames(P, THROW.primeMs + 60); T += 3.3; const tRel = T; look.pitch = -.31; for (const b of btns) P.button(b, false); look.pitch = .9; T += 9; P.update(.009);
    ok(`buttons ${btns.join('+')} released: a ${want} throw with the release's moment (s) and the angles at that moment`, thrown.length === 1 && thrown[0].strength === want && near(thrown[0].rel.t, tRel / 1000) && thrown[0].rel.pitch === -.31 && thrown[0].rel.yaw === 1.1, JSON.stringify(thrown)); }
  // the jumpthrow: let go with whatever is held, at the given moment
  { const { P, thrown } = rig(); for (const b of btns) P.button(b, true); frames(P, THROW.primeMs + 60); const t = T / 1000 + .0021; const r = P.jumpThrow(t); T += 8; P.update(.008);
    ok(`jumpthrow with ${btns.join('+')} held: a ${want} throw released at the jump's moment`, r === true && thrown.length === 1 && thrown[0].strength === want && near(thrown[0].rel.t, t, 1e-9), JSON.stringify(thrown));
    for (const b of btns) P.button(b, false); frames(P, 20); ok('…letting go of the buttons afterwards throws nothing more', thrown.length === 1); } }
// a release whose handler runs late (a busy frame: 23 ms after the input) carries the event's own moment (e.timeStamp)
{ const { P, thrown } = rig(); P.button(0, true); frames(P, THROW.primeMs + 60); const tEv = T + .4; T += 23; P.button(0, false, tEv); T += 5; P.update(.005);
  ok('a release handled 23 ms late is thrown at its event\'s moment (e.timeStamp), not the handler\'s', thrown.length === 1 && near(thrown[0].rel.t, tEv / 1000, 1e-12), JSON.stringify(thrown));
  const { P: Q, thrown: q } = rig(); Q.button(0, true); frames(Q, THROW.primeMs + 60); const tNow = T; Q.button(0, false, 'x'); T += 5; Q.update(.005);
  ok('…a moment that is not one (missing, in the future, from another clock) falls back to now', q.length === 1 && near(q[0].rel.t, tNow / 1000, 1e-12)); }
{ const { P } = rig(); P.button(0, true); frames(P, THROW.primeMs + 60); const s1 = P.nade.strength; P.button(2, true); const s2 = P.nade.strength; P.button(0, false); P.button(2, false);
  ok('changing strength while holding: left = full, then right pressed too = medium (the preview follows)', s1 === 'long' && s2 === 'medium', s1 + ' → ' + s2); }
{ const { P, thrown } = rig(); ok('jumpthrow with no grenade pin pulled lets nothing go (lab.js still jumps: CS2\'s bind is +jump;-attack;-attack2)', P.jumpThrow(T / 1000) === false && thrown.length === 0); }

// ── The bindable action ──
{ const A = ACTIONS.find(a => a.id === 'a-jumpthrow');
  ok("'Jump-throw' is a Global Defensive action, unbound by default (CS2: bind it yourself)", A && A.legacy === 'jumpthrow' && A.ctx.length === 1 && A.ctx[0] === 'arena' && Array.isArray(A.def) && A.def.length === 0 && actionsIn('arena').includes(A));
  ok('…in no other mode\'s controls', Object.keys({ infra: 1, payday: 1, casino: 1 }).every(c => !actionsIn(c).includes(A)));
  const lab = readFileSync(new URL('../dist/lab.js', import.meta.url), 'utf8');
  ok("lab.js: 'jumpthrow' lets go and jumps at one moment (GD only, the key's own e.timeStamp); the helper; throws read off the movement tick; releases carry e.timeStamp; chorded buttons reach the grenade (real mouse: tests/browser/gd-nade-chord.mjs)", /inArena\(\)&&k==='jumpthrow'/.test(lab) && /pistol\.jumpThrow\?\.\(t\);pressJump\(amClk,t\)/.test(lab) && /k==='jumpthrow'&&active&&!spectator\?\.on\)\{e\.preventDefault\(\);const t=evSec\(e\)/.test(lab) && /pistol\.button\(e\.button,false,e\.timeStamp\)/.test(lab) && /addEventListener\('pointermove',e=>\{if\(\(e\.button!==0&&e\.button!==2\)\|\|!inArena\(\)\|\|pistol\.current\?\.kind!=='nade'\)return;/.test(lab) && /settings\.jumpRelease&&/.test(lab) && /pressThrow\(amClk,rel\.t\)/.test(lab)); }

console.log(`PASS: jump-throw and release · ${n} checks (take-off at 301.993 u/s at 30–240 fps, one CS2 tick for a plain jump + release, late releases on their own tick, stop to 0, eye 64.06 / 46.04, strengths 1 / 0.5 / 0, bindable)`);
