// Grenades on screen (every client): the grenade in flight (smoothed between host updates), the HE fireball,
// the flashbang white-out (how much depends on your own view: arena-nades.js flashAmount), the smoke cloud and the
// molotov fire, each with 3D sound. Materials are made once and shared (the graphics warm-up compiles them).
import * as THREE from './three.module.js';
import { weaponModel } from './weapon-models.js';
import { NADES, flashAmount } from './arena-nades.js';
import { audioCtx, outAt } from './spatial-audio.js';

const soft = (inner, outer) => { try { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); if (typeof g?.createRadialGradient !== 'function') return null;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; } catch { return null; } };
const MAT = {
  smoke: new THREE.SpriteMaterial({ map: soft('rgba(205,208,212,1)', 'rgba(205,208,212,0)'), color: 0xd8dade, transparent: true, depthWrite: false, opacity: 0 }),
  fire: new THREE.SpriteMaterial({ map: soft('rgba(255,220,120,1)', 'rgba(255,90,0,0)'), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  boom: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  scorch: new THREE.MeshBasicMaterial({ color: 0x1a120c, transparent: true, opacity: .6, depthWrite: false }),
};
for (const m of Object.values(MAT)) m.userData.shared = true;
const BALL = new THREE.SphereGeometry(1, 16, 12), DISC = new THREE.CircleGeometry(1, 24);
// One of each effect, for the warm-up.
export const nadeWarmObjects = () => [new THREE.Sprite(MAT.smoke), new THREE.Sprite(MAT.fire), new THREE.Mesh(BALL, MAT.boom), new THREE.Mesh(DISC, MAT.scorch)];

// Synthesized sounds: explosion, flashbang bang + ringing, smoke hiss, fire crackle, throw whoosh.
// Noise bursts are made once per shape and reused (building a 3 s buffer mid-frame would cost a frame).
const noiseCache = new Map();
function noise(c, len, decay) { const k = len + ':' + decay; let b = noiseCache.get(k); if (b) return b; b = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, decay); noiseCache.set(k, b); return b; }
// Build them while idle at start.
export async function warmNadeSounds() { for (const [l, dc] of [[1.6, 2.2], [.6, 4], [2.5, .8], [1.2, 1.5], [.2, 3], [3, 1.8], [.25, 1.5]]) { await new Promise(r => (globalThis.requestIdleCallback || setTimeout)(r)); try { noise(audioCtx(), l, dc); } catch {} } }   // one shape per idle moment
function burst(at, { len = 1.2, decay = 2.5, freq = 900, vol = 1, type = 'lowpass', thump = 0 } = {}) {
  try { const c = audioCtx(), t = c.currentTime, out = outAt(c, at), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = noise(c, len, decay); f.type = type; f.frequency.value = freq; g.gain.value = vol; s.connect(f).connect(g).connect(out); s.start(t);
    if (thump) { const o = c.createOscillator(), og = c.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + .5); og.gain.setValueAtTime(thump, t); og.gain.exponentialRampToValueAtTime(.001, t + .6); o.connect(og).connect(out); o.start(t); o.stop(t + .65); } } catch {}
}
function ring(secs) { try { const c = audioCtx(), t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.frequency.value = 3200; g.gain.setValueAtTime(.08, t); g.gain.linearRampToValueAtTime(0, t + secs); o.connect(g).connect(c.destination); o.start(t); o.stop(t + secs); } catch {} }
export const throwSound = () => burst(null, { len: .25, decay: 1.5, freq: 1800, vol: .25, type: 'bandpass' });

export function createNadeView({ scene, camera, world, boxes = () => [] }) {
  const group = new THREE.Group(); group.name = 'nades'; scene.add(group);
  const live = new Map(), dir = new THREE.Vector3(); let flashUntil = 0, flashPeak = 0, flashAt = 0;
  document.body.insertAdjacentHTML('beforeend', '<div id="gd-flash" style="position:fixed;inset:0;z-index:39;background:#fff;opacity:0;pointer-events:none"></div>');
  const white = document.getElementById('gd-flash') || { style: {} };
  function effect(g) {
    const fx = new THREE.Group(); fx.position.set(g.x, g.y, g.z); group.add(fx); const at = { x: g.x, y: g.y, z: g.z }, parts = [];
    if (g.phase === 'boom') { const b = new THREE.Mesh(BALL, MAT.boom.clone()); fx.add(b); parts.push(b); const s = new THREE.Mesh(DISC, MAT.scorch); s.rotation.x = -Math.PI / 2; s.position.y = .05 - g.y + Math.max(0, g.y - .4); s.scale.setScalar(5); fx.add(s); burst(at, { len: 1.6, decay: 2.2, freq: 700, vol: 1.3, thump: 1 }); }
    if (g.phase === 'pop') { const b = new THREE.Mesh(BALL, MAT.boom.clone()); b.material.color.setHex(0xffffff); fx.add(b); parts.push(b); burst(at, { len: .6, decay: 4, freq: 2600, vol: 1, thump: .4 });
      camera.getWorldDirection(dir); const a = flashAmount(boxes(), g.x, g.y, g.z, camera.position.x, camera.position.y, camera.position.z, dir.x, dir.y, dir.z);
      if (a > .05) { flashPeak = Math.max(flashPeak * Math.max(0, (flashUntil - performance.now()) / 4000), a); flashAt = performance.now(); flashUntil = flashAt + 600 + 3400 * a; if (a > .4) ring(1 + 2.5 * a); } }
    if (g.phase === 'smoke') { for (let i = 0; i < 18; i++) { const sp = new THREE.Sprite(MAT.smoke.clone()), a = i * 2.4, r = (i % 6) / 6 * NADES.smoke.radius * .7; sp.position.set(Math.cos(a) * r, 2 + (i % 3) * 3.2, Math.sin(a) * r); sp.userData.size = 9 + (i % 4) * 2; fx.add(sp); parts.push(sp); }
      burst(at, { len: 2.5, decay: .8, freq: 3000, vol: .35, type: 'highpass' }); }
    if (g.phase === 'fire') { const s = new THREE.Mesh(DISC, MAT.scorch); s.rotation.x = -Math.PI / 2; s.position.y = .05; s.scale.setScalar(NADES.molotov.radius); fx.add(s);
      for (let i = 0; i < 14; i++) { const sp = new THREE.Sprite(MAT.fire), a = i * 2.4, r = Math.sqrt((i + .5) / 14) * NADES.molotov.radius * .85; sp.position.set(Math.cos(a) * r, 1.2, Math.sin(a) * r); sp.userData.size = 2.4 + (i % 3); fx.add(sp); parts.push(sp); }
      burst(at, { len: 1.2, decay: 1.5, freq: 1200, vol: .7, thump: .3 }); }
    return { fx, parts, start: performance.now(), phase: g.phase, crackle: 0 };
  }
  return {
    group,
    update(dt) {
      const G = world.operations.game, list = G.mode === 'arena' ? G.combat?.nades || [] : [], now = performance.now(), seen = new Set();
      for (const g of list) {
        seen.add(g.id); let v = live.get(g.id);
        if (!v) { v = { model: weaponModel(g.kind, 1.4), fx: null }; v.model.position.set(g.x, g.y, g.z); group.add(v.model); live.set(g.id, v); }
        if (g.phase === 'air') { const k = 1 - Math.exp(-dt * 18); v.model.position.x += (g.x - v.model.position.x) * k; v.model.position.y += (g.y - v.model.position.y) * k; v.model.position.z += (g.z - v.model.position.z) * k; v.model.rotation.x += dt * 9; v.model.rotation.z += dt * 5; continue; }
        if (!v.fx) { v.fx = effect(g); if (g.phase !== 'fire' && g.phase !== 'smoke') v.model.visible = false; else v.model.position.set(g.x, g.y + .3, g.z); }
        const t = (now - v.fx.start) / 1000, F = v.fx;
        if (g.phase === 'boom' || g.phase === 'pop') { const b = F.parts[0], k = Math.min(1, t / .35); b.scale.setScalar(.5 + k * (g.phase === 'boom' ? 9 : 4)); b.material.opacity = Math.max(0, 1 - t / .5); b.visible = t < .5; }
        if (g.phase === 'smoke') { const total = NADES.smoke.lasts / 1000, grow = Math.min(1, t / 1.4), fade = Math.min(1, Math.max(0, (total - t) / 2.5)); for (const sp of F.parts) { sp.scale.setScalar(sp.userData.size * (.4 + .6 * grow)); sp.material.opacity = .97 * fade * Math.min(1, t / .4); } }
        if (g.phase === 'fire') { for (let i = 0; i < F.parts.length; i++) { const sp = F.parts[i], f = .75 + .25 * Math.sin(now / 90 + i * 1.7); sp.scale.set(sp.userData.size * f, sp.userData.size * 1.6 * f, 1); }
          if (now - F.crackle > 380) { F.crackle = now; burst({ x: g.x, y: g.y, z: g.z }, { len: .2, decay: 3, freq: 2200, vol: .25, type: 'bandpass' }); } }
      }
      for (const [id, v] of live) if (!seen.has(id)) { v.model.removeFromParent(); if (v.fx) { v.fx.fx.removeFromParent(); for (const p of v.fx.parts) if (p.material !== MAT.fire && p.material !== MAT.smoke && p.material !== MAT.boom) p.material.dispose(); } live.delete(id); }
      // Flashbang white-out: full for a moment, then fades.
      const left = flashUntil - now; white.style.opacity = left > 0 ? String(Math.min(1, flashPeak * Math.min(1, left / 1800))) : '0';
    },
    clear() { for (const v of live.values()) { v.model.removeFromParent(); v.fx?.fx.removeFromParent(); } live.clear(); white.style.opacity = '0'; flashUntil = 0; },
  };
}
// The planted bomb's beep (3D) and the bomb's explosion (a big fireball, a heavy blast heard far away).
export function beep(at, pitch = 1) { try { const c = audioCtx(), t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.frequency.value = 1700 * pitch; g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .09); o.connect(g).connect(outAt(c, at)); o.start(t); o.stop(t + .1); } catch {} }
export function explosion(parent, p, scale = 1) {
  const b = new THREE.Mesh(BALL, MAT.boom.clone()), t0 = performance.now(); b.position.set(p.x, (p.y || 0) + 2, p.z); parent.add(b);
  burst({ x: p.x, y: (p.y || 0) + 2, z: p.z }, { len: 3, decay: 1.8, freq: 500, vol: 2.5, thump: 1.5 });
  const step = () => { const t = (performance.now() - t0) / 1000; b.scale.setScalar(1 + Math.min(1, t / .5) * 9 * scale); b.material.opacity = Math.max(0, 1 - t / .9); if (t < .9) requestAnimationFrame(step); else { b.removeFromParent(); b.material.dispose(); } }; requestAnimationFrame(step);
}
