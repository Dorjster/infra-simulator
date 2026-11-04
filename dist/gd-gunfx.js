// Global Defensive · CS2's first-person muzzle flashes and shell casings (v53 GUNS, spec addendum 9: G5, G6).
// Which effect each gun uses and every number come from CS2's own files (tools/import-cs2-gunfx.mjs: items_game.txt's
// muzzle_flash_effect_1st_person / eject_brass_effect and the particles/weapons/cs_weapon_fx/*.vpcf they name), read
// from user-assets/gunfx/gunfx.json when imported; without it the built-in REF below — the same files' numbers, read on
// 2026-11-04 — and our own pictures (a drawn glow and a cross) instead of CS2's.
//  · A flash (flash(at, dir, id)): every additive sprite child of the gun's effect at once (the AK's _fp: the vent — one
//    muzzleflashx sprite, 28–30 ms — and the main flash — 6 particle_glow_04 sprites of radius 2–7 HU, 1–12 HU along the
//    barrel, a random roll, alpha 0.71–0.78, colour [93,78,63]…[51,28,13] × overbright 4, alive 1–2 ms). Each particle
//    lives its CS2 life (C_OP_FadeOut over its last fade seconds) but is drawn on at least the frame it was made in
//    (CS2 simulates at least one frame: m_nMinimumFrames 1) — the main flash is one frame, the vent two at 60 fps.
//    The smoke puffs of the effects (non-additive children) are not drawn here. Your own (and the player you watch
//    in-eye) get the first-person effect drawn in the view model's depth range (weapons.js vmNear: never hidden by a
//    wall, only by the gun itself, as CS2 draws its view-model particles); other players' shots their gun's
//    muzzle_flash_effect_3rd_person in the world (final review). The silencer-on guns (the M4A1-S) take their prefab's
//    _alt effects, weapon_muzzle_flash_assaultrifle_silenced.
//  · A shell (eject(at, dir, id, floorY)): one brass case from the ejection port with CS2's speed in the port's frame
//    (weapon_shell_casing_rifle: 200–250 HU/s out to the right, 15…−5 forward, 50–75 up), gravity 600 HU/s², its life
//    (rifle 3 s, 9 mm 2 s, shotgun 5 s), tumbling, a bounce on the ground under the port (api.floorAt: the map's, lab.js; else the caller's floorY). The case is our own small brass
//    box (CS2 draws its own casing model: glock_casing / ak47_casing / xm1014_casing — not imported). The port's place
//    is ours: PORT_BACK HU behind the muzzle by kind, a little to the right (CS2 reads it off the model's attachment).
// Pools: FLASH_MAX sprites in ONE instanced draw (a single atlas: CS2's pictures packed by the importer, else ours) and
// SHELL_MAX cases in ONE instanced draw; both made at load, always in the scene (count 0 when idle: their shaders are
// built with the scene's warm-up, never in a round), the oldest reused when full; hidden while empty (no empty draw in
// any mode). Nothing is allocated per shot or per frame (fixed typed arrays, reused vectors, constant defaults —
// tests/gd-gun-feel.mjs counts it).
import * as THREE from './three.module.js';
import { userAssets, userAssetURL } from './user-assets.js';

export const HU_UNITS = 2.54 / 16.5;   // game units per Hammer unit
export const FLASH_MAX = 64, SHELL_MAX = 32;
// The built-in reference (tools/import-cs2-gunfx.mjs --dry-run on the user's install, 2026-11-04): per effect, its
// additive sprite children [count, life s, radius HU, along HU, alpha, colour min, colour max, overbright, fade s, speed HU/s, picture].
const S = (count, life, radius, along, alpha, c0, c1, ob, fade, speed, tex) => ({ count, life, radius, along, alpha, c0, c1, overbright: ob, fade, speedMin: speed ? [speed[0], 0, 0] : null, speedMax: speed ? [speed[1], 0, 0] : null, texture: tex, roll: [0, 360] });
export const REF = {
  guns: { pistol: 'pistol', usps: 'pistol', p250: 'pistol', fiveseven: 'pistol', cz75: 'pistol', tec9: 'pistol', deagle: 'pistol', cannon: 'pistol', mac10: 'smg', mp9: 'smg', mp7: 'smg', smg: 'silenced', bizon: 'smg', ump45: 'smg', p90: 'smg',
    shotgun: 'shotgun', xm1014: 'shotgun', galil: 'rifle', famas: 'rifle', ak: 'rifle', m4: 'rifle', m4s: 'silenced', sg553: 'rifle', aug: 'rifle', ssg08: 'hunting', sniper: 'hunting', lmg: 'para', negev: 'para' },
  // other players' shots: muzzle_flash_effect_3rd_person's family (the same file as above where items_game names it)
  guns3: { pistol: 'pistol3', usps: 'pistol3', p250: 'pistol3', fiveseven: 'pistol3', cz75: 'pistol3', tec9: 'pistol3', deagle: 'pistol3', cannon: 'pistol3', mac10: 'smg3', mp9: 'smg3', mp7: 'smg3', smg: 'silenced', bizon: 'smg3', ump45: 'smg3', p90: 'smg3',
    shotgun: 'shotgun', xm1014: 'shotgun', galil: 'rifle3', famas: 'rifle3', ak: 'rifle3', m4: 'rifle3', m4s: 'silenced', sg553: 'rifle3', aug: 'rifle3', ssg08: 'hunting', sniper: 'hunting', lmg: 'para', negev: 'para' },
  muzzle: {
    pistol3: [S(4, [.025, .025], [5, 5], null, null, null, null, 4, [.015, .015], [80, 500], 'effects/muzzleflash4')],                                       // weapon_muzzle_flash_pistol → _pistol_main
    smg3: [S(8, [.05, .07], [5, 7], null, [.705882, .784314], [136, 96, 50], [200, 177, 140], 2, [.025, .05], null, 'effects/muzzleflash2')],                   // weapon_muzzle_flash_smg → _smg_glow
    rifle3: [S(1, [.025, .025], [5, 7], null, [.745098, .901961], null, null, 4, [.025, .025], null, 'effects/muzzleflashx'),                                   // weapon_muzzle_flash_assaultrifle → _vent
      S(1, [.015, .015], [5, 5], null, [.705882, .784314], [255, 188, 189], [130, 92, 75], 4, [.025, .015], null, 'particle/particle_flares/particle_flare_004')],   //   … → _glow
    pistol: [S(6, [.025, .025], [3, 6], [0, 7], [.705882, .784314], [198, 131, 80], [216, 216, 216], 4, [.015, .015], null, 'effects/muzzleflash4')],   // weapon_muzzle_flash_pistol_fp → _pistol_main2
    smg: [S(5, [.0225, .0325], [2, 6], [-1, 12], [1, 1], [249, 222, 115], [231, 150, 118], 4, null, null, 'effects/muzzleflash4')],                       // _smg_fp → _smg_glow2
    silenced: [S(1, [.015, .015], [6, 12], null, [.705882, .784314], [255, 221, 187], [130, 97, 74], 4, [.025, .015], null, 'particle/smoke1/smoke1')],     // _assaultrifle_silenced → _parent_silenced (the MP5-SD; the M4A1-S's _alt)
    shotgun: [S(6, [.05, .06], [5, 8], null, [.705882, .784314], [234, 224, 216], [240, 177, 131], 2, [.25, .5], [100, 180], 'effects/muzzleflash2')],       // _autoshotgun_fp → _autoshotgun_glow
    rifle: [S(1, [.028, .03], [3, 6], null, [.745098, .901961], null, null, 4, [.025, .025], null, 'effects/muzzleflashx'),                                  // _assaultrifle_fp → _vent_fp
      { ...S(6, [.001, .002], [2, 7], [1, 12], [.705882, .784314], [93, 78, 63], [51, 28, 13], 4, null, null, 'particle/particle_glow_04') }],               //   … → _main_fp
    hunting: [S(4, [.024, .024], [6, 22], [0, 25], [0, 1], [234, 174, 115], [240, 135, 61], 1, null, null, 'particle/particle_glow_04')],                    // _huntingrifle_fp / _awp → _huntingrifle_glow
    para: [S(4, [.024, .024], [6, 22], [0, 25], [0, 1], [234, 174, 115], [240, 135, 61], 1, null, null, 'particle/particle_glow_04'),                        // _para_fp → _para_glow
      S(9, [.1, .1], [5, 5], [-2, -2], [1, 1], null, null, 1, [.5, .5], [30, 100], 'particle/muzzleflashcloud'), S(8, [.1, .1], [5, 5], [-1, 7], [1, 1], null, null, 4, [.5, .5], null, 'particle/muzzleflashcloud')],   //   _para_b, _para_flash (no radius: CS2's default 5)
  },
  // weapon_shell_casing_*: speed in the port's frame [out, forward, up] min / max (HU/s), gravity (HU/s²), life (s)
  shell: { '9mm': { speedMin: [150, 15, 50], speedMax: [200, -5, 75], gravity: [0, 0, -600], life: [2, 2], len: .75 }, rifle: { speedMin: [200, 15, 50], speedMax: [250, -5, 75], gravity: [0, 0, -600], life: [3, 3], len: 1.5 },
    shotgun: { speedMin: [200, -15, 50], speedMax: [250, 5, 75], gravity: [0, 0, -600], life: [5, 5], len: 2.6 } },
  shellOf: { pistol: '9mm', smg: '9mm', silenced: '9mm', rifle: 'rifle', hunting: 'rifle', para: 'rifle', shotgun: 'shotgun' },
};
// The ejection port behind the muzzle (HU, ours: CS2 has it as the model's shell_eject attachment).
const PORT_BACK = { pistol: 4, smg: 9, silenced: 12, rifle: 14, hunting: 20, para: 14, shotgun: 14 };
// (the case's look, ours: a brass box this long × .35 × .35 HU per shell kind)
const BRASS = 0xc89a46;

// The data in use: the imported file's (per gun: its effect's own children) else REF's. fx(id) → { flash: [children],
// shell: {…} | null, family } — cached per gun (made once, not per shot).
let DATA = null; const CACHE = new Map();
export function setData(d) { DATA = d && d.muzzle ? d : null; CACHE.clear(); }
export function fxOf(id) {
  let o = CACHE.get(id); if (o) return o; const fam = REF.guns[id] || 'pistol';
  let flash = REF.muzzle[fam], flash3 = REF.muzzle[REF.guns3[id] || fam] || flash, shell = REF.shell[REF.shellOf[fam]] || null;
  const g = DATA?.guns?.[id], eff = n => n && Array.isArray(DATA.muzzle[n]) && DATA.muzzle[n].length ? DATA.muzzle[n] : null;
  if (g) { flash = eff(g.muzzle) || flash; flash3 = eff(g.muzzle3) || (g.muzzle3 === undefined ? flash : flash3); }   // (an import made before muzzle3 existed: its first-person one)
  if (g && 'shell' in g) { const s = g.shell && DATA.shell?.[g.shell]; shell = s ? { ...s, len: REF.shell[REF.shellOf[fam]]?.len || 1 } : shell; }
  o = { flash, flash3, shell, family: fam }; CACHE.set(id, o); return o; }

// Our own pictures (the fallback atlas, 2 cells): a soft round glow and a four-pointed cross.
function ownAtlas() {
  try { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,240,210,.85)'); g.addColorStop(.6, 'rgba(255,190,120,.25)'); g.addColorStop(1, 'rgba(255,150,80,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.save(); x.translate(192, 64); for (let k = 0; k < 2; k++) { x.rotate(Math.PI / 4 + k * Math.PI / 2); const h = x.createLinearGradient(-60, 0, 60, 0); h.addColorStop(0, 'rgba(255,200,120,0)'); h.addColorStop(.5, 'rgba(255,245,220,1)'); h.addColorStop(1, 'rgba(255,200,120,0)'); x.fillStyle = h; x.beginPath(); x.ellipse(0, 0, 60, 13, 0, 0, Math.PI * 2); x.fill(); } x.restore();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; } catch { return null; } }
const OWN_CELL = tex => tex && tex.indexOf('muzzleflashx') >= 0 ? 1 : 0;   // (indexOf, not a RegExp: nothing allocated per particle)

const VERT = `attribute vec4 iPos; attribute vec4 iCol; attribute vec3 iCell; uniform float uCells; varying vec2 vUv; varying vec4 vCol;
void main() { vUv = vec2((uv.x + iCell.x) / uCells, uv.y); vCol = iCol; vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
  float c = cos(iCell.y), s = sin(iCell.y); vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * iPos.w * 2.0;
  mv.xy += p; gl_Position = projectionMatrix * mv;
  if (iCell.z > .5) gl_Position.z = (gl_Position.z + gl_Position.w) * .01 - gl_Position.w; }`;   // (iCell.z 1: a first-person particle, in the view model's depth range — weapons.js vmNear's depthRange(0, .01) — in the same draw)
const FRAG = `uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol; void main() { vec4 t = texture2D(uMap, vUv); gl_FragColor = vec4(t.rgb * vCol.rgb, t.a * vCol.a); }`;   // (added: rgb × alpha, CS2's PARTICLE_OUTPUT_BLEND_MODE_ADD)

// The pools. scene: where they live. Returns { flash, eject, update(dt), samples(), counts, load() }.
export function createGunFx(scene) {
  // ── flash sprites: per particle [x, y, z, radius] · [r, g, b, alpha] · [cell, roll] and its clock ──
  const geo = new THREE.InstancedBufferGeometry(); const quad = new THREE.PlaneGeometry(1, 1); geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
  const P = new Float32Array(FLASH_MAX * 4), Cc = new Float32Array(FLASH_MAX * 4), Ce = new Float32Array(FLASH_MAX * 3);
  const aP = new THREE.InstancedBufferAttribute(P, 4), aC = new THREE.InstancedBufferAttribute(Cc, 4), aE = new THREE.InstancedBufferAttribute(Ce, 3);
  for (const a of [aP, aC, aE]) a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('iPos', aP); geo.setAttribute('iCol', aC); geo.setAttribute('iCell', aE); geo.instanceCount = 0;
  const own = ownAtlas(), mat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: own }, uCells: { value: 2 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  mat.userData.shared = true; const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.userData.gd = true; mesh.userData.fx = true; mesh.userData.noPool = true; mesh.visible = false; scene?.add(mesh);
  let renders = 0; mesh.onBeforeRender = () => { renders++; for (let i = 0; i < n; i++) drawn[i] = 1; };   // (each particle on screen at least once: then its life counts)
  let cells = null;   // (the imported atlas' cell per picture; null: ours)
  // live particles (structure of arrays: no objects): age, life, fade, base alpha, velocity along/out/up, drawn once
  const age = new Float32Array(FLASH_MAX), life = new Float32Array(FLASH_MAX), fade = new Float32Array(FLASH_MAX), a0 = new Float32Array(FLASH_MAX), V = new Float32Array(FLASH_MAX * 3), drawn = new Uint8Array(FLASH_MAX);
  let n = 0;   // particles in use (0 … n−1, packed)
  const R = (r, k = Math.random()) => r ? r[0] + (r[1] - r[0]) * k : 0, F = new Float64Array(4);   // (F: the flash's scratch numbers)
  const WHITE = [255, 255, 255], RAD5 = [5, 5], ONE = [1, 1], ROLL = [0, 360], LIFE = [.02, .02];   // (CS2's defaults, made once: no array per particle)
  const D = new THREE.Vector3(), RT = new THREE.Vector3(), UP = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), Q = new THREE.Vector3();
  const frame = dir => { D.copy(dir).normalize(); RT.crossVectors(D, Y); if (RT.lengthSq() < 1e-6) RT.set(1, 0, 0); RT.normalize(); UP.crossVectors(RT, D).normalize(); };
  function kill(i) { const j = --n; if (i === j) return; P.copyWithin(i * 4, j * 4, j * 4 + 4); Cc.copyWithin(i * 4, j * 4, j * 4 + 4); Ce.copyWithin(i * 3, j * 3, j * 3 + 3); V.copyWithin(i * 3, j * 3, j * 3 + 3); age[i] = age[j]; life[i] = life[j]; fade[i] = fade[j]; a0[i] = a0[j]; drawn[i] = drawn[j]; }
  // A muzzle flash at `at` (game units) along `dir` for gun `id`. own: true — your own (or the watched player's
  // in-eye) first-person effect in the view model's depth range; false — another player's third-person one in the world.
  // Returns the particles made.
  function flash(at, dir, id, own = true) {
    const o = fxOf(id), f = own ? o.flash : o.flash3; if (!f) return 0; frame(dir); let made = 0;
    for (let ci = 0; ci < f.length; ci++) { const c = f[ci], cell = cells ? cells[c.texture] : OWN_CELL(c.texture); if (cell == null) continue;
      // (each number goes straight into the typed arrays: no double is kept across a call — V8 would box it, 16 bytes a
      // particle — the allocation count in tests/gd-gun-feel.mjs)
      const cnt = c.count || 1, c0 = c.c0 || WHITE, c1 = c.c1 || c0, alg = c.along, rad = c.radius || RAD5, alp = c.alpha || ONE, rol = c.roll || ROLL, lif = c.life || LIFE, fad = c.fade, smin = c.speedMin, smax = c.speedMax || smin;
      for (let k = 0; k < cnt; k++) { if (n >= FLASH_MAX) kill(0); const i = n++, i4 = i * 4, i3 = i * 3;
        F[0] = (alg ? alg[0] + (alg[1] - alg[0]) * Math.random() : 0) * HU_UNITS; P[i4] = at.x + D.x * F[0]; P[i4 + 1] = at.y + D.y * F[0]; P[i4 + 2] = at.z + D.z * F[0];
        P[i4 + 3] = (rad[0] + (rad[1] - rad[0]) * Math.random()) * HU_UNITS; F[1] = Math.random(); F[2] = (c.overbright || 1) / 255;
        Cc[i4] = (c0[0] + (c1[0] - c0[0]) * F[1]) * F[2]; Cc[i4 + 1] = (c0[1] + (c1[1] - c0[1]) * F[1]) * F[2]; Cc[i4 + 2] = (c0[2] + (c1[2] - c0[2]) * F[1]) * F[2];
        a0[i] = alp[0] + (alp[1] - alp[0]) * Math.random(); Cc[i4 + 3] = a0[i]; Ce[i3] = cell; Ce[i3 + 1] = (rol[0] + (rol[1] - rol[0]) * Math.random()) * (Math.PI / 180); Ce[i3 + 2] = own ? 1 : 0;
        F[3] = smin ? (smin[0] + (smax[0] - smin[0]) * Math.random()) * HU_UNITS : 0; V[i3] = D.x * F[3]; V[i3 + 1] = D.y * F[3]; V[i3 + 2] = D.z * F[3];
        age[i] = 0; life[i] = Math.max(1e-4, lif[0] + (lif[1] - lif[0]) * Math.random()); fade[i] = fad ? fad[0] + (fad[1] - fad[0]) * Math.random() : 0; drawn[i] = 0; made++; } }
    geo.instanceCount = n; mesh.visible = n > 0; aP.needsUpdate = aC.needsUpdate = aE.needsUpdate = true; return made; }
  // ── shells: one instanced brass box each ──
  const sGeo = new THREE.BoxGeometry(1, 1, 1), sMat = new THREE.MeshStandardMaterial({ color: BRASS, metalness: .85, roughness: .35 }); sMat.userData.shared = true;
  const shells = new THREE.InstancedMesh(sGeo, sMat, SHELL_MAX); shells.count = 0; shells.frustumCulled = false; shells.userData.gd = true; shells.userData.noPool = true; shells.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shells.visible = false; scene?.add(shells);
  const sp = new Float32Array(SHELL_MAX * 3), sv = new Float32Array(SHELL_MAX * 3), sr = new Float32Array(SHELL_MAX * 4), sAge = new Float32Array(SHELL_MAX), sLife = new Float32Array(SHELL_MAX), sLen = new Float32Array(SHELL_MAX), sFloor = new Float32Array(SHELL_MAX), sG = new Float32Array(SHELL_MAX);
  let sn = 0, sNext = 0; const M = new THREE.Matrix4(), QQ = new THREE.Quaternion(), EE = new THREE.Euler(), PP = new THREE.Vector3(), SC = new THREE.Vector3();
  // A case from the port of gun `id` firing from `at` along `dir`; floorY: the floor under the shooter (game units),
  // used when api.floorAt (x, z, y → the ground under the port, or null) has no answer.
  function eject(at, dir, id, floorY = -Infinity) {
    const o = fxOf(id), s = o.shell; if (!s) return false; frame(dir); const i = sn < SHELL_MAX ? sn++ : (sNext = (sNext + 1) % SHELL_MAX);
    const back = (PORT_BACK[o.family] ?? 10) * HU_UNITS; PP.copy(at).addScaledVector(D, -back).addScaledVector(RT, .6 * HU_UNITS);
    const gr = api.floorAt ? api.floorAt(PP.x, PP.z, PP.y) : null; if (Number.isFinite(gr)) floorY = gr;   // (final review: the map's ground under the port, not a guess from the muzzle)
    sp[i * 3] = PP.x; sp[i * 3 + 1] = PP.y; sp[i * 3 + 2] = PP.z; const mn = s.speedMin || [200, 0, 60], mx = s.speedMax || mn, k = Math.random();
    const out = (mn[0] + (mx[0] - mn[0]) * k) * HU_UNITS, fw = (mn[1] + (mx[1] - mn[1]) * Math.random()) * HU_UNITS, up = (mn[2] + (mx[2] - mn[2]) * Math.random()) * HU_UNITS;
    sv[i * 3] = RT.x * out + D.x * fw + UP.x * up; sv[i * 3 + 1] = RT.y * out + D.y * fw + UP.y * up; sv[i * 3 + 2] = RT.z * out + D.z * fw + UP.z * up;
    sr[i * 4] = Math.random() * 6.3; sr[i * 4 + 1] = Math.random() * 6.3; sr[i * 4 + 2] = 8 + Math.random() * 10; sr[i * 4 + 3] = 4 + Math.random() * 6;   // (tumble: our own, CS2's C_OP_SpinUpdate on its model)
    sAge[i] = 0; sLife[i] = R(s.life || [2, 2]); sLen[i] = (s.len || 1) * HU_UNITS; sFloor[i] = floorY; sG[i] = (s.gravity ? s.gravity[2] : -600) * HU_UNITS;
    shells.count = sn; shells.visible = true; return true; }
  const DT = new Float64Array(1);   // (the frame's step, kept in a typed slot: no number boxed across kill())
  function update(dt) {
    DT[0] = Math.min(Math.max(dt || 0, 0), .1);
    if (n) { for (let i = n - 1; i >= 0; i--) { age[i] += DT[0]; if (drawn[i] && age[i] >= life[i]) { kill(i); continue; }   // (never before it has been drawn once — CS2's minimum frame: mesh.onBeforeRender marks them)
        Cc[i * 4 + 3] = a0[i] * (fade[i] > 0 && life[i] - age[i] < fade[i] ? Math.max(0, (life[i] - age[i]) / fade[i]) : 1);
        P[i * 4] += V[i * 3] * DT[0]; P[i * 4 + 1] += V[i * 3 + 1] * DT[0]; P[i * 4 + 2] += V[i * 3 + 2] * DT[0]; }
      geo.instanceCount = n; mesh.visible = n > 0; aP.needsUpdate = aC.needsUpdate = aE.needsUpdate = true; }
    if (sn) { for (let i = 0; i < sn; i++) { sAge[i] += DT[0]; const j = i * 3;
        if (sAge[i] < sLife[i]) { sv[j + 1] += sG[i] * DT[0]; sp[j] += sv[j] * DT[0]; sp[j + 1] += sv[j + 1] * DT[0]; sp[j + 2] += sv[j + 2] * DT[0];
          if (sp[j + 1] < sFloor[i] + sLen[i] * .2) { sp[j + 1] = sFloor[i] + sLen[i] * .2; if (sv[j + 1] < 0) sv[j + 1] *= -.3; sv[j] *= .6; sv[j + 2] *= .6; sr[i * 4 + 2] *= .5; sr[i * 4 + 3] *= .5; }
          sr[i * 4] += sr[i * 4 + 2] * DT[0]; sr[i * 4 + 1] += sr[i * 4 + 3] * DT[0]; }
        const gone = sAge[i] >= sLife[i]; QQ.setFromEuler(EE.set(sr[i * 4], sr[i * 4 + 1], 0)); SC.set(gone ? 0 : sLen[i] * .3, gone ? 0 : sLen[i] * .3, gone ? 0 : sLen[i]); PP.set(sp[j], sp[j + 1], sp[j + 2]);
        shells.setMatrixAt(i, M.compose(PP, QQ, SC)); }
      let live = 0; for (let i = 0; i < sn; i++) if (sAge[i] < sLife[i]) live++; if (!live) { sn = 0; sNext = 0; } shells.count = sn; shells.visible = sn > 0; shells.instanceMatrix.needsUpdate = true; } }
  // The imported pictures and numbers (once, at load): the atlas swapped in as a uniform (no new shader).
  let loading = null;
  function load() { return loading ??= (typeof fetch === 'function' ? userAssets().catch(() => null) : Promise.resolve(null)).then(async ua => { const g = ua?.models?.gunfx; if (!g?.file) return false;
    const d = await fetch(userAssetURL(ua, g.file)).then(r => r.ok ? r.json() : null).catch(() => null); if (!d) return false;
    const tex = g.atlas ? await new THREE.TextureLoader().loadAsync(userAssetURL(ua, g.atlas)).catch(() => null) : null;
    setData(d); if (tex && d.cells) { tex.colorSpace = THREE.SRGBColorSpace; const k = Object.values(d.cells); mat.uniforms.uMap.value = tex; mat.uniforms.uCells.value = d.grid || Math.max(0, ...k) + 1; cells = d.cells; } return true; }); }
  const api = { flash, eject, update, load, mesh, shells, floorAt: null /* (lab.js: the map's ground under a shell's port) */,
    get renders() { return renders; },   // (times the flash pool was drawn: fun-pistol's GD light starts its 20 ms from the first)
    get counts() { return { flash: n, shells: sn, flashCap: FLASH_MAX, shellCap: SHELL_MAX }; },
    // (warm-up stand-ins on the same geometry and materials — the pools themselves stay in the scene: a warm-up group
    // that took them would take them out of it)
    samples() { const a = new THREE.Mesh(geo, mat), b = new THREE.InstancedMesh(sGeo, sMat, 1); a.frustumCulled = b.frustumCulled = false; return [a, b]; } };
  if (scene) globalThis.__gdGunFx = api;   // (the browser tests' and pictures' handle: the game's own pools)
  return api;
}
