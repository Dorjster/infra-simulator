// Global Defensive · your own wound (v53 FEEDBACK; the user's latest rule, 2026-11-05: "no blood should be on own wound
// only red barrier something with 4 side"). gd-blood.js, gd-hit-feedback.js, combat-hud.js:
//  · NO blood on your own screen: gd-blood.js has no screen-space pool, shader or plan for your wounds (CS2's
//    blood_impact_localplayer / lp_spray / lp_mist, localfrontenemy (_splatter_lft / _rgt), localrearhit, localkillshot,
//    localfrontsimple and explosions_fx/screen_blood_splatter are named only in comments); its scene objects are the
//    world's spray, decals and the helmet dink, all drawn in the world (view × projection), none warmed for your screen;
//    hits on you (front, side, front-right, rear, killing, an HE blast, spectating in-eye) add no object and no spray in
//    your view, with Blood on or off; the world's blood stays (your wound's decals; someone else's wound sprays);
//  · the ONLY thing on your screen is CS2's red damage indicator (gd-hit-feedback.js): HIT_ARC_CSS against
//    huddamageindicator.vcss (300 px at 1080 p, the radial gradient's 49 % radius and its stops, #cc3300, the 90° wedge,
//    translate3d(0, −5px, 0) and the rotations) — with the user's install here, read back from the compiled .vcss_c and
//    the .vxml_c (its LZ4 data decoded here: the four segment panels, one Damage__Segment_Bar); which segments light for
//    each direction (straight: one, diagonal: the two it lies between — segmentsOf, Source's rule: CS2's own is in its
//    code), lit through createHitFeedback for front, side, front-right, rear and a killing hit, whatever Settings → Blood;
//  · no red full-screen flash (combat-hud.js's update never shows #cb-flash); update() allocates nothing.
//   node tests/gd-own-wound.mjs        (re-runs itself with --expose-gc for the allocation check)
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { spawnSync, execFileSync } from 'node:child_process';
if (typeof globalThis.gc !== 'function') { const r = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, ok = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 500))); };
const ET = new EventTarget(); globalThis.addEventListener = ET.addEventListener.bind(ET); globalThis.dispatchEvent = ET.dispatchEvent.bind(ET);
let T = 1000; performance.now = () => T;
const THREE = await import('../dist/three.module.js');
const B = await import('../dist/gd-blood.js');
const { live } = await import('../dist/live-settings.js'); const { savePreferences, loadPreferences } = await import('../dist/player-preferences.js');
const code = f => readFileSync(path.join(root, 'dist', f), 'utf8').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const LOCAL_SYSTEMS = ['localplayer', 'lp_spray', 'lp_mist', 'localfrontenemy', 'splatter_lft', 'splatter_rgt', 'localrearhit', 'localkillshot', 'localfrontsimple', 'screen_blood_splatter'];

// ── 1 · gd-blood.js: nothing for your own screen ────────────────────────────────────────────────────────────────────
{ const src = code('gd-blood.js'), named = LOCAL_SYSTEMS.filter(s => src.includes(s));
  check('CS2\'s local-player screen systems are named only in comments (none planned or drawn)', !named.length, named.join());
  const gone = ['planLocal', 'planSimple', 'LOCAL', 'LOCAL_N', 'GLOW', 'LP_MIST', 'hitSide', 'GLOW_UNIFORMS'].filter(k => k in B);
  check('no local-player plan, table or pool size exported any more', !gone.length, gone.join());
  check('no screen-space shader in the module (no clip-space position written directly, nothing drawn without the depth test)', !/gl_Position\s*=\s*vec4\(\s*\(/.test(src) && !/depthTest:\s*false/.test(src)); }

const mkGame = () => ({ mode: 'arena', arena: { map: 'yard' }, combat: { d: { match: 'm1', n: 1, round: { phase: 'live' } }, bl: [], hp: { ann: 100, bo: 100 }, hx: {} } });
const rec = (i, r, d = 40, extra = {}) => ({ i, at: 0, v: 'ann', z: 'chest', d, p: [0, 1.2, 0], r, s: 'cy', ...extra });
const DIRS = { front: [0, 0, 1], side: [-1, 0, 0], rear: [0, 0, -1], frontRight: [-.7071, 0, .7071] };   // (the bullet's travel; your view along −z: a shot from ahead travels +z)
{ const hostT = 20_000, sc = new THREE.Scene(), G = mkGame(), who = { me: 'ann', w: null };
  const bl = B.createBlood(sc, { game: () => G, me: () => who.me, watched: () => who.w, clock: () => hostT, assets: false });
  const kids = sc.children.slice(), meshes = sc.children.filter(o => o.isMesh);
  check(`the blood's scene objects are the world's three (${meshes.map(m => m.name).join(', ')})`, meshes.length === 3 && meshes.every(m => /^gd-(blood-spray|blood-decals|dink)$/.test(m.name)) && !('local' in bl));
  check('each draws in the world (view × projection), none over the screen', meshes.every(m => /viewMatrix/.test(m.material.vertexShader) && m.material.depthTest !== false && m.renderOrder < 999));
  check('the warm-up has only the world\'s pools (nothing warmed for your screen)', bl.warmObjects().length === 3 && !('local' in bl.pools));
  bl.update(); let q = 80_000; const s0 = bl.stats;
  for (const r of Object.values(DIRS)) { G.combat = { ...G.combat, bl: [rec(++q, r, 45, { at: hostT })] }; bl.update(); }
  G.combat = { ...G.combat, bl: [rec(++q, DIRS.front, 100, { at: hostT, k: 1 })] }; bl.update();
  G.combat = { ...G.combat, hp: { ...G.combat.hp, ann: 43 }, hx: { ann: hostT } }; bl.update();
  const s1 = bl.stats;
  check(`hits on you from the front, side, front-right, rear, a killing hit and an HE blast: no spray in your view, no new object (${s1.hits - s0.hits} records taken)`, s1.hits - s0.hits === 5 && !s1.sprayAlive && sc.children.length === kids.length && sc.children.every((o, j) => o === kids[j]));
  for (let j = 0; j < 8; j++) bl.placeNext();
  check(`the world's blood stays: your wounds' decals are placed on the floor below you (${bl.stats.decals} decals)`, bl.stats.decals > 0, bl.stats.decals);
  G.combat = { ...G.combat, bl: [rec(++q, DIRS.front, 45, { at: hostT, v: 'bo' })] }; bl.update();
  check('someone else\'s wound: its spray is drawn (what onlookers see — you too)', bl.stats.sprayAlive && bl.stats.hits === s1.hits + 1);
  bl.clear(); who.w = 'bo'; G.combat = { ...G.combat, bl: [rec(++q, DIRS.rear, 45, { at: hostT, v: 'bo' })] }; bl.update();
  check('spectating in-eye: the watched player\'s wound sprays nothing in the view either', !bl.stats.sprayAlive); who.w = null;
  const prev = loadPreferences(); savePreferences({ ...prev, blood: false });
  G.combat = { ...G.combat, bl: [rec(++q, DIRS.front, 45, { at: hostT })] }; bl.update();
  check('Blood off: still nothing on your screen (and no world blood)', !bl.stats.sprayAlive && bl.stats.decals === 0 && sc.children.length === kids.length);
  savePreferences({ ...prev, blood: true }); check('Blood back on (default on)', live.blood === true);
  // no allocation per frame (a record about you arriving, the lists unchanged after)
  G.combat = { ...G.combat, bl: [rec(++q, DIRS.front, 60, { at: hostT, k: 1 })] }; bl.update();
  for (let i = 0; i < 2000; i++) { T += 16; bl.update(); } globalThis.gc(); const h0 = process.memoryUsage().heapUsed;
  for (let i = 0; i < 20000; i++) { T += 16; bl.update(); } globalThis.gc(); const h1 = process.memoryUsage().heapUsed;
  check(`update() allocates nothing (heap ${((h1 - h0) / 1024).toFixed(0)} KB over 20 000 frames)`, h1 - h0 < 256 * 1024, h1 - h0);
  bl.dispose(); }

// ── 2 · CS2's damage indicator: the only thing on your screen ───────────────────────────────────────────────────────
class El { constructor() { this.className = ''; this.style = {}; this.kids = []; this.textContent = ''; this.innerHTML = ''; } append(...k) { this.kids.push(...k); } }
globalThis.document = { createElement: () => new El(), getElementById: () => null, head: new El(), body: new El() };
const HF = await import('../dist/gd-hit-feedback.js'); const { HIT_ARC_CSS, segmentsOf, SEGMENTS } = HF;
// CS2's stylesheet (panorama/styles/hud/huddamageindicator.vcss — the text its .vcss_c holds; read back in part 4 when the install is here)
const VCSS = { stops: [[86.1, 0], [86.2, 1], [88.9, 1], [89, 0], [91.9, 0], [92, 1], [99.9, 1], [100, 0]], rot: [0, 90, 180, 270] };
{ const css = HIT_ARC_CSS.replace(/\s+/g, ' ');
  check('300 px at 1080 p (@define damageIndicatorSize 300px; Panorama scales by the height)', /--gd-di:calc\(var\(--gd-view-h,100vh\) \* 300 \/ 1080\)/.test(css));
  const g = /radial-gradient\(circle calc\(var\(--gd-di\) \* \.49\) at 50% 50%,([^)]*)\)/.exec(css), st = g ? g[1].split(',').map(s => { const m = /#cc3300(00)? ([\d.]+)%/.exec(s.trim()); return m ? [+m[2], m[1] ? 0 : 1] : null; }) : [];
  check('the gradient: radial at 50 % 50 %, radius 49 %, clear → .862–.889 → clear → .920–.999 → clear (CS2\'s stops)', st.length === VCSS.stops.length && st.every((s, k) => s && Math.abs(s[0] - VCSS.stops[k][0]) < 1e-6 && s[1] === VCSS.stops[k][1]), JSON.stringify(st));
  check('its colour: CS2\'s wash-color #cc3300 (white × the wash), no other colour', (css.match(/#cc3300/g) || []).length >= 8 && !/#[0-9a-f]{6}/i.test(css.replace(/#cc3300(00)?/g, '')));
  check('the 90° wedge round the top (clip: radial(50% 50%, 315deg, 90deg))', /clip-path:polygon\(50% 50%,0 0,100% 0\)/.test(css));
  check('CS2\'s translate3d(0, −5px, 0) and rotateZ 0 / 90 / 180 / 270° for Top / Right / Bottom / Left, each segment pushed 5 px out along its own side (our reading of Panorama\'s order: written for the browser as rotate(N) translate3d — the ring centred)', VCSS.rot.every((r, k) => new RegExp(`\\.s${k}\\{transform:${r ? `rotate\\(${r}deg\\) ` : ''}translate3d\\(0,calc\\(var\\(--gd-di\\) \\* -5 \\/ 300\\),0\\)\\}`).test(css)) && SEGMENTS.join() === 'top,right,bottom,left');
  check('a hit\'s fade: one 950 ms animation, in over 5 % (ours: CS2\'s code drives it)', /gd-da0\{0%\{opacity:0\}5%\{opacity:1\}/.test(css) && /950ms/.test(css)); }
// which segments: bits top 1, right 2, bottom 4, left 8 — a shot coming FROM `deg` clockwise from ahead, your view along −z
{ const lit = deg => { const a = deg * Math.PI / 180; return segmentsOf(-Math.sin(a), Math.cos(a), 0, -1); };   // (the bullet travels away from the shooter)
  const want = { 0: 1, 90: 2, 180: 4, 270: 8, 45: 3, 135: 6, 225: 12, 315: 9, 10: 1, 30: 3, 80: 2, 100: 2, 170: 4, 350: 1 }, bad = Object.entries(want).filter(([d, m]) => lit(+d) !== m).map(([d, m]) => `${d}°: ${lit(+d)} ≠ ${m}`);
  check('straight from one side: its one segment; a diagonal: the two it lies between (ahead / right / behind / left over .3)', !bad.length, bad.join(' | '));
  check('turned to face the shooter: the top (your view along +x, the shot from +x)', segmentsOf(-1, 0, 1, 0) === 1); }
// through createHitFeedback: front, side, front-right, rear and a killing hit light their segments; Blood off changes nothing
{ const hurt = []; const rootEl = new El();
  const F = HF.createHitFeedback({ parent: rootEl, hit: () => {}, hurt: (...a) => hurt.push(a), frame: out => { out.fx = 0; out.fz = -1; return out; } });
  const di = rootEl.kids.find(k => k.className === 'gd-da');
  const bl = [], G = { combat: { bl } }; let i = 500;
  const fire = (r, o = {}) => { const was = di.kids.map(k => k.className); bl.push({ i: ++i, at: 5000, v: 'ann', z: 'chest', d: 30, p: [0, 1, 0], r, s: 'cy', ...o }); F.update(G, 'ann', 5000); return di.kids.map((k, j) => k.className !== was[j] ? SEGMENTS[j] : '').filter(Boolean).join('+'); };
  F.update(G, 'ann', 5000);
  check('four segments built once, none lit before a hit', di && di.kids.length === 4 && di.kids.every(k => !/ [ab]$/.test(k.className)));
  const got = { front: fire(DIRS.front), side: fire(DIRS.side), rear: fire(DIRS.rear), frontRight: fire(DIRS.frontRight), kill: fire(DIRS.rear, { k: 1, d: 100 }) };
  check(`front → top, from the right → right, rear → bottom, front-right → top + right, a killing hit from behind → bottom: ${JSON.stringify(got)}`, got.front === 'top' && got.side === 'right' && got.rear === 'bottom' && got.frontRight === 'top+right' && got.kill === 'bottom' && F.stats.arcs === 5 && hurt.length === 5);
  const prev = loadPreferences(); savePreferences({ ...prev, blood: false });
  check('Settings → Blood off: the indicator lights the same (it is not blood)', live.blood === false && fire(DIRS.front) === 'top' && fire([1, 0, 0]) === 'left'); savePreferences({ ...prev, blood: true });
  check('someone else\'s wound: no segment lights', fire(DIRS.front, { v: 'bo' }) === '');
  // (v53 FEEDBACK final) several hits on you in ONE update (one host frame): each lit segment restarts once
  const many = (...rs) => { const was = di.kids.map(k => k.className); for (const r of rs) bl.push({ i: ++i, at: 5000, v: 'ann', z: 'chest', d: 30, p: [0, 1, 0], r, s: 'cy' }); F.update(G, 'ann', 5000); return di.kids.map((k, j) => k.className !== was[j] ? SEGMENTS[j] : '').filter(Boolean).join('+'); };
  check('two hits from the front in one update: the top restarts (before: its class flipped twice — no indicator)', many(DIRS.front, DIRS.front) === 'top' && many(DIRS.front, DIRS.front, DIRS.front, DIRS.front) === 'top');
  check('a straight and a diagonal hit in one update: top + right, each restarted once', many(DIRS.front, DIRS.frontRight) === 'top+right' && many(DIRS.side, DIRS.side, DIRS.rear) === 'right+bottom');
  // an HE on you: the host's stamp (hx) and its direction blast → you (hxr) light the segments; an old stamp is no news
  { const hurt0 = hurt.length; G.combat.hx = { ann: 4000 }; G.combat.hxr = { ann: [0, 1] }; const F2 = HF.createHitFeedback({ parent: new El(), hit: () => {}, hurt: () => {}, frame: out => { out.fx = 0; out.fz = -1; return out; } });
    F2.update(G, 'ann', 4100); check('an HE stamp already there on the first look: no news (nothing lit)', F2.stats.blasts === 0 && F2.stats.lit === 0);
    const blastAt = (t, d) => { const was = di.kids.map(k => k.className); G.combat.hx = { ann: t }; G.combat.hxr = { ann: d }; F.update(G, 'ann', t + 30); return di.kids.map((k, j) => k.className !== was[j] ? SEGMENTS[j] : '').filter(Boolean).join('+'); };
    F.update(G, 'ann', 5200);   // (this one's stamp, 1.2 s old: no news)
    const got = { front: blastAt(6000, [0, 1]), left: blastAt(7000, [1, 0]), rearRight: blastAt(8000, [-.7071, -.7071]) };
    check(`an HE that hurts you lights the blast's side (combat.hx + combat.hxr): ${JSON.stringify(got)}`, got.front === 'top' && got.left === 'left' && got.rearRight === 'right+bottom' && F.stats.blasts === 3 && hurt.length === hurt0);
    const same = blastAt(8000, [0, 1]), late = (() => { const was = di.kids.map(k => k.className); G.combat.hx = { ann: 9000 }; G.combat.hxr = { ann: [0, 1] }; F.update(G, 'ann', 10500); return di.kids.some((k, j) => k.className !== was[j]); })();
    check('the same HE stamp again, or one over a second old: nothing lit', same === '' && !late);
    G.combat.hx = { ann: 11000 }; delete G.combat.hxr; const was = di.kids.map(k => k.className); F.update(G, 'ann', 11010); check('an HE stamp with no direction (an old host): nothing lit, no error', di.kids.every((k, j) => k.className === was[j]));
    // (v53 FEEDBACK final) a blast right on you ([0, 0] from the host) lights all four; a stamp far below the last (another host's clock) is news again
    check('an HE right on you (hxr [0, 0]): all four segments light', blastAt(12000, [0, 0]) === 'top+right+bottom+left');
    check('joining a host whose clock is behind: its HE stamp still lights (re-based, as gd-blood.js)', blastAt(1e6, [1, 0]) === 'left' && blastAt(1e6 - 7e5, [0, 1]) === 'top');
    delete G.combat.hx; }
  // (v53 FEEDBACK final) blood records from a host whose clock is behind the last record seen: still a hit on you
  { const was = di.kids.map(k => k.className); bl.length = 0; bl.push({ i: i - 9e5, at: 4000, v: 'ann', z: 'chest', d: 30, p: [0, 1, 0], r: DIRS.side, s: 'cy' }); const h0 = hurt.length; F.update(G, 'ann', 4000);
    check('a new host whose record numbers are far below the last: the hit on you lights (right) and plays', di.kids[1].className !== was[1] && hurt.length === h0 + 1); i -= 9e5; }
  // the host's side: an HE's blast direction on the victim's key, small (2 decimals), Global Defensive only
  { const CL = await import('../dist/combat-logic.js'), g = { mode: 'arena', combat: { hp: { ann: 100 } }, arena: { kind: 'dm' } };
    CL.applyHit(g, 'Cy', 'Ann', { id: 'he', name: 'HE Grenade', ap: .6, hxr: [3, -4] }, 'chest', 5, 1, 50_000, 40);
    const r = g.combat.hxr?.ann; check(`the host stamps an HE's direction beside hx: hxr.ann = ${JSON.stringify(r)} (blast → you, level, unit, 2 decimals)`, Array.isArray(r) && r[0] === .6 && r[1] === -.8 && g.combat.hx?.ann === 50_000);
    const lab = { mode: 'lab', combat: { hp: { ann: 100 } } }; CL.applyHit(lab, 'Cy', 'Ann', { id: 'he', name: 'HE Grenade', ap: .6, hxr: [3, -4] }, 'chest', 5, 1, 50_000, 40);
    check('other modes: no hxr (hitMarks is Global Defensive only)', !lab.combat?.hxr);
    CL.applyHit(g, 'Cy', 'Ann', { id: 'he', name: 'HE Grenade', ap: .6, hxr: [0, 0] }, 'chest', 0, 1, 51_000, 10);
    check(`a blast right on the victim: the host writes hxr [0, 0], not the last HE's side (${JSON.stringify(g.combat.hxr?.ann)})`, g.combat.hxr?.ann?.[0] === 0 && g.combat.hxr?.ann?.[1] === 0 && g.combat.hx?.ann === 51_000);
    const nades = readFileSync(path.join(root, 'dist/arena-nades.js'), 'utf8'); check('arena-nades.js passes the blast → victim direction on the HE\'s weapon record', /\{ id: 'he', name: N\.name, ap: N\.ap, hxr: \[t\.x - g\.x, t\.z - g\.z\]/.test(nades)); } }

// ── 2b · gd-hud.js while you are dead (v53 FEEDBACK final): the hit that killed you keeps its indicator ─────────────────
{ const mkEl = () => { const cl = new Set(); return { className: '', hidden: false, kids: [], children: [], textContent: '', innerHTML: '', dataset: {}, style: { setProperty() {}, removeProperty() {} },
    classList: { add: (...c) => c.forEach(x => cl.add(x)), remove: (...c) => c.forEach(x => cl.delete(x)), toggle: (c, f) => { f = f === undefined ? !cl.has(c) : !!f; f ? cl.add(c) : cl.delete(c); return f; }, contains: c => cl.has(c) },
    append(...k) { this.kids.push(...k); }, appendChild(k) { this.kids.push(k); return k; }, querySelector: () => mkEl(), querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }),
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, remove() {}, insertAdjacentHTML() {} }; };
  const Q = new Map(), doc0 = globalThis.document; globalThis.document = { createElement: () => mkEl(), getElementById: () => null, head: mkEl(), body: mkEl(), documentElement: mkEl(), querySelector: s => Q.get(s) || (Q.set(s, mkEl()), Q.get(s)), querySelectorAll: s => /\.av$/.test(s) ? Array.from({ length: 5 }, mkEl) : [] };
  globalThis.innerHeight ??= 1080; globalThis.innerWidth ??= 1920;
  const { createGdHud } = await import('../dist/gd-hud.js'), { hostNow } = await import('../dist/host-clock.js');
  const run = (defuse) => { const G = { mode: 'arena', arena: { kind: defuse ? 'defuse' : 'dm', map: 'yard' }, combat: { bl: [], hp: { tester: 100 }, ...(defuse ? { d: { match: 'm1', n: 1, teams: { tester: 'ct', bo: 'ct' }, score: { ct: 0, t: 0 }, round: { phase: 'live', ends: hostNow() + 60000 } } } : {}) } };
    const S = { act: true, spec: false }; Q.clear();
    const hud = createGdHud({ world: { operations: { game: G } }, name: () => 'Tester', weapons: { current: null }, recoil: () => ({ pitch: 0, yaw: 0 }), fov: () => 70, move: () => ({ speed: 0, max: 250, onGround: true, landedAgo: 9, ducked: false }), active: () => S.act, spectating: () => S.spec });
    const root = Q.get('#gd-hud'), di = root.kids.find(k => k.className === 'gd-da'); hud.update();
    let i = 900; const now = hostNow(), add = (v, o = {}) => G.combat.bl.push({ i: ++i, at: hostNow(), v, z: 'chest', d: 100, p: [0, 1, 0], r: [0, 0, 1], s: 'cy', ...o });
    // the killing record arrives as the death cam starts (or a frame later): dead, spectating, the HUD's root must stay up
    S.act = false; S.spec = true; G.combat.hp.tester = 0; (G.combat.down ??= {}).tester = { until: now + 5000, at: now, by: 'Cy' }; add('tester', { k: 1 });
    const was = di.kids.map(k => k.className), h0 = hud.fbStats.hurt; hud.update();
    const lit = di.kids.map((k, j) => k.className !== was[j] ? SEGMENTS[j] : '').filter(Boolean).join('+');
    const res = { hidden: root.hidden, dc: root.classList.contains('dc'), sp: root.classList.contains('sp'), lit, hurt: hud.fbStats.hurt - h0 };
    for (let f = 0; f < 30; f++) hud.update(); res.stillUp = !root.hidden;
    const o0 = hud.fbStats.onlooker; add('bo'); hud.update(); res.onlooker = hud.fbStats.onlooker - o0;
    S.act = true; S.spec = false; hud.update(); res.backAlive = !root.hidden && !root.classList.contains('dc') && !root.classList.contains('sp'); return res; };
  const dm = run(false), df = run(true);
  check(`Deathmatch / practice (no combat.d): dead in the death cam the HUD's box stays up with only the indicator (class dc) — the killing hit lit ${dm.lit}, its Death* sound ${dm.hurt}: ${JSON.stringify(dm)}`, !dm.hidden && dm.dc && !dm.sp && dm.lit === 'top' && dm.hurt === 1 && dm.stillUp && dm.backAlive);
  check(`Defuse (combat.d): dead and watching, the team counter's view (class sp) — the killing hit lit ${df.lit}: ${JSON.stringify(df)}`, !df.hidden && df.sp && !df.dc && df.lit === 'top' && df.hurt === 1 && df.stillUp && df.backAlive);
  check('dead: a hit on someone else is heard placed (an onlooker\'s sound — CS2\'s spectator hears the game round the watched player), it lights nothing', dm.onlooker === 1 && df.onlooker === 1);
  const css = readFileSync(path.join(root, 'dist/gd-hud.js'), 'utf8'); check('gd-hud.js: class dc hides the boxes, the crosshair, the scope and the hit marker (the indicator stays)', /#gd-hud\.dc \.vb,#gd-hud\.dc #gd-x,#gd-hud\.dc #gd-scope,#gd-hud\.dc \.gd-hm\{visibility:hidden\}/.test(css) && !/#gd-hud\.dc [^{]*\.gd-da/.test(css));
  globalThis.document = doc0; }

// ── 3 · no red full-screen flash; the headers say so ────────────────────────────────────────────────────────────────
{ const hud = readFileSync(path.join(root, 'dist/combat-hud.js'), 'utf8'), upd = hud.slice(hud.indexOf('update() {'));
  check('the red full-screen flash stays removed (combat-hud.js update never shows #cb-flash)', !/cb-flash/.test(upd) && !/flash'\)\.style/.test(hud));
  const fb = readFileSync(path.join(root, 'dist/gd-hit-feedback.js'), 'utf8').split('\nimport')[0], bh = readFileSync(path.join(root, 'dist/gd-blood.js'), 'utf8').split('\nimport')[0];
  check('the headers: no blood on your own screen, the indicator the only thing (gd-hit-feedback.js, gd-blood.js)', /NO blood on your screen/.test(fb) && /no red screen flash/i.test(fb) && /NO\s*\n\/\/ blood on your own SCREEN/.test(bh)); }

// ── 4 · CS2's own files, read back (when the user's install is here) ────────────────────────────────────────────────
// The two files do not decompile (Source2Viewer-CLI: "Unknown KVType 26"): extracted raw — the .vcss_c holds the
// stylesheet's text; the .vxml_c's panel tree is an LZ4 block, decoded here (a plain LZ4 block reader, its start found by trying).
function lz4(src, at, max = 1 << 16) { const out = []; let i = at; try { while (i < src.length && out.length < max) { const t = src[i++]; let ll = t >> 4; if (ll === 15) { let b; do { b = src[i++]; ll += b; } while (b === 255); }
  for (let k = 0; k < ll; k++) out.push(src[i++]); if (i >= src.length) break; const off = src[i] | (src[i + 1] << 8); i += 2; if (!off || off > out.length) return out; let ml = t & 15; if (ml === 15) { let b; do { b = src[i++]; ml += b; } while (b === 255); } ml += 4; for (let k = 0; k < ml; k++) out.push(out[out.length - off]); } } catch {} return out; }
{ const CS2 = path.join(os.homedir(), 'CS2-extract'), VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), S2V = path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI');
  if (existsSync(VPK) && existsSync(S2V)) { const tmp = mkdtempSync(path.join(os.tmpdir(), 'gd-own-wound-'));
    try { for (const f of ['panorama/styles/hud/huddamageindicator.vcss_c', 'panorama/layout/hud/huddamageindicator.vxml_c']) execFileSync(S2V, ['-i', VPK, '-f', f, '-o', tmp], { stdio: 'ignore' });
      const cssP = path.join(tmp, 'panorama/styles/hud/huddamageindicator.vcss_c'), xmlP = path.join(tmp, 'panorama/layout/hud/huddamageindicator.vxml_c');
      const css = existsSync(cssP) ? readFileSync(cssP).toString('latin1') : '', seg = /\.Damage__Segment\{([^}]*)\}/.exec(css)?.[1] || '';
      const stops = [...seg.matchAll(/color-stop\(\s*([\d.]+)\s*,\s*#FFFFFF(00|FF)\s*\)/g)].map(m => [Math.round(+m[1] * 1000) / 10, m[2] === 'FF' ? 1 : 0]);
      check('CS2\'s file: @define damageIndicatorSize 300px', /@define damageIndicatorSize:\s*300px;/.test(css), css.slice(0, 80));
      check('CS2\'s file: .Damage__Segment\'s radial gradient — 50% 50%, radius 49% 49%, its 7 stops as ours (to #FFFFFF00 at the end)', /gradient\(\s*radial,\s*50% 50%,\s*0% 1%,\s*49% 49%/.test(seg) && /to\(\s*#FFFFFF00\s*\)/.test(seg) && stops.length === 7 && stops.every((s, k) => Math.abs(s[0] - VCSS.stops[k][0]) < .051 && s[1] === VCSS.stops[k][1]), JSON.stringify(stops));
      check('CS2\'s file: wash-color #cc3300FF, clip radial(50% 50%, 315deg, 90deg)', /wash-color:\s*#cc3300FF;/.test(seg) && /clip:\s*radial\(\s*50% 50%,\s*315deg,\s*90deg\s*\)/.test(seg));
      const tf = side => new RegExp(`\\.Damage__Segment--${side}\\{transform:\\s*translate3d\\(\\s*0px,\\s*-5px,\\s*0px\\s*\\)([^;]*);\\}`).exec(css)?.[1]?.trim() ?? null;
      check('CS2\'s file: each segment translate3d(0px, -5px, 0px), then rotateZ 90 / 180 / 270deg', tf('Top') === '' && /rotateZ\(\s*90deg\s*\)/.test(tf('Right')) && /rotateZ\(\s*180deg\s*\)/.test(tf('Bottom')) && /rotateZ\(\s*270deg\s*\)/.test(tf('Left')), [tf('Top'), tf('Right'), tf('Bottom'), tf('Left')].join(' | '));
      check('CS2\'s file: no transition or animation in the stylesheet (the fade is the game\'s code)', css.includes('@define') && !/transition|animation/.test(css.slice(css.indexOf('@define'))));
      const raw = existsSync(xmlP) ? readFileSync(xmlP) : Buffer.alloc(0); let best = '', bestN = 0;
      for (let s = 0; s < raw.length; s++) { const o = lz4(raw, s); if (o.length > 200) { const t = Buffer.from(o).toString('latin1'), k = (t.match(/Damage__Segment/g) || []).length; if (k > bestN) { bestN = k; best = t; } } }
      const panels = ['Top', 'Right', 'Bottom', 'Left'].map(sd => best.includes(`Damage__Segment Damage__Segment--${sd}`));
      check('CS2\'s layout: the four segment panels (Damage__Segment --Top / --Right / --Bottom / --Left) and one Damage__Segment_Bar (on Top: not drawn)', panels.every(Boolean) && (best.match(/Damage__Segment_Bar /g) || []).length === 1 && /CSGOHudDamageIndicator/.test(best), panels.join());
    } finally { rmSync(tmp, { recursive: true, force: true }); } }
  else console.log('(no CS2 install here: the indicator is checked against the shipped numbers only)'); }

console.log(`\n${ok}/${n} passed`); process.exit(ok === n ? 0 : 1);
