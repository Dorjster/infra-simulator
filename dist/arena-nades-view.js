// Grenades on screen (every client): the grenade in flight (smoothed between host updates), the HE fireball,
// the flashbang white-out (how much depends on your own view: arena-nades.js flashBlind), the smoke cloud and the
// molotov fire, each with 3D sound. Materials are made once and shared (the graphics warm-up compiles them).
import * as THREE from './three.module.js';
import { weaponModel, groundRest } from './weapon-models.js';
import { NADES, stepNade, throwStart, launch, cs2Release, THROW_DELAY, flashBlind, stackFlash, flashWhite, decoyShots, decoyShotAt, DECOY, fireCells, smokeShape, holeOpen, smokeDensity, smokeVoxels, smokeFront, holeRadius, smokeHoleCells, HOLE_IN, HOLE_OUT, SMOKE, VOX, FIRE, cellEnd } from './arena-nades.js';
import { smokeHoleBytes, smokeLocalCut, smokeCutsNow, SMOKE_CUTS, TUNNEL as CUT_RULES, BILLOW, R as NADE_R } from './arena-nades.js';
import { flyNade, NADE_DT, GRAVITY as NADE_G } from './arena-nades.js';   // (v53: copies fly the host's own 1/64 s steps)
import { createSmokePass } from './arena-smoke-pass.js';
import { createFireView } from './gd-fire-view.js';   // (v53 FIRE: every fire, bottle in flight, burst, extinguish and scorch in one draw)
import { gdPlay } from './gd-sounds.js';   // (v53 FIRE: CS2's own grenade sound events — Molotov.Start, Inferno.Loop, Molotov.Extinguish, BaseSmokeEffect.Sound … — when the room has them)
import { flightFrame, frameClock, drawFixed } from './phys-smooth.js';
// A flight's correction (the host's word on where your copy of it flies) eased out with this time constant (s): ~95 %
// gone in 150 ms and never faster than the grenade flies (v51's 25 ms pulled a 2-unit correction back at 80 units/s:
// a grenade flying 100 units/s all but stopped). A resting grenade settles into its lying pose over REST_BLEND s.
const CORR_TAU = .05, REST_BLEND = .15, FC = { t: undefined };
import { audioCtx, outAt, reverb, listenerAt } from './spatial-audio.js';
import { fx as rec, shotSound } from './sound-bank.js';

const soft = (inner, outer) => { try { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); if (typeof g?.createRadialGradient !== 'function') return null;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; } catch { return null; } };
const MAT = {
  smoke: new THREE.SpriteMaterial({ map: soft('rgba(176,179,184,1)', 'rgba(176,179,184,0)'), color: 0x8e9196, transparent: true, depthWrite: false, opacity: 0 }),   // CS2's grey: darker than a cloud
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
// Molotov flames (CS2): crossed quads per burning cell, each an animated flame drawn by its shader — a noise-torn
// teardrop licking upward, white-yellow at the core to deep orange at the edges, additive (the glow picks it up on High).
const NOISE2 = (() => { const n = 64, a = new Uint8Array(n * n); let r = 98765; for (let i = 0; i < a.length; i++) { r = (r * 16807) % 2147483647; a[i] = r & 255; }
  const t = new THREE.DataTexture(a, n, n, THREE.RedFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t; })();
MAT.flame = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uNoise: { value: NOISE2 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  vertexShader: `varying vec2 vUv; varying float vPhase; void main() { vUv = uv; vPhase = fract(float(gl_InstanceID) * 0.6180339); gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uTime; uniform sampler2D uNoise; varying vec2 vUv; varying float vPhase;
void main() { float t = uTime + vPhase * 7.3, n = texture2D(uNoise, vec2(vUv.x * 0.9 + vPhase, vUv.y * 0.7 - t * 1.3)).r, n2 = texture2D(uNoise, vec2(vUv.x * 1.9 - vPhase * 3.1, vUv.y * 1.4 - t * 2.1)).r;
  float x = (vUv.x - 0.5) * 2.0 + (n - 0.5) * 0.8 * vUv.y, w = mix(1.0, 0.3, pow(vUv.y, 1.3)), body = 1.0 - smoothstep(w * 0.3, w, abs(x)), tip = 1.0 - smoothstep(0.3, 1.0, vUv.y + (n2 - 0.5) * 0.6);
  float a = body * tip * smoothstep(0.0, 0.12, vUv.y) * (0.55 + 0.45 * n2); if (a < 0.01) discard; float core = clamp(a * 1.3 - vUv.y * 0.9, 0.0, 1.0);
  vec3 c = mix(vec3(0.55, 0.09, 0.01), vec3(0.95, 0.42, 0.08), core); c = mix(c, vec3(1.0, 0.75, 0.38), core * core); gl_FragColor = vec4(c * a * 0.75, a); }` }); MAT.flame.userData.shared = true;
MAT.glow = new THREE.MeshBasicMaterial({ map: soft('rgba(255,140,40,1)', 'rgba(255,60,0,0)'), color: 0xff7a26, transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false }); MAT.glow.userData.shared = true;   // a soft round glow per cell, overlapping: one glowing floor
const CELL = new THREE.PlaneGeometry(5.2, 5.2).rotateX(-Math.PI / 2);
// Trajectory preview: dashed line + landing ring.
MAT.path = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 1.2, gapSize: .8, transparent: true, opacity: .75, depthTest: false }); MAT.path.userData.shared = true;
MAT.ring = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7, depthTest: false }); MAT.ring.userData.shared = true;
// CS2's smoke on screen: arena-smoke-pass.js — every live cloud in one ray-marched pass after the scene (its cells, the
// same the rules use, in one 3D atlas). This module gives each cloud a slot when it pops (its cells, light and HE
// holes) and each frame its front, fade, holes' radii and the open bullet tunnels.
// Bullet tunnels (CS2): a shot through a smoke clears a narrow tube along its path that fills in again within about a
// second — arena-nades.js TUNNEL / smokeCut: the host's tunnels and your own shots (here, at once, on the host's clock)
// are what the rules subtract and the pass clears.
export const TUNNEL = CUT_RULES;
// view: another player's shot replayed here — drawn, never in the rules (arena-nades.js smokeLocalCut). A shot that
// crosses no smoke cuts nothing.
let cutClock = () => Date.now(), cutGame = () => null;
export function smokeTunnel(ox, oy, oz, dx, dy, dz, len = TUNNEL.reach, view = false) { const g = cutGame(); if (g?.mode !== 'arena') return false; return smokeLocalCut(ox, oy, oz, dx, dy, dz, len, cutClock(), view, g); }
const NO_HOLES = [], SEEN = new Set(), DRAWN = { x: 0, y: 0, z: 0 };   // (DRAWN: where a fixed-step copy is drawn this frame — drawFixed, reused)
const fadeNow = (s, now) => Math.max(0, Math.min(1, (NADES.smoke.lasts - (now - (s.firedAt || now))) / SMOKE.fade));   // (arena-nades.js fadeOf: its last SMOKE.fade ms)
// An effect's parts let go of (its own materials, instanced meshes; its smoke slot): when it ends, and on clear().
function disposeFx(F, pass) { F.loop?.stop?.(); F.fx.removeFromParent(); if (F.slot >= 0) { pass?.remove(F.slot); F.slot = -1; }
  for (const p of F.parts) if (p.material && !p.material.userData?.shared && p.material !== MAT.fire && p.material !== MAT.smoke && p.material !== MAT.boom) p.material.dispose();
  F.fx.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); }

// Shared effect particles, made once (no allocation while playing): hot sparks / debris / embers (one instanced mesh),
// soft puffs (dark blast smoke, dust, steam, fire smoke; a fixed pool of sprites) and ground shock rings.
const SPARK = new THREE.BoxGeometry(.13, .13, .13), RING = new THREE.RingGeometry(.82, 1, 40).rotateX(-Math.PI / 2);
MAT.spark = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); MAT.spark.userData.shared = true;
MAT.wave = new THREE.MeshBasicMaterial({ color: 0xe8dcc0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }); MAT.wave.userData.shared = true;
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
// (the smoke's own pass warms itself: createNadeView().warm)
export const nadeWarmObjects = () => { for (const k in NADES) try { groundRest(k); } catch {} return nadeWarm(); };   // (each grenade's resting pose measured now, not when the first one lands mid-round: restNade)
const nadeWarm = () => [new THREE.Sprite(MAT.smoke), new THREE.Sprite(MAT.fire), new THREE.Mesh(BALL, MAT.boom), new THREE.Mesh(DISC, MAT.scorch), new THREE.Mesh(CORE, MAT.core), new THREE.InstancedMesh(SPARK, MAT.spark, 1), new THREE.Mesh(RING, MAT.wave), (() => { const m = new THREE.InstancedMesh(FLAME, MAT.flame, 1); m.setColorAt(0, new THREE.Color(1, .6, .2)); return m; })(), (() => { const m = new THREE.InstancedMesh(CELL, MAT.glow, 1); m.userData.gd = true; return m; })(), new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), MAT.path)];

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
// (FIRE final) The incendiary's own stand-in when CS2's IncGrenade.Start / .StartFailed isn't imported: a can's pop and
// the fire's whoosh — never the bottle's glass (two of the warmed noise shapes)
const canPop = at => { burst(at, { len: .25, decay: 1.5, freq: 1400, vol: .6, type: 'bandpass', thump: .5 }); burst(at, { len: 1.2, decay: 1.5, freq: 700, vol: .55 }); };
// A grenade come to rest (a decoy at work, a smoke smoking, a fire burning): lying on the floor as CS2's do — on its
// largest face (weapon-models groundRest: a can on its side), its lowest point on the floor — not frozen mid-tumble
// half in the ground. The floor: a smoke's or a fire's g.y (arena-nades.js puts it on the surface it lies on), else
// under the sphere it flew as (a decoy: centre g.y, radius R). Its yaw from its id ('n<seq>', arena-nades.js: the same
// on every client; +g.id was NaN → 0, every grenade lay the same way). Once per grenade, never per frame.
// Which grenades stay drawn once they go off (liesAfter): a decoy at work and a smoke smoking lie there; an incendiary
// or a molotov is gone into its fire, as an HE or a flash into its blast — CS2 removes the projectile when it detonates
// (v52 M: the can lay intact in its own flames).
const BOUNCE_EV = { he: 'nade.he.bounce', flash: 'nade.flash.bounce', smoke: 'nade.smoke.bounce', decoy: 'nade.decoy.bounce', molotov: 'nade.molotov.bounce', incendiary: 'nade.incendiary.bounce' };
export const liesAfter = phase => phase === 'decoy' || phase === 'smoke';
export function restNade(model, kind, g) { const r = groundRest(kind), s = model.scale.x || 1, id = parseInt(String(g.id).replace(/\D/g, ''), 10) || 0, floor = g.phase === 'smoke' || g.phase === 'fire' ? g.y : g.y - NADE_R;
  model.rotation.set(r.x, (id * 2.39996) % (2 * Math.PI), r.z, 'YXZ'); model.position.set(g.x, floor + r.lift * s, g.z); return model; }

export function createNadeView({ scene, camera, world, boxes = () => [], bounds = () => null, quality = () => 'Medium', hostNow = () => Date.now() }) {
  const group = new THREE.Group(); group.name = 'nades'; group.userData.gd = true; scene.add(group);
  // The effects (fire, flames, sparks, puffs, blast balls) on their own top-level group, flagged fx: while a smoke is up
  // they are drawn after it (arena-smoke-pass.js), so a fire in front of a cloud isn't painted over by it.
  const fxg = new THREE.Group(); fxg.name = 'nadeFx'; fxg.userData.gd = true; fxg.userData.fx = true; scene.add(fxg); const FXP = FXS = createFxSystem(fxg, quality);
  // v53 FIRE: the fires (gd-fire-view.js) — a top-level mesh of its own (userData.gd + warm + fx: compiled behind the
  // loading card, drawn after the smoke); a bottle in flight burns where this view draws it.
  // (FIRE final: each flame as it lights — CS2's Inferno.Fire.Ignite, placed at the flame; one reused spot, nothing made)
  const IGN = { x: 0, y: 0, z: 0 }, onFlame = (x, y, z) => { IGN.x = x; IGN.y = y + .3; IGN.z = z; snd('nade.fire.crackle', IGN); };
  const live = new Map(), fire = createFireView({ scene, quality, hostNow, boxes, onFlame, drawnAt: id => { const v = live.get(id); return v && v.model.visible !== false ? v.model.position : null; } });
  // Sounds (v53 FIRE): an event of CS2's (gd-sounds.js, placed, with walls and distance) when the room has it, else ours.
  const SO = { at: null, src: null, loop: 0, key: null }, snd = (id, at, o = null) => { SO.at = at; SO.src = null; SO.loop = o?.loop || 0; SO.key = o?.key || null; try { return gdPlay(id, SO); } catch { return false; } };
  let pass = null; const smokes = () => pass ??= (() => { const renderer = globalThis.__infra?.renderer; if (!renderer) return null; const p = createSmokePass({ renderer, scene, camera, quality }); scene.userData.gdSmoke = p; return p; })();   // (made once a renderer is there)
  cutClock = hostNow; cutGame = () => world?.operations?.game;
  const FM = new THREE.Matrix4(), FQ = new THREE.Quaternion(), FV = new THREE.Vector3(), FS = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(), FL = { peak: 0, holdUntil: 0, fadeEnd: 0 }, FB = { s: 0, peak: 0, hold: 0, fade: 0 }; let path = null, landRing = null;   // (FL: your stacked flashes — arena-nades.js stackFlash; FB: one flash's white-out, reused)
  // Your own throw, drawn the moment you let go: from the hand, with the start and launch the host uses (arena-nades.js
  // throwStart / launch), flown here as a copy (view: it never touches collision) until the host's grenade by you of
  // that kind arrives a round trip later — that one then takes over this model, the gap eased out like any correction.
  // Refused, or not heard back within MINE_MS: let go of. (arena-ui.js throwNade: gd-throw-start / gd-throw-refused.)
  const mine = [], MINE_MS = 1200, nameKey = n => String(n || '').trim().toLowerCase();
  // (v53: flown in the host's own fixed steps from the moment of release — d.t, s on performance.now()'s clock: the throw
  // waited up to a movement tick for its state, arena-move.js pressThrow — so it is where the host's will be)
  const onThrow = e => { const d = e?.detail; if (!d?.a || !NADES[d.kind]) return; try { const b = boxes(), bb = b?.length ? b : null, ra = cs2Release(d.a, THROW_DELAY, bb, bounds()), s = throwStart(ra, bb, bounds()), v = launch(ra), m = weaponModel(d.kind, 1.4), late = Number.isFinite(d.t) ? Math.max(0, Math.min(.1, performance.now() / 1000 - d.t - THROW_DELAY)) : 0;   /* (v53 S2 review: made THROW_DELAY after the release d.t — arena-ui.js sends it then — with the host's collision during the delay) */
    m.position.set(s.x, s.y, s.z); group.add(m); mine.push({ kind: d.kind, by: nameKey(d.by), seq: d.seq, model: m, age: 0, sim: { x: s.x, y: s.y, z: s.z, vx: v.vx, vy: v.vy, vz: v.vz, still: 0, rest: false, grav: undefined, bt: undefined, void: false, bad: false, view: true, pastGlass: null, n: 0, acc: late, p: new Float64Array(6) } }); } catch {} };
  const dropMine = i => { mine[i].model.removeFromParent(); mine.splice(i, 1); };
  if (typeof addEventListener === 'function') { addEventListener('gd-throw-start', onThrow); addEventListener('gd-throw-refused', e => { const i = mine.findIndex(c => c.seq === e?.detail?.seq); if (i >= 0) dropMine(i); }); }
  // (the host's new grenade: yours of this kind thrown here and still waiting — the oldest — or none)
  const flyStep = (S, d) => flyNade(S, boxes(), bounds(), d, null, S.p);   // (one closure: no allocation per frame; v53: the host's fixed steps — arena-nades.js flyNade)
  const adopt = g => { const by = nameKey(g.by), i = mine.findIndex(c => c.kind === g.kind && c.by === by); if (i < 0) return null; const c = mine[i]; mine.splice(i, 1); return c; };
  document.body.insertAdjacentHTML('beforeend', '<div id="gd-flash" style="position:fixed;inset:0;z-index:39;background:#fff;opacity:0;pointer-events:none"></div>');
  const white = document.getElementById('gd-flash') || { style: {} };
  // (inside a smoke: the pass's own march from your eye — thick smoke in front of you is opaque, no screen veil)
  function effect(g) {
    const fx = new THREE.Group(); fx.position.set(g.x, g.y, g.z); fxg.add(fx); const at = { x: g.x, y: g.y, z: g.z }, parts = []; let fireLoop = null, loopCulled = false;
    if (g.phase === 'boom') { globalThis.dispatchEvent?.(new CustomEvent('gd-blast', { detail: { x: g.x, y: g.y, z: g.z, r: NADES.he.radius } }));   // (a CS2 map's pots and cans thrown about: arena-physprops.js)
      const b = new THREE.Sprite(MAT.fire.clone()); b.position.y = 1; fx.add(b); parts.push(b); FXP.fire(g.x, g.y + 1, g.z, 16, { size: 7, grow: 1.7, life: .8, rise: 3.5, spread: 3.5 }); const s = new THREE.Mesh(DISC, MAT.scorch); s.rotation.x = -Math.PI / 2; s.position.y = .05 - g.y + Math.max(0, g.y - .4); s.scale.setScalar(5); fx.add(s); FXP.spark(g.x, g.y + .4, g.z, 46, { speed: 26, up: 10, life: .9 }); FXP.puff(g.x, g.y + 1, g.z, 9, { color: 0x2c2824, size: 4.5, grow: 1.6, life: 3.6, rise: 2.6, spread: 3 }); FXP.puff(g.x, .3, g.z, 6, { color: 0x9a8a70, size: 3, grow: 2.2, life: 1.8, rise: .5, spread: 6, alpha: .55 }); FXP.wave(g.x, Math.max(0, g.y - .4), g.z, 16);
      const core = new THREE.Sprite(MAT.fire.clone()); core.material.color.setHex(0xffffff); core.position.y = 1; fx.add(core); parts.push(core);
      if (rec('he', { at, kind: 'explosion', volume: 1.5, wet: .9, lowpass: dull(at) })) { rec('low', { at, kind: 'explosion', volume: 1.2 }); burst(at, { len: .6, decay: 3, freq: 400, vol: .4, thump: 1 }); } else burst(at, { len: 1.6, decay: 2.2, freq: 700, vol: 1.3, thump: 1 }); }
    if (g.phase === 'pop') { const b = new THREE.Mesh(BALL, MAT.boom.clone()); b.material.color.setHex(0xffffff); fx.add(b); parts.push(b); FXP.spark(g.x, g.y, g.z, 22, { speed: 16, up: 4, life: .45, size: .7 }); FXP.puff(g.x, g.y, g.z, 3, { color: 0xc8c8c8, size: 2, grow: 1.2, life: 1.4, rise: 1, spread: .8, alpha: .5 }); if (!rec('flash', { at, kind: 'explosion', volume: 1.1, rate: 1.35, wet: .6, lowpass: dull(at) })) burst(at, { len: .6, decay: 4, freq: 2600, vol: 1, thump: .4 }); else burst(at, { len: .15, decay: 3, freq: 5000, vol: .5, type: 'highpass' });
      // Your white-out (arena-nades.js flashBlind: how long by how much reaches you and where you look, how white by the
      // tier), stacked on any you still have — a weaker second flash never shortens or dims a stronger one (stackFlash).
      camera.getWorldDirection(dir); const B = flashBlind(boxes(), g.x, g.y, g.z, camera.position.x, camera.position.y, camera.position.z, dir.x, dir.y, dir.z, world.operations.game, FB);
      if (B.hold + B.fade > 30) { stackFlash(FL, B, performance.now()); if (B.hold + B.fade > 1900) ring(1 + 2.5 * Math.min(1, (B.hold + B.fade) / 4000)); } }
    if (g.phase === 'fizz') { FXP.spark(g.x, g.y, g.z, 10, { speed: 6, up: 3, life: .35, size: .5 }); FXP.puff(g.x, g.y, g.z, 3, { color: 0xb8b8b8, size: 1.2, grow: 1.5, life: .9, rise: .8, spread: .5, alpha: .5 }); burst(at, { len: .25, decay: 3, freq: 1500, vol: .35, type: 'bandpass' }); }   // the decoy's end: a small pop
    let slot = -1;
    if (g.phase === 'smoke') { // CS2's volume (a slot of the smoke pass: its cells); without the map's boxes: an opaque core wrapped in soft puffs (fewer on Low)
      const v = smokeVoxels(world.operations.game, g), P = v && smokes(); slot = P ? P.add(v) : -1;
      if (slot < 0) { const R = NADES.smoke.radius, core = new THREE.Mesh(CORE, MAT.core.clone()); core.userData.core = true; core.scale.set(R * .58, R * .44, R * .58); core.position.y = R * .12; fx.add(core); parts.push(core);
      const n = quality() === 'Low' ? 20 : quality() === 'Medium' ? 34 : 48; for (let i = 0; i < n; i++) { const sp = new THREE.Sprite(MAT.smoke.clone()), y = 1 - (i + .5) / n * 1.15, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996, f = .62 + (i % 3) * .1; sp.position.set(Math.cos(a) * rr * R * f, Math.max(1.2, R * .12 + y * R * .5 * f), Math.sin(a) * rr * R * f); sp.userData.size = R * (.5 + (i % 4) * .07); fx.add(sp); parts.push(sp); } }   // a shell of soft puffs around the core: a fluffy outline
      FXP.puff(g.x, g.y + .3, g.z, 8, { color: 0x9a9da1, size: 3, grow: 3, life: 1.6, rise: 1.5, spread: 1.5, alpha: .8 }); if (snd('nade.smoke.emit', at, { key: 'se:' + g.id })) {} else if (rec('poof', { at, volume: .9, wet: .3 })) rec('smoke', { at, volume: .7, delay: .05 }); else burst(at, { len: 2.5, decay: .8, freq: 3000, vol: .35, type: 'highpass' }); }   // (v53 FIRE: CS2's BaseSmokeEffect.Sound — never a fire sound)
    if (g.phase === 'fire') { // v53 FIRE: drawn by gd-fire-view.js (the host's flames); here its sounds — CS2's Molotov.Start / IncGrenade.Start
      // (with Molotov.Smash / IncGrenade.Pop and the distant layer: gd-sounds.js) and the Inferno.Loop while it burns
      const inc = g.kind === 'incendiary', left = Math.max(.5, ((g.fe ?? NADES.molotov.lasts) - (hostNow() - (g.firedAt || hostNow()))) / 1000);
      if (!snd(inc ? 'nade.incendiary.ignite' : 'nade.molotov.ignite', at, { key: 'fi:' + g.id })) { if (inc) canPop(at); else if (rec('glass', { at, volume: 1, wet: .3 })) { rec('glass', { at, volume: .6, rate: .8, delay: .05 }); burst(at, { len: .9, decay: 1.2, freq: 600, vol: .5, thump: .25 }); } else burst(at, { len: 1.2, decay: 1.5, freq: 1200, vol: .7, thump: .3 }); }   // (the can: our pop and whoosh — CS2's IncGrenade.Start is inc_grenade_detonate_1–3, no glass)
      FXP.spark(g.x, g.y + .3, g.z, inc ? 40 : 24, { speed: inc ? 14 : 9, up: 6, life: inc ? .9 : 1.2, size: .8, gravity: 8 });   // (the incendiary's burst throws sparks: incendiary_explosion's splash, sparks_burst)
      SO.at = at; SO.src = null; SO.key = null; SO.loop = left; let lp = null; try { lp = gdPlay('nade.fire.loop', SO); } catch {} SO.loop = 0;
      fireLoop = lp && typeof lp === 'object' ? lp : lp ? null : rec('fire', { at, volume: .55, rate: .8, lowpass: 2600, loop: left }) || null; loopCulled = lp === true; }   // (lp true: out of earshot — tried again as you come closer: the update below)
    if (g.phase === 'out' && g.airburst) { if (!snd(g.kind === 'incendiary' ? 'nade.incendiary.air' : 'nade.molotov.air', at, { key: 'fa:' + g.id })) { if (g.kind === 'incendiary') canPop(at); else rec('glass', { at, volume: .8 }); } FXP.spark(g.x, g.y, g.z, 30, { speed: 18, up: 6, life: .8 }); }   // a molotov that burst high in the air: CS2's Molotov.StartFailed, its fireball (gd-fire-view), no fire below
    else if (g.phase === 'out') { // put out by smoke (or broke inside it): CS2's Molotov.Extinguish, its dark swirl and embers (gd-fire-view.js) — never the smoke grenade's look or sound
      if (!snd('nade.fire.out', at, { key: 'fo:' + g.id })) { burst(at, { len: .5, decay: 3.5, freq: 900, vol: .4, type: 'lowpass' }); burst(at, { len: .3, decay: 4, freq: 2400, vol: .2, type: 'bandpass' }); }   // (ours: a dull wet thud and sizzle — the smoke's own hiss is a long bright highpass)
      FXP.spark(g.x, g.y + .4, g.z, 16, { speed: 5, up: 7, life: 1.1, size: .6, gravity: 6 }); }
    return { fx, parts, start: performance.now(), phase: g.phase, crackle: 0, loop: fireLoop, loopCulled, loopTry: 0, at, slot, holeAt: [null, null], holeX: [null, null], v: slot >= 0 ? smokeVoxels(world.operations.game, g) : null };
  }
  return {
    group,
    drawn: id => live.get(id)?.model.position || null,   // (tests: where a grenade is drawn)
    update(dt) {
      const G = world.operations.game, list = G.mode === 'arena' ? G.combat?.nades || NO_HOLES : NO_HOLES, now = performance.now(), seen = SEEN; seen.clear();   // (NO_HOLES: an empty list; nothing made per frame)
      const fhn = list.length ? frameClock(FC, dt, hostNow()) : (FC.t = undefined);   // (the host's time for this frame: flights caught up to it — phys-smooth.js frameClock)
      FXP.update(dt);
      if (pass) { const hn = hostNow(); pass.frame((hn / 1000) % BILLOW.period, SMOKE_CUTS, list.length ? smokeCutsNow(G, hn) : 0); }   // (the clouds pushed below; the billows on the host's clock, the tunnels the rules subtract)
      for (let i = mine.length - 1; i >= 0; i--) { const c = mine[i]; c.age += dt; if (c.age * 1000 > MINE_MS) { dropMine(i); continue; }   // your throws waiting for the host's word
        if (!c.sim.void && !G.combat?.d?.paused) flyNade(c.sim, boxes(), bounds(), dt, null, c.sim.p); drawFixed(DRAWN, c.sim, c.sim.p, NADE_DT, NADE_G); c.model.position.set(DRAWN.x, DRAWN.y, DRAWN.z); c.model.rotation.x += dt * 9; c.model.rotation.z += dt * 5; }
      for (const g of list) {
        seen.add(g.id); let v = live.get(g.id);
        if (!v) { const c = g.phase === 'air' && mine.length ? adopt(g) : null;   // (yours, already flying here: it carries on from where it is drawn)
          v = c ? { model: c.model, fx: null, sim: c.sim, ox: 0, oy: 0, oz: 0, fresh: true, slow: .45, exact: true } : { model: weaponModel(g.kind, 1.4), fx: null, ox: 0, oy: 0, oz: 0, fresh: false, slow: 0, exact: true }; if (!c) { v.model.position.set(g.x, g.y, g.z); group.add(v.model); } live.set(g.id, v); }   // (exact: flown in the host's own steps — phys-smooth.js flightFrame; fresh: its copy already flown this frame — the loop above)
        if (g.phase === 'air') { const isNew = g.x !== v.hx || g.y !== v.hy || g.z !== v.hz; if (isNew) { // a new host position: a sharp turn in its path is a bounce
          if (v.hx !== undefined) { const vx = g.x - v.hx, vy = g.y - v.hy, vz = g.z - v.hz, m = Math.hypot(vx, vy, vz), pm = Math.hypot(v.vx, v.vy, v.vz);
            if (m > .05 && pm > .05 && (vx * v.vx + vy * v.vy + vz * v.vz) / (m * pm) < .55 && now - (v.bounced || 0) > 120) { v.bounced = now; const bat = { x: g.x, y: g.y, z: g.z }; if (!snd(BOUNCE_EV[g.kind] || 'nade.he.bounce', bat)) rec('bounce', { at: bat, volume: Math.min(.8, .25 + pm * .15), rate: g.kind === 'molotov' ? .8 : .95 + Math.random() * .15, kind: 'step' }); }   // (v53 FIRE: each grenade's own CS2 bounce — Molotov.Bounce, IncGrenade.Bounce, SmokeGrenade.Bounce …)
            v.vx = vx; v.vy = vy; v.vz = vz; } else v.vx = v.vy = v.vz = 0;
          v.hx = g.x; v.hy = g.y; v.hz = g.z; }
          // The flight flown here too, as the host flies it (the same physics on the same map: arena-nades.js stepNade),
          // from the host's latest state caught up to now on the host's clock — smooth every frame between the host's
          // updates, and exact at bounces, instead of trailing the updates (an older host without velocities: smoothed).
          // The host's word compared with where the copy is to be drawn THIS frame (phys-smooth.js flightFrame): v51 took
          // last frame's drawn spot, so every host update — 20 a second — counted this frame's own motion as a correction:
          // the grenade all but stood still for a frame, then raced (132 / 117 / 57 units/s on a 102 units/s flight, every
          // 50 ms — the "laggy" flight). The difference left (a bounce met a tick apart, your own throw's head start of half
          // a round trip) is eased out with time constant CORR_TAU, never a jump. (paused: the host holds it where it is)
          flightFrame(v, g, isNew, isNew ? Math.max(0, (fhn - (G.combat?.clock ?? fhn)) / 1000) : 0, dt, flyStep, !!G.combat?.d?.paused, CORR_TAU, NADE_G, NADE_DT);
          if (v.sim) { drawFixed(DRAWN, v.sim, v.sim.p, NADE_DT, NADE_G); v.model.position.set(DRAWN.x + v.ox, DRAWN.y + v.oy, DRAWN.z + v.oz); }   // (v53: between its last two fixed steps)
          else { const k = 1 - Math.exp(-dt * 18); v.model.position.x += (g.x - v.model.position.x) * k; v.model.position.y += (g.y - v.model.position.y) * k; v.model.position.z += (g.z - v.model.position.z) * k; }
          if (!v.sim?.rest) { v.model.rotation.x += dt * 9; v.model.rotation.z += dt * 5; } continue; }   // (lying still, waiting to go off: no longer tumbling)
        if (v.fx && v.fx.phase !== g.phase) { disposeFx(v.fx, pass); v.fx = null; }   // fire → out
        if (!v.fx) { v.fx = effect(g); if (liesAfter(g.phase)) { const fly = v.hx !== undefined && v.model.visible && !v.rb;   // (seen flying here: it settles into the lying pose — it jumped there in one frame, up to 0.9 units for a molotov)
            if (fly) { v.rb = { p0: v.model.position.clone(), q0: v.model.quaternion.clone(), p1: new THREE.Vector3(), q1: new THREE.Quaternion(), s: 0 }; } restNade(v.model, g.kind, g);
            if (fly) { v.rb.p1.copy(v.model.position); v.rb.q1.copy(v.model.quaternion); v.model.position.copy(v.rb.p0); v.model.quaternion.copy(v.rb.q0); } } else v.model.visible = false; }   // (once per grenade: its two poses)
        if (v.rb && v.rb.s < 1) { const b = v.rb; b.s = Math.min(1, b.s + dt / REST_BLEND); const e = b.s * b.s * (3 - 2 * b.s); v.model.position.lerpVectors(b.p0, b.p1, e); v.model.quaternion.slerpQuaternions(b.q0, b.q1, e); }
        // A decoy at work: its thrower's gun, shot by shot (arena-nades.js decoyShots: the host's schedule, the same here),
        // heard where it lies; after a hitch only the latest shot plays (never a burst all at once).
        if (g.phase === 'decoy') { const i = decoyShotAt(g, hostNow()); if (v.shot === undefined) v.shot = i; else if (i > v.shot) { v.shot = i; shotSound(g.gun, { at: v.model.position, volume: .8 }); } }
        const t = (now - v.fx.start) / 1000, F = v.fx;
        if (g.phase === 'boom' || g.phase === 'pop') { const b = F.parts[0], k = Math.min(1, t / .35), e = 1 - (1 - k) ** 3; b.scale.setScalar(.5 + e * (g.phase === 'boom' ? 24 : 4)); b.material.opacity = Math.max(0, 1 - t / .45) ** 1.5; b.visible = t < .45;
          const c = g.phase === 'boom' && F.parts[1]; if (c) { c.scale.setScalar(.4 + Math.min(1, t / .08) * 11); c.material.opacity = Math.max(0, 1 - t / .25); c.visible = t < .25; } }
        if (g.phase === 'smoke' && F.slot >= 0) { // its slot this frame: front, fade and holes now (the host's clock — what the rules use)
          const hn = hostNow(), H = g.holes || NO_HOLES, at = F.holeAt, hx = F.holeX; let r0 = 0, r1 = 0;
          // A new blast's reach into the channel of the older of the last two (once per hole); each channel's radius now.
          for (let i = Math.max(0, H.length - 2); i < H.length; i++) { const h = H[i]; if ((at[0] === h.at && hx[0] === h.x) || (at[1] === h.at && hx[1] === h.x)) continue; const k = at[0] === null ? 0 : at[1] === null ? 1 : at[0] <= at[1] ? 0 : 1; pass.hole(F.slot, k, smokeHoleBytes(G, g, h)); at[k] = h.at; hx[k] = h.x; }
          for (let i = Math.max(0, H.length - 2); i < H.length; i++) { const h = H[i]; if (at[0] === h.at && hx[0] === h.x) r0 = holeRadius(h, hn); else if (at[1] === h.at && hx[1] === h.x) r1 = holeRadius(h, hn); }
          pass.push(F.slot, smokeFront(F.v, g, hn), fadeNow(g, hn), r0, r1); continue; }
        if (g.phase === 'smoke') { // the shared smoke shape (arena-nades smokeShape): grows, thins at the end; HE holes clear puffs near the blast
          const hn = hostNow(), S = smokeShape(g, hn), k = S.r / NADES.smoke.radius, fade = S.dens * Math.min(1, t / .5); let coreCut = 0;
          // (only without a slot — no map's cells, or more clouds than the pass holds; the puffs stay drawn round your eye too)
          for (const h of g.holes || []) if (Math.hypot(h.x - g.x, h.z - g.z) < NADES.smoke.radius * .8) coreCut = Math.max(coreCut, holeOpen(G, g, h.x, h.y, h.z, hn));
          for (const sp of F.parts) { if (sp.userData.core) { sp.scale.set(NADES.smoke.radius * .58 * k, NADES.smoke.radius * .44 * k, NADES.smoke.radius * .58 * k); sp.material.opacity = Math.max(0, Math.min(1, (t - .7) / .8)) * S.dens * (1 - coreCut * .9); sp.visible = sp.material.opacity > .02; continue; }
            const cut = g.holes?.length ? holeOpen(G, g, g.x + sp.position.x * k, g.y + sp.position.y, g.z + sp.position.z * k, hn) : 0; sp.position.multiplyScalar(1); sp.scale.setScalar(sp.userData.size * k * (1 + .08 * Math.sin(now / 900 + sp.id))); sp.material.opacity = .95 * fade * (1 - cut); } }
        if (g.phase === 'out') { for (const sp of F.parts) { sp.position.y += dt * 4; sp.scale.setScalar(sp.userData.size * (1 + t * 1.5)); sp.material.opacity = Math.max(0, .8 - t); } }
        // (FIRE final: an Inferno.Loop culled out of earshot at the start — tried again twice a second for the time left, so
        // walking up to a fire you hear it; the loop object is the bank's, made once when it starts)
        if (g.phase === 'fire' && F.loopCulled && now - F.loopTry > 500) { F.loopTry = now; const left = ((g.fe ?? NADES.molotov.lasts) - (hostNow() - (g.firedAt || hostNow()))) / 1000;
          if (left < .5) F.loopCulled = false; else { SO.at = F.at; SO.src = null; SO.key = null; SO.loop = left; let lp = null; try { lp = gdPlay('nade.fire.loop', SO); } catch {} SO.loop = 0; if (lp && typeof lp === 'object') { F.loop = lp; F.loopCulled = false; } else if (lp !== true) F.loopCulled = false; } }
        if (g.phase === 'fire' && !F.faded && Number.isFinite(g.fe) && hostNow() - (g.firedAt || 0) > g.fe - 1200) { F.faded = true; snd('nade.fire.fade', { x: g.x, y: g.y, z: g.z }, { key: 'ff:' + g.id }); }   // (v53 FIRE: CS2's Inferno.FadeOut as the last flames die)
      }
      fire.update(list, hostNow());   // (v53 FIRE: every fire, bottle in flight, burst and scorch — one draw)
      for (const [id, v] of live) if (!seen.has(id)) { v.model.removeFromParent(); if (v.fx) disposeFx(v.fx, pass); live.delete(id); }
      // Flashbang white-out: as white as the flash's tier for its hold, then fading (stacked flashes: arena-nades.js).
      { const w = flashWhite(FL, now), o = w <= .002 ? '0' : w.toFixed(3); if (white.style.opacity !== o) white.style.opacity = o; }
    },
    // Leaving the match: every grenade, effect and smoke slot let go of (nothing left in the scene, no textures kept).
    clear() { fire.clear(); for (const v of live.values()) { v.model.removeFromParent(); if (v.fx) disposeFx(v.fx, pass); } live.clear(); while (mine.length) dropMine(mine.length - 1); FXP.clear(); pass?.clear(); white.style.opacity = '0'; FL.peak = FL.holdUntil = FL.fadeEnd = 0; this.preview(null); },
    // The smoke pass's shaders and textures built now (the match's loading): post = the HDR buffer is on (graphics.post).
    warm(post) { return smokes()?.warm(post) || Promise.resolve(); },
    get smokePass() { return pass; },
    // Where the grenade in your hand will go (points from arena-nades predictThrow), or null to hide.
    preview(pts) { if (!pts || pts.length < 2) { if (path) path.visible = landRing.visible = false; return; }
      if (!path) { path = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(82 * 3), 3)), MAT.path); path.frustumCulled = false; path.renderOrder = 5; landRing = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 24).rotateX(-Math.PI / 2), MAT.ring); landRing.renderOrder = 5; group.add(path, landRing); }
      const a = path.geometry.attributes.position, n = Math.min(82, pts.length); for (let i = 0; i < n; i++) a.setXYZ(i, pts[i][0], pts[i][1], pts[i][2]); a.needsUpdate = true; path.geometry.setDrawRange(0, n); path.computeLineDistances(); path.visible = true; const e = pts[n - 1]; landRing.position.set(e[0], Math.max(.08, e[1] - .3), e[2]); landRing.visible = true; },
  };
}
// The planted bomb's beep (3D) and the bomb's explosion (a big fireball, a heavy blast heard far away).
export function beep(at, pitch = 1) { try { const c = audioCtx(), t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.frequency.value = 1700 * pitch; g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .09); o.connect(g).connect(outAt(c, at, 'beep')); o.start(t); o.stop(t + .1); } catch {} }
// A defuse's click (CS2: the kit's snips and the case's clicks, heard close to the bomb): a short bright tick, sometimes
// a duller second one.
export function defuseClick(at) { try { const c = audioCtx(), t = c.currentTime, out = outAt(c, at, 'defuse');
  for (const [dt, f, g] of Math.random() < .35 ? [[0, 3200, .32], [.045, 1500, .2]] : [[0, 2600 + Math.random() * 900, .3]]) { const n = c.createBufferSource(), len = .03, b = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
    n.buffer = b; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 3; const gg = c.createGain(); gg.gain.value = g; n.connect(bp).connect(gg).connect(out); n.start(t + dt); } } catch {} }
export function explosion(parent, p, scale = 1) {
  const b = new THREE.Mesh(BALL, MAT.boom.clone()), t0 = performance.now(); b.position.set(p.x, (p.y || 0) + 2, p.z); parent.add(b);
  { const at = { x: p.x, y: (p.y || 0) + 2, z: p.z }; if (rec('bomb', { at, kind: 'explosion', volume: 2, wet: 1.2, lowpass: dull(at) })) { rec('bomblow', { at, kind: 'explosion', volume: 2 }); rec('he', { at, kind: 'explosion', volume: 1.2, rate: .7, delay: .08 }); burst(at, { len: 1.5, decay: 2, freq: 300, vol: .8, thump: 1.5 }); } else burst(at, { len: 3, decay: 1.8, freq: 500, vol: 2.5, thump: 1.5 }); }
  if (FXS) { const y = (p.y || 0); FXS.fire(p.x, y + 2, p.z, 20, { size: 10, grow: 1.6, life: 1.1, rise: 5, spread: 6 }); FXS.spark(p.x, y + 1.5, p.z, 90, { speed: 40, up: 16, life: 1.3, size: 1.3 }); FXS.puff(p.x, y + 2, p.z, 16, { color: 0x2a2622, size: 8, grow: 2, life: 5, rise: 4, spread: 6 }); FXS.puff(p.x, y + .3, p.z, 8, { color: 0x9a8a70, size: 5, grow: 2.5, life: 2.4, rise: .6, spread: 12, alpha: .5 }); FXS.wave(p.x, y, p.z, 40 * scale, .7); }
  const step = () => { const t = (performance.now() - t0) / 1000; b.scale.setScalar(1 + Math.min(1, t / .5) * 9 * scale); b.material.opacity = Math.max(0, 1 - t / .9); if (t < .9) requestAnimationFrame(step); else { b.removeFromParent(); b.material.dispose(); } }; requestAnimationFrame(step);
}
