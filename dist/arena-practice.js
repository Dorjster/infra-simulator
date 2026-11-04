// Practice (Global Defensive, arena.practice): what the session's settings show, on this screen only —
//  · impacts: a small red box where each of your bullets stopped, and where it went through a wall, for 4 s (CS2's
//    sv_showimpacts);
//  · recoil: (v53 HITS, open-B#9: the dots panel #gd-recoil is gone — CS2 has no such panel; it was ADDENDUM 11's "stray
//    dark square" beside the crosshair. The session setting stays and draws nothing);
//  · paths: the flight of each grenade you throw, drawn for 8 s (sv_grenade_trajectory) — v53 S2: with a mark at each
//    bounce and a bigger one where it ended (rested / went off);
//  · collision shapes (Practice menu, this screen only): what bodies, bullets and grenades meet round you, drawn over the
//    map (gd-collision-view.js; switched off with the session).
// v53 S2 (SPEC 1.3), CS2's practice tools:
//  · The trajectory preview while a grenade is held (sv_grenade_trajectory_prac_pipreview): the line it will take, a
//    ring where it ends and a small picture of that spot (bottom right), live with your aim, position and strength —
//    flown with the throw's own fixed-step function (arena-nades.js simThrow, from the release state throwPacket
//    makes: the same steps the host flies), into reused buffers: nothing allocated per frame. The picture: the scene
//    from above and behind the landing spot — into a small target every 2nd frame (with post-processing: the
//    composer's shader set; its quad on the screen every frame) or onto the screen scissored (without: the screen's), so no shader is built mid-round; the
//    quad that shows the target is compiled when the session starts.
//  · Lineups (gd-lineups.js): the map's shipped ones and yours, as floor marks where to stand (blue: smoke, white:
//    flash); standing on one (within 8 HU) shows its name and how to throw it, and a small target in the world where
//    to aim — white, yellow within 1°, green once your angles are within 0.1° (AIM_OK). Yours: saved from getpos
//    (console lineup_save) into user-assets/lineups/<map>.json through the room (only the host's computer keeps a file;
//    a guest's stay in this browser).
//  · The console (gd-console.js, ` key): getpos / setpos / setang, noclip (here: fly, no collision — the host lets the
//    moves through as teleports), god, sv_infinite_ammo, bot_kick, mp_roundtime / mp_freezetime (host settings, this
//    session only), sv_rethrow_last_grenade (your last throw's own packet again: same spot, angles, strength).
// State: per session (createPractice … dispose). Everything is made once and reused (no garbage in play).
import * as THREE from './three.module.js';
import { simThrow, throwPacket, throwEye, NADE_DT, GRAVITY, NADES } from './arena-nades.js';
import { COLLISION_VIEW } from './gd-collision-view.js';
import { ARENA_MAPS } from './arena-maps.js';
import { ARENA } from './facility-layout.js';
import { mapFrame, lineupsFor, lineupStand, aimOff, AIM_OK, HU, lineupFrom, parsePos, MAX_USER, saveArgs } from './gd-lineups.js';   // (LINEUPS: v53 S2 review — every seed (≤ 14 a map) and all of the player's own (MAX_USER) get a mark)
import { createConsole } from './gd-console.js';
import { hostNow } from './host-clock.js';

const MARKS = 192, MARK_MS = 4000, PATHS = 6, PATH_MS = 8000, PTS = 260, BOUNCES = 24, LINEUPS = 16 + MAX_USER, ON_SPOT = 8 * HU, PIP_W = 288, PIP_H = 162, PIP_BOTTOM = 150, PIP_RIGHT = 16;
const KIND_COLOR = { smoke: 0x7fb4ff, flash: 0xf2f2f2, he: 0xff6a4a, molotov: 0xffa040, incendiary: 0xffa040, decoy: 0xb0b0b0 };
// The preview's flight (pure — no DOM, no scene; tests/gd-lineup-library.mjs): fly(kind, s, arr) flies the release
// state s (throwPacket's fields) with simThrow into a reused flight object, writing every 3rd step's point into arr
// (Float32Array, x y z) and the bounces into bx; the same state as the last frame's (aim, feet, speed, strength, kind
// all equal) flies nothing again — a held, still aim costs nothing, and a moving one only the flight (≈ 0.25 KB of
// short-lived numbers a flight in V8's throwStart / launch: measured by the test, no object kept).
export function createFlightPreview(boxes, bounds) {
  const G = {}, P = {}, F = { n: 0, nb: 0, bx: new Float32Array(BOUNCES * 3), arr: null, pvx: 0, pvy: 0, pvz: 0, g: null, flights: 0 }, K = new Float64Array(11); let kindWas = null, arrWas = null;
  const onStep = g => { if (g.n % 3 === 0 && F.n < PTS) { const a = F.arr; a[F.n * 3] = g.x; a[F.n * 3 + 1] = g.y; a[F.n * 3 + 2] = g.z; F.n++; }
    if (g.n > 0) { const ey = F.pvy - (g.grav ?? GRAVITY) * NADE_DT; if (Math.abs(g.vx - F.pvx) + Math.abs(g.vy - ey) + Math.abs(g.vz - F.pvz) > .5 && F.nb < BOUNCES && !g.rest) { F.bx[F.nb * 3] = g.x; F.bx[F.nb * 3 + 1] = g.y; F.bx[F.nb * 3 + 2] = g.z; F.nb++; } }   // (a bounce: the velocity changed by more than gravity's step)
    F.pvx = g.vx; F.pvy = g.vy; F.pvz = g.vz; };
  F.fly = (kind, a, arr) => { F.arr = arr; F.n = 0; F.nb = 0; F.flights++; const g = simThrow(kind, a, boxes(), bounds(), kind === 'smoke' || kind === 'decoy' ? 8000 : 4000, onStep, true, G);
    if (g.n % 3 && F.n < PTS) { arr[F.n * 3] = g.x; arr[F.n * 3 + 1] = g.y; arr[F.n * 3 + 2] = g.z; F.n++; } return F.g = g; };
  // the held grenade's flight: only when something changed since the last frame
  const put = (i, v) => { const d = K[i] !== v; K[i] = v; return d; };
  F.hold = (kind, s, arr) => { const st = s.strength === 'short' ? 0 : s.strength === 'medium' ? 1 : 2;
    let ch = put(0, s.x); ch = put(1, s.y) || ch; ch = put(2, s.z) || ch; ch = put(3, s.duck || 0) || ch; ch = put(4, s.vx || 0) || ch; ch = put(5, s.vy || 0) || ch; ch = put(6, s.vz || 0) || ch; ch = put(7, s.pitch) || ch; ch = put(8, s.yaw) || ch; ch = put(9, st) || ch; ch = put(10, s.jt ? 1 : 0) || ch;
    if (!ch && kind === kindWas && arr === arrWas && F.g) return F.g; kindWas = kind; arrWas = arr; return F.fly(kind, throwPacket(s, P), arr); };
  return F; }
// deps (lab.js): scene, pistol, boxes(), bounds(), settings() (arena.practice), map() (its id), me() → { x y z (feet),
// duck, pitch, yaw } or null, teleport(x, y, z, pitch, yaw) (feet), look(pitch, yaw), act(action) → Promise (an arena
// action to the host), infra() → { renderer, gfx }, release() / capture() (the mouse), name().
export function createPractice({ scene, pistol, boxes, bounds = () => null, settings, map = () => null, me = () => null, teleport = () => {}, look = () => {}, act = async () => ({}), infra = () => globalThis.__infra, release = () => {}, capture = () => {}, name = () => '' }) {
  const own = [];   // (everything this session adds to the scene: removed and disposed at the end)
  const add = o => { o.frustumCulled = false; o.userData.gd = true; o.userData.noShadow = true; scene.add(o); own.push(o); return o; };
  const marks = add(new THREE.InstancedMesh(new THREE.BoxGeometry(.45, .45, .45), new THREE.MeshBasicMaterial({ color: 0xff3a30 }), MARKS));
  const M = new THREE.Matrix4(), born = new Float64Array(MARKS), FAR = new THREE.Matrix4().makeTranslation(0, -5000, 0);
  for (let i = 0; i < MARKS; i++) marks.setMatrixAt(i, FAR); marks.count = MARKS;
  // Grenade paths after a throw (8 s), their bounce marks and end marks.
  const lineMat = new THREE.LineBasicMaterial({ color: 0x62d4ff }), paths = [];
  for (let i = 0; i < PATHS; i++) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PTS * 3).fill(-5000), 3)); g.setDrawRange(0, 2); paths.push({ l: add(new THREE.Line(g, lineMat)), until: 0, b0: i * BOUNCES }); }
  const dotGeo = new THREE.SphereGeometry(.32, 8, 6), bounceMat = new THREE.MeshBasicMaterial({ color: 0xffc23a }), endMat = new THREE.MeshBasicMaterial({ color: 0x5cff7a });
  const bounces = add(new THREE.InstancedMesh(dotGeo, bounceMat, PATHS * BOUNCES)), ends = add(new THREE.InstancedMesh(dotGeo, endMat, PATHS));
  for (let i = 0; i < PATHS * BOUNCES; i++) bounces.setMatrixAt(i, FAR); for (let i = 0; i < PATHS; i++) ends.setMatrixAt(i, FAR); ends.scale.setScalar(1);
  // The preview: line and landing ring (drawn over the map), and the picture (below).
  const prevGeo = new THREE.BufferGeometry(); prevGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PTS * 3).fill(-5000), 3)); prevGeo.setDrawRange(0, 2);
  const prevLine = add(new THREE.Line(prevGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85, depthTest: false }))); prevLine.renderOrder = 6;
  const ring = add(new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9, depthTest: false, side: THREE.DoubleSide }))); ring.renderOrder = 6; ring.position.set(0, -5000, 0);
  // Lineups: floor marks (one instanced ring set, coloured per kind) and the aim target.
  const spotGeo = new THREE.RingGeometry(.55, 1.25, 28).rotateX(-Math.PI / 2), spots = add(new THREE.InstancedMesh(spotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .75, depthWrite: false, side: THREE.DoubleSide }), LINEUPS));
  spots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LINEUPS * 3).fill(1), 3); for (let i = 0; i < LINEUPS; i++) spots.setMatrixAt(i, FAR); spots.renderOrder = 4;
  const tgtMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95, depthTest: false, side: THREE.DoubleSide }), target = add(new THREE.Mesh(new THREE.RingGeometry(.09, .16, 24), tgtMat)); target.renderOrder = 7; target.position.set(0, -5000, 0);
  target.add(new THREE.Mesh(new THREE.CircleGeometry(.025, 10), tgtMat));
  // The lineup card and the picture's frame (DOM).
  // (v53 HITS: no recoil panel — CS2 has none, open-B#9)
  const card = document.createElement('div'); card.id = 'gd-lineup-card'; Object.assign(card.style, { position: 'fixed', left: '50%', top: 'calc(50% + 70px)', transform: 'translateX(-50%)', padding: '6px 12px', background: '#000a', color: '#fff', font: '600 13px/1.4 system-ui, sans-serif', borderRadius: '4px', pointerEvents: 'none', zIndex: 30, display: 'none', textAlign: 'center', maxWidth: 'min(520px, calc(100vw - 32px))' }); document.body.append(card);
  const pipBox = document.createElement('div'); pipBox.id = 'gd-pip'; Object.assign(pipBox.style, { position: 'fixed', right: PIP_RIGHT - 2 + 'px', bottom: PIP_BOTTOM - 2 + 'px', width: PIP_W + 'px', height: PIP_H + 'px', border: '2px solid #ffffffb0', pointerEvents: 'none', zIndex: 29, display: 'none' }); document.body.append(pipBox);
  let head = 0, pathHead = 0, lastShots = pistol.shots;
  // ── one flight, written into reused buffers: points (every 3rd step and the last), bounce marks, its end ──
  const FL = createFlightPreview(boxes, bounds), fly = FL.fly;
  // ── after a throw: its path 8 s, bounces, end; kept for sv_rethrow_last_grenade ──
  let last = null;
  const onThrow = e => { const d = e.detail; if (!d?.a || !NADES[d.kind]) return; last = { kind: d.kind, a: { ...d.a } };   // (a copy of the packet as sent — once a throw, not a frame)
    const s = settings(); if (!s?.paths) return; const k = pathHead++ % PATHS, P = paths[k], arr = P.l.geometry.attributes.position.array, g = fly(d.kind, d.a, arr);
    P.l.geometry.setDrawRange(0, FL.n); P.l.geometry.attributes.position.needsUpdate = true; P.until = performance.now() + PATH_MS;
    for (let i = 0; i < BOUNCES; i++) bounces.setMatrixAt(P.b0 + i, i < FL.nb ? M.makeTranslation(FL.bx[i * 3], FL.bx[i * 3 + 1], FL.bx[i * 3 + 2]) : FAR); bounces.instanceMatrix.needsUpdate = true;
    ends.setMatrixAt(k, M.makeScale(1.8, 1.8, 1.8).setPosition(g.x, g.y, g.z)); ends.instanceMatrix.needsUpdate = true; };
  addEventListener('gd-throw', onThrow);
  // ── the lineups of this map ──
  let mapId = null, frame = null, list = [], userList = [], here = -1; const ST = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, duck: 0 }, stands = new Float64Array(LINEUPS * 3), looks = new Float64Array(LINEUPS * 2), col = new THREE.Color();   // (looks: v53 S2 review — each lineup's pitch / yaw, worked out once in place(): nothing parsed per frame)
  const localKey = id => 'gd-lineups:' + id;
  function loadLineups(id) { mapId = id; const Mm = ARENA_MAPS[id]; frame = Mm ? mapFrame(Mm, ARENA.cx, ARENA.cz) : null; userList = []; try { userList = JSON.parse(localStorage.getItem(localKey(id)) || '[]'); } catch { userList = []; } place();
    fetch('/api/lineups/' + id, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => { if (j && mapId === id && Array.isArray(j.lineups)) { userList = [...userList.filter(u => !j.lineups.some(l => l.id === u.id)), ...j.lineups]; place(); } }).catch(() => {}); }
  function place() { list = frame ? lineupsFor(mapId, userList).filter(L => parsePos(L.pos)) : []; if (list.length > LINEUPS) list.length = LINEUPS; here = -1; card.style.display = 'none';
    for (let i = 0; i < LINEUPS; i++) { if (i < list.length) { lineupStand(list[i], frame, ST); stands[i * 3] = ST.x; stands[i * 3 + 1] = ST.y; stands[i * 3 + 2] = ST.z; looks[i * 2] = ST.pitch; looks[i * 2 + 1] = ST.yaw; aimOff(list[i], 0, 0);   /* (aimOff: its parsed angles cached on the lineup now) */ spots.setMatrixAt(i, M.makeTranslation(ST.x, ST.y + .06, ST.z)); spots.setColorAt(i, col.setHex(KIND_COLOR[list[i].kind] || 0xffffff)); } else spots.setMatrixAt(i, FAR); }
    spots.instanceMatrix.needsUpdate = true; if (spots.instanceColor) spots.instanceColor.needsUpdate = true; }
  const how = L => `${L.kind === 'flash' ? (L.pop ? 'Pop-flash' : 'Flashbang') : L.kind[0].toUpperCase() + L.kind.slice(1)} · ${{ left: 'left click', right: 'right click', both: 'both buttons' }[L.button]}${{ stand: '', crouch: ' · crouched', jump: ' · jump-throw', runjump: ' · run + jump-throw', walk: ' · walking', run: ' · running' }[L.move]}`;
  // lineup_save [name] [left|right|both] [stand|crouch|jump|runjump|walk|run] (v53 S2 review, gd-lineups.js saveArgs):
  // the throw as said, else your last throw's (opening the console lets go of the buttons, so the held ones can't tell).
  async function saveLineup(arg, posLine) {
    const kind = pistol.current?.id && NADES[pistol.current.id] ? pistol.current.id : last?.kind || 'smoke', s = me(), A = saveArgs(arg, last && last.kind === kind ? last.a : null, s?.duck || 0);
    const L = lineupFrom(mapId, posLine, { name: A.name || 'My ' + kind + ' ' + (userList.length + 1), kind, button: A.button, move: A.move }); if (!L) return 'lineup_save: not a lineup';
    let where = 'this browser'; try { const r = await fetch('/api/lineups/' + mapId, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ add: L }) }); if (r.ok) { const j = await r.json(); userList = j.lineups; where = 'user-assets/lineups/' + mapId + '.json'; } } catch {}
    if (where === 'this browser') { userList = [...userList, L]; try { localStorage.setItem(localKey(mapId), JSON.stringify(userList.filter(u => u.user).slice(-200))); } catch {} }
    place(); return `Saved "${L.name}" (${how(L)}) · ${where}`; }
  // ── the console ──
  let noclip = false; const myKey = () => String(name() || '').trim().toLowerCase().slice(0, 40);
  const cons = createConsole({ isGD: () => true, release, capture, ctx: () => ({ practice: !!settings(), frame, me,
    teleport: (x, y, z, p, yw) => teleport(x, y, z, p, yw), look: (p, yw) => look(p, yw),
    toggle: k => { if (k === 'noclip') return noclip = !noclip; const on = !settings()?.god?.[myKey()]; act({ type: 'practice-god', on }).then(r => r?.error && cons.print(r.error)); return on; },
    set: (k, v) => act({ type: 'practice', settings: k === 'ammo' ? { ammo: v > 0, nades: v === 1, mag: v === 1 } : { [k]: v } }).then(r => r?.error || ''),   // (sv_infinite_ammo 1: the magazine never empties and grenades stay (mag, nades); 2: the reserve only — v53 S2 review)
    kick: nm => act({ type: 'practice-kick', name: nm || undefined }).then(r => r?.error || ''),
    rethrow: () => { if (!last) return null; const L0 = last; act({ type: 'throw', kind: L0.kind, ...L0.a, rethrow: true }).then(r => { if (r?.error) cons.print(r.error); else dispatchEvent(new CustomEvent('gd-throw', { detail: { kind: L0.kind, a: L0.a } })); }); return 'Rethrew the last ' + NADES[L0.kind].name.toLowerCase(); },
    saveLineup, lineups: () => list.map(L => `${L.user ? '* ' : ''}${L.name} — ${how(L)} — ${L.pos}`),
    copy: t => { try { navigator.clipboard?.writeText(t).catch(() => {}); } catch {} } }) });
  // ── the preview's picture of the landing spot ──
  const pipCam = new THREE.PerspectiveCamera(60, PIP_W / PIP_H, .5, 120), quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false })); quadScene.add(quad);
  const KEEP = [], VP = new THREE.Vector4(), SC = new THREE.Vector4(); let rt = null, pipOn = false, pipFrame = 0;
  function warm() { const r = infra()?.renderer; if (!r || rt) return; rt = new THREE.WebGLRenderTarget(PIP_W * 2, PIP_H * 2, { type: THREE.HalfFloatType }); quad.material.map = rt.texture; quad.material.needsUpdate = true; try { r.compile(quadScene, quadCam); } catch {} }
  warm();   // (at the session's start: the quad's one small shader)
  function drawPip() { const I = infra(), r = I?.renderer; if (!r) return; warm(); const post = !!I.gfx?.post, fresh = ++pipFrame % 2 === 0;   // (the frame's own render covers the whole screen: the picture goes on every frame; its scene — with post-processing — every 2nd)
    const auto = r.autoClear, sh = r.shadowMap.autoUpdate, only = scene.userData.renderOnly, all = scene.children;
    const scenePass = () => { if (only) { KEEP.length = 0; for (let i = 0; i < all.length; i++) if (only(all[i])) KEEP.push(all[i]); scene.children = KEEP; } r.shadowMap.autoUpdate = false; };   // (the line and ring stay in the picture: where it lands, marked)
    try { if (post) { if (fresh) { scenePass(); const was = r.getRenderTarget(); r.setRenderTarget(rt); r.autoClear = true; r.render(scene, pipCam); r.setRenderTarget(was); if (only) scene.children = all; }   // (a target: the composer's shader set)
        r.autoClear = false; quadFit(); r.render(quadScene, quadCam); }   // (then the quad onto the screen)
      else { scenePass(); r.getViewport(VP); r.getScissor(SC); const x = innerWidth - PIP_RIGHT - PIP_W; r.setViewport(x, PIP_BOTTOM, PIP_W, PIP_H); r.setScissor(x, PIP_BOTTOM, PIP_W, PIP_H); r.setScissorTest(true); r.autoClear = false; r.clear(true, true, false); r.render(scene, pipCam); r.setScissorTest(false); r.setViewport(VP); r.setScissor(SC); } }   // (no post-processing: the screen's own shader set, scissored, each frame)
    finally { r.autoClear = auto; r.shadowMap.autoUpdate = sh; scene.children = all; } }
  const quadFit = () => { const w = innerWidth, h = innerHeight; quad.scale.set(PIP_W / w, PIP_H / h, 1); quad.position.set(1 - (PIP_RIGHT + PIP_W / 2) * 2 / w, -1 + (PIP_BOTTOM + PIP_H / 2) * 2 / h, 0); quad.updateMatrixWorld(); };
  // ── per frame ──
  const PS = { x: 0, z: 0 }, prevArr = prevGeo.attributes.position.array;
  return {
    get noclip() { return noclip; }, get console() { return cons; }, get lineups() { return list; }, get here() { return here >= 0 ? list[here] : null; }, get last() { return last; }, get pip() { return pipOn; },
    // The flight preview (lab.js, every frame a grenade is held in practice): s = { x y z (feet), duck, vx vy vz, pitch,
    // yaw, strength, jt } — the release state, as the throw takes it — or null to hide it. Returns the flight's end.
    preview(kind, s) {
      if (!kind || !s || !NADES[kind]) { if (pipOn || prevGeo.drawRange.count) { prevGeo.setDrawRange(0, 0); ring.position.y = -5000; pipOn = false; pipBox.style.display = 'none'; } return null; }
      const n0 = FL.flights, g = FL.hold(kind, s, prevArr); if (FL.flights === n0 && pipOn) return g;   // (nothing changed: the same line, ring and picture spot)
      PS.x = s.x; PS.z = s.z; prevGeo.setDrawRange(0, FL.n); prevGeo.attributes.position.needsUpdate = true; ring.position.set(g.x, g.y + .05, g.z);
      // the picture: from above and behind the landing spot, along the throw
      const dx = g.x - PS.x, dz = g.z - PS.z, dl = Math.hypot(dx, dz) || 1; pipCam.position.set(g.x - dx / dl * 9, g.y + 11, g.z - dz / dl * 9); pipCam.lookAt(g.x, g.y, g.z); pipCam.updateMatrixWorld();
      if (!pipOn) { pipOn = true; pipBox.style.display = 'block'; } return g; },
    afterRender() { if (pipOn) drawPip(); },
    // noclip: fly where you look (W / S along the view, A / D sideways, jump up, crouch down), through everything.
    // Approximation: 1000 HU/s, a quarter of it walking (CS2's sv_noclipspeed is a server cvar not in the install).
    fly(s, clk, I, dt) { const sp = (I.walk ? 250 : 1000) * HU * dt, wl = Math.hypot(I.wish[0], I.wish[1]), fx = I.look[0], fz = I.look[1], f = wl ? (I.wish[0] * fx + I.wish[1] * fz) / wl : 0, rr = wl ? (I.wish[0] * -fz + I.wish[1] * fx) / wl : 0, cp = Math.cos(I.pitch), u = (I.jump ? 1 : 0) - (I.duck ? 1 : 0);
      s.x += (fx * cp * f - fz * rr) * sp; s.z += (fz * cp * f + fx * rr) * sp; s.y += (Math.sin(I.pitch) * f + u) * sp; s.vx = s.vy = s.vz = 0; s.onGround = false; s.duck = 0;
      clk.px = clk.x = s.x; clk.py = clk.y = s.y; clk.pz = clk.z = s.z; clk.duck = clk.pd = 0; clk.acc = 0; clk.lift = 0; clk.landed = 0; return true; },
    // A practice round's freeze time (mp_freezetime): still until the host's round.free.
    get frozen() { const R = settings()?.round; return !!R && hostNow() < R.free; },   // (v53 S2 review: the host's time, on its clock — host-clock.js; a guest's own Date.now() can be seconds off)
    update(now = performance.now()) {
      const s = settings() || {};
      if (map() && (map() !== mapId || frame && !frame.cs2 && ARENA_MAPS[mapId]?.hammer)) loadLineups(map());   // (a new map — or its CS2 file arrived after the session started: its own frame)
      // A new shot: its impacts.
      if (pistol.shots !== lastShots) { lastShots = pistol.shots; const L = pistol.lastShot;
        if (L && s.impacts) for (const e of L.ends) { if (!e.mark && e.flesh === undefined || e.point.distanceTo(L.origin) > 399) continue;   /* (not a shot into the sky) */ const i = head++ % MARKS; marks.setMatrixAt(i, M.makeTranslation(e.point.x, e.point.y, e.point.z)); born[i] = now; marks.instanceMatrix.needsUpdate = true; }
        }
      // Old marks and paths out of sight.
      for (let i = 0; i < MARKS; i++) if (born[i] && now - born[i] > MARK_MS) { born[i] = 0; marks.setMatrixAt(i, FAR); marks.instanceMatrix.needsUpdate = true; }
      for (let k = 0; k < PATHS; k++) { const P = paths[k]; if (!P.until || now <= P.until) continue; P.until = 0; P.l.geometry.setDrawRange(0, 2); P.l.geometry.attributes.position.array.fill(-5000, 0, 6); P.l.geometry.attributes.position.needsUpdate = true;
        for (let i = 0; i < BOUNCES; i++) bounces.setMatrixAt(P.b0 + i, FAR); ends.setMatrixAt(k, FAR); bounces.instanceMatrix.needsUpdate = true; ends.instanceMatrix.needsUpdate = true; }
      // On a lineup's spot: its card and its aim target.
      const m = me(); let at = -1;
      if (m) { let bd = ON_SPOT; for (let i = 0; i < list.length; i++) { const d = Math.hypot(m.x - stands[i * 3], m.z - stands[i * 3 + 2]); if (d < bd && Math.abs(m.y - stands[i * 3 + 1]) < 3) { bd = d; at = i; } } }
      if (at !== here) { here = at; if (at < 0) { card.style.display = 'none'; target.position.y = -5000; } else { const L = list[at]; card.textContent = `${L.name} · ${how(L)}${L.notes ? ' · ' + L.notes : ''}`; card.style.display = 'block'; } }
      if (at >= 0) { const L = list[at], lp = looks[at * 2], ly = looks[at * 2 + 1], cp = Math.cos(lp), D = 30, ex = m.x, ey = m.y + throwEye(m.duck), ez = m.z;   // (v53 S2 review: the cached look — no parse, no new object per frame)
        target.position.set(ex - Math.sin(ly) * cp * D, ey + Math.sin(lp) * D, ez - Math.cos(ly) * cp * D); target.lookAt(ex, ey, ez); const off = aimOff(L, m.pitch, m.yaw); tgtMat.color.setHex(off <= AIM_OK + 1e-9 ? 0x3cff6a : off < 1 ? 0xffd23a : 0xffffff); }
    },
    // Stand on lineup i and aim as it says (tests, the browser check). Returns it.
    goTo(i) { const L = list[i]; if (!L || !frame) return null; lineupStand(L, frame, ST); teleport(ST.x, ST.y, ST.z, ST.pitch, ST.yaw); return L; },
    get aimColor() { return '#' + tgtMat.color.getHexString(); },
    // The newest after-throw path (tests, the browser check): its points drawn, its bounce marks and end mark placed.
    get lastPath() { const k = (pathHead - 1 + PATHS) % PATHS, P = paths[k], e = new THREE.Matrix4(), v = new THREE.Vector3(); let nb = 0; for (let i = 0; i < BOUNCES; i++) { bounces.getMatrixAt(P.b0 + i, e); if (v.setFromMatrixPosition(e).y > -4000) nb++; } ends.getMatrixAt(k, e); v.setFromMatrixPosition(e); return { on: pathHead > 0 && P.until > performance.now(), points: P.l.geometry.drawRange.count, bounces: nb, end: v.y > -4000 ? [v.x, v.y, v.z] : null }; },
    dispose() { if (!COLLISION_VIEW.dev) COLLISION_VIEW.on = false;   // (the practice menu's collision view ends with the session: never in a match)
      removeEventListener('gd-throw', onThrow); cons.dispose();
      for (const o of own) { scene.remove(o); o.traverse(c => c.geometry?.dispose()); }
      for (const m of [marks.material, lineMat, bounceMat, endMat, prevLine.material, ring.material, spots.material, tgtMat, quad.material]) m.dispose(); dotGeo.dispose(); quad.geometry.dispose(); rt?.dispose(); card.remove(); pipBox.remove(); },
  };
}
