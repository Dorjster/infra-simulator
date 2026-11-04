// Global Defensive · CS2's death cam (v53 Addendum 2: dist/gd-deathcam.js, arena-spectate.js, gd-death-panel.js).
//  · the state machine: death → ANIM → TRAVEL → FREEZE (→ fade) → DONE → first-person spectating, on the host's clock,
//    with the timings of the CAM table (CS2's convar names spec_freeze_deathanim_time / _traveltime / _time / _time_lock,
//    whose defaults are not in the install: see the module's top) — and CS2's death_cam_phase1 colour (#ff9494);
//  · the skip (CS2's jump): refused before deathanim + lock, taken after, straight to the fade, then spectating;
//  · the camera: at your eye at the death, stepping back and up, never through a wall; turned to the killer and
//    following them as they move; the killer gone (left the match): back along the bullet; self-kill / fall / C4 / fire:
//    no killer, the cam looks at your body and the panel says CS2's words;
//  · the panel: KILLED BY, name, weapon, marks, their health (updated), damage given / taken (CS2's words) from the
//    host's down record (dg / dt), hidden when the spectating starts;
//  · the host's record: hurt() puts dg / dt (Defuse: this round's report; deathmatch: this life) and bleed() the killing
//    hit (rg, z) on the down record — small, GD only;
//  · respawn modes: back alive mid-cam ends it; nothing allocated per frame.
//  · (FINISH pass) a spectator or a mid-round joiner gets no body of themselves; allocation measured with no collection
//    in between, and the check shown to catch a frame that does allocate.
//  · (r2 fixes) the red tint is never over the spectating (0 / hidden in every 'done' frame); the vignette of
//    death_cam_phase1 in the tint layer; a respawn mode fades the cam out before the respawn and lifts the black after it;
//    a death while scoped: the cam at your normal FOV; CS2's "your own" / "<name>'s" gun lines from the record's `o`; the
//    86 px health bar; no world blur behind the panel on Low.
//   node tests/gd-deathcam.mjs        (re-runs itself with --expose-gc and a 64 MB young generation for the allocation check)
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
if (typeof gc !== 'function') { const r = spawnSync(process.execPath, ['--expose-gc', '--max-semi-space-size=64', '--min-semi-space-size=64', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
// allocation over a loop: one collection before, none during or after (a 64 MB young generation: nothing collected in between)
const allocOf = loop => { gc(); gc(); const h0 = process.memoryUsage().heapUsed; loop(); return process.memoryUsage().heapUsed - h0; };
let n = 0, ok = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 300))); };
// a tiny DOM
class El { constructor(t) { this.tagName = t; this.children = []; this.style = {}; this.hidden = false; this._html = ''; this.text = ''; this.id = ''; this.className = ''; }
  insertAdjacentHTML(w, h) { for (const m of h.matchAll(/id="([^"]+)"/g)) { const e = new El('div'); e.id = m[1]; e.hidden = true; byId[m[1]] = e; } }
  append(...k) { for (const c of k) { this.children.push(c); if (c.id) byId[c.id] = c; } } set innerHTML(h) { this._html = h; } get innerHTML() { return this._html; } set textContent(v) { this.text = v; } get textContent() { return this.text; }
  querySelector(sel) { const c = sel.replace(/^\./, ''); const m = new RegExp(`class="${c}"[^>]*>([^<]*)`).exec(this._html); if (!m) return null; const e = this.__q ??= {}; return e[c] ??= Object.assign(new El('span'), { text: m[1] }); } }
const byId = {}; globalThis.document = { head: new El('head'), body: new El('body'), createElement: t => new El(t), getElementById: id => byId[id] || null };
let T = 1e6; Date.now = () => T; performance.now = () => T;
const THREE = await import('../dist/three.module.js');
const DC = await import('../dist/gd-deathcam.js'), SP = await import('../dist/arena-spectate.js'), DP = await import('../dist/gd-death-panel.js'), CL = await import('../dist/combat-logic.js');
const { CAM, camPhase, camTotal, canSkip, blackAt, deathKind, DEATHCAM, TINT, FADE } = DC;

// ── the timeline ──
check('the CAM table: deathanim 0.8 s, travel 0.3 s, freeze 3 s, lock 2 s, skippable (the Source / CS:GO defaults — CS2\'s names verified, values not in the install)', CAM.deathanim === .8 && CAM.travel === .3 && CAM.freeze === 3 && CAM.lock === 2 && CAM.skippable === true && Math.abs(camTotal() - 4.1) < 1e-9);
check('phases: anim → travel → freeze → fade → done at deathanim, +travel, end − FADE, end', camPhase(0) === 'anim' && camPhase(.79) === 'anim' && camPhase(.81) === 'travel' && camPhase(1.09) === 'travel' && camPhase(1.11) === 'freeze' && camPhase(camTotal() - FADE - .01) === 'freeze' && camPhase(camTotal() - FADE + .01) === 'fade' && camPhase(camTotal() + .01) === 'done');
check('the screen goes black over the fade and comes back as the spectating starts', blackAt(1) === 0 && blackAt(camTotal() - .01) > .9 && blackAt(camTotal() + .01) > .9 && blackAt(camTotal() + .6) === 0);
check('the skip: refused before deathanim + lock (2.8 s), allowed after', !canSkip(2.79) && canSkip(2.81));
check('a skip at 3 s: the fade at once, done 0.2 s later', camPhase(3.05, 3) === 'fade' && camPhase(3.25, 3) === 'done' && blackAt(3.19, 3) > .9);
check('the death cam colour is CS2\'s death_cam_phase1 table (R × 1, G and B × 0.58 = #ff9494)', TINT === '#ff9494' && Math.abs(0x94 / 255 - .58) < .005);
check('who killed you: a player, yourself, the fall, the bomb, your own fire', deathKind({ by: 'Foe' }, 'me') === 'killer' && deathKind({ by: 'Me', wid: 'he' }, 'me') === 'self' && deathKind({ by: 'Me', wid: 'fall' }, 'me') === 'self' && deathKind({ by: 'C4', wid: 'c4' }, 'me') === 'bomb' && deathKind({ by: 'me', wid: 'molotov' }, 'me') === 'fire' && deathKind({}, 'me') === 'self');

// ── the cam and the spectator, as lab.js wires them ──
const mk = (name, x, y, z) => { const g = new THREE.Group(), label = new THREE.Object3D(), cs = { g: new THREE.Group() }; g.add(label); g.add(cs.g); g.position.set(x, y, z); return { name, g, label, cs, speed: 0 }; };
const foe = mk('Foe', 40, 0, 0), mate = mk('Mate', -30, 0, 10); mate.iyaw = .5; mate.ipitch = 0; mate.iey = 9.7;
const G = { mode: 'arena', arena: { map: 'dust2', kind: 'defuse', knives: {}, skins: {} }, combat: { d: { teams: { me: 'ct', mate: 'ct', foe: 't' }, round: { phase: 'live', id: 'm.1' }, money: { me: 800, foe: 800, mate: 800 }, score: { t: 0, ct: 0 }, rules: {} }, down: {}, hp: { foe: 64, mate: 100 }, kills: {}, deaths: {}, last: {}, respawns: {}, feed: [], nades: [] } };
const players = [{ id: 'm', name: 'Mate', pose: { yaw: .5, gun: true, weapon: 'ak', shot: { n: 0, r: 0, pitch: 0 } } }, { id: 'f', name: 'Foe', pose: { yaw: 0 } }];
const lan = { models: new Map([['m', mate], ['f', foe]]), players };
// a wall 6 units behind you (boxes the death cam's step back must not pass)
const boxes = [{ minX: -12, maxX: -10, minZ: -50, maxZ: 50, y0: 0, y1: 40, mat: 'concrete', walk: false, off: false }];
const camera = new THREE.PerspectiveCamera(); camera.position.set(-4, 9.7, 0); camera.lookAt(-4, 9.7, -20);
const sp = SP.createSpectator({ camera, world: { operations: { game: G } }, lan, name: () => 'Me', boxes: () => boxes, view: { show() {}, hide() { return false; } } });
const panel = DP.createDeathPanel({ art: { gun: id => `<img class="kw" src="/i/${id}.svg">`, mark: k => `<i data-k="${k}"></i>`, hs: '' } });
const fwd = () => new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
const toward = (x, y, z) => new THREE.Vector3(x, y, z).sub(camera.position).normalize();
if (process.argv.includes('--alloc')) { let sink = 0; const bad = () => { for (let i = 0; i < 2000; i++) { const a = [1, 2, 3].map(x => x * 2); sink = (sink + a[1] + ('Foe' + i).toLowerCase().length) % 7; } }; bad(); const db = allocOf(bad);
  G.combat.down.me = { until: T + 4e12, by: 'Foe', weapon: 'AK-47', wid: 'ak', at: T, dg: [1, 1], dt: [1, 1] }; const DT = 1 / 144;
  const frames = k => { for (let i = 0; i < k; i++) { T += .2; foe.g.position.x = 40 + (i % 9) * .01; sp.update(DT); sp.follow(); panel.update(true, G, 'me', T); } }, clock = k => { for (let i = 0; i < k; i++) { T += .2; foe.g.position.x = 40 + (i % 9) * .01; } };
  frames(4000); clock(4000); let least = Infinity, raw = 0, base = 0; for (let r = 0; r < 3; r++) { const b = allocOf(() => clock(2000)), a = allocOf(() => frames(2000)); if (a - b < least) { least = a - b; raw = a; base = b; } }
  console.log(`DCALLOC ${raw} ${base} ${db}`); process.exit(0); }
check('alive: no cam, not spectating', sp.update(1 / 60) === false && !DEATHCAM.on);
// your death: the host's own record, through hurt() and bleed() (Defuse: damage both ways this round first)
const usp = { id: 'usps', name: 'USP-S', dmg: 35, kind: 'pistol' }, ak = { id: 'ak', name: 'AK-47', dmg: 36, kind: 'rifle', pen: 2 };
CL.hurt(G, 'Me', 'Foe', usp, 20, 'chest', T - 900); CL.hurt(G, 'Me', 'Foe', usp, 16, 'stomach', T - 700); CL.hurt(G, 'Foe', 'Me', ak, 40, 'chest', T - 300); const res = CL.hurt(G, 'Foe', 'Me', ak, 200, 'head', T, true, { wallbang: true });
CL.bleed(G, 'Me', res, -4.5, 9.4, 0, -1, 0, 0, T);
const dn = G.combat.down.me;
check('the host\'s down record: who, the weapon, head, at; damage given 36 in 2 hits, taken 100 in 2 hits (dg / dt); the killing hit (rg) and its hit group (z)', dn && dn.by === 'Foe' && dn.wid === 'ak' && dn.head && dn.at === T && JSON.stringify(dn.dg) === '[36,2]' && JSON.stringify(dn.dt) === '[100,2]' && Array.isArray(dn.rg) && dn.rg.length === 6 && dn.z === 'head', JSON.stringify(dn));
check('…small: under 200 bytes on the wire', JSON.stringify(dn).length < 200, JSON.stringify(dn).length);
const eye0 = camera.position.clone();
T += 16; sp.update(1 / 60); panel.update(true, G, 'me', T);
check('dead: the death cam runs first — not spectating a team mate yet, the HUD bar hidden', DEATHCAM.on && DEATHCAM.phase === 'anim' && sp.on && sp.watched === null && sp.camOn);
check('…the camera starts at your eye', camera.position.distanceTo(eye0) < .3, camera.position.toArray());
check('…the death panel: KILLED BY, the killer, the weapon icon, the HS and wallbang marks, their health (64 less your 36)', !panel.el.hidden && /KILLED BY/.test(panel.el.innerHTML) && panel.el.innerHTML.includes('Foe') && panel.el.innerHTML.includes('/i/ak.svg') && /data-k="head"/.test(panel.el.innerHTML) && /data-k="wallbang"/.test(panel.el.innerHTML) && /✚ 28/.test(panel.el.innerHTML), panel.el.innerHTML);
check('…CS2\'s words: "killed you with their AK-47", "Damage taken: 100 in 2 hits", "Damage given: 36 in 2 hits"', /killed you with their AK-47/.test(panel.el.innerHTML) && /Damage taken:.*<b>100<\/b>.*<b>2 hits/.test(panel.el.innerHTML) && /Damage given:.*<b>36<\/b>.*<b>2 hits/.test(panel.el.innerHTML), panel.el.innerHTML);
T += 784; sp.update(1 / 60);
check('end of the death anim: stepped back (away from the killer) and up, but not through the wall behind', camera.position.y > eye0.y + 1 && camera.position.x < eye0.x && camera.position.x > -10, camera.position.toArray());
T += 150; sp.update(1 / 60); check('travel: turning toward the killer', DEATHCAM.phase === 'travel');
T += 400; sp.update(1 / 60); sp.follow(); const d1 = fwd().dot(toward(foe.g.position.x, foe.g.position.y + 7.5, foe.g.position.z));
check('freeze: the killer framed (the camera looks at their chest)', DEATHCAM.phase === 'freeze' && d1 > .99, d1);
foe.g.position.z = 25; for (let i = 0; i < 60; i++) { T += 1000 / 60; sp.update(1 / 60); sp.follow(); }
const d2 = fwd().dot(toward(foe.g.position.x, foe.g.position.y + 7.5, foe.g.position.z));
check('the killer walks off: the cam keeps them framed (smoothly)', d2 > .99, d2);
G.combat.hp.foe = 31; T += 16; panel.update(true, G, 'me', T); check('their health updated in the panel as it changes', panel.el.querySelector('.hp')?.textContent === '✚ 31');
check('the skip refused before the lock', T - dn.at < 2800 && !sp.skip());
T = dn.at + 2900; sp.update(1 / 60); panel.update(true, G, 'me', T); check('past the lock: the skip hint shows', DEATHCAM.canSkip && !panel.skipEl.hidden);
check('Space (jump) takes the skip', sp.skip() === true && sp.skip() === false);
T += 100; sp.update(1 / 60); check('…the fade', DEATHCAM.phase === 'fade' && DEATHCAM.on && DEATHCAM.skip);
T += 150; const spec = sp.update(1 / 60); panel.update(true, G, 'me', T);
check('…then spectating your team mate, in first person (the cam done, the panel gone)', spec && !DEATHCAM.on && DEATHCAM.phase === 'done' && sp.watched?.name === 'Mate' && panel.el.hidden && panel.skipEl.hidden, JSON.stringify([DEATHCAM.phase, sp.watched?.name, panel.el.hidden]));
T += 300; sp.update(1 / 60); const tint = byId['gd-dc-tint'], black = byId['gd-dc-black'];
check('the black lifts and the red tint goes when the spectating has begun', black.hidden && tint.hidden);
// back alive (a new round)
delete G.combat.down.me; T += 16; check('alive again: no cam, not spectating', sp.update(1 / 60) === false && !DEATHCAM.on && !sp.on);
// no skip: the cam runs its full time on its own
G.combat.down.me = { until: T + 4e9, by: 'Foe', weapon: 'AK-47', wid: 'ak', head: false, at: T }; camera.position.set(0, 9.7, 0); sp.update(1 / 60);
T += 4090; sp.update(1 / 60); check('without a skip: still the cam at 4.09 s', DEATHCAM.on && sp.watched === null);
T += 30; sp.update(1 / 60); check('…spectating from 4.1 s (CAM total)', !DEATHCAM.on && sp.watched?.name === 'Mate');
{ const tint = byId['gd-dc-tint'], black = byId['gd-dc-black']; let bad = 0, frames = 0, lifted = false; for (let i = 0; i < 30; i++) { if (DEATHCAM.phase === 'done') { frames++; if (!tint.hidden && tint.style.opacity !== '0' && tint.style.opacity !== '0.000') bad++; if (black.hidden) lifted = true; } T += 1000 / 60; sp.update(1 / 60); }
  check('(r2) the red tint is gone the moment the cam is done — never over the spectated team mate while the black lifts', frames > 10 && !bad && lifted, `${bad} of ${frames} done frames tinted (opacity ${tint.style.opacity})`); }
delete G.combat.down.me; T += 16; sp.update(1 / 60);
// the killer gone (left the match): back along the bullet
lan.models.delete('f'); camera.position.set(0, 9.7, 0); camera.lookAt(0, 9.7, -20);
G.combat.down.me = { until: T + 4e9, by: 'Foe', weapon: 'AK-47', wid: 'ak', at: T, rg: [0, 9.4, 0, 0, 0, -1] }; sp.update(1 / 60); T += 1500; sp.update(1 / 60);
const back = fwd(); check('killer gone: the cam still runs, and looks back along the bullet (where they shot from)', DEATHCAM.on && back.z > .9, back.toArray());
lan.models.set('f', foe); delete G.combat.down.me; T += 16; sp.update(1 / 60);
// self-kill, fall, bomb, fire: CS2's words, no killer
for (const [d, word] of [[{ by: 'Me', wid: 'he', weapon: 'HE Grenade' }, 'You were killed by your own grenade'], [{ by: 'Me', wid: 'fall', weapon: 'Fall' }, 'YOU KILLED YOURSELF'], [{ by: 'C4', wid: 'c4', weapon: 'C4' }, 'You were killed by the C4 explosion'], [{ by: 'Me', wid: 'molotov', weapon: 'Molotov' }, 'You burned to death']]) {
  camera.position.set(0, 9.7, 0); G.combat.down.me = { until: T + 4e9, at: T, ...d }; sp.update(1 / 60); panel.update(true, G, 'me', T); T += 1500; sp.update(1 / 60); panel.update(true, G, 'me', T);
  const look = fwd(); check(`${d.wid === 'c4' ? 'the bomb' : d.wid}: the cam runs, looks down at your body; the panel says "${word}"`, DEATHCAM.on && DEATHCAM.kind !== 'killer' && look.y < -.3 && panel.el.innerHTML.includes(word) && !panel.el.innerHTML.includes('KILLED BY'), JSON.stringify([DEATHCAM.kind, look.y, panel.el.innerHTML.slice(0, 120)]));
  delete G.combat.down.me; T += 16; sp.update(1 / 60); panel.update(true, G, 'me', T); }
// respawn modes (deathmatch): the respawn ends the cam
G.combat.d = null; G.combat.down.me = { until: T + 2500, by: 'Foe', weapon: 'AK-47', wid: 'ak', at: T }; camera.position.set(0, 9.7, 0); sp.update(1 / 60); T += 1000; check('deathmatch: the cam runs', sp.update(1 / 60) && DEATHCAM.on);
for (let i = 0; i < 75; i++) { T += 1000 / 60; sp.update(1 / 60); } const bl = byId['gd-dc-black'], tn = byId['gd-dc-tint'];
check('(r2) …the cam fits the respawn: at 2.25 s (2.5 s respawn − FADE) it is fading to black — not cut mid-freeze', DEATHCAM.phase === 'fade' && !bl.hidden && +bl.style.opacity > .1, JSON.stringify([DEATHCAM.phase, bl.hidden, bl.style.opacity]));
check('(r2) the pure timeline: a 2.5 s respawn cap — freeze until 2.15 s, fade, done at 2.5 s; black full at the respawn', DC.camPhase(2.1, null, 2.5) === 'freeze' && DC.camPhase(2.2, null, 2.5) === 'fade' && DC.camPhase(2.5, null, 2.5) === 'done' && DC.blackAt(2.499, null, 2.5) > .95 && DC.respawnCap({ at: 0, until: 2500 }) === 2.5 && DC.respawnCap({ at: 0, until: 4e15 }) === Infinity);
for (let i = 0; i < 14; i++) { T += 1000 / 60; sp.update(1 / 60); } T += 20; check('…and the respawn (2.5 s) ends it: alive, no cam', sp.update(1 / 60) === false && !DEATHCAM.on);
check('(r2) …the tint off at once, the black lifting over your own view (not cut)', tn.hidden && !bl.hidden && +bl.style.opacity > .5, JSON.stringify([tn.hidden, bl.hidden, bl.style.opacity]));
T += 300; sp.update(1 / 60); check('(r2) …then gone', bl.hidden);
delete G.combat.down.me;
// (r2) CS2's line for a gun the killer picked up (o: its owner on the down record — combat-logic.js)
check('(r2) "killed you with their / your own / <name>\'s" (Panorama_DeathPanel_Killer1_KillerWeapon / _YourWeapon / _OthersWeapon)', DP.killerLine({ weapon: 'AK-47' }, 'me') === 'killed you with their AK-47' && DP.killerLine({ weapon: 'AK-47', o: 'me' }, 'me') === 'killed you with your own AK-47' && DP.killerLine({ weapon: 'AWP', o: 'mate' }, 'me', { mate: 'Mate' }) === 'killed you with <font color="#adadad">Mate\'s</font> AWP');
{ const D = { mode: 'arena', arena: { loadout: { a: { own: { primary: { w: 'ak', k: 'b' } } } } }, combat: { hp: {}, down: {}, kills: {}, deaths: {}, last: {}, respawns: {}, feed: [] } }; CL.hurt(D, 'A', 'B', ak, 200, 'chest', 1000); CL.hurt(D, 'C', 'E', ak, 200, 'chest', 1000);
  check('(r2) the host marks a picked-up gun\'s owner on the down record (o), and only then', D.combat.down.b?.o === 'b' && !('o' in (D.combat.down.e || {})), JSON.stringify(D.combat.down)); }
{ const css = document.head.children.map(c => c.textContent || c.text || '').join('\n'); check('(r2) the panel\'s health bar is CS2\'s 86 × 5 px (.DeathPanel__AvatarHealthBar)', /\.hpb\{width:86px;height:5px/.test(css));
  check('(r2) the tint layer carries death_cam_phase1\'s vignette (#ff9494 at the centre to #f48787 at the edges)', /#gd-dc-tint\{[^}]*radial-gradient\([^)]*#ff9494 9%,#f48787 56%\)/.test(css));
  const lowP = DP.createDeathPanel({ low: () => true }); G.combat.down.me = { until: T + 4e9, by: 'Foe', weapon: 'AK-47', wid: 'ak', at: T }; lowP.update(true, G, 'me', T);
  check('(r2) Low presets: no world blur behind the panel (class lo)', /\blo\b/.test(lowP.el.className), lowP.el.className); delete G.combat.down.me; lowP.update(true, G, 'me', T); }
// (r2) a death while scoped: the cam at your normal field of view
{ const cam3 = new THREE.PerspectiveCamera(); cam3.fov = 20; cam3.position.set(0, 9.7, 0); const sp3 = SP.createSpectator({ camera: cam3, world: { operations: { game: G } }, lan, name: () => 'Me', boxes: () => boxes, fov: () => 73.74, view: { show() {}, hide() { return false; } } });
  G.combat.down.me = { until: T + 4e9, by: 'Foe', weapon: 'AWP', wid: 'awp', at: T }; T += 16; sp3.update(1 / 60); const f1 = cam3.fov; T += 5000; sp3.update(1 / 60);
  check('(r2) died scoped (fov 20): the death cam and the spectating after it at the normal FOV (73.74)', f1 === 73.74 && cam3.fov === 73.74 && !!sp3.watched, [f1, cam3.fov, sp3.watched?.name]); delete G.combat.down.me; T += 16; sp3.update(1 / 60); }
// deathmatch's damage report: this life
{ const D = { mode: 'arena', arena: {}, combat: { hp: {}, down: {}, kills: {}, deaths: {}, last: {}, respawns: {}, feed: [] } }; CL.hurt(D, 'A', 'B', usp, 30, 'chest', 1000); CL.hurt(D, 'B', 'A', usp, 25, 'chest', 1100); CL.hurt(D, 'B', 'A', usp, 99, 'head', 1200);
  check('deathmatch: dg / dt for this life (A gave 30 in 1, took 100 in 2)', JSON.stringify(D.combat.down.a?.dg) === '[30,1]' && JSON.stringify(D.combat.down.a?.dt) === '[100,2]', JSON.stringify(D.combat.down.a)); }
check('other modes: the host adds nothing to the record', (() => { const O = { mode: 'campaign', combat: { hp: {}, down: {}, kills: {}, deaths: {}, last: {}, respawns: {}, feed: [] } }; CL.hurt(O, 'A', 'B', usp, 200, 'chest', 1); const d = O.combat.down.b; return d && !('dg' in d) && !('rg' in d); })());
check('a down record without its time (older hosts): no cam, straight to spectating', (() => { G.combat.d = { teams: { me: 'ct', mate: 'ct', foe: 't' }, round: { phase: 'live' } }; G.combat.down.me = { until: T + 4e9, by: 'Foe' }; const r = sp.update(1 / 60); const w = sp.watched?.name; delete G.combat.down.me; T += 16; sp.update(1 / 60); return r && !DEATHCAM.on && w === 'Mate'; })());
check('joined mid-round (down, nobody\'s kill, no time): no cam, no death panel', (() => { G.combat.down.me = { until: T + 4e9, by: '', weapon: 'joined mid-round' }; const r = sp.update(1 / 60); panel.update(true, G, 'me', T); const h = panel.el.hidden; delete G.combat.down.me; T += 16; sp.update(1 / 60); return r && !DEATHCAM.on && h; })());
// a spectator, a mid-round joiner: no body of themselves (their down record has no time: not a death)
{ const scene = new THREE.Scene(); let made = 0, shown = 0; const selfBody = () => ({ key: 'cs2:t', make: () => { made++; const g = new THREE.Group(); return { g, update() {}, setWeapon() {}, dispose() {} }; } });
  const cam2 = new THREE.PerspectiveCamera(); cam2.position.set(5, 9.7, 5); const sp2 = SP.createSpectator({ camera: cam2, world: { operations: { game: G } }, lan, name: () => 'Me', boxes: () => boxes, scene, selfBody, view: { show() {}, hide() { return false; } } });
  for (const [team, rec] of [['spec', { until: T + 4e9, by: '', weapon: 'spectating' }], ['ct', { until: T + 4e9, by: '', weapon: 'joined mid-round' }]]) { G.combat.d.teams.me = team; G.combat.down.me = rec; for (let i = 0; i < 90; i++) { T += 1000 / 60; sp2.update(1 / 60); } if (sp2.selfBody?.g.visible) shown++; }
  check('a spectator / a player who joined mid-round: no body of themselves lying on their own screen', !shown && !scene.children.some(o => o.visible && o.userData?.gd), `made ${made}, shown ${shown}`);
  // a real death of theirs does lie there (the same spectator object, the same scene)
  G.combat.down.me = { until: T + 4e9, by: 'Foe', weapon: 'AK-47', wid: 'ak', at: T }; T += 16; sp2.update(1 / 60);
  check('…while a real death (with its time) does leave their body where they died', made >= 1 && sp2.selfBody?.g.visible === true, `made ${made}`);
  delete G.combat.down.me; G.combat.d.teams.me = 'ct'; T += 16; sp2.update(1 / 60); }
// allocations: frames of cam + panel, the heap counted with no collection in between, in a fresh process (this file's
// checks above leave the shared code's type feedback mixed — the killer gone, other deaths — which one death never sees)
{ const r = spawnSync(process.execPath, ['--expose-gc', '--max-semi-space-size=64', '--min-semi-space-size=64', fileURLToPath(import.meta.url), '--alloc'], { encoding: 'utf8' }); const m = /DCALLOC (\S+) (\S+) (\S+)/.exec(r.stdout || '');
  check('the allocation check sees allocation (2000 frames of a 3-number array and a string: > 100 KB)', !!m && +m[3] > 100000, m ? m[3] + ' bytes' : (r.stderr || '').slice(-300));
  check('the cam and the panel make nothing per frame (2000 frames, a fresh process: < 32 bytes a frame over the test\'s own clock — the clock it hands the panel is one boxed number a frame)', !!m && (+m[1] - +m[2]) / 2000 < 32, m ? `${m[1]} bytes measured, the test's own clock alone ${m[2]}` : '?'); }
console.log(ok === n ? `PASS: gd-deathcam · ${n} checks (CS2 death cam: anim → travel → freeze → spectate, skip after the lock, killer framed / gone, self / fall / bomb / fire, panel, dg / dt / rg, respawn modes, no allocation)` : `FAIL: gd-deathcam · ${n - ok} of ${n} failed`);
process.exit(ok === n ? 0 : 1);
