// Grenades on screen (every client): the grenade in flight (smoothed between host updates), the HE fireball,
// the flashbang white-out (how much depends on your own view: arena-nades.js flashAmount), the smoke cloud and the
// molotov fire, each with 3D sound. Materials are made once and shared (the graphics warm-up compiles them).
import * as THREE from './three.module.js';
import { weaponModel } from './weapon-models.js';
import { NADES, flashAmount, fireCells, smokeShape, holeOpen, smokeDensity } from './arena-nades.js';
import { audioCtx, outAt, reverb, listenerAt } from './spatial-audio.js';
import { fx as rec } from './sound-bank.js';

const soft = (inner, outer) => { try { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); if (typeof g?.createRadialGradient !== 'function') return null;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; } catch { return null; } };
const MAT = {
  smoke: new THREE.SpriteMaterial({ map: soft('rgba(205,208,212,1)', 'rgba(205,208,212,0)'), color: 0xd8dade, transparent: true, depthWrite: false, opacity: 0 }),
  fire: new THREE.SpriteMaterial({ map: soft('rgba(255,220,120,1)', 'rgba(255,90,0,0)'), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  boom: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  scorch: new THREE.MeshBasicMaterial({ color: 0x1a120c, transparent: true, opacity: .6, depthWrite: false }),
};
for (const m of Object.values(MAT)) m.userData.shared = true;
const F_CELLS = new WeakMap();
const BALL = new THREE.SphereGeometry(1, 16, 12), DISC = new THREE.CircleGeometry(1, 24);
// Smoke core: a lumpy, opaque ball (fixed noise) — the part of the cloud you can't see through.
const CORE = (() => { const g = new THREE.IcosahedronGeometry(1, 4), p = g.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + .12 * Math.sin(v.x * 5.1 + v.y * 3.3) * Math.cos(v.z * 4.7 - v.y * 2.1); v.multiplyScalar(n); if (v.y < -.2) v.y = -.2; p.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals(); return g; })();
MAT.core = new THREE.MeshBasicMaterial({ color: 0xc3c6ca, transparent: true, opacity: 0, depthWrite: true });   /* unlit: no facets, the same grey as the puffs */ MAT.core.userData.shared = true;
// Fire: crossed flame quads per burning cell (one instanced mesh), and a glowing floor so the area reads clearly.
const FLAME = (() => { const a = new THREE.PlaneGeometry(2.6, 3.4).translate(0, 1.7, 0), b = a.clone().rotateY(Math.PI / 2); const m = new THREE.BufferGeometry(); const P = [...a.attributes.position.array, ...b.attributes.position.array], U = [...a.attributes.uv.array, ...b.attributes.uv.array], I = [...a.index.array, ...b.index.array.map(i => i + 4)]; m.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); m.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); m.setIndex(I); return m; })();
MAT.flame = new THREE.MeshBasicMaterial({ map: MAT.fire.map, color: 0xffb060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); MAT.flame.userData.shared = true;
MAT.glow = new THREE.MeshBasicMaterial({ color: 0xff5a10, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false }); MAT.glow.userData.shared = true;
const CELL = new THREE.PlaneGeometry(3.1, 3.1).rotateX(-Math.PI / 2);
// Trajectory preview: dashed line + landing ring.
MAT.path = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 1.2, gapSize: .8, transparent: true, opacity: .75, depthTest: false }); MAT.path.userData.shared = true;
MAT.ring = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7, depthTest: false }); MAT.ring.userData.shared = true;
// Shared effect particles, made once (no allocation while playing): hot sparks / debris / embers (one instanced mesh),
// soft puffs (dark blast smoke, dust, steam, fire smoke; a fixed pool of sprites) and ground shock rings.
const SPARK = new THREE.BoxGeometry(.13, .13, .13), RING = new THREE.RingGeometry(.82, 1, 40).rotateX(-Math.PI / 2);
MAT.spark = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); MAT.spark.userData.shared = true;
MAT.wave = new THREE.MeshBasicMaterial({ color: 0xe8dcc0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }); MAT.wave.userData.shared = true;
let FXS = null;   // the live system (createNadeView), so the bomb's explosion can use it too
function createFxSystem(group, quality) {
  const N = 320, sparks = new THREE.InstancedMesh(SPARK, MAT.spark, N); sparks.frustumCulled = false; sparks.visible = false; group.add(sparks);
  const P = new Float32Array(N * 3), V = new Float32Array(N * 3), L = new Float32Array(N), LM = new Float32Array(N), SZ = new Float32Array(N), GR = new Float32Array(N), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(); let si = 0, alive = 0;
  for (let i = 0; i < N; i++) { m4.makeScale(0, 0, 0); sparks.setMatrixAt(i, m4); }
  const M = 44, puffs = Array.from({ length: M }, () => { const sp = new THREE.Sprite(MAT.smoke.clone()); sp.visible = false; sp.userData.t = 0; group.add(sp); return sp; }); let pi = 0;
  const F = 28, flames = Array.from({ length: F }, () => { const sp = new THREE.Sprite(MAT.fire.clone()); sp.visible = false; sp.userData.t = 0; group.add(sp); return sp; }); let fi = 0;
  const waves = Array.from({ length: 4 }, () => { const w = new THREE.Mesh(RING, MAT.wave.clone()); w.visible = false; w.userData.t = 0; group.add(w); return w; }); let wi = 0;
  const lo = () => quality() === 'Low' ? .5 : 1;
  return {
    // `count` sparks from (x, y, z): speed, extra upward speed, life (s), size, gravity (negative = rising embers).
    spark(x, y, z, count, { speed = 18, up = 8, life = .8, size = 1, gravity = 30 } = {}) { count = Math.ceil(count * lo());
      for (let k = 0; k < count; k++) { const i = si++ % N, a = Math.random() * Math.PI * 2, e = Math.random() * 2 - 1, r = Math.sqrt(1 - e * e), sp = speed * (.35 + Math.random() * .65);
        P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; V[i * 3] = Math.cos(a) * r * sp; V[i * 3 + 1] = Math.abs(e) * sp * .7 + up * Math.random(); V[i * 3 + 2] = Math.sin(a) * r * sp;
        if (L[i] <= 0) alive++; L[i] = LM[i] = life * (.6 + Math.random() * .4); SZ[i] = size * (.6 + Math.random() * .8); GR[i] = gravity; } sparks.visible = true; },
    // `count` soft puffs: color, size, growth, life (s), rising speed, spread (radius), opacity.
    puff(x, y, z, count, { color = 0x2e2a26, size = 4, grow = 1.5, life = 3, rise = 2, spread = 3, alpha = .85 } = {}) { count = Math.ceil(count * lo());
      for (let k = 0; k < count; k++) { const sp = puffs[pi++ % M], a = Math.random() * Math.PI * 2, r = spread * Math.sqrt(Math.random()), u = sp.userData;
        sp.position.set(x + Math.cos(a) * r, y + Math.random() * spread * .3, z + Math.sin(a) * r); sp.material.color.setHex(color); u.t = 0; u.life = life * (.7 + Math.random() * .5); u.size = size * (.7 + Math.random() * .6); u.grow = grow; u.rise = rise * (.6 + Math.random() * .8); u.alpha = alpha; u.drift = (Math.random() - .5) * 1.5; sp.visible = true; sp.scale.setScalar(.01); sp.material.opacity = 0; } },
    // `count` glowing flame balls (additive): a fireball that billows out and rises, burning from white-yellow to deep orange.
    fire(x, y, z, count, { size = 4, grow = 1.4, life = .7, rise = 3, spread = 2.5 } = {}) { count = Math.ceil(count * lo());
      for (let k = 0; k < count; k++) { const sp = flames[fi++ % F], a = Math.random() * Math.PI * 2, r = spread * Math.sqrt(Math.random()), u = sp.userData;
        sp.position.set(x + Math.cos(a) * r * .3, y + Math.random() * spread * .3, z + Math.sin(a) * r * .3); u.vx = Math.cos(a) * r * 2.2; u.vz = Math.sin(a) * r * 2.2; u.t = 0; u.life = life * (.7 + Math.random() * .6); u.size = size * (.6 + Math.random() * .7); u.grow = grow; u.rise = rise * (.5 + Math.random()); sp.visible = true; sp.scale.setScalar(.01); sp.material.opacity = 0; sp.material.color.setRGB(1, 1, .85); } },
    wave(x, y, z, radius = 14, life = .45) { const w = waves[wi++ % waves.length]; w.position.set(x, y + .08, z); w.userData.t = 0; w.userData.life = life; w.userData.r = radius; w.visible = true; w.scale.setScalar(.1); },
    update(dt) {
      if (alive > 0) { alive = 0; for (let i = 0; i < N; i++) { if (L[i] <= 0) continue; L[i] -= dt; const j = i * 3;
          if (L[i] <= 0) { m4.makeScale(0, 0, 0); sparks.setMatrixAt(i, m4); continue; } alive++;
          V[j + 1] -= GR[i] * dt; const drag = GR[i] < 0 ? 1 - dt * 1.5 : 1 - dt * .6; V[j] *= drag; V[j + 2] *= drag; P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt; if (P[j + 1] < .05 && GR[i] > 0) { P[j + 1] = .05; V[j + 1] *= -.3; V[j] *= .5; V[j + 2] *= .5; }
          const k = SZ[i] * (L[i] / LM[i]); m4.compose(v3.set(P[j], P[j + 1], P[j + 2]), q, s3.set(k, k, k * (1 + Math.min(3, Math.hypot(V[j], V[j + 1], V[j + 2]) * .08)))); sparks.setMatrixAt(i, m4); }
        sparks.instanceMatrix.needsUpdate = true; if (!alive) sparks.visible = false; }
      for (const sp of puffs) { if (!sp.visible) continue; const u = sp.userData; u.t += dt; if (u.t >= u.life) { sp.visible = false; continue; } const f = u.t / u.life;
        sp.position.y += u.rise * dt * (1 - f * .6); sp.position.x += u.drift * dt; sp.scale.setScalar(u.size * (1 + u.grow * Math.sqrt(f))); sp.material.opacity = u.alpha * Math.min(1, u.t / .12) * (1 - f) * (1 - f * .3); }
      for (const sp of flames) { if (!sp.visible) continue; const u = sp.userData; u.t += dt; if (u.t >= u.life) { sp.visible = false; continue; } const f = u.t / u.life, e = 1 - (1 - Math.min(1, f * 2.5)) ** 2;
        sp.position.x += u.vx * dt * (1 - f); sp.position.z += u.vz * dt * (1 - f); sp.position.y += u.rise * dt * f * 2; sp.scale.setScalar(u.size * (.3 + e * u.grow)); sp.material.opacity = Math.min(1, u.t / .04) * (1 - f) ** 1.4; sp.material.color.setRGB(1, Math.max(.35, .95 - f * .9), Math.max(.1, .8 - f * 1.6)); }
      for (const w of waves) { if (!w.visible) continue; const u = w.userData; u.t += dt; const f = u.t / u.life; if (f >= 1) { w.visible = false; continue; } w.scale.setScalar(.5 + u.r * Math.sqrt(f)); w.material.opacity = .55 * (1 - f) ** 2; }
    },
    clear() { for (let i = 0; i < N; i++) { L[i] = 0; m4.makeScale(0, 0, 0); sparks.setMatrixAt(i, m4); } sparks.instanceMatrix.needsUpdate = true; sparks.visible = false; alive = 0; for (const sp of puffs) sp.visible = false; for (const sp of flames) sp.visible = false; for (const w of waves) w.visible = false; },
  };
}
// One of each effect, for the warm-up.
export const nadeWarmObjects = () => [new THREE.Sprite(MAT.smoke), new THREE.Sprite(MAT.fire), new THREE.Mesh(BALL, MAT.boom), new THREE.Mesh(DISC, MAT.scorch), new THREE.Mesh(CORE, MAT.core), new THREE.InstancedMesh(SPARK, MAT.spark, 1), new THREE.Mesh(RING, MAT.wave), (() => { const m = new THREE.InstancedMesh(FLAME, MAT.flame, 1); m.setColorAt(0, new THREE.Color(1, .6, .2)); return m; })(), new THREE.InstancedMesh(CELL, MAT.glow, 1), new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), MAT.path)];

// Sounds: recorded explosions, flash bang, glass, burn and bounces (sound-bank fx), layered with synthesized body,
// flashbang ringing, smoke hiss, fire crackle and the throw whoosh.
// Noise bursts are made once per shape and reused (building a 3 s buffer mid-frame would cost a frame).
const noiseCache = new Map();
function noise(c, len, decay) { const k = len + ':' + decay; let b = noiseCache.get(k); if (b) return b; b = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, decay); noiseCache.set(k, b); return b; }
// Build them while idle at start.
export async function warmNadeSounds() { try { reverb(audioCtx()); } catch {}   /* the mix's reverb impulse is prepared here, while idle, not at the first shot */
  for (const [l, dc] of [[1.6, 2.2], [.6, 4], [2.5, .8], [1.2, 1.5], [.2, 3], [3, 1.8], [.25, 1.5]]) { await new Promise(r => (globalThis.requestIdleCallback || setTimeout)(r)); try { noise(audioCtx(), l, dc); } catch {} } }   // one shape per idle moment
function burst(at, { len = 1.2, decay = 2.5, freq = 900, vol = 1, type = 'lowpass', thump = 0 } = {}) {
  try { const c = audioCtx(), t = c.currentTime, out = outAt(c, at, thump ? 'explosion' : 'effect'), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = noise(c, len, decay); f.type = type; f.frequency.value = freq; g.gain.value = vol; s.connect(f).connect(g).connect(out); s.start(t);
    if (thump) { const w = c.createGain(); w.gain.value = Math.min(1, vol * .7); g.connect(w).connect(reverb(c)); }   // blasts ring off the walls
    if (thump) { const o = c.createOscillator(), og = c.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + .5); og.gain.setValueAtTime(thump, t); og.gain.exponentialRampToValueAtTime(.001, t + .6); o.connect(og).connect(out); o.start(t); o.stop(t + .65); } } catch {}
}
function ring(secs) { try { const c = audioCtx(), t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.frequency.value = 3200; g.gain.setValueAtTime(.08, t); g.gain.linearRampToValueAtTime(0, t + secs); o.connect(g).connect(c.destination); o.start(t); o.stop(t + secs); } catch {} }
const away = at => { const me = listenerAt(); return at && me ? Math.hypot(at.x - me.x, at.y - me.y, at.z - me.z) : 0; }, dull = at => Math.max(900, 18000 * Math.exp(-away(at) / 140));
export const throwSound = () => burst(null, { len: .25, decay: 1.5, freq: 1800, vol: .25, type: 'bandpass' });

export function createNadeView({ scene, camera, world, boxes = () => [], quality = () => 'Medium', hostNow = () => Date.now() }) {
  const group = new THREE.Group(); group.name = 'nades'; scene.add(group); const FXP = FXS = createFxSystem(group, quality);
  const FM = new THREE.Matrix4(), FQ = new THREE.Quaternion(), FV = new THREE.Vector3(), FS = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const live = new Map(), dir = new THREE.Vector3(); let flashUntil = 0, flashPeak = 0, flashAt = 0, path = null, landRing = null;
  document.body.insertAdjacentHTML('beforeend', '<div id="gd-flash" style="position:fixed;inset:0;z-index:39;background:#fff;opacity:0;pointer-events:none"></div>');
  const white = document.getElementById('gd-flash') || { style: {} };
  // Inside a smoke you see smoke: a veil as thick as the smoke at your eye (the same density the rules use).
  document.body.insertAdjacentHTML('beforeend', '<div id="gd-smokeveil" style="position:fixed;inset:0;z-index:20;background:#c9ccd0;opacity:0;pointer-events:none"></div>');
  const veil = document.getElementById('gd-smokeveil') || { style: {} }; let veilNow = 0;
  function effect(g) {
    const fx = new THREE.Group(); fx.position.set(g.x, g.y, g.z); group.add(fx); const at = { x: g.x, y: g.y, z: g.z }, parts = []; let fireLoop = null;
    if (g.phase === 'boom') { const b = new THREE.Sprite(MAT.fire.clone()); b.position.y = 1; fx.add(b); parts.push(b); FXP.fire(g.x, g.y + 1, g.z, 16, { size: 7, grow: 1.7, life: .8, rise: 3.5, spread: 3.5 }); const s = new THREE.Mesh(DISC, MAT.scorch); s.rotation.x = -Math.PI / 2; s.position.y = .05 - g.y + Math.max(0, g.y - .4); s.scale.setScalar(5); fx.add(s); FXP.spark(g.x, g.y + .4, g.z, 46, { speed: 26, up: 10, life: .9 }); FXP.puff(g.x, g.y + 1, g.z, 9, { color: 0x2c2824, size: 4.5, grow: 1.6, life: 3.6, rise: 2.6, spread: 3 }); FXP.puff(g.x, .3, g.z, 6, { color: 0x9a8a70, size: 3, grow: 2.2, life: 1.8, rise: .5, spread: 6, alpha: .55 }); FXP.wave(g.x, Math.max(0, g.y - .4), g.z, 16);
      const core = new THREE.Sprite(MAT.fire.clone()); core.material.color.setHex(0xffffff); core.position.y = 1; fx.add(core); parts.push(core);
      if (rec('he', { at, kind: 'explosion', volume: 1.5, wet: .9, lowpass: dull(at) })) { rec('low', { at, kind: 'explosion', volume: 1.2 }); burst(at, { len: .6, decay: 3, freq: 400, vol: .4, thump: 1 }); } else burst(at, { len: 1.6, decay: 2.2, freq: 700, vol: 1.3, thump: 1 }); }
    if (g.phase === 'pop') { const b = new THREE.Mesh(BALL, MAT.boom.clone()); b.material.color.setHex(0xffffff); fx.add(b); parts.push(b); FXP.spark(g.x, g.y, g.z, 22, { speed: 16, up: 4, life: .45, size: .7 }); FXP.puff(g.x, g.y, g.z, 3, { color: 0xc8c8c8, size: 2, grow: 1.2, life: 1.4, rise: 1, spread: .8, alpha: .5 }); if (!rec('flash', { at, kind: 'explosion', volume: 1.1, rate: 1.35, wet: .6, lowpass: dull(at) })) burst(at, { len: .6, decay: 4, freq: 2600, vol: 1, thump: .4 }); else burst(at, { len: .15, decay: 3, freq: 5000, vol: .5, type: 'highpass' });
      camera.getWorldDirection(dir); const a = flashAmount(boxes(), g.x, g.y, g.z, camera.position.x, camera.position.y, camera.position.z, dir.x, dir.y, dir.z, world.operations.game);
      if (a > .05) { flashPeak = Math.max(flashPeak * Math.max(0, (flashUntil - performance.now()) / 4000), a); flashAt = performance.now(); flashUntil = flashAt + 600 + 3400 * a; if (a > .4) ring(1 + 2.5 * a); } }
    if (g.phase === 'smoke') { // a dense volume: an opaque core you can't see through, wrapped in soft puffs (fewer on Low)
      const R = NADES.smoke.radius, core = new THREE.Mesh(CORE, MAT.core.clone()); core.userData.core = true; core.scale.set(R * .58, R * .44, R * .58); core.position.y = R * .12; fx.add(core); parts.push(core);
      const n = quality() === 'Low' ? 20 : quality() === 'Medium' ? 34 : 48; for (let i = 0; i < n; i++) { const sp = new THREE.Sprite(MAT.smoke.clone()), y = 1 - (i + .5) / n * 1.15, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996, f = .62 + (i % 3) * .1; sp.position.set(Math.cos(a) * rr * R * f, Math.max(1.2, R * .12 + y * R * .5 * f), Math.sin(a) * rr * R * f); sp.userData.size = R * (.5 + (i % 4) * .07); fx.add(sp); parts.push(sp); }   // a shell of soft puffs around the core: a fluffy outline
      FXP.puff(g.x, g.y + .3, g.z, 8, { color: 0xd4d6da, size: 3, grow: 3, life: 1.6, rise: 1.5, spread: 1.5, alpha: .8 }); if (rec('poof', { at, volume: .9, wet: .3 })) rec('smoke', { at, volume: .7, delay: .05 }); else burst(at, { len: 2.5, decay: .8, freq: 3000, vol: .35, type: 'highpass' }); }
    if (g.phase === 'fire') { // exactly where the host burns (fireCells): a glowing floor and flames on every cell
      const cells = fireCells(boxes(), g.x, g.z, g.y), flames = new THREE.InstancedMesh(FLAME, MAT.flame, Math.max(1, cells.length)), glow = new THREE.InstancedMesh(CELL, MAT.glow, Math.max(1, cells.length)), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      cells.forEach(([cx, cz], i) => { const h = .7 + ((i * 7919) % 13) / 13 * .7; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2.4) % 6.28); m4.compose(new THREE.Vector3(cx - g.x, .05, cz - g.z), q, sc.set(1, h, 1)); flames.setMatrixAt(i, m4); m4.compose(new THREE.Vector3(cx - g.x, .06, cz - g.z), new THREE.Quaternion(), sc.set(1, 1, 1)); glow.setMatrixAt(i, m4); });
      const tint = new THREE.Color(); cells.forEach((_, i) => flames.setColorAt(i, tint.setHSL(.06 + ((i * 3571) % 11) / 11 * .06, 1, .55 + ((i * 131) % 7) / 7 * .15)));
      flames.count = glow.count = cells.length; fx.userData.cells = cells; fx.userData.flames = flames; fx.userData.rot = cells.map((_, i) => (i * 2.4) % 6.28); fx.userData.h = cells.map((_, i) => .7 + ((i * 7919) % 13) / 13 * .7); flames.frustumCulled = glow.frustumCulled = false; fx.add(glow, flames); parts.push(flames); F_CELLS.set(fx, cells.length);
      if (rec('glass', { at, volume: 1, wet: .3 })) { rec('glass', { at, volume: .6, rate: .8, delay: .05 }); burst(at, { len: .9, decay: 1.2, freq: 600, vol: .5, thump: .25 }); } else burst(at, { len: 1.2, decay: 1.5, freq: 1200, vol: .7, thump: .3 });
      FXP.spark(g.x, g.y + .3, g.z, 30, { speed: 9, up: 6, life: 1.2, size: .8, gravity: 8 });
      fireLoop = rec('fire', { at, volume: .55, rate: .8, lowpass: 2600, loop: NADES.molotov.lasts / 1000 }) || null; }
    if (g.phase === 'out') { // put out by smoke: a puff of steam and a hiss where the fire was
      for (let i = 0; i < 10; i++) { const sp = new THREE.Sprite(MAT.smoke.clone()), a = i * 2.4; sp.position.set(Math.cos(a) * 5 * (i % 3) / 2, 1 + (i % 4), Math.sin(a) * 5 * (i % 3) / 2); sp.userData.size = 5 + (i % 3) * 2; fx.add(sp); parts.push(sp); }
      FXP.puff(g.x, g.y + .5, g.z, 8, { color: 0xe4e6e8, size: 4, grow: 2, life: 2, rise: 4, spread: 4, alpha: .6 }); burst(at, { len: 1, decay: 2.5, freq: 4200, vol: .45, type: 'highpass' }); }
    return { fx, parts, start: performance.now(), phase: g.phase, crackle: 0, loop: fireLoop };
  }
  return {
    group,
    update(dt) {
      const G = world.operations.game, list = G.mode === 'arena' ? G.combat?.nades || [] : [], now = performance.now(), seen = new Set();
      FXP.update(dt);
      for (const g of list) {
        seen.add(g.id); let v = live.get(g.id);
        if (!v) { v = { model: weaponModel(g.kind, 1.4), fx: null }; v.model.position.set(g.x, g.y, g.z); group.add(v.model); live.set(g.id, v); }
        if (g.phase === 'air' && (g.x !== v.hx || g.y !== v.hy || g.z !== v.hz)) { // a new host position: a sharp turn in its path is a bounce
          if (v.hx !== undefined) { const vx = g.x - v.hx, vy = g.y - v.hy, vz = g.z - v.hz, m = Math.hypot(vx, vy, vz), pm = Math.hypot(v.vx, v.vy, v.vz);
            if (m > .05 && pm > .05 && (vx * v.vx + vy * v.vy + vz * v.vz) / (m * pm) < .55 && now - (v.bounced || 0) > 120) { v.bounced = now; rec('bounce', { at: { x: g.x, y: g.y, z: g.z }, volume: Math.min(.8, .25 + pm * .15), rate: g.kind === 'molotov' ? .8 : .95 + Math.random() * .15, kind: 'step' }); }
            v.vx = vx; v.vy = vy; v.vz = vz; } else v.vx = v.vy = v.vz = 0;
          v.hx = g.x; v.hy = g.y; v.hz = g.z; }
        if (g.phase === 'air') { const k = 1 - Math.exp(-dt * 18); v.model.position.x += (g.x - v.model.position.x) * k; v.model.position.y += (g.y - v.model.position.y) * k; v.model.position.z += (g.z - v.model.position.z) * k; v.model.rotation.x += dt * 9; v.model.rotation.z += dt * 5; continue; }
        if (v.fx && v.fx.phase !== g.phase) { v.fx.loop?.stop?.(); v.fx.fx.removeFromParent(); for (const p of v.fx.parts) if (!p.material.userData?.shared && p.material !== MAT.fire && p.material !== MAT.smoke && p.material !== MAT.boom) p.material.dispose(); v.fx.fx.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); v.fx = null; }   // fire → out
        if (!v.fx) { v.fx = effect(g); if (g.phase !== 'fire' && g.phase !== 'smoke') v.model.visible = false; else v.model.position.set(g.x, g.y + .3, g.z); }
        const t = (now - v.fx.start) / 1000, F = v.fx;
        if (g.phase === 'boom' || g.phase === 'pop') { const b = F.parts[0], k = Math.min(1, t / .35), e = 1 - (1 - k) ** 3; b.scale.setScalar(.5 + e * (g.phase === 'boom' ? 24 : 4)); b.material.opacity = Math.max(0, 1 - t / .45) ** 1.5; b.visible = t < .45;
          const c = g.phase === 'boom' && F.parts[1]; if (c) { c.scale.setScalar(.4 + Math.min(1, t / .08) * 11); c.material.opacity = Math.max(0, 1 - t / .25); c.visible = t < .25; } }
        if (g.phase === 'smoke') { // the shared smoke shape (arena-nades smokeShape): grows, thins at the end; HE holes clear puffs near the blast
          const hn = hostNow(), S = smokeShape(g, hn), k = S.r / NADES.smoke.radius, fade = S.dens * Math.min(1, t / .5); let coreCut = 0;
          // Your eye deep inside this cloud: the veil already shows solid smoke, so the puffs around you are skipped (they only cost fill-rate).
          { const c = camera.position, inside = Math.hypot(c.x - g.x, c.z - g.z, (c.y - S.cy) / .62) < S.r * .7; if (F.fx.visible === inside) F.fx.visible = !inside; if (inside) continue; } for (const h of g.holes || []) if (Math.hypot(h.x - g.x, h.z - g.z) < NADES.smoke.radius * .8) coreCut = Math.max(coreCut, holeOpen(g, h.x, h.y, h.z, hn));
          for (const sp of F.parts) { if (sp.userData.core) { sp.scale.set(NADES.smoke.radius * .58 * k, NADES.smoke.radius * .44 * k, NADES.smoke.radius * .58 * k); sp.material.opacity = Math.max(0, Math.min(1, (t - .7) / .8)) * S.dens * (1 - coreCut * .9); sp.visible = sp.material.opacity > .02; continue; }
            const cut = g.holes?.length ? holeOpen(g, g.x + sp.position.x * k, g.y + sp.position.y, g.z + sp.position.z * k, hn) : 0; sp.position.multiplyScalar(1); sp.scale.setScalar(sp.userData.size * k * (1 + .08 * Math.sin(now / 900 + sp.id))); sp.material.opacity = .95 * fade * (1 - cut); } }
        if (g.phase === 'out') { for (const sp of F.parts) { sp.position.y += dt * 4; sp.scale.setScalar(sp.userData.size * (1 + t * 1.5)); sp.material.opacity = Math.max(0, .8 - t); } }
        if (g.phase === 'fire') { const left = NADES.molotov.lasts / 1000 - t, k = Math.max(0, Math.min(1, left / 1.2)); if (quality() === 'Low') F.parts[0].scale.set(1, (.8 + .2 * Math.sin(now / 80)) * k, 1); MAT.glow.opacity = .45 * k;
          const U = F.fx.userData, fl = U.flames; if (fl && quality() !== 'Low') { for (let i = 0; i < U.cells.length; i++) { const c = U.cells[i], w = .78 + .22 * Math.sin(now / 85 + i * 1.7) * Math.sin(now / 137 + i * .9);
              FQ.setFromAxisAngle(UP, U.rot[i] + Math.sin(now / 400 + i) * .25); FM.compose(FV.set(c[0] - g.x, .05, c[1] - g.z), FQ, FS.set(.85 + .3 * w, U.h[i] * w * k, .85 + .3 * w)); fl.setMatrixAt(i, FM); } fl.instanceMatrix.needsUpdate = true; }
          const cl = U.cells; if (cl?.length && k > .2) { if (now - (F.ember || 0) > 90) { F.ember = now; const c = cl[(Math.random() * cl.length) | 0]; FXP.spark(c[0] + (Math.random() - .5) * 2, g.y + .4, c[1] + (Math.random() - .5) * 2, 2, { speed: 2, up: 5, life: 1.4, size: .55, gravity: -3 }); }
            if (now - (F.smk || 0) > 450) { F.smk = now; const c = cl[(Math.random() * cl.length) | 0]; FXP.puff(c[0], g.y + 2.5, c[1], 1, { color: 0x221d1a, size: 3.5, grow: 2, life: 2.6, rise: 4.5, spread: 1, alpha: .5 }); } }
          if (now - F.crackle > 380) { F.crackle = now; burst({ x: g.x, y: g.y, z: g.z }, { len: .2, decay: 3, freq: 2200, vol: .25, type: 'bandpass' }); } }
      }
      for (const [id, v] of live) if (!seen.has(id)) { v.model.removeFromParent(); if (v.fx) { v.fx.loop?.stop?.(); v.fx.fx.removeFromParent(); for (const p of v.fx.parts) if (!p.material.userData?.shared && p.material !== MAT.fire && p.material !== MAT.smoke && p.material !== MAT.boom) p.material.dispose(); v.fx.fx.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); } live.delete(id); }
      // Flashbang white-out: full for a moment, then fades.
      const left = flashUntil - now; white.style.opacity = left > 0 ? String(Math.min(1, flashPeak * Math.min(1, left / 1800))) : '0';
      { const c = camera.position, want = list.some(n => n.phase === 'smoke') ? Math.min(.97, smokeDensity(G, c.x, c.y, c.z, hostNow()) * 1.25) : 0; veilNow += (want - veilNow) * Math.min(1, dt * 10); const o = veilNow < .01 ? '0' : veilNow.toFixed(2); if (veil.style.opacity !== o) veil.style.opacity = o; }
    },
    clear() { for (const v of live.values()) { v.model.removeFromParent(); v.fx?.loop?.stop?.(); v.fx?.fx.removeFromParent(); } live.clear(); FXP.clear(); white.style.opacity = '0'; veil.style.opacity = '0'; veilNow = 0; flashUntil = 0; this.preview(null); },
    // Where the grenade in your hand will go (points from arena-nades predictThrow), or null to hide.
    preview(pts) { if (!pts || pts.length < 2) { if (path) path.visible = landRing.visible = false; return; }
      if (!path) { path = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(82 * 3), 3)), MAT.path); path.frustumCulled = false; path.renderOrder = 5; landRing = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 24).rotateX(-Math.PI / 2), MAT.ring); landRing.renderOrder = 5; group.add(path, landRing); }
      const a = path.geometry.attributes.position, n = Math.min(82, pts.length); for (let i = 0; i < n; i++) a.setXYZ(i, pts[i][0], pts[i][1], pts[i][2]); a.needsUpdate = true; path.geometry.setDrawRange(0, n); path.computeLineDistances(); path.visible = true; const e = pts[n - 1]; landRing.position.set(e[0], Math.max(.08, e[1] - .3), e[2]); landRing.visible = true; },
  };
}
// The planted bomb's beep (3D) and the bomb's explosion (a big fireball, a heavy blast heard far away).
export function beep(at, pitch = 1) { try { const c = audioCtx(), t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.frequency.value = 1700 * pitch; g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .09); o.connect(g).connect(outAt(c, at, 'beep')); o.start(t); o.stop(t + .1); } catch {} }
export function explosion(parent, p, scale = 1) {
  const b = new THREE.Mesh(BALL, MAT.boom.clone()), t0 = performance.now(); b.position.set(p.x, (p.y || 0) + 2, p.z); parent.add(b);
  { const at = { x: p.x, y: (p.y || 0) + 2, z: p.z }; if (rec('bomb', { at, kind: 'explosion', volume: 2, wet: 1.2, lowpass: dull(at) })) { rec('bomblow', { at, kind: 'explosion', volume: 2 }); rec('he', { at, kind: 'explosion', volume: 1.2, rate: .7, delay: .08 }); burst(at, { len: 1.5, decay: 2, freq: 300, vol: .8, thump: 1.5 }); } else burst(at, { len: 3, decay: 1.8, freq: 500, vol: 2.5, thump: 1.5 }); }
  if (FXS) { const y = (p.y || 0); FXS.fire(p.x, y + 2, p.z, 20, { size: 10, grow: 1.6, life: 1.1, rise: 5, spread: 6 }); FXS.spark(p.x, y + 1.5, p.z, 90, { speed: 40, up: 16, life: 1.3, size: 1.3 }); FXS.puff(p.x, y + 2, p.z, 16, { color: 0x2a2622, size: 8, grow: 2, life: 5, rise: 4, spread: 6 }); FXS.puff(p.x, y + .3, p.z, 8, { color: 0x9a8a70, size: 5, grow: 2.5, life: 2.4, rise: .6, spread: 12, alpha: .5 }); FXS.wave(p.x, y, p.z, 40 * scale, .7); }
  const step = () => { const t = (performance.now() - t0) / 1000; b.scale.setScalar(1 + Math.min(1, t / .5) * 9 * scale); b.material.opacity = Math.max(0, 1 - t / .9); if (t < .9) requestAnimationFrame(step); else { b.removeFromParent(); b.material.dispose(); } }; requestAnimationFrame(step);
}
