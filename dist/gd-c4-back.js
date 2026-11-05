// Global Defensive (v53 C4, Addendum 10): the bomb on the carrier's back, with its blinking light — as CS2 draws it.
//
// The rule (one pooled rig: the C4 model, its LED and a glow sprite — three draws, no light):
//   carrier = game.combat.d.bomb.carrier (the host's own field: every computer has it — the radar's carrier mark reads it)
//   shown on the carrier's drawn body (lan.models: their dress, a CS2 agent or a built-in soldier) when ALL of:
//     · a Defuse round has a carrier (a drop, a plant, a death clears it on the host: the rig leaves the body that frame);
//     · the carrier is someone else (your own back is never drawn in first person; spectating in-eye hides the watched
//       player's whole body, the rig with it; the death cam and everyone else see it);
//     · the bomb is not in their hands (pose.weapon 'c4' and a gun out: CS2 then draws it in the hand — "holstered" is the
//       weapon not in use).
//   otherwise parked: hidden, in the scene (userData.gd), so the loading card's warm-up compiles its shaders.
//   A pickup moves the rig to the new carrier's body at once (a re-parent, no allocation, nothing built).
//
// Where it hangs (verified from CS2's files, ~/CS2-extract via Source2Viewer-CLI; scratchpad c4ref/):
//   · CS2 agents: the agent model's own "c4" attachment — agents/models/tm_phoenix/tm_phoenix.vmdl (and ctm_sas for a CT
//     agent) m_attachments "c4": one influence, spine_3, m_vInfluenceOffsets / m_vInfluenceRotations (inches, quaternion
//     x y z w) — C4_ATTACH below. The C4 world model's ROOT sits on it (weapons/models/c4/weapon_c4.vmdl: the root is the
//     brick's centre). Its weapon_holster_center attachment lies 2.3 cm from the root along the brick's length (Source
//     (−2.33, −0.17, 0.13) cm, weapon_offset mapped to the root through the `weapon` bone of the decompiled model); which
//     point the game hangs on the agent's "c4" attachment is game code, not in the files — the root is used. The brick's
//     underside lies on the agent's back: the skin under its footprint reaches at most 0.4 cm (Phoenix, rest pose) /
//     1.6 cm (Phoenix, holding a gun) into it; SAS's plate carrier 3.0 cm at the brick's corners, already in CS2's bind
//     pose (tests/gd-c4-back.mjs). Keypad facing back, long side up. The bones of the imported
//     agents keep Source's local frames in metres (tools/import-cs2-models.mjs), so the attachment is used as it is.
//   · built-in soldiers (gd-soldiers.js → avatar.js): the same frame laid on the back of the torso (up the spine, keypad
//     out), the brick's underside on the jacket.
// The model: CS2's own world model when imported (user-assets/weapons/c4.bin, its mesh in CS2's frame: ours (x, y, z) =
//   Source (−x, z, y), measured: bounds and the LED's self-illum texels match weapon_c4.vmdl's exactly), else the shipped
//   CC0 bomb (dist/models/weapons/c4.bin) — the same weaponModel('c4') the planted and dropped bombs use (shared mesh and
//   material: nothing new to compile but the LED's and the sprite's two programs).
// The blink (CS2: particles/explosions_fx/c4_holstered_light.vpcf — the carried, "holstered" bomb's light): a continuous
//   emitter of 1 particle / s, each living 1.0 s (C_INIT_InitFloat field 1 = 1.0), its alpha (field 7) set by age on a
//   spline (0, 0) → (0.111, 0.865) → (0.350, 0.218) → (1, 0) (C_OP_SetFloat m_Curve, slopes as given): a flash once a
//   second, quick up, slow fade. Colour m_ConstantColor 240 230 140 (an sRGB colour: set as one), overbright 1.5,
//   additive. Its two sprites: particle_flare_001 (5 u radius) drawn only into CS2's effects-bloom pass
//   (m_bOnlyRenderInEffectsBloomPass) and the yellowflare core drawn directly (m_flRadiusScale 0.1: 1 u across), both
//   moved toward the camera by m_flCameraBias 1 u, the flare faded by an occlusion proxy (m_flProxyRadius 2.5 u).
//   Ours: one sprite — the core at CS2's 1 u, the flare as a soft halo at BLOOM_K of its light (gd-impacts.js's share for
//   CS2's bloom-only renderers); moved toward the camera by CS2's 1 u, or more for the wider halo, so the brick's own
//   keypad and capacitors never cut it; faded as the bomb's top turns away from the viewer (ours: a stand-in for the
//   occlusion proxy). Ours too: the core kept at least CORE_PX pixels wide at a distance (CS2's bloom and its light carry
//   it there). CS2 also adds an Omni2 light (350 lm, 128 u): left out here on purpose (no real light: it costs nothing).
//   The LED itself (weapon_c4.vmat DynamicParams: self-illum = c4_light, its texels yellow in c4_color, 220 198 42) is lit
//   with the same pulse. Timed on the host's clock, so every computer blinks together.
// Frame code (update, and the glow's onBeforeRender per draw): no allocation — a few comparisons, a Map lookup, two colour /
//   opacity writes, a dozen multiplies on the sprite's own matrix.
//
// v53 DETAILS: the PLANTED and the DROPPED bomb's lights (createBombLights below; arena-ui.js drives it). Only one bomb is
// ever in the round, so one pooled light per state (an LED dot and two sprites: the flare and the core — no real light):
//   · planted (particles/explosions_fx/c4_timer_light.vpcf): an instantaneous emitter of ONE particle each time the game
//     fires it (up to 5 alive: m_nMaxParticles 5 — the last beeps' flashes overlap and add), living 0.5 s (C_INIT_InitFloat field 1 = 0.5), its alpha (field 7) by age on the spline (0, 0) →
//     (0.0159, 0.994) → (0.180, 0.162) → (1, 0): a sharp flash, then a fast fade. Colour m_ConstantColor 255 75 75 — RED,
//     radius 10 u, overbright 1.5, additive; the particle_flare_001 flare in the bloom-only pass (camera bias 3 u), the
//     yellowflare core at radius scale 0.1 (1 u, camera bias 1 u); also an Omni2 light (cookie c4_bomb_led_cookie, 128 u)
//     — left out (no real light). WHEN it fires is game code, not in the files: here with every beep of the planted bomb
//     (arena-ui.js bombView — CS:GO's planted C4 fired its c4_timer_light with each beep; our reading for CS2).
//   · dropped (particles/explosions_fx/c4_timer_light_dropped.vpcf): a continuous emitter (default rate) capped at ONE
//     particle (m_nMaxParticles 1), each living 1.0 s → one flash a second from the drop, on c4_holstered_light's own
//     spline. Colour 255 255 96 (yellow), radius 8 u, the flare at radius scale 0.5 (4 u, bloom-only), the core at 0.2
//     (1.6 u); its C_OP_RenderSound plays C4.LightFlash with each particle (game_sounds_weapons.vsndevts: c4_beep2.vsnd,
//     volume 0.3, linear to silence at 500 HU, time_volume_mapping_curve 0 → 1 over 1 s — a faint chirp), and an Omni2
//     light (100 lm, 256 u: left out). Timed from the host's drop time (ground item `at`): every computer flashes together.
//   · carried: the rig above — c4_holstered_light, CS2's warm yellow 240 230 140 (USER DECISION: the spec asked for red;
//     CS2's colour is kept; red would be one value, C4_BLINK.color).
// The bomb model is the same weaponModel('c4') the carried one uses; its LED in the model's own space (game units) is
// C4_FIT's LED turned back through the fit (ledInModel). Frame cost: two spline reads and four opacity writes.
import * as THREE from './three.module.js';
import { weaponModel, hasReal, modelFromFile } from './weapon-models.js';
import { CASTER } from './sun-shadows.js';   // (the brick casts its shadow on a baked CS2 map, as the agent and its gun do)

const IN = .0254, GU = .165;   // an inch (Source unit) and a game unit, in metres
// CS2's "c4" attachment on its agents (spine_3): offset in inches, rotation (x, y, z, w) — the vmdl's m_attachments.
export const C4_ATTACH = {
  t: { bone: 'spine_3', o: [-2.197727, -7.073534, 1.128739], q: [0.698821, -0.022778, -0.032574, 0.714191], from: 'agents/models/tm_phoenix/tm_phoenix.vmdl m_attachments c4' },
  ct: { bone: 'spine_3', o: [-2.364758, -9.845432, 0.65404], q: [0.737861, -0.017401, -0.016729, 0.674521], from: 'agents/models/ctm_sas/ctm_sas.vmdl m_attachments c4' },
};
// CS2's carried-bomb light (c4_holstered_light.vpcf): period, alpha spline keys [x, y, slope], colour and overbright.
export const C4_BLINK = { periodMs: 1000, keys: [[0, 0, 7.765143], [.111339, .86456, 0], [.349921, .21816, -.972879], [1, 0, .059499]], color: [240, 230, 140], overbright: 1.5, from: 'particles/explosions_fx/c4_holstered_light.vpcf' };
// The glow's size in metres: CS2's two sprites as one — the bloom flare (particle_flare_001: the default radius 5 u, so
// 10 u across) with the yellowflare core in its middle (radius scale 0.1: 1 u across, a tenth of it) — one quad 10 u
// across, its picture a hot centre fading out. The LED dot: 0.32 cm (the lens on CS2's model is ~0.5 cm wide).
// BLOOM_K: the bloom-only flare's share of light in our halo (gd-impacts.js BLOOM_K, ours). CORE_PX: the core's least
// width in pixels at 1080 lines (ours; more on a taller drawing buffer). BIAS_M: CS2's m_flCameraBias (1 u).
export const GLOW_M = 10 * IN, LED_R = .0032, BLOOM_K = .35, CORE_PX = 2.5, BIAS_M = 1 * IN;
// The bomb's light this moment (0 … 0.865): CS2's spline at the particle's age (host ms → age in the 1 s cycle).
export function c4Pulse(ms) {
  const P = C4_BLINK.periodMs, K = C4_BLINK.keys, t = (((ms % P) + P) % P) / P;
  for (let i = 0; i < K.length - 1; i++) { const a = K[i], b = K[i + 1]; if (t > b[0]) continue; const h = b[0] - a[0], u = (t - a[0]) / h, u2 = u * u, u3 = u2 * u;
    return Math.max(0, (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * h * a[2] + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * h * b[2]); }
  return 0; }
// Our model in CS2's C4 root frame (Source axes, metres). fit: the basis (our x, y, z → Source), the shift (m) after the
// turn and scale, the LED (m). CS2's file: ours = Source (−x, z, y), loaded 2.5 cm up (weapon-models CS2_FIT c4 at
// [0, −2.5, 0]); its LED: the self-illum texels' lit lens, Source (−0.02, 0.40, 2.84) cm. The CC0 bomb (REAL_FIT c4 at
// [0, 2, 0]: 9.7 × 6.6 × 20 cm, long along z, keypad up +y): its length up the spine, its top out, its underside where
// CS2's is (−4.0 cm), its LED on the top of its detonator box (that box's top: Source z 2.32 cm over x −7 … −2, y −2 … 2
// cm, raycast from dist/models/weapons/c4.bin; the dot sunk to 0.4 of its radius in it — ours: the CC0 bomb has no LED).
export const C4_FIT = {
  cs2: { x: [-1, 0, 0], y: [0, 0, 1], z: [0, 1, 0], shift: [0, 0, -.025], led: [-.0002, .004, .0292] },
  cc0: { x: [0, 1, 0], y: [0, 0, 1], z: [1, 0, 0], shift: [.006, 0, -.0063], led: [-.03, .015, .0232 + LED_R * .4] },
};
const key = n => String(n ?? '').trim().toLowerCase().slice(0, 40);
const shared = o => { o.traverse(c => { if (c.geometry) c.geometry.userData.shared = true; for (const m of [].concat(c.material || [])) { if (!m) continue; m.userData.shared = true; if (m.map) m.map.userData.shared = true; } }); return o; };
function glowTexture() {
  if (typeof document === 'undefined') return null;
  try { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); if (typeof x?.createRadialGradient !== 'function') return null;
    // (the core: a tenth of the width at full light — CS2's yellowflare, 1 u of the flare's 10 u; round it, the halo at
    // BLOOM_K — the bloom-only particle_flare_001 — fading to nothing at the edge)
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64), a = v => `rgba(255,255,255,${v.toFixed(3)})`;
    gr.addColorStop(0, a(1)); gr.addColorStop(.05, a(.92)); gr.addColorStop(.1, a(.5)); gr.addColorStop(.15, a(BLOOM_K * .6)); gr.addColorStop(.3, a(BLOOM_K * .26)); gr.addColorStop(.55, a(BLOOM_K * .07)); gr.addColorStop(1, a(0));
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t; } catch { return null; } }   // (a light mask, not a colour: no sRGB decode)

// The rig and its mounting. o: { scene, players() (lan.players), models() (lan.models: id → model with .cs, the dress),
// selfId(), game(), hostNow() }. Returns { rig, update(), state, dispose() }.
export function createC4Back({ scene = null, players = () => [], models = () => null, selfId = () => null, game = () => null, hostNow = () => Date.now() } = {}) {
  const rig = new THREE.Group(); rig.name = 'gd-c4-back'; rig.userData.gd = true; rig.visible = false;
  const inner = new THREE.Group(); inner.name = 'gd-c4-model'; rig.add(inner);
  // colours: CS2's are sRGB (the particle's m_ConstantColor, the LED's c4_color texels) — set as sRGB, so three turns them
  // linear (a /255 value written straight into its linear colour lost the yellow: 140 / 255 = .55 linear, CS2's is .26)
  const ob = C4_BLINK.overbright, [r8, g8, b8] = C4_BLINK.color;
  const DARK = new THREE.Color(0x2b2508), LIT = new THREE.Color().setRGB(220 / 255, 198 / 255, 42 / 255, THREE.SRGBColorSpace).multiplyScalar(ob);   // (the LED unlit / at the flash: c4_color's lens texels × the overbright)
  const ledMat = new THREE.MeshBasicMaterial({ color: DARK }); const led = new THREE.Mesh(new THREE.SphereGeometry(LED_R, 10, 6), ledMat); led.name = 'gd-c4-led'; rig.add(led);
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color().setRGB(r8 / 255, g8 / 255, b8 / 255, THREE.SRGBColorSpace).multiplyScalar(ob), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
  const glow = new THREE.Sprite(glowMat); glow.name = 'gd-c4-glow'; glow.scale.setScalar(GLOW_M); glow.renderOrder = 3; rig.add(glow); shared(rig);
  // Per draw (onBeforeRender: any camera, idempotent — the matrix is made again from the parent's each time): the sprite
  // moved toward the camera (CS2's 1 u camera bias, or a quarter of the quad for the wider halo, never past half the way),
  // widened so the core stays CORE_PX wide far off, faded as the bomb's top (the rig's Source +z) turns away. No allocation.
  let pulse = 0;
  glow.onBeforeRender = (renderer, scene, camera) => {
    const p = glow.parent; if (!p) return; const e = glow.matrixWorld.multiplyMatrices(p.matrixWorld, glow.matrix).elements, c = camera.matrixWorld.elements, r = rig.matrixWorld.elements;
    const dx = c[12] - e[12], dy = c[13] - e[13], dz = c[14] - e[14], d = Math.hypot(dx, dy, dz) || 1e-6, sx = Math.hypot(e[0], e[1], e[2]) || 1e-9;
    let W = sx; const H = renderer?.domElement?.height || 1080, p5 = camera.isPerspectiveCamera ? camera.projectionMatrix.elements[5] : 0;
    if (p5 > 0) W = Math.max(sx, 10 * CORE_PX * Math.max(1, H / 1080) * 2 * d / (p5 * H));
    const f = W / sx; if (f !== 1) { e[0] *= f; e[1] *= f; e[2] *= f; e[4] *= f; e[5] *= f; e[6] *= f; e[8] *= f; e[9] *= f; e[10] *= f; }
    const b = Math.min(.5 * d, Math.max(BIAS_M * sx / GLOW_M, .25 * W)) / d; e[12] += dx * b; e[13] += dy * b; e[14] += dz * b;
    const nl = Math.hypot(r[8], r[9], r[10]) || 1, facing = (r[8] * dx + r[9] * dy + r[10] * dz) / (nl * d), u = Math.min(1, Math.max(0, (facing - .05) / .35));
    glowMat.opacity = pulse * u * u * (3 - 2 * u); };
  // the model (built when the bomb's model is in — loadRealWeapons: CS2's file, else the CC0 one — and again if that changes)
  let built = null; const bM = new THREE.Matrix4(), bX = new THREE.Vector3(), bY = new THREE.Vector3(), bZ = new THREE.Vector3();
  function build() { const want = !hasReal('c4') ? null : modelFromFile('c4') ? 'cs2' : 'cc0'; if (want === built) return; built = want;
    for (let i = inner.children.length - 1; i >= 0; i--) inner.remove(inner.children[i]); if (!want) return;
    const F = C4_FIT[want], m = shared(weaponModel('c4', 1)); m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.layers.enable(CASTER); } }); inner.add(m);
    inner.quaternion.setFromRotationMatrix(bM.makeBasis(bX.fromArray(F.x), bY.fromArray(F.y), bZ.fromArray(F.z))); inner.scale.setScalar(GU); inner.position.fromArray(F.shift);
    led.position.fromArray(F.led); glow.position.fromArray(F.led); }   // (the glow on the LED: moved toward the camera per draw, above)
  if (scene) scene.add(rig);
  // Mounts: the agent's spine_3 (CS2's attachment, metres) or the soldier's torso (the same frame, in game units).
  const SOLDIER_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1)));   // Source x up the spine, y across, z out of the back
  const AQ = { t: new THREE.Quaternion(...C4_ATTACH.t.q), ct: new THREE.Quaternion(...C4_ATTACH.ct.q) };
  const mounts = new WeakMap();   // dress → { parent, kind, side } (looked up once per body)
  function mountOf(dress) { let M = mounts.get(dress); if (M !== undefined) return M; M = null;
    const side = dress.team === 'ct' ? 'ct' : 't', bone = dress.g?.getObjectByName?.(C4_ATTACH[side].bone);
    if (bone?.isBone) M = { parent: bone, kind: 'agent', side }; else if (dress.torso?.isObject3D) M = { parent: dress.torso, kind: 'soldier', side };
    mounts.set(dress, M); return M; }
  // hideBareBones (cs2-agents.js) leaves bones with nothing drawn under them out of the render walk: the chain from the
  // mount bone up is shown while the bomb hangs there, and put back as it was after.
  const shownChain = new Array(24).fill(null); let shownN = 0;
  const showChain = (o, top) => { shownN = 0; for (let x = o; x && x !== top && shownN < shownChain.length; x = x.parent) if (x.visible === false) { x.visible = true; shownChain[shownN++] = x; } };
  const restoreChain = () => { for (let i = 0; i < shownN; i++) { shownChain[i].visible = false; shownChain[i] = null; } shownN = 0; };
  let on = null, onDress = null;   // the dress it hangs on now
  function park() { if (!onDress && !on) { rig.visible = false; return; } restoreChain(); on = null; onDress = null; rig.visible = false; if (scene) scene.add(rig); else rig.removeFromParent(); }
  function mount(dress, M) { if (onDress === dress) return; park(); onDress = dress; on = M; M.parent.add(rig);
    if (M.kind === 'agent') { const A = C4_ATTACH[M.side]; rig.position.set(A.o[0] * IN, A.o[1] * IN, A.o[2] * IN); rig.quaternion.copy(AQ[M.side]); rig.scale.setScalar(1); showChain(M.parent, dress.g); }
    else { rig.position.set(0, 2.65, -(1.4 + .04 / GU));   /* (torso space: between the shoulder blades, the jacket's radius there ~1.4, the brick's underside — 4 cm under CS2's root — on it) */ rig.quaternion.copy(SOLDIER_Q); rig.scale.setScalar(1 / GU); }
    rig.visible = true; }
  // the carrier's row in the player list (looked up again only when the carrier or the list changes; names keyed once each)
  const KEYS = new Map(), keyOf = n => { let k = KEYS.get(n); if (k === undefined) { k = key(n); if (KEYS.size > 256) KEYS.clear(); KEYS.set(n, k); } return k; };
  let lastCarrier = null, lastList = null, row = null;
  let held = -1;   // (pictures only: the blink held at one moment of its cycle — holdPulse(ms); -1 runs on the host clock)
  const state = { carrier: null, mounted: null, held: false, self: false, pulse: 0 };
  function update() {
    build();
    const G = game(), d = G?.mode === 'arena' ? G.combat?.d : null, k = d?.bomb?.carrier || null;
    if (k !== lastCarrier || players() !== lastList) { lastCarrier = k; const L = lastList = players(); row = null; if (k && L) for (let i = 0; i < L.length; i++) if (L[i]?.name && keyOf(L[i].name) === k) { row = L[i]; break; } }
    state.carrier = k; state.self = !!row && row.id === selfId(); state.held = !!row && !!row.pose?.gun && row.pose.weapon === 'c4';
    const m = row && !state.self && !state.held && built ? models()?.get(row.id) : null, dress = m?.cs || null, M = dress ? mountOf(dress) : null;
    if (M) mount(dress, M); else park();
    state.mounted = on ? on.kind : null;
    if (on) { const a = c4Pulse(held >= 0 ? held : hostNow()), s = a / C4_BLINK.keys[1][1]; state.pulse = pulse = a; glowMat.opacity = a; ledMat.color.setRGB(DARK.r + (LIT.r - DARK.r) * s, DARK.g + (LIT.g - DARK.g) * s, DARK.b + (LIT.b - DARK.b) * s); }   // (linear values: no conversion; the glow's opacity × the facing fade at the draw)
    return state; }
  function dispose() { park(); rig.removeFromParent(); led.geometry.dispose(); ledMat.dispose(); glowMat.map?.dispose(); glowMat.dispose(); }
  return { rig, update, state, dispose, holdPulse(ms = null) { held = Number.isFinite(ms) ? ms : -1; }, get model() { return inner.children[0] || null; }, get led() { return led; }, get glow() { return glow; }, mountOf };
}

// ── v53 DETAILS: the planted and the dropped bomb's lights (see the top) ──
const HU_U = 2.54 / 16.5;   // a Hammer unit in game units
// CS2's planted-bomb flash (c4_timer_light.vpcf) and dropped-bomb blink (c4_timer_light_dropped.vpcf): life / period (ms),
// alpha spline keys [x, y, slope] over the particle's normalised age, colour (sRGB), overbright, radius (HU), the flare's
// and the core's radius scales, the flare's and the core's camera bias (HU).
export const C4_TIMER_LIGHT = { lifeMs: 500, max: 5, keys: [[0, 0, 62.484001], [.015906, .99384, 0], [.180262, .1616, -1.009903], [1, 0, .059499]], color: [255, 75, 75], overbright: 1.5, radius: 10, flare: 1, core: .1, flareBias: 3, coreBias: 1, from: 'particles/explosions_fx/c4_timer_light.vpcf' };
export const C4_DROPPED_LIGHT = { periodMs: 1000, keys: C4_BLINK.keys, color: [255, 255, 96], overbright: 1.5, radius: 8, flare: .5, core: .2, flareBias: 0, coreBias: 0, sound: 'C4.LightFlash', from: 'particles/explosions_fx/c4_timer_light_dropped.vpcf' };
// A Hermite spline of CS2's (m_spline points with their slopes) at t in [0, 1].
// (RG: the frame's number registers — [0] a spline's value, [1] the light's alpha, [2] the frame's host time — so no
// double crosses a call boxed: the per-frame path is allocation-free.)
const RG = new Float64Array(3);
const FRESH_MS = 150;   // (a dropped bomb seen within this of its particle's birth chirps for it: ours)
function splineR(K, t) {
  RG[0] = 0; if (!(t >= 0) || t > 1) return;
  for (let i = 0; i < K.length - 1; i++) { const a = K[i], b = K[i + 1]; if (t > b[0]) continue; const h = b[0] - a[0], u = (t - a[0]) / h, u2 = u * u, u3 = u2 * u;
    const v = (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * h * a[2] + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * h * b[2]; RG[0] = v > 0 ? v : 0; return; } }
export function splineAt(K, t) { splineR(K, t); return RG[0]; }
// The planted bomb's light `ms` after its last flash; the dropped bomb's `ms` after it was dropped.
export const plantedPulse = ms => ms >= 0 && ms <= C4_TIMER_LIGHT.lifeMs ? splineAt(C4_TIMER_LIGHT.keys, ms / C4_TIMER_LIGHT.lifeMs) : 0;
export const droppedPulse = ms => ms >= 0 ? splineAt(C4_DROPPED_LIGHT.keys, (ms % C4_DROPPED_LIGHT.periodMs) / C4_DROPPED_LIGHT.periodMs) : 0;
// The LED in weaponModel('c4')'s own space (game units): C4_FIT's LED (rig metres) back through the fit's turn and shift.
export function ledInModel(kind, out = [0, 0, 0]) { const F = C4_FIT[kind] || C4_FIT.cc0, d0 = F.led[0] - F.shift[0], d1 = F.led[1] - F.shift[1], d2 = F.led[2] - F.shift[2];
  out[0] = (F.x[0] * d0 + F.x[1] * d1 + F.x[2] * d2) / GU; out[1] = (F.y[0] * d0 + F.y[1] * d1 + F.y[2] * d2) / GU; out[2] = (F.z[0] * d0 + F.z[1] * d1 + F.z[2] * d2) / GU; return out; }
function dotTexture() {
  if (typeof document === 'undefined') return null;
  try { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); if (typeof x?.createRadialGradient !== 'function') return null;
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32), a = v => `rgba(255,255,255,${v})`; gr.addColorStop(0, a(1)); gr.addColorStop(.25, a(.55)); gr.addColorStop(.6, a(.12)); gr.addColorStop(1, a(0));
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t; } catch { return null; } }   // (a soft round light mask: CS2's flare and core textures are the user's own files, not imported here)
// The bloom-only flare's mask (v53 DETAILS final): CS2 draws particle_flare_001 only into the bloom input
// (m_bOnlyRenderInEffectsBloomPass), so what reaches the screen is bloom's glow — bright at the LED and falling off fast,
// not a flat disc over the whole brick. Ours: this steep mask at BLOOM_K (our stand-in for the bloom pass). (v53 DETAILS
// final 2: its inner fifth raised — 0.6 at 8 %, 0.2 at 20 %, was 0.4 / 0.09 — so the flash reads red round the LED at
// normal range, still dark at the brick's edges; the stops are ours.)
function haloTexture() {
  if (typeof document === 'undefined') return null;
  try { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); if (typeof x?.createRadialGradient !== 'function') return null;
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32), a = v => `rgba(255,255,255,${v})`; gr.addColorStop(0, a(1)); gr.addColorStop(.08, a(.6)); gr.addColorStop(.2, a(.2)); gr.addColorStop(.4, a(.05)); gr.addColorStop(1, a(0));
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t; } catch { return null; } }
// Per draw: the sprite moved toward the camera by its CS2 camera bias (HU), and kept at least minPx wide. No allocation.
function biasSprite(sp, biasU, minPx) {
  sp.onBeforeRender = (renderer, scene, camera) => {
    const p = sp.parent; if (!p) return; const e = sp.matrixWorld.multiplyMatrices(p.matrixWorld, sp.matrix).elements, c = camera.matrixWorld.elements;
    const dx = c[12] - e[12], dy = c[13] - e[13], dz = c[14] - e[14], d = Math.hypot(dx, dy, dz) || 1e-6, sx = Math.hypot(e[0], e[1], e[2]) || 1e-9;
    const H = renderer?.domElement?.height || 1080, p5 = camera.isPerspectiveCamera ? camera.projectionMatrix.elements[5] : 0;
    if (p5 > 0 && minPx > 0) { const W = Math.max(sx, minPx * Math.max(1, H / 1080) * 2 * d / (p5 * H)), f = W / sx; if (f !== 1) { e[0] *= f; e[1] *= f; e[2] *= f; e[4] *= f; e[5] *= f; e[6] *= f; e[8] *= f; e[9] *= f; e[10] *= f; } }
    const b = Math.min(.5 * d, Math.max(biasU * HU_U, .25 * sx)) / d; e[12] += dx * b; e[13] += dy * b; e[14] += dz * b; }; }
// The two pooled lights. o: { scene (parked there: warmed with the map), hostNow(), play(at) — the dropped blink's sound }.
// planted(mesh | null): hang the red flash on the planted bomb's model (or take it off); beep(hostMs): a flash now (each
// beep). dropped(mesh | null, atMs): the yellow blink on the dropped bomb's model, timed from its drop. update(): per frame.
// play(mesh, msSinceDrop): the dropped blink's sound, with each new particle.
export function createBombLights({ scene = null, hostNow = () => Date.now(), play = null } = {}) {
  const tex = dotTexture(), halo = haloTexture(), led = [0, 0, 0];
  function light(L, name) {
    const g = new THREE.Group(); g.name = name; g.userData.gd = true; g.userData.keep = true; g.visible = false;   // (keep: a map change's clear of the arena group leaves it)
    const col = new THREE.Color().setRGB(L.color[0] / 255, L.color[1] / 255, L.color[2] / 255, THREE.SRGBColorSpace).multiplyScalar(L.overbright), dark = new THREE.Color(0x1a0d08);
    const mk = (size, bias, px, map = tex) => { const m = new THREE.SpriteMaterial({ map, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }); const s = new THREE.Sprite(m); s.scale.setScalar(size); s.renderOrder = 3; biasSprite(s, bias, px); g.add(s); return s; };
    const flare = mk(2 * L.radius * L.flare * HU_U, L.flareBias, 0, halo || tex), core = mk(2 * L.radius * L.core * HU_U, L.coreBias, CORE_PX);
    const dotM = new THREE.MeshBasicMaterial({ color: dark.clone() }), dot = new THREE.Mesh(new THREE.SphereGeometry(LED_R / GU, 10, 6), dotM); g.add(dot);
    if (scene) scene.add(g); shared(g);
    return { g, flare, core, dotM, col, dark, on: null,
      set(a = RG[1]) { flare.material.opacity = a * BLOOM_K; core.material.opacity = a; const s = a < 1 ? a : 1, dc = dotM.color; dc.r = dark.r + (col.r - dark.r) * s; dc.g = dark.g + (col.g - dark.g) * s; dc.b = dark.b + (col.b - dark.b) * s; },   // (written by field: no call takes a boxed number)
      hang(mesh) { if (this.on === mesh) return; this.on = mesh || null; if (!mesh) { g.visible = false; if (scene) scene.add(g); else g.removeFromParent(); this.set(0); return; }
        ledInModel(modelFromFile('c4') ? 'cs2' : 'cc0', led); g.position.set(led[0], led[1], led[2]); mesh.add(g); g.visible = true; } };
  }
  const P = light(C4_TIMER_LIGHT, 'gd-c4-planted-light'), D = light(C4_DROPPED_LIGHT, 'gd-c4-dropped-light');
  const FL = new Float64Array(C4_TIMER_LIGHT.max).fill(-1e12); let flashI = 0, dropAt = 0, cycle = -1, held = null;   // (held: a frozen clock for pictures — hold(ms); FL, the live flashes: CS2's m_nMaxParticles 5 — at the last beeps, 0.15 s apart, their 0.5 s lives overlap and add up, additive)
  const state = { planted: 0, dropped: 0, flashes: 0, blinks: 0 };
  return {
    P, D, state,
    planted(mesh) { P.hang(mesh); if (!mesh) FL.fill(-1e12); },
    beep(ms = hostNow()) { FL[flashI] = ms; flashI = (flashI + 1) % FL.length; state.flashes++; },
    dropped(mesh, atMs = hostNow()) { if (D.on !== (mesh || null)) cycle = -1; D.hang(mesh); dropAt = atMs; },
    hold(ms = null) { held = Number.isFinite(ms) ? ms : null; },   // (tests / pictures: the lights drawn at host time `ms`; null: live)
    update(now = hostNow()) { RG[2] = held !== null ? held : now; const LF = C4_TIMER_LIGHT.lifeMs, PD = C4_DROPPED_LIGHT.periodMs;
      if (P.on) { RG[1] = 0; for (let i = 0; i < FL.length; i++) { const ms = RG[2] - FL[i]; if (ms >= 0 && ms <= LF) { splineR(C4_TIMER_LIGHT.keys, ms / LF); RG[1] += RG[0]; } } if (RG[1] > 1) RG[1] = 1; state.planted = RG[1]; P.set(); }
      if (D.on) { const t = RG[2] - dropAt, n = t >= 0 ? Math.floor(t / PD) : -1; if (t >= 0) splineR(C4_DROPPED_LIGHT.keys, (t - n * PD) / PD); else RG[0] = 0; RG[1] = RG[0]; state.dropped = RG[1]; D.set();
        if (n !== cycle) { const late = cycle < 0 && t - n * PD > FRESH_MS; cycle = n; if (n >= 0) { state.blinks++; if (play && !late) play(D.on, t); } } }   /* (v53 DETAILS final 2: t, ms since the drop — the time C4.LightFlash's curve reads) */   // (its sound with each new particle — the first one too, at the drop (CS2: m_nInitialParticles 1, its C_OP_RenderSound plays); not for a particle already well under way when the bomb came into view: a late join)
    },
    dispose() { P.hang(null); D.hang(null); for (const L of [P, D]) { L.g.removeFromParent(); L.flare.material.dispose(); L.core.material.dispose(); L.dotM.dispose(); } tex?.dispose(); halo?.dispose(); },
  };
}
