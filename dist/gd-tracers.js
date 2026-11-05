// Global Defensive bullet tracers, CS2's look: a thin bright streak leaving the muzzle along the bullet's real path
// (the same seeded bullets the host traces — weapons.js for your own, shotDirs for another player's or a bot's),
// flying fast, stopping where the bullet stopped (a wall, a body, the floor) and fading out quickly.
//  · Which shots draw one (v53 FEEDBACK, spec addendum 15: Settings → Global Defensive → Bullet tracers, per user,
//    tracerMode() below — live-settings.js's live.tracers rule; nothing sent over LAN — every computer chooses for the bullets it sees):
//     – CS2 (the default): each gun's m_nTracerFrequency from the install's scripts/weapons.vdata (decompiled with
//       Source2Viewer-CLI 2026-11-05; per gun in TRACER_FREQ): 1 = every shot, 3 = every third (the rifles and SMGs),
//       0 = none (the MP5-SD; the USP-S and M4A1-S in their silencer-on mode — the vdata pair's second value, the mode
//       the guns are carried in here, weapons-data.js). Counted on the shot's own number (the pose's shot.n: shots n with
//       (n − 1) % f = 0, so every computer agrees on which); a shot without a number draws one. Shotguns: the same count
//       per bullet — Nova / XM1014 1: every pellet (how CS2 counts pellets is in its code, not its files: read so).
//     – Every bullet: every shot and pellet of every gun (52.0.5's rule — the user asked for it then).
//    Outside Global Defensive (gd false: fun-pistol.js passes gdOn()) every bullet, exactly as 52.0.5.
//  · One fixed pool (POOL streaks, each a core ribbon and a glow ribbon) in one camera-facing mesh — ONE draw, made and warmed at load (its shader is
//    built with the scene: samples()). A full pool reuses the oldest. update() writes the buffers in place: nothing is
//    made per frame or per shot.
import * as THREE from './three.module.js';
import { HU } from './weapons-data.js';
import { loadPreferences } from './player-preferences.js';
// (v53 FEEDBACK) The viewer's Bullet tracers setting — live-settings.js's rule (p.tracers 'every' | else 'cs2'), read here at
// the first shot and kept on every change. Not imported from live-settings: this module loads with the graphics chain
// (avatar → weapon-models → fun-pistol), and live-settings would then register its listener before a page (or a test)
// has its event target.
const TM = { m: null };
export function tracerMode() { if (TM.m === null) { const up = p => { TM.m = p?.tracers === 'every' ? 'every' : 'cs2'; }; up(loadPreferences()); globalThis.addEventListener?.('infra-preferences', e => up(e.detail || loadPreferences())); } return TM.m; }

// CS2's m_nTracerFrequency per Global Defensive gun (weapons.vdata; the class each id is, gd-reload-ref.js vdata).
export const TRACER_FREQ = Object.freeze({
  pistol: 1, usps: 0, p250: 1, fiveseven: 1, cz75: 1, tec9: 1, deagle: 1, cannon: 1,           // (glock [1, 1] · usp_silencer [1, 0]: silencer on 0 · p250 · fiveseven · cz75a · tec9 · deagle; cannon: Darja's Deagle, not GD)
  p2000: 1, elite: 1, revolver: 1, zeus: 1, taser: 1,                                           // (hkp2000 · elite · revolver [1, 1] · taser — the guns v53 adds, when present)
  mac10: 3, mp9: 3, mp7: 3, smg: 0, bizon: 3, ump45: 3, p90: 3,                                // (mp5sd 0)
  shotgun: 1, xm1014: 1, mag7: 1, sawedoff: 1,                                                  // (nova · xm1014 · mag7 · sawedoff)
  galil: 3, famas: 3, ak: 3, m4: 3, m4s: 0, sg553: 3, aug: 3,                                  // (galilar · famas [3, 3] · ak47 · m4a1 · m4a1_silencer [3, 0]: silencer on 0 · sg556 [3, 3] · aug [3, 3])
  ssg08: 1, sniper: 1, scar20: 1, g3sg1: 1, lmg: 1, negev: 1,                                  // (ssg08 · awp · scar20 · g3sg1 · m249 · negev)
});
export const TRACER_MODES = ['cs2', 'every'];
export const tracerFreq = id => TRACER_FREQ[id] ?? 1;   // (a gun not in the table: every shot)
// Does shot number n (the shooter's own count, as the pose carries it) draw a tracer? gd: in a Global Defensive match.
// mode: the viewer's setting. CS2: numbers 1, 1 + f, 1 + 2f…, none at f 0; n unknown: yes. Every bullet: always.
export function tracerShot(id, n, gd = true, mode = tracerMode()) { if (!gd || mode === 'every') return true; const f = tracerFreq(id); if (f <= 0) return false; return !Number.isFinite(n) || n < 1 || (n - 1) % f === 0; }
export const tracerPellet = (i, pellets) => true;   // (every pellet of a shot that draws: the count is per bullet — see above)

// The look (game units: HU = one Hammer unit), from CS2's weapon_tracers_assrifle.vpcf: a long thin streak (its trail
// grows to 1200 HU) flying 20 500 HU/s, white-hot at the head through orange to a red-orange tail, drawn twice — an
// added glow and a blended core (PARTICLE_OUTPUT_BLEND_MODE_ADD and _BLEND_ADD). Here: slower (12 000 HU/s: a 40 m
// shot stays on screen for about 8 frames), 300 HU (8 m) long (the user found 700 too long and 120 too short), running to the landing spot and shrinking into it, starting just past the muzzle (not inside your gun),
// shrinking into the stop after it lands and fading out. Widths: a world half-width, but never thinner on screen than
// minAng (radians of half-width: about 1 px core and 2.5 px glow across at 800 px: thin like CS2, the user found 2 px / 7 px too thick) nor fatter than maxAng (your own streak by
// the barrel stays a line, not a blob). The core is blended (alpha: shows on Dust II's white walls and bright sky),
// the glow is added on top (shines in the dark) — both in ONE draw: premultiplied colour (ONE, ONE_MINUS_SRC_ALPHA),
// the core with its alpha, the glow with alpha 0. Colours: sRGB as seen, kept linear for the shader.
const lin = (r, g, b, k = 1) => Object.freeze([r, g, b].map(c => Math.pow(c, 2.2) * k));
export const TRACER = Object.freeze({
  speed: 12000 * HU, length: 300 * HU, start: 14 * HU, fade: .06,
  core: Object.freeze({ width: .35 * HU, minAng: .0009, maxAng: .0016, head: lin(1, .9, .55), tail: lin(1, .58, .18), alpha: .97 }),
  glow: Object.freeze({ width: 1 * HU, minAng: .0016, maxAng: .0035, head: lin(1, .74, .34, .7), tail: lin(1, .48, .12, .4) }),
});
// (v53 GUNS8 final) The Zeus x27's own look — CS2's weapon_tracers_taser.vpcf (weapons.vdata weapon_taser m_szTracerParticle;
// decompiled with Source2Viewer-CLI 2026-11-05): its rope child weapon_tracers_taser_wire2 is an electric blue crackle
// (m_ColorMin / Max [149, 218–232, 255]), added (PARTICLE_OUTPUT_BLEND_MODE_ADD, overbright 4), radius up to 2 HU × 0.5
// in the middle of the path, shrinking to 0.35 (C_OP_InterpolateRadius) over its 0.4 s life, the last 0.1 s fading
// (C_OP_FadeOut). The path is there at once from the gun to the hit (C_INIT_CreateSequentialPathV2: no flight). Here
// one straight streak in the same pool and draw (CS2 bulges and sags its wire and uses a crack texture: see TASER_NOTE).
export const TASER = Object.freeze({ life: .4, fade: .1, endScale: .35,
  core: Object.freeze({ width: .6 * HU, minAng: .0012, maxAng: .004, head: lin(149 / 255, 225 / 255, 1, 1.6), tail: lin(149 / 255, 225 / 255, 1, 1.6), alpha: .9 }),
  glow: Object.freeze({ width: 1 * HU, minAng: .0022, maxAng: .006, head: lin(149 / 255, 225 / 255, 1, 1.2), tail: lin(149 / 255, 225 / 255, 1, 1.2) }) });
export const TASER_NOTE = 'CS2 draws the taser as a sagging, bulging rope with a crack texture; here a straight blue streak in the tracer pool (one draw).';
export const POOL = 128;   // (every bullet traced: room for a Negev burst with others firing)

// The streak's picture (premultiplied: rgb = alpha = strength): bright from the middle to the head (u = 1, its tip
// softened), dimmer toward the tail (u = 0) without vanishing, soft across (v). A data texture: no canvas needed.
function streakTexture() {
  const W = 64, H = 16, d = new Uint8Array(W * H * 4), ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = (i + .5) / W, v = (j + .5) / H * 2 - 1;
    const f = ss(0, .06, u) * (.5 + .5 * ss(0, .55, u)) * (1 - .55 * ss(.95, 1, u)) * Math.exp(-4.5 * v * v), b = Math.round(255 * f), o = (j * W + i) * 4;
    d[o] = d[o + 1] = d[o + 2] = d[o + 3] = b;
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
}

// The pool. scene: where the one mesh lives (always there: no add / remove, no shader rebuild). camera(): the eye the
// ribbons face (and whose distance sets their on-screen width).
export function createTracers(scene, { camera = () => null } = {}) {
  // Per streak: origin xyz, direction xyz, length to the stop, age (s; negative: not yet fired — a replayed burst's later shot).
  // Per streak two quads (8 vertices): the core, then the glow over it.
  const S = new Float32Array(POOL * 8), live = new Uint8Array(POOL), look = new Uint8Array(POOL);   /* (look: 1 the Zeus's, TASER — v53 GUNS8) */ let next = 0, active = 0, spawned = 0;
  const pos = new Float32Array(POOL * 8 * 3), col = new Float32Array(POOL * 8 * 4), uv = new Float32Array(POOL * 8 * 2), idx = new Uint16Array(POOL * 12);
  for (let i = 0; i < POOL * 2; i++) { uv.set([0, 0, 0, 1, 1, 1, 1, 0], i * 8); const v = i * 4; idx.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6); }
  const geo = new THREE.BufferGeometry(), P = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), C = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);   // (RGBA, premultiplied: the core's alpha, the glow's 0)
  geo.setAttribute('position', P); geo.setAttribute('color', C); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.setDrawRange(0, 0);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.MeshBasicMaterial({ map: streakTexture(), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  mat.userData.shared = true;
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'gd-tracers'; mesh.frustumCulled = false; mesh.renderOrder = 5;
  mesh.userData.gd = true; mesh.userData.fx = true; mesh.userData.noPool = true;   // (fx: drawn after a smoke, as the muzzle flashes)
  scene?.add(mesh);
  const eye = new THREE.Vector3();
  // One streak from (ox, oy, oz) along the unit direction (dx, dy, dz) for dist units; delay: seconds before it leaves.
  function spawn(ox, oy, oz, dx, dy, dz, dist, delay = 0, lk = 0) {
    if (!(dist > .05) || !Number.isFinite(dist + ox + oy + oz + dx + dy + dz)) return false;
    let k = -1; for (let j = 0; j < POOL; j++) { const s = (next + j) % POOL; if (!live[s]) { k = s; break; } }
    if (k < 0) k = next;   // full: the oldest goes
    next = (k + 1) % POOL; const o = k * 8; S[o] = ox; S[o + 1] = oy; S[o + 2] = oz; S[o + 3] = dx; S[o + 4] = dy; S[o + 5] = dz; S[o + 6] = Math.min(dist, 4000); S[o + 7] = -Math.max(0, delay); look[k] = lk;
    if (!live[k]) { live[k] = 1; active++; } spawned++; return true;
  }
  // A shot's end points ({ point, mark? }: the stops; marks — holes on the way — are not tracers) from `origin`.
  function shot(origin, ends, id, n, delay = 0, gd = true) {
    if (!tracerShot(id, n, gd)) return 0; let pellets = 0, made = 0; for (const e of ends) if (!e.mark) pellets++;
    let i = 0; for (const e of ends) { if (e.mark) continue; if (tracerPellet(i++, pellets)) { const x = e.point.x - origin.x, y = e.point.y - origin.y, z = e.point.z - origin.z, d = Math.hypot(x, y, z); if (d > .05 && spawn(origin.x, origin.y, origin.z, x / d, y / d, z / d, d, delay, id === 'zeus' || id === 'taser' ? 1 : 0)) made++; } }
    return made;
  }
  // One camera-facing quad (vertex base v) from tail to head across the side (sx, sy, sz): widths by the eye distances
  // dT / dH within L's limits, colours L.tail → L.head times k, alpha a (premultiplied).
  function quad(v, L, tx, ty, tz, hx, hy, hz, sx, sy, sz, dT, dH, k, a, ws = 1) {   // (ws: a width scale — the Zeus's shrinking rope)
    const wT = ws * Math.min(Math.max(L.width, dT * L.minAng), dT * L.maxAng), wH = ws * Math.min(Math.max(L.width, dH * L.minAng), dH * L.maxAng), p = v * 3, c = v * 4;
    pos[p] = tx - sx * wT; pos[p + 1] = ty - sy * wT; pos[p + 2] = tz - sz * wT; pos[p + 3] = tx + sx * wT; pos[p + 4] = ty + sy * wT; pos[p + 5] = tz + sz * wT;
    pos[p + 6] = hx + sx * wH; pos[p + 7] = hy + sy * wH; pos[p + 8] = hz + sz * wH; pos[p + 9] = hx - sx * wH; pos[p + 10] = hy - sy * wH; pos[p + 11] = hz - sz * wH;
    for (let i = 0; i < 4; i++) { const E = i < 2 ? L.tail : L.head, o = c + i * 4; col[o] = E[0] * k; col[o + 1] = E[1] * k; col[o + 2] = E[2] * k; col[o + 3] = a; }
  }
  // Each frame: age the streaks and write the live ones' ribbons into the one buffer.
  function update(dt) {
    const cam = camera(); if (cam) cam.getWorldPosition(eye);
    let q = 0; const T = TRACER, ex = eye.x, ey = eye.y, ez = eye.z;
    for (let k = 0; k < POOL; k++) {
      if (!live[k]) continue; const o = k * 8; S[o + 7] += dt; const age = S[o + 7]; if (age < 0) continue;
      // travel: how far the bullet is; the streak runs from just past the muzzle (start) to the stop, then shrinks into it.
      if (look[k]) { const Z = TASER, dist = S[o + 6]; if (age > Z.life) { live[k] = 0; active--; continue; }   // (v53 GUNS8: the Zeus — the whole path at once, 0.4 s, shrinking, fading at the end)
        const fk = age > Z.life - Z.fade ? (Z.life - age) / Z.fade : 1, ws = 1 - (1 - Z.endScale) * age / Z.life, ox = S[o], oy = S[o + 1], oz = S[o + 2], dx = S[o + 3], dy = S[o + 4], dz = S[o + 5], tl = dist > 3 * T.start ? T.start : 0;
        const hx = ox + dx * dist, hy = oy + dy * dist, hz = oz + dz * dist, tx = ox + dx * tl, ty = oy + dy * tl, tz = oz + dz * tl, vx = (hx + tx) * .5 - ex, vy = (hy + ty) * .5 - ey, vz = (hz + tz) * .5 - ez;
        let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx; const sl = Math.hypot(sx, sy, sz); if (sl < 1e-6) { sx = 0; sy = 1; sz = 0; } else { sx /= sl; sy /= sl; sz /= sl; }
        const dT = Math.hypot(tx - ex, ty - ey, tz - ez), dH = Math.hypot(hx - ex, hy - ey, hz - ez), a = Z.core.alpha * fk;
        quad(q * 8, Z.core, tx, ty, tz, hx, hy, hz, sx, sy, sz, dT, dH, a, a, ws); quad(q * 8 + 4, Z.glow, tx, ty, tz, hx, hy, hz, sx, sy, sz, dT, dH, fk, 0, ws); q++; continue; }
      const dist = S[o + 6], travel = age * T.speed, head = Math.min(dist, travel), tail = Math.max(dist > 3 * T.start ? T.start : 0, travel - T.length), over = age - dist / T.speed;   // over: seconds since it landed
      if (over > T.fade || tail >= dist) { live[k] = 0; active--; continue; }
      if (head - tail < 1e-3) continue;
      const fadeK = over > 0 ? 1 - over / T.fade : 1;
      const ox = S[o], oy = S[o + 1], oz = S[o + 2], dx = S[o + 3], dy = S[o + 4], dz = S[o + 5];
      const hx = ox + dx * head, hy = oy + dy * head, hz = oz + dz * head, tx = ox + dx * tail, ty = oy + dy * tail, tz = oz + dz * tail;
      // Side: across the streak, square to the line of sight (the ribbon faces the eye).
      const vx = (hx + tx) * .5 - ex, vy = (hy + ty) * .5 - ey, vz = (hz + tz) * .5 - ez;
      let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx; const sl = Math.hypot(sx, sy, sz);
      if (sl < 1e-6) { sx = 0; sy = 1; sz = 0; } else { sx /= sl; sy /= sl; sz /= sl; }
      const dT = Math.hypot(tx - ex, ty - ey, tz - ez), dH = Math.hypot(hx - ex, hy - ey, hz - ez), a = T.core.alpha * fadeK;
      quad(q * 8, T.core, tx, ty, tz, hx, hy, hz, sx, sy, sz, dT, dH, a, a);              // the blended core (premultiplied)
      quad(q * 8 + 4, T.glow, tx, ty, tz, hx, hy, hz, sx, sy, sz, dT, dH, fadeK, 0);      // the added glow over it
      q++;
    }
    geo.setDrawRange(0, q * 12);
    if (q) { P.clearUpdateRanges(); P.addUpdateRange(0, q * 24); P.needsUpdate = true; C.clearUpdateRanges(); C.addUpdateRange(0, q * 32); C.needsUpdate = true; }
    drawn = q;
  }
  let drawn = 0;
  function clear() { live.fill(0); active = 0; geo.setDrawRange(0, 0); drawn = 0; }
  // For the GPU warm-up (graphics.prewarm / compileFor): a mesh with the very material and buffers.
  const sample = () => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m; };
  return { spawn, shot, update, clear, sample, mesh, get active() { return active; }, get drawn() { return drawn; }, get spawned() { return spawned; }, buffers: { pos, col } };
}
