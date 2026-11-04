// v53 C4 · Addendum 10: the bomb on the carrier's back with its blinking light (dist/gd-c4-back.js), in node.
// Checks:
//  · CS2's numbers as read from its files: the agents' "c4" attachment (spine_3, offset / rotation) and the carried
//    bomb's light (c4_holstered_light.vpcf: a flash once a second on CS2's alpha spline);
//  · the blink: c4Pulse at CS2's keys, periodic (1 s), the rig's glow and LED following the host clock;
//  · attach / detach follows the bomb on the HOST (arena-logic.js runs a Defuse round on Dust II: the carrier, the bomb in
//    hand, a drop, a pickup by another Terrorist, a plant) and on a GUEST (the same state as the room sends it, merged by
//    multiplayer.js mergeGdFrame): on the carrier's built-in soldier, never on your own back (first person), off while the
//    bomb is in their hands, gone the frame it is dropped or planted, on the new carrier at once after a pickup;
//  · on a CS2 agent (when the agents are imported on this computer: user-assets): on spine_3 with CS2's attachment, the
//    brick's underside on the back, its keypad facing back, its LED behind the body; the same for CS2's own C4 mesh
//    (user-assets/weapons/c4.bin) laid by C4_FIT.cs2 — LED texels where CS2's vmdl puts its "led" attachment region;
//  · CS2's colours set as sRGB (the glow 240 230 140, the LED's lens 220 198 42); the glow per draw: CS2's 1 u camera
//    bias, its 10 u size near and the core's least pixels far off, the facing fade; the CC0 fallback's LED on its top;
//  · no allocation per frame (node --expose-gc).
//   node --expose-gc tests/gd-c4-back.mjs
import { readFileSync, existsSync } from 'node:fs';
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
globalThis.self ??= globalThis; globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
{ const w = console.warn; console.warn = (...a) => { if (!/PropertyBinding|texture/i.test(String(a[0]))) w(...a); }; }
const THREE = await import('../dist/three.module.js');
const W = await import('../dist/weapon-models.js');
const { createC4Back, c4Pulse, C4_BLINK, C4_ATTACH, C4_FIT } = await import('../dist/gd-c4-back.js');
// ── CS2's numbers (as read from the files with Source2Viewer-CLI; the test pins them) ──
check('CS2 attachment "c4" (tm_phoenix): spine_3, offset (−2.198, −7.074, 1.129) in, rotation (.6988, −.0228, −.0326, .7142)', C4_ATTACH.t.bone === 'spine_3' && Math.abs(C4_ATTACH.t.o[1] + 7.073534) < 1e-6 && Math.abs(C4_ATTACH.t.q[3] - .714191) < 1e-6);
check('CS2 carried-bomb light (c4_holstered_light): 1 flash / s, peak .865 at 0.111 s', C4_BLINK.periodMs === 1000 && Math.abs(C4_BLINK.keys[1][0] - .111339) < 1e-6 && Math.abs(C4_BLINK.keys[1][1] - .86456) < 1e-6);
// ── the blink ──
{ const at = [0, 50, 111.339, 200, 349.921, 600, 999].map(c4Pulse);
  check('c4Pulse on CS2\'s keys: 0 at the start, .865 at 0.111 s, .218 at 0.350 s, ~0 at the end', Math.abs(at[0]) < 1e-9 && Math.abs(at[2] - .86456) < 1e-4 && Math.abs(at[4] - .21816) < 1e-4 && at[6] < .01, at.map(v => v.toFixed(3)).join(' '));
  check('…rises fast, fades slow (0.05 s > 0.6 s > 0)', at[1] > .4 && at[5] > 0 && at[5] < at[3], at.map(v => v.toFixed(3)).join(' '));
  let per = 0; for (let t = 0; t < 5000; t += 7) per = Math.max(per, Math.abs(c4Pulse(t) - c4Pulse(t + 1000)) + Math.abs(c4Pulse(1.7e12 + t) - c4Pulse(t + 1.7e12 + 3000)));
  let bright = 0; for (let t = 0; t < 1000; t++) if (c4Pulse(t) > .3) bright++; let max = 0; for (let t = 0; t < 1000; t++) max = Math.max(max, c4Pulse(t));
  check('…the same every second, on the host\'s clock too (1.7e12 ms)', per < 1e-9, per);
  check(`…lit (> .3) for ${bright} ms a second, never above CS2's .865`, bright > 150 && bright < 450 && max <= .8646 + 1e-6, max.toFixed(4)); }
// ── a stand-in bomb model (node has no fetch for the real ones): the shipped CC0 bomb's shape, as weaponModel('c4') ──
{ const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(9.7 / 16.5, 6.6 / 16.5, 20 / 16.5), new THREE.MeshStandardMaterial({ color: 0x777777 })); g.add(m); W.registerModel('c4', g); }
// ── a tiny DOM for the soldiers' name / face canvases ──
{ const ctx = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : /^(get|create)ImageData$/.test(k) ? () => ({ data: new Uint8ClampedArray(4) }) : /Gradient$/.test(k) ? () => ({ addColorStop() {} }) : typeof k === 'string' ? (t[k] ?? (() => {})) : undefined, set: (t, k, x) => { t[k] = x; return true; } });
  globalThis.document ??= { createElement: () => ({ width: 64, height: 64, style: {}, getContext: () => ctx, toDataURL: () => '' }), createElementNS: () => ({ style: {} }) }; }
const { makeSoldier } = await import('../dist/gd-soldiers.js');
// ── the host: a real Defuse round (arena-logic.js) on Dust II; the guest: the room's frame merged (multiplayer.js) ──
const { startArena, arenaApply, arenaTick } = await import('../dist/arena-logic.js'), { ARENA_MAPS } = await import('../dist/arena-maps.js'), { ARENA } = await import('../dist/facility-layout.js'), { mergeGdFrame } = await import('../dist/multiplayer.js');
let seed = 11; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const M = ARENA_MAPS.dust2, cx = ARENA.cx, cz = ARENA.cz, at = ([x, z]) => ({ x: cx + x, y: 9.7 + (M.nav ? M.nav.floorAt(x, z) || 0 : 0), z: cz + z, yaw: 0 });
const host = { levels: {} }; let t = 6e9; startArena(host, { map: 'dust2', kind: 'defuse', bots: 0 }, t);
const P = [{ id: 'a', name: 'Ann', pose: at(M.t[0]) }, { id: 'b', name: 'Bea', pose: at(M.t[1] || M.t[0]) }, { id: 'c', name: 'Cy', pose: at(M.ct[0]) }];
const tick = ms => { for (let i = 0; i < ms / 50; i++) { t += 50; arenaTick(host, P, .05, t); } };
tick(100);
const guest = { mode: 'arena', arena: { map: 'dust2' } }, Rr = { combat: 0, arena: 0, loadout: 0 }, wire = () => JSON.parse(JSON.stringify({ ...host.combat, sent: Date.now() }));
const sync = () => mergeGdFrame(guest, wire(), Rr);
// every computer draws the others: a soldier per player (their side's gear), keyed by player id as lan.models
const teamOf = nm => host.combat.d.teams[nm.toLowerCase()];
const dress = Object.fromEntries(P.map(p => [p.id, makeSoldier(p, teamOf(p.name) || 't')]));
const viewOf = (selfId, G) => { const scene = new THREE.Scene(), models = new Map(P.filter(p => p.id !== selfId).map(p => [p.id, { cs: dress[p.id] }]));
  let now = 0; const v = createC4Back({ scene, players: () => P, models: () => models, selfId: () => selfId, game: () => G(), hostNow: () => now }); return { v, scene, setNow: x => { now = x; } }; };
// the views: a CT on the host computer, a Terrorist guest, and the carrier's own computer (also a guest)
const carrierOf = () => host.combat.d.bomb.carrier, idOf = k => P.find(p => p.name.toLowerCase() === k)?.id;
const ctId = P.find(p => teamOf(p.name) === 'ct')?.id, H = viewOf(ctId, () => host), Gt = viewOf(null, () => guest);   // (the host's computer: a CT's; a spectating guest)
const on = (view, id) => view.v.rig.parent === dress[id]?.torso && view.v.rig.visible;
const parked = view => !view.v.rig.visible && view.v.rig.parent === view.scene;
sync(); H.v.update(); Gt.v.update();
const c1 = carrierOf(), id1 = idOf(c1);
check('a Terrorist carries the bomb (the host gave it at the round start)', !!c1 && teamOf(P.find(p => p.id === id1).name) === 't', c1);
check('host (a CT\'s computer): the bomb hangs on the carrier\'s back — the soldier\'s torso', on(H, id1) && H.v.state.mounted === 'soldier', H.v.state.mounted);
check('guest: the same, from the room\'s frame', on(Gt, id1) && guest.combat.d.bomb.carrier === c1);
const own = viewOf(id1, () => guest); own.v.update();
check('the carrier\'s own computer: not on your own back (first person)', parked(own) && own.v.state.self === true);
// the bomb in their hands (slot 5): drawn in the hand by the agent / soldier, not on the back
{ const p = P.find(x => x.id === id1); p.pose = { ...p.pose, gun: true, weapon: 'c4' }; H.v.update(); Gt.v.update();
  check('the carrier takes the bomb out (in hand): off the back, on host and guest', parked(H) && parked(Gt) && H.v.state.held && Gt.v.state.held);
  p.pose = { ...p.pose, gun: true, weapon: 'ak' }; H.v.update(); Gt.v.update(); check('…puts it away: back on the back', on(H, id1) && on(Gt, id1)); }
// into the live round; the carrier drops it
for (let i = 0; i < 400 && host.combat.d.round?.phase !== 'live'; i++) tick(100);
{ const p = P.find(x => x.id === id1); arenaApply(host, { type: 'drop', slot: 'bomb' }, p.name, P, t += 50); H.v.update();
  check('drop: gone from the carrier\'s back that frame (host)', parked(H) && !host.combat.d.bomb.carrier);
  sync(); Gt.v.update(); check('…and on the guest the frame the room\'s state arrives', parked(Gt) && !guest.combat.d.bomb.carrier);
  p.pose = { ...p.pose, x: p.pose.x + 40 }; tick(1500); }
// another Terrorist picks it up
{ const it = host.combat.ground.find(x => x.item === 'c4'), other = P.find(x => x.id !== id1 && teamOf(x.name) === 't');
  check('the dropped bomb lies on the ground', !!it && !!other); other.pose = { ...other.pose, x: it.x, z: it.z, y: (it.y || 0) + 9.7 };
  const r = arenaApply(host, { type: 'pickup', id: it.id }, other.name, P, t += 50); H.v.update(); sync(); Gt.v.update();
  check('pickup by another Terrorist: the bomb moves to the new carrier at once (host and guest)', /bomb/i.test(String(r)) && on(H, other.id) && on(Gt, other.id) && !on(H, id1), String(r));
  // plant on a site
  other.pose = at(M.siteGoals?.A || M.sites.A.slice(0, 2)); arenaApply(host, { type: 'plant', hold: true }, other.name, P, t);
  tick(1000); H.v.update(); sync(); Gt.v.update(); const kO = other.name.toLowerCase();
  // (while the plant runs the host keeps them the carrier — arena-defuse.js clears it only at the plant — so the rig
  // follows their hands: the pose says the gun out is something else → on the back; the bomb out → in hand, off the back)
  check('planting, the bomb not (yet) in their hands: still the carrier, still on the back (host and guest)', host.combat.d.round.plant?.by === kO && host.combat.d.bomb.carrier === kO && guest.combat.d.bomb.carrier === kO && on(H, other.id) && on(Gt, other.id), JSON.stringify(host.combat.d.round.plant));
  other.pose = { ...other.pose, gun: true, weapon: 'c4' }; H.v.update(); Gt.v.update();
  check('planting with the bomb in their hands (CS2\'s plant): off the back, on host and guest', parked(H) && parked(Gt) && H.v.state.held && Gt.v.state.held && H.v.state.carrier === kO);
  other.pose = { ...other.pose, gun: true, weapon: 'ak' }; H.v.update(); check('…(put away again mid-plant: back on the back)', on(H, other.id));
  tick(2600); H.v.update(); sync(); Gt.v.update();
  check('plant: off the back on host and guest when the bomb is planted', host.combat.d.round.phase === 'planted' && parked(H) && parked(Gt), host.combat.d.round.phase); }
// ── the LED and glow follow the blink (host clock) ──
{ const v = Gt; guest.combat.d.bomb.carrier = c1; for (const p of P) if (p.id === id1) p.pose = { ...p.pose, gun: true, weapon: 'ak' }; v.v.update();
  const rows = []; for (const ms of [6e12, 6e12 + 111, 6e12 + 350, 6e12 + 700, 6e12 + 1111]) { v.setNow(ms); v.v.update(); rows.push([v.v.glow.material.opacity, v.v.led.material.color.r]); }
  check('the glow\'s opacity is CS2\'s pulse on the host clock (0 → .865 → .218 → … → .865 a second later)', Math.abs(rows[0][0]) < 1e-6 && Math.abs(rows[1][0] - .86456) < 1e-3 && Math.abs(rows[2][0] - .21816) < 1e-3 && rows[3][0] < rows[2][0] && Math.abs(rows[4][0] - rows[1][0]) < 1e-9, rows.map(r => r[0].toFixed(3)).join(' '));
  check('…and the LED with it (bright at the flash, dark between)', rows[1][1] > 1 && rows[0][1] < .2, rows.map(r => r[1].toFixed(2)).join(' '));
  // CS2's colours, as sRGB (c4_holstered_light m_ConstantColor 240 230 140 × overbright 1.5; the LED: c4_color's lens texels 220 198 42)
  { const s8 = (col, k) => { const o = {}; new THREE.Color().copy(col).multiplyScalar(1 / k).getRGB(o, THREE.SRGBColorSpace); return [o.r, o.g, o.b].map(x => Math.round(x * 255)); };
    v.setNow(6e12 + 111.339); v.v.update(); const gc8 = s8(v.v.glow.material.color, C4_BLINK.overbright), lc8 = s8(v.v.led.material.color, C4_BLINK.overbright);
    check('the glow\'s colour is CS2\'s warm yellow 240 230 140 (sRGB) × 1.5 — not near-white', gc8.every((x, i) => Math.abs(x - [240, 230, 140][i]) <= 1), gc8.join(' '));
    check('the LED at the flash: c4_color\'s yellow lens 220 198 42 (sRGB) × 1.5', lc8.every((x, i) => Math.abs(x - [220, 198, 42][i]) <= 1), lc8.join(' ')); }
  // the glow per draw (onBeforeRender): CS2's camera bias, the core's least size far off, the facing fade
  { let top = v.v.rig; while (top.parent) top = top.parent; top.updateMatrixWorld(true);
    const rw = v.v.rig.matrixWorld.elements, n = new THREE.Vector3(rw[8], rw[9], rw[10]).normalize(), ledW = v.v.led.getWorldPosition(new THREE.Vector3()), cam = new THREE.PerspectiveCamera(74, 16 / 9, .05, 5000), R = { domElement: { height: 1080 } };
    const draw = (metres, dir) => { cam.position.copy(ledW).addScaledVector(dir, metres / .165); cam.lookAt(ledW); cam.updateMatrixWorld(true); v.v.glow.onBeforeRender(R, null, cam); const e = v.v.glow.matrixWorld.elements, p = new THREE.Vector3(e[12], e[13], e[14]), W = Math.hypot(e[0], e[1], e[2]), d = cam.position.distanceTo(ledW);
      return { moved: ledW.distanceTo(cam.position) - p.distanceTo(cam.position), sideways: p.clone().sub(ledW).cross(cam.position.clone().sub(ledW).normalize()).length(), corePx: W / 10 * cam.projectionMatrix.elements[5] * 1080 / 2 / d, W, op: v.v.glow.material.opacity }; };
    const near = draw(1, n), far = draw(10, n), front = draw(3, n.clone().negate()), side = draw(3, new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize()), back3 = draw(3, n);
    check('glow: moved toward the camera by at least CS2\'s 1 u camera bias (m_flCameraBias), along the line of sight', near.moved >= .0254 / .165 - 1e-6 && near.sideways < 1e-4 && far.moved > 0, `1 m: ${(near.moved * 16.5).toFixed(1)} cm · 10 m: ${(far.moved * 16.5).toFixed(1)} cm`);
    check('glow: at 1 m CS2\'s size (10 u quad, 1 u core); at 10 m the core kept ≥ CORE_PX wide (1080 lines)', Math.abs(near.W * .165 - 10 * .0254) < 1e-6 && far.corePx >= 2.5 - 1e-6 && far.W > near.W, `1 m: ${(near.W * 16.5).toFixed(1)} cm, core ${near.corePx.toFixed(1)} px · 10 m: core ${far.corePx.toFixed(1)} px`);
    check('glow: full light seen from behind (the bomb\'s top toward you), none from the front, faded from the side', Math.abs(back3.op - .86456) < 1e-3 && front.op === 0 && side.op < .2, `behind ${back3.op.toFixed(3)} front ${front.op.toFixed(3)} side ${side.op.toFixed(3)}`);
    for (let i = 0; i < 300; i++) v.v.glow.onBeforeRender(R, null, cam);
    globalThis.gc?.(); const g0 = process.memoryUsage().heapUsed; for (let i = 0; i < 100000; i++) v.v.glow.onBeforeRender(R, null, cam); globalThis.gc?.(); const dg = process.memoryUsage().heapUsed - g0;
    if (globalThis.gc) check('100 000 glow draws (onBeforeRender): heap growth under 512 KB', dg < 524288, (dg / 1024).toFixed(1) + ' KB'); }
  // no allocation per frame
  for (let i = 0; i < 300; i++) { v.setNow(6e12 + i * 16); v.v.update(); }
  globalThis.gc?.(); const h0 = process.memoryUsage().heapUsed; for (let i = 0; i < 100000; i++) { v.setNow(6e12 + i * 16); v.v.update(); } globalThis.gc?.(); const dh = process.memoryUsage().heapUsed - h0;
  if (globalThis.gc) check('100 000 frames with the bomb on a back: heap growth under 512 KB (one 16-byte object a frame would be 1.6 MB)', dh < 524288, (dh / 1024).toFixed(1) + ' KB'); else console.log('SKIP the allocation check: run with node --expose-gc');
  guest.combat.d.bomb.carrier = null; v.v.update(); check('the carrier cleared: parked, hidden', parked(v)); }
// ── the shipped CC0 bomb (dist/models/weapons/c4.bin: the fallback without CS2's file) laid by C4_FIT.cc0: the LED on its top ──
{ const buf = readFileSync('dist/models/weapons/c4.bin'), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), dv = new DataView(ab), hl = dv.getUint32(0, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, hl))); let o = 4 + hl;
  const F = C4_FIT.cc0, at0 = W.REAL_FIT.c4.at, B = new THREE.Matrix4().makeBasis(new THREE.Vector3(...F.x), new THREE.Vector3(...F.y), new THREE.Vector3(...F.z)), sh = new THREE.Vector3(...F.shift), pos = [], s = new THREE.Vector3();
  for (const pt of head.parts) { const Pp = new Float32Array(ab.slice(o, o + pt.count * 12)); o += pt.count * 32; for (let i = 0; i < Pp.length; i += 3) { s.set(Pp[i] - at0[0], Pp[i + 1] - at0[1], Pp[i + 2] - at0[2]).multiplyScalar(.01).applyMatrix4(B).add(sh); pos.push(s.x, s.y, s.z); } }   // (file cm → game units (÷16.5) × GU (.165) = metres, then CS2's root frame)
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeBoundingBox(); const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), rc = new THREE.Raycaster();
  const [lx, ly, lz] = F.led; rc.set(new THREE.Vector3(lx, ly, 1), new THREE.Vector3(0, 0, -1)); const hit = rc.intersectObject(mesh)[0], topZ = hit ? hit.point.z : NaN, R = .0032;
  check('CC0 fallback bomb: its underside where CS2\'s is (−4.0 cm), long side up the spine (Source x)', Math.abs(g.boundingBox.min.z * 100 + 4) < .1 && (g.boundingBox.max.x - g.boundingBox.min.x) > (g.boundingBox.max.y - g.boundingBox.min.y), `z ${(g.boundingBox.min.z * 100).toFixed(2)} … ${(g.boundingBox.max.z * 100).toFixed(2)} cm`);
  check('CC0 fallback bomb: the LED dot sits on the mesh\'s top right under it (sunk, not floating: its bottom below the surface, its centre above)', hit && lz - R < topZ && lz > topZ && lz - topZ < R, `top ${(topZ * 100).toFixed(2)} cm, LED centre ${(lz * 100).toFixed(2)} cm, radius ${(R * 100).toFixed(2)} cm`); }
// ── CS2 agents (imported on this computer only) ──
const A = 'user-assets/agents/';
if (!['cs2_ct.glb', 'cs2_t.glb'].every(f => existsSync(A + f))) console.log('SKIP (agents): no CS2 agents on this computer');
else {
  const { gltfLoader } = await import('../dist/gltf-loader.js'), { useAgents, makeAgent } = await import('../dist/cs2-agents.js');
  const parse = f => { const b = readFileSync(A + f); return new Promise((res, rej) => gltfLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)); };
  const [ct, tt] = await Promise.all(['cs2_ct.glb', 'cs2_t.glb'].map(parse)); useAgents({ ct: ct.scene, t: tt.scene });
  // CS2's own C4 mesh (user-assets/weapons/c4.bin, CS2's file) read here as weapon-models loadReal reads it
  const bin = 'user-assets/weapons/c4.bin'; let cs2Pts = null;
  if (existsSync(bin)) { const buf = readFileSync(bin), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), dv = new DataView(ab), hl = dv.getUint32(0, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, hl))); let o = 4 + hl; cs2Pts = [];
    for (const pt of head.parts) { const Pp = new Float32Array(ab.slice(o, o + pt.count * 12)); o += pt.count * 32; for (let i = 0; i < Pp.length; i += 3 * 7) cs2Pts.push((Pp[i]) / 16.5, (Pp[i + 1] + 2.5) / 16.5, Pp[i + 2] / 16.5); } }   // (game units as weaponModel has it: CS2_FIT c4 at [0, −2.5, 0]; every 7th vertex)
  for (const side of ['t', 'ct']) {
    const a = makeAgent({ name: 'C' }, side), scene = new THREE.Scene(); scene.add(a.g); a.setWeapon('ak'); for (let i = 0; i < 30; i++) a.update(1 / 60, { aim: true, speed: 0 });
    const Pl = [{ id: 'x', name: 'Xa', pose: { gun: true, weapon: 'ak' } }], G = { mode: 'arena', combat: { d: { bomb: { carrier: 'xa' } } } }, models = new Map([['x', { cs: a }]]);
    const v = createC4Back({ scene, players: () => Pl, models: () => models, selfId: () => 'me', game: () => G, hostNow: () => 0 }); v.update(); a.update(1 / 60, { aim: true, speed: 0 }); scene.updateMatrixWorld(true);
    const spine = a.g.getObjectByName('spine_3'); let chain = true; for (let x = spine; x && x !== a.g; x = x.parent) if (!x.visible) chain = false;
    check(`${side.toUpperCase()} agent: the rig hangs on spine_3 (CS2's "c4" attachment), its bones shown`, v.rig.parent === spine && v.state.mounted === 'agent' && chain);
    // the agent's facing (−z of g), its back surface right behind the rig, the brick's top normal (Source +z) pointing back
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(a.g.matrixWorld), up = new THREE.Vector3(0, 0, 1).transformDirection(v.rig.matrixWorld), longA = new THREE.Vector3(1, 0, 0).transformDirection(v.rig.matrixWorld);
    check(`${side.toUpperCase()} agent: keypad facing back, long side up the spine`, up.dot(fwd) < -.8 && longA.y > .85, `top·fwd ${up.dot(fwd).toFixed(2)} long.y ${longA.y.toFixed(2)}`);
    const root = new THREE.Vector3().setFromMatrixPosition(v.rig.matrixWorld), led = v.led.getWorldPosition(new THREE.Vector3());
    // How far the body reaches into the brick: every drawn skin vertex in the rig's own frame (CS2's C4 root: Source axes,
    // metres) inside the brick's footprint (weapon_c4.vmdl bounds x −14.03…12.75, y −9.47…9.46 cm), its height over the
    // brick's underside (z −3.99 cm). > 0: into the brick; the most, and how many reach past 1.5 cm. Posed (holding a
    // gun, as every carrier is) and in the model's rest pose (CS2's bind pose with CS2's attachment: the files' own fit).
    const intoOf = (ag, rig) => { ag.g.updateMatrixWorld(true); const inv = rig.matrixWorld.clone().invert(), q = new THREE.Vector3(); let max = -1e9, deep = 0, pts = 0;
      ag.g.traverse(o => { if (!o.isSkinnedMesh || !o.visible) return; const Pp = o.geometry.attributes.position; for (let i = 0; i < Pp.count; i++) { o.getVertexPosition(i, q); q.applyMatrix4(o.matrixWorld).applyMatrix4(inv); const x = q.x * 100, y = q.y * 100, z = q.z * 100;
        if (x < -14.03 || x > 12.75 || y < -9.47 || y > 9.46 || z < -15) continue; pts++; const k = z + 3.99; if (k > max) max = k; if (k > 1.5) deep++; } });
      return { max, deep, pts }; };
    const posed = intoOf(a, v.rig), ra = makeAgent({ name: 'R' }, side), rs = new THREE.Scene(); rs.add(ra.g); const rig2 = new THREE.Group(); ra.g.getObjectByName('spine_3').add(rig2); rig2.position.set(...C4_ATTACH[side].o.map(x => x * .0254)); rig2.quaternion.set(...C4_ATTACH[side].q); rs.updateMatrixWorld(true); const rest = intoOf(ra, rig2); ra.dispose?.();
    const fmt = r => `${r.max.toFixed(1)} cm into it, ${r.deep}/${r.pts} skin points past 1.5 cm`;
    if (side === 't') check(`T agent (Phoenix, the carrier's side): the brick's underside on the back — rest ${fmt(rest)}; posed ${fmt(posed)} (within −1.5 … +1 cm at rest, +2 cm posed, under 10 % of the footprint past 1.5 cm)`, rest.pts > 20 && rest.max > -1.5 && rest.max < 1 && posed.max > -1.5 && posed.max < 2 && posed.deep < .1 * posed.pts);
    // (SAS: CS2's own attachment on its bind pose already has the plate carrier's edges 3.0 cm into the brick's corners —
    //  the files' fit, not ours; our pose must add no more than 0.5 cm to it. A CT never carries the bomb in a match.)
    else check(`CT agent (SAS): on the back — rest ${fmt(rest)} (CS2's bind pose and attachment); posed ${fmt(posed)} (rest within −1.5 … +3.5 cm, posed no deeper than rest + 0.5 cm)`, rest.pts > 20 && rest.max > -1.5 && rest.max < 3.5 && posed.max < rest.max + .5);
    check(`${side.toUpperCase()} agent: the LED is behind the body (seen from behind)`, -led.clone().sub(root).dot(fwd) > 0 && (led.clone().sub(a.g.getWorldPosition(new THREE.Vector3())).dot(fwd)) < 0);
    if (cs2Pts && side === 't') {   // CS2's own mesh by C4_FIT.cs2: its bounds in CS2's root frame (weapon_c4.vmdl: x −14.03…12.75, y −9.47…9.46, z −3.99…4.33 cm)
      const F = C4_FIT.cs2, q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...F.x), new THREE.Vector3(...F.y), new THREE.Vector3(...F.z))), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], s = new THREE.Vector3();
      for (let i = 0; i < cs2Pts.length; i += 3) { s.set(cs2Pts[i], cs2Pts[i + 1], cs2Pts[i + 2]).applyQuaternion(q).multiplyScalar(.165).add(new THREE.Vector3(...F.shift)); const A3 = s.toArray(); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], A3[k]); hi[k] = Math.max(hi[k], A3[k]); } }
      const want = [[-14.03, -9.47, -3.99], [12.75, 9.46, 4.33]], err = Math.max(...[0, 1, 2].map(k => Math.max(Math.abs(lo[k] * 100 - want[0][k]), Math.abs(hi[k] * 100 - want[1][k]))));
      check('CS2\'s own C4 mesh laid by C4_FIT.cs2 lands in CS2\'s root frame (bounds within 0.5 cm of weapon_c4.vmdl\'s)', err < .5, err.toFixed(2) + ' cm'); }
    v.dispose(); a.dispose(); } }
console.log(`${ok}/${n}`); if (ok !== n) { console.log('FAIL: gd-c4-back'); process.exit(1); } console.log('PASS: gd-c4-back · ' + n + ' checks (CS2 attachment + holstered blink, attach / detach on host and guest, agents and soldiers, no per-frame allocation)');
