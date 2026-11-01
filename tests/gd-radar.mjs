// Global Defensive radar rules (dist/gd-radar.js, gd-radar-art.js), run in node on a tiny DOM stub with a synthetic map
// (a wall along x = 0, a nav whose sight lines it stops):
//  · GDUI-04 spotting: a shut door blocks, an open one doesn't, glass never does (radarSight, the scene's live boxes);
//    with the user's CS2 map files (skipped without them): Nuke's rotating doors block while shut, open when their box is off.
//  · GDUI-05 an enemy is drawn where he is only while someone sees him; lost behind the wall he stays at his last seen
//    spot (faded) for 2 s, then goes; your own camera spots nobody while you are dead; eyes see all round (the view cone is
//    built but off: CS2's is unconfirmed); the planted bomb shows to every CT at once by default (v51), and — with the
//    built-but-off ctBombSpotted rule turned on — only once one of them has seen it.
//  · side swap / new round / rematch forget every known enemy; while spectating the radar turns with who you watch (GDUI-06).
//  · GDUI-12 the radar picture of every floor is made while the radar is still hidden (Nuke: both), only the current map's
//    pictures are kept (the cache never grows over a map rotation); GDUI-15: expand() makes the next frame read the new size.
//  · v52 (package Q) CS2's look: the overview data parsed as CS2 writes it (tools/export-cs2-radar.mjs), CS2's picture
//    placed by overviewFit (a Hammer point lands where CS2's own formula puts it), shown only once decoded and never
//    swapped in mid-round, Nuke's lower picture by CS2's altitude split, CS2's five team colours by join order; with the
//    user's export and map files (skipped without them): every spawn and bomb site, and nearly all walkable floor, land
//    on drawn (opaque) pixels of CS2's own picture — and a picture shifted by 3 % of its width does markedly worse.
//  · v52 CS2's options: defaults = CS2's cvars, saved per computer (v51's N choice carried over), applied live (rotating,
//    centred / best fit, zoom, HUD size, whole map with the scoreboard).
import { existsSync, readFileSync } from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
// ---- a tiny DOM: just what the radar touches ---------------------------------------------------------------------
const ctx = new Proxy({}, { get: (t, k) => k in t ? t[k] : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
const classList = () => { const s = new Set(); return { toggle: (c, on) => { if (on ?? !s.has(c)) s.add(c); else s.delete(c); }, contains: c => s.has(c), add: c => s.add(c), remove: c => s.delete(c) }; };
const el = (tag = 'div') => ({ tagName: tag.toUpperCase(), style: {}, classList: classList(), hidden: false, children: [], textContent: '', width: 300, height: 150, clientWidth: 210, getContext: () => ctx, replaceChildren(...c) { this.children = c; }, append() {}, querySelector() { return null; } });
const radarEl = el(), mapEl = el(), canvas = el('canvas'), small = el('small'); canvas.width = canvas.height = 420; radarEl.hidden = true;
radarEl.querySelector = s => s === '.map' ? mapEl : s === 'canvas' ? canvas : s === 'small' ? small : null;
const spBar = el(), rootStyle = { setProperty(k, v) { this[k] = v; } }; globalThis.document = { head: el(), body: { ...el(), insertAdjacentHTML() {} }, documentElement: { style: rootStyle }, createElement: el, getElementById: id => id === 'gd-radar' ? radarEl : id === 'sp-bar' ? spBar : null };
// (v52 options: this computer's storage and the page's events — saveRadarPrefs → 'gd-radar-prefs' → the radar, live)
const store = new Map(); globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
{ const et = new EventTarget(); globalThis.addEventListener = et.addEventListener.bind(et); globalThis.removeEventListener = et.removeEventListener.bind(et); globalThis.dispatchEvent = et.dispatchEvent.bind(et); }
let T = 1000; performance.now = () => T;
const { createRadar, radarSight, inView } = await import('../dist/gd-radar.js');
const { ARENA_MAPS, mapBoxes } = await import('../dist/arena-maps.js'), { ARENA } = await import('../dist/facility-layout.js'), { radarCacheIds, radarCacheSrcs, radarImage } = await import('../dist/gd-radar-art.js');
const cx = ARENA.cx, cz = ARENA.cz;
// ---- the synthetic map: 200 × 200, a wall x ∈ [−1, 1], z ∈ [−60, 60] (map coordinates), which the nav's sight stops at -----
const crossesWall = (ax, az, bx, bz) => { if ((ax < -1 && bx < -1) || (ax > 1 && bx > 1)) return false; const t = Math.abs(bx - ax) < 1e-9 ? 0 : (0 - ax) / (bx - ax), z = az + (bz - az) * t; return Math.abs(z) < 60; };
const mk = id => ({ id, name: id, kind: 'defuse', size: [200, 200], solids: [], t: [[-80, 0]], ct: [[80, 0]], sites: {}, nav: { sight: (ax, ay, az, bx, by, bz) => !crossesWall(ax, az, bx, bz), floorAt: () => 0 } });
ARENA_MAPS.__radarA = mk('__radarA'); ARENA_MAPS.__radarB = mk('__radarB');
const G = { mode: 'arena', arena: { map: '__radarA', match: 1, startedAt: 1 }, combat: { d: { teams: { me: 'ct', mate: 'ct', foe: 't' }, round: { id: 'r1', phase: 'live' }, score: { t: 0, ct: 0 } }, down: { mate: { until: Date.now() + 1e9 } }, nades: [] } };   // (the team mate down until his own check: only your eyes count before it)
const world = { operations: { game: G } };
const pose = (x, z, yaw = 0, y = 9.7) => ({ x: cx + x, y, z: cz + z, yaw, crouched: false, fy: y - 9.7 });
const players = [{ name: 'Me', pose: pose(-50, 0) }, { name: 'Mate', pose: pose(-90, 90, Math.PI) }, { name: 'Foe', pose: pose(-20, 0) }];
const lan = { players }; let me = { x: cx - 50, y: 9.7, z: cz }, myYaw = -Math.PI / 2;   // facing +x (forward = (−sin yaw, −cos yaw))
let live = { movers: [] }; live.length = 0;
const radar = createRadar({ world, lan, name: () => 'Me', yaw: () => myYaw, where: () => me, active: () => true, boxes: () => live, ctBombSpotted: true });   // (the CS:GO "bomb spotted" rule on for its checks: off by default, unconfirmed in CS2)
const tick = (ms = 70) => { T += ms; radar.update(); };
const drawn = k => radar.drawn.find(o => o.k === k);
// ---- pure rules ---------------------------------------------------------------------------------------------------
{ const m = ARENA_MAPS.__radarA, g = { combat: { nades: [] } }, door = { minX: cx - 30, maxX: cx - 29, minZ: cz - 10, maxZ: cz + 10, y0: 0, y1: 20, mat: 'door', off: false, mover: 0 }, glass = { ...door, mat: 'glass', mover: 1 };
  const see = movers => { const b = []; b.movers = movers; return radarSight(m, b, g, cx - 50, 9.7, cz, cx - 20, 9.7, cz, 0, false, Date.now()); };
  check('radarSight: open ground → seen', see([]) === true);
  check('radarSight: a shut door between → not seen (GDUI-04)', see([door]) === false);
  check('radarSight: the same door open (its box off) → seen', see([{ ...door, off: true }]) === true);
  check('radarSight: a glass pane between → seen (glass doesn\'t stop sight)', see([glass]) === true);
  check('radarSight: the map\'s wall → not seen', radarSight(m, [], g, cx - 50, 9.7, cz, cx + 20, 9.7, cz, 0, false, Date.now()) === false);
  const mesh = []; mesh.movers = [door]; mesh.nadeMesh = { blocked: () => false };
  check('radarSight on a CS2 mesh: the mesh clear but a shut door → not seen', radarSight(m, mesh, g, cx - 50, 9.7, cz, cx - 20, 9.7, cz, 0, false, Date.now()) === false);
  check('inView (spotting cone off: CS2\'s is unconfirmed): eyes see all round', inView(0, 0, -Math.PI / 2, 10, 0) && inView(0, 0, -Math.PI / 2, -10, 0)); }
// ---- GDUI-12: pictures made while hidden, every floor; one map kept ----------------------------------------------
{ G.arena.map = 'nuke'; const r2 = createRadar({ world, lan, name: () => 'Me', yaw: () => 0, where: () => me, active: () => false });
  r2.update(); check('hidden radar (loading card, lobby): Nuke\'s picture made already, both floors (GDUI-12)', r2.pictures === 2, r2.pictures);
  const lo = radarImage(ARENA_MAPS.nuke, 'nuke', 2, 'lower'), lo2 = radarImage(ARENA_MAPS.nuke, 'nuke', 2, 'lower'); check('…the lower floor comes from the cache (no drawing mid-round)', lo === lo2);
  G.arena.map = '__radarB'; r2.update(); G.arena.map = '__radarA'; radar.update();
  check('only the current map\'s pictures are kept (no 139 MB over a rotation)', JSON.stringify(radarCacheIds()) === '["__radarA"]', JSON.stringify(radarCacheIds()));
  // the CS2 file arriving under a built-in map's name (same id, fromFile): the built-in's pictures go, never both sets
  const builtIn = ARENA_MAPS.__radarA, file = { ...builtIn, fromFile: true, size: [210, 190] }; radarImage(builtIn, '__radarA', 2, null); radarImage(file, '__radarA', 2, null);
  check('the map file replacing the built-in map of that name: only the file\'s pictures stay cached', JSON.stringify(radarCacheSrcs()) === '["__radarA:210x190:file"]', JSON.stringify(radarCacheSrcs()));
  radarImage(builtIn, '__radarA', 2, null); }
// ---- GDUI-05: live while seen, last known when lost, gone after 2 s ---------------------------------------------
tick(); tick();
{ const d = drawn('foe'); check('enemy in view: drawn where he is (live)', d && d.live && Math.abs(d.x - (cx - 20)) < 1e-6, JSON.stringify(radar.drawn)); }
players[2].pose = pose(30, 0); T += 10; radar.update();   // (moved behind the wall between two looks: the next frame draws him where he is — still the 15 Hz look's verdict)
tick();
{ const d = drawn('foe'); check('behind the wall: drawn at his last seen spot, not followed (GDUI-05)', d && !d.live && Math.abs(d.x - (cx - 20)) < 1e-6, JSON.stringify(radar.drawn)); }
players[2].pose = pose(60, 40); tick();
{ const d = drawn('foe'); check('…still there while he walks on unseen', d && Math.abs(d.x - (cx - 20)) < 1e-6 && Math.abs(d.z - cz) < 1e-6, JSON.stringify(radar.drawn)); }
tick(2000); check('…and gone 2 s after he was last seen', !drawn('foe'), JSON.stringify(radar.drawn));
// in plain sight behind you: spotted (all-round eyes, as before)
players[2].pose = pose(-80, 0); tick(); tick(); check('an enemy in plain sight (even behind you) is spotted', !!drawn('foe')?.live, JSON.stringify(radar.why));
// shut door through the live scene boxes
{ players[2].pose = pose(-20, 0); myYaw = -Math.PI / 2; tick(2100); live = []; live.movers = [{ minX: cx - 30, maxX: cx - 29, minZ: cz - 10, maxZ: cz + 10, y0: 0, y1: 20, mat: 'door', off: false }]; tick(); tick();
  check('a shut door (the scene\'s live box) hides him (no live dot: at most the faded last-seen one)', !drawn('foe')?.live, JSON.stringify(radar.why));
  live.movers[0].off = true; tick(); check('…opened: seen', !!drawn('foe')?.live); live.movers[0].off = false; live.movers[0].mat = 'glass'; tick(2100); tick(); check('…a glass pane instead: seen through it', !!drawn('foe')?.live); live = []; live.movers = []; }
// dead: your camera is nobody's eyes; a living team mate's are
{ tick(2100); const mateDown = G.combat.down.mate; G.combat.down = { me: { until: Date.now() + 60000, by: 'foe' }, mate: mateDown }; tick(); tick(); check('dead: what your (spectator) camera sees spots nobody (GDUI-05)', !drawn('foe')?.live, JSON.stringify(radar.why));
  delete G.combat.down.mate; players[1].pose = pose(-60, 0, -Math.PI / 2); tick(); check('…a living team mate who can see him does', !!drawn('foe')?.live, JSON.stringify(radar.why)); G.combat.down = { mate: mateDown }; players[1].pose = pose(-90, 90, Math.PI); }
// side swap: nobody known any more
{ tick(); check('(known before the swap)', !!drawn('foe')); G.combat.d.teams = { me: 't', mate: 't', foe: 'ct' }; me = { x: cx + 150, y: 9.7, z: cz + 150 }; tick(); check('side swap: last round\'s spots forgotten at once', !drawn('foe'), JSON.stringify(radar.drawn));
  G.combat.d.teams = { me: 'ct', mate: 'ct', foe: 't' }; me = { x: cx - 50, y: 9.7, z: cz }; tick(); tick(); check('(seen again)', !!drawn('foe')); players[2].pose = pose(30, 0); tick();
  G.arena.match = 2; tick(); check('rematch (a new match): forgotten', !drawn('foe'), JSON.stringify(radar.drawn)); G.arena.match = 1; }
// the planted bomb: CTs only once seen
{ players[2].pose = pose(90, -90); tick(2100); G.combat.d.round = { id: 'r2', phase: 'planted', planted: { x: cx + 20, y: 0, z: cz, at: 777, explodeAt: Date.now() + 40000 } }; tick(); tick();
  { const r0 = createRadar({ world, lan, name: () => 'Me', yaw: () => myYaw, where: () => me, active: () => true, boxes: () => live }); T += 100; r0.update();
    check('default (v51 rule kept): a CT sees the planted bomb at once, even behind the wall', r0.bombShown === true); }
  check('ctBombSpotted on: planted bomb behind the wall: not on a CT\'s radar', radar.bombShown === false);
  me = { x: cx + 5, y: 9.7, z: cz + 30 }; myYaw = Math.atan2(-(20 - 5), -(0 - 30)); tick(); check('…a CT sees it: shown', radar.bombShown === true);
  me = { x: cx - 50, y: 9.7, z: cz }; tick(); check('…and stays shown', radar.bombShown === true);
  G.combat.d.teams.me = 't'; G.combat.d.round = { ...G.combat.d.round, id: 'r3', planted: { ...G.combat.d.round.planted, at: 778 } }; tick(); check('a Terrorist always sees it', radar.bombShown === true); G.combat.d.teams.me = 'ct'; G.combat.d.round = { id: 'r4', phase: 'live' }; }
// spectating (GDUI-06): the spectator says who it watches (arena-spectate.js `watched`: their eye and yaw), and the radar,
// wired as lab.js wires it (yaw / where from spectator.watched while it is set, else your own), turns and centres with them
{ const THREE = await import('../dist/three.module.js'), { createSpectator } = await import('../dist/arena-spectate.js'), { hostNow } = await import('../dist/host-clock.js');
  const SG = { mode: 'arena', arena: { map: '__radarA', match: 1, startedAt: 1 }, combat: { d: { teams: { me: 'ct', mate: 'ct', foe: 't' }, round: { id: 's1', phase: 'live' }, score: { t: 0, ct: 0 } }, down: {}, nades: [] } }, sw = { operations: { game: SG } };
  const mateG = { visible: true, position: new THREE.Vector3(cx - 10, 0, cz + 10), rotation: { y: 0 } }, sp = createSpectator({ camera: new THREE.PerspectiveCamera(), world: sw, lan: { models: new Map([['m1', { name: 'Mate', g: mateG }], ['f1', { name: 'Foe', g: { ...mateG, position: new THREE.Vector3(cx + 50, 0, cz) } }]]), players: [{ id: 'm1', name: 'Mate', pose: { yaw: 1.234, ey: 9.7 } }, { id: 'f1', name: 'Foe', pose: { yaw: -2 } }] }, name: () => 'Me' });
  sp.update(.016); check('alive: the spectator watches nobody (watched null)', sp.watched === null, JSON.stringify(sp.watched));
  SG.combat.down.me = { until: hostNow() + 60000, by: 'Foe' }; sp.update(.016); const w = sp.watched;
  check('dead: spectator.watched is your team mate (never the enemy who killed you, in Defuse), at his eye, facing his way', w && w.name === 'Mate' && Math.abs(w.yaw - 1.234) < 1e-9 && Math.abs(w.x - (cx - 10)) < 1e-9 && Math.abs(w.y - 9.7) < 1e-9, JSON.stringify(w));
  const myOwnYaw = -.5, r3 = createRadar({ world: sw, lan: { players: [] }, name: () => 'Me', yaw: () => sp.watched ? sp.watched.yaw : myOwnYaw, where: () => sp.watched || me, active: () => true }); if (r3.mode !== 'rotate') r3.toggle(); T += 100; r3.update();
  check('…the rotating radar turns with the watched player, not your death view (GDUI-06)', Math.abs(r3.angle - 1.234) < 1e-9, r3.angle);
  delete SG.combat.down.me; sp.update(.016); check('respawned: watched null again (the radar is yours)', sp.watched === null); }
// GDUI-15: expand() → the next frame reads the new size itself
{ radarEl.clientWidth = 210; tick(); radar.expand(true); radarEl.clientWidth = 600; tick(16); check('expand: the very next frame draws at the big size (dots canvas follows it)', radar.canvasPx === 600, radar.canvasPx);
  const bigIcon = radar.iconCss; check('Tab map icons never smaller than v51\'s (one unit = 1/420 of the map\'s width: 600/420 CSS px)', bigIcon >= 600 / 420 - 1e-6, bigIcon);
  radar.expand(false); radarEl.clientWidth = 210; tick(16); check('…and back', radar.canvasPx === 210, radar.canvasPx); check('small radar icons 1.3× v51\'s (0.65 CSS px per unit, v51 0.5)', Math.abs(radar.iconCss - .65) < 1e-6, radar.iconCss); }
// ---- with the user's CS2 map files: Nuke's rotating doors -----------------------------------------------------
{ const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), f = path.join(root, 'user-maps', 'nuke.bsp');
  if (!existsSync(f)) console.log('SKIP: no user-maps/nuke.bsp (the CS2 map file check)');
  else { const { useMapFile } = await import('../dist/arena-maps.js'); useMapFile('nuke', readFileSync(f)); const M = ARENA_MAPS.nuke, B = mapBoxes(M, cx, cz), g = { combat: { nades: [] } }; let shut = 0, blocked = 0, opened = 0, total = 0;
    for (const b of B.movers || []) { if (b.role !== 'shut' || b.mat !== 'door') continue; total++; const x0 = b.minX, x1 = b.maxX, z0 = b.minZ, z1 = b.maxZ, thinX = x1 - x0 < z1 - z0, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, y = Math.min(b.y1 - 1, b.y0 + 9.7), L = 6;
      const [ax, az, bx, bz] = thinX ? [mx - L, mz, mx + L, mz] : [mx, mz - L, mx, mz + L]; b.off = false; shut++; if (!radarSight(M, B, g, ax, y, az, bx, y, bz, y - 9.7, false, Date.now())) blocked++;
      b.off = true; if (radarSight(M, B, g, ax, y, az, bx, y, bz, y - 9.7, false, Date.now())) opened++; b.off = false; }
    check('Nuke (CS2 file): every shut door blocks the radar\'s sight', total > 0 && blocked === shut, blocked + '/' + shut);
    check('Nuke (CS2 file): opened, most doorways are clear', opened >= Math.ceil(total * .5), opened + '/' + total); } }
// ==== v52 (package Q): CS2's radar look ==============================================================================
const ART = await import('../dist/gd-radar-art.js'), PREFS = await import('../dist/gd-radar-prefs.js'), { TEAM_COLORS, ZOOM_K } = await import('../dist/gd-radar.js'), EXP = await import('../tools/export-cs2-radar.mjs');
const settle = () => new Promise(r => setTimeout(r, 0));
// ---- the overview file as CS2 writes it (a made-up two-level map in CS2's KeyValues layout) → what the radar needs ----
{ const kv = EXP.parseKV(`// overview\n"de_test"\n{\n\t"material"\t"overviews/de_test"\t// texture\n\t"pos_x"\t\t"-3000"\n\t"pos_y"\t"2500"\n\t"scale"\t"6.5"\n\t"verticalsections"\n\t{\n\t\t"default" // primary\n\t\t{\n\t\t\t"AltitudeMax" "10000"\n\t\t\t"AltitudeMin" "-400"\n\t\t}\n\t\t"lower"\n\t\t{\n\t\t\t"AltitudeMax" "-400"\n\t\t\t"AltitudeMin" "-10000"\n\t\t}\n\t}\n\t"CTSpawn_x"\t"0.8"\n}`);
  const ov = EXP.overviewOf(kv); check('export: CS2 overview data parsed (pos_x / pos_y / scale; the lower picture below the default section\'s AltitudeMin)', ov.pos_x === -3000 && ov.pos_y === 2500 && ov.scale === 6.5 && ov.split === -400, JSON.stringify(ov));
  check('export: a one-level overview has no split', EXP.overviewOf(EXP.parseKV('"de_one"\n{\n "pos_x" "-1" "pos_y" "2" "scale" "4.4"\n "rotate" "1"\n}')).split === null); }
// ---- overviewFit: CS2's picture in the radar's terms, against CS2's own formula --------------------------------------
const U = 2.54 / 16.5, H = { x0: -2000, y1: 1500, W: 200, D: 200, zLow: -300, U }, OV = { pos_x: -2300, pos_y: 1800, scale: 2, res: 1024, split: -200 };
const hammerOf = (gx, gz) => [H.x0 + (gx + H.W / 2) / U, H.y1 - (gz + H.D / 2) / U];
{ const F = ART.overviewFit(OV, H); let worst = 0;
  for (const [gx, gz] of [[0, 0], [-100, -100], [100, 100], [37.5, -81.2], [-64, 12]]) { const [hx, hy] = hammerOf(gx, gz), [u, v] = ART.overviewUV(OV, hx, hy), px = (gx + H.W / 2) * F.scale + F.ox, pz = (gz + H.D / 2) * F.scale + F.oz; worst = Math.max(worst, Math.abs(px - u * 1024), Math.abs(pz - v * 1024)); }
  check('overviewFit: every map point lands on the CS2 picture pixel CS2\'s formula gives ((x − pos_x) / scale, (pos_y − y) / scale)', worst < 1e-6, worst);
  check('overviewFit: Nuke-style split → the lower picture below that Hammer height, as game feet', Math.abs(F.lowerFeet - 100 * U) < 1e-9, F.lowerFeet);
  const F2 = ART.overviewFit({ ...OV, res: 2048 }, H), [hx, hy] = hammerOf(10, 20), [u] = ART.overviewUV(OV, hx, hy); check('overviewFit: a 2048-px picture scales with it', Math.abs((10 + 100) * F2.scale + F2.ox - u * 2048) < 1e-6); }
// ---- the radar with a CS2 picture: shown only once decoded, never swapped in mid-round, aligned, both floors ----------
{ const mkC = id => ({ ...mk(id), hammer: H, sites: { A: [40, -60, 20], B: [-50, 50, 20] } }); ARENA_MAPS.__radarC = mkC('__radarC'); ARENA_MAPS.__radarD = mkC('__radarD');
  let release; const gate = new Promise(r => { release = r; }), loads = []; const fake = f => gate.then(() => { loads.push(f.img); return { naturalWidth: 1024, naturalHeight: 1024, style: {}, img: f.img }; });
  ART.setCS2RadarIndex({ maps: { __radarC: { ...OV, img: 'c.png', lower: { img: 'c_low.png' } }, __radarD: { ...OV, split: null, img: 'd.png', lower: null } } }, fake);
  const GC = { mode: 'arena', arena: { map: '__radarC', match: 1, startedAt: 1 }, combat: { d: { teams: { me: 'ct', mate: 'ct', foe: 't', t2: 't' }, round: { id: 'c1', phase: 'live' }, score: { t: 0, ct: 0 } }, down: {}, nades: [] } };
  let meC = { x: cx + 20, y: 9.7 + 30, z: cz - 10 }, onC = true; const rc = createRadar({ world: { operations: { game: GC } }, lan: { players: [{ name: 'Mate', pose: pose(-30, 40) }] }, name: () => 'Me', yaw: () => .4, where: () => meC, active: () => onC });
  T += 100; rc.update(); check('CS2 picture still decoding while the radar is shown mid-round: the built-in picture meanwhile', rc.art === 'own', rc.art);
  release(); await settle(); await settle(); T += 100; rc.update(); check('…decoded during the round: NOT swapped in mid-round (no picture change while playing)', rc.art === 'own', rc.art);
  GC.combat.d.round = { id: 'c2', phase: 'freeze' }; T += 100; rc.update(); check('…swapped in at the next freeze time', rc.art === 'cs2' && rc.pictures === 2, rc.art + ' ' + rc.pictures);
  { const [px, pz] = rc.picturePoint(cx + 37.5, cz - 81.2), [hx, hy] = hammerOf(37.5, -81.2), [u, v] = ART.overviewUV(OV, hx, hy); check('radar dots on the CS2 picture exactly where CS2 places that point', Math.abs(px - u * 1024) < 1e-6 && Math.abs(pz - v * 1024) < 1e-6, [px, pz, u * 1024, v * 1024].map(n => n.toFixed(2)).join(' ')); }
  check('upstairs (feet above CS2\'s split): the upper picture', rc.layer === null, rc.layer); meC = { x: cx + 20, y: 9.7 + 5, z: cz - 10 }; T += 100; rc.update(); check('…feet 5 units up is still under the split (15.4): the lower picture', rc.layer === 'lower', rc.layer);
  meC = { x: cx + 20, y: 9.7 + 30, z: cz - 10 }; T += 100; rc.update(); check('…30 up: upper again', rc.layer === null, rc.layer);
  { const c0 = rc.project(meC.x, meC.z); check('default (centred): you at the panel\'s centre', Math.abs(c0[0] - 105) < 1e-6 && Math.abs(c0[1] - 105) < 1e-6, c0.join(','));
    check('zoom 0.7 shows ZOOM_K / 0.7 of CS2\'s overview (half of its 1024 px)', Math.abs(rc.view - 1024 / ART.overviewFit(OV, H).scale * ZOOM_K / .7) < 1e-6 && Math.abs(rc.view * ART.overviewFit(OV, H).scale - 512) < 1e-6, rc.view); }
  check('CS2 colours: team mates by the host\'s join order per side (2nd CT purple, 1st CT you yellow, 2nd T purple)', rc.colorOf('Mate') === TEAM_COLORS[1] && rc.colorOf('Me') === TEAM_COLORS[0] && rc.colorOf('t2') === TEAM_COLORS[1] && rc.colorOf('foe') === TEAM_COLORS[0], [rc.colorOf('Me'), rc.colorOf('Mate'), rc.colorOf('t2')].join(' '));
  // hidden (a map loading): waits for the CS2 picture rather than drawing the built-in one first
  onC = false; GC.arena.map = '__radarD'; GC.combat.d.round = { id: 'd1', phase: 'live' }; T += 100; rc.update(); check('map loading (radar hidden): nothing built-in drawn while CS2\'s picture decodes', !ART.radarCacheIds().includes('__radarD'), JSON.stringify(ART.radarCacheIds()));
  await settle(); await settle(); T += 100; rc.update(); check('…then CS2\'s picture, ready before the round shows the radar (even mid-round: it was hidden)', rc.art === 'cs2' && rc.pictures === 1 && loads.includes('d.png'), rc.art + ' ' + loads.join());
  ART.setCS2RadarIndex(false); GC.arena.map = '__radarC'; ARENA_MAPS.__radarC = mkC('__radarC'); T += 100; rc.update(); onC = true; T += 100; rc.update(); check('no CS2 export (CI, a friend\'s computer): the built-in picture', rc.art === 'own', rc.art);
  delete ARENA_MAPS.__radarC; delete ARENA_MAPS.__radarD; }
// ---- CS2's options: defaults, persistence, applied live --------------------------------------------------------------
{ G.arena.map = '__radarA'; G.combat.d.round = { id: 'o1', phase: 'live' }; store.clear(); radarEl.clientWidth = 210;
  const D = PREFS.loadRadarPrefs(); check('defaults = CS2\'s cvars (cl_radar_always_centered 1, cl_radar_rotate 1, cl_hud_radar_scale 1, cl_radar_scale 0.7, cl_radar_square_with_scoreboard 1)', JSON.stringify(D) === JSON.stringify({ centered: true, rotate: true, size: 1, zoom: .7, squareTab: true }), JSON.stringify(D));
  store.set('gd-radar-mode', 'fixed'); check('v51\'s N choice (fixed) carried over', PREFS.loadRadarPrefs().rotate === false); store.clear();
  const ro = createRadar({ world, lan, name: () => 'Me', yaw: () => myYaw, where: () => me, active: () => true, boxes: () => live }), fr = (ms = 70) => { T += ms; ro.update(); };
  me = { x: cx - 50, y: 9.7, z: cz }; myYaw = 1; fr(); check('rotating (default): the radar turns with your view', Math.abs(ro.angle - 1) < 1e-9, ro.angle);
  check('built-in map: zoom 0.7 shows half of its overview (size + 10 %)', Math.abs(ro.view - 220 * ZOOM_K / .7) < 1e-6, ro.view);
  PREFS.saveRadarPrefs({ ...PREFS.loadRadarPrefs(), rotate: false }); fr(); check('"Radar is rotating" No: north up at once (live), saved on this computer', ro.angle === 0 && ro.mode === 'fixed' && JSON.parse(store.get('gd-radar')).rotate === false, ro.angle + ' ' + store.get('gd-radar'));
  PREFS.saveRadarPrefs({ ...PREFS.loadRadarPrefs(), zoom: .35 }); fr(); check('"Radar map zoom" 0.35: twice as much map across the radar', Math.abs(ro.view - 220 * ZOOM_K / .35) < 1e-6, ro.view);
  me = { x: cx - 95, y: 9.7, z: cz - 95 }; PREFS.saveRadarPrefs({ ...PREFS.loadRadarPrefs(), zoom: .7 }); fr(); { const c = ro.project(me.x, me.z); check('centred: near the map\'s corner you stay in the middle', Math.abs(c[0] - 105) < 1e-6 && Math.abs(c[1] - 105) < 1e-6, c.join(',')); }
  PREFS.saveRadarPrefs({ ...PREFS.loadRadarPrefs(), centered: false }); fr(); { const c = ro.project(me.x, me.z), corner = ro.project(cx - 100, cz - 100); check('"Radar centers the player" No (best fit): the map\'s corner held at the radar\'s corner, you off centre toward it', Math.abs(corner[0]) < 1e-6 && Math.abs(corner[1]) < 1e-6 && c[0] < 30 && c[1] < 30, c.map(v => v.toFixed(1)) + ' corner ' + corner.map(v => v.toFixed(1))); }
  PREFS.saveRadarPrefs({ ...PREFS.loadRadarPrefs(), size: 1.3 }); check('"Radar HUD size" 1.3: the panel\'s size published at once (--gd-radar-h)', /\* 1\.3\)$/.test(rootStyle['--gd-radar-h'] || ''), rootStyle['--gd-radar-h']);
  ro.expand(true); check('"Toggle radar shape with scoreboard" Yes: Tab shows the whole map (big)', radarEl.classList.contains('big')); ro.expand(false);
  PREFS.saveRadarPrefs({ ...PREFS.loadRadarPrefs(), squareTab: false }); ro.expand(true); check('…No: Tab leaves the radar as it is', !radarEl.classList.contains('big')); ro.expand(false);
  const c2 = PREFS.saveRadarPrefs({ size: 9, zoom: -1, rotate: 'yes' }); check('stored values made safe (CS2\'s slider ranges: size 0.8–1.3, zoom 0.25–1)', c2.size === 1.3 && c2.zoom === .25 && c2.rotate === true && c2.centered === true, JSON.stringify(c2));
  PREFS.saveRadarPrefs({ ...PREFS.RADAR_DEFAULT }); const was = ro.mode, now2 = ro.toggle(); check('N still switches rotating ⇄ north up, and saves it', was === 'rotate' && now2 === 'fixed' && PREFS.loadRadarPrefs().rotate === false); PREFS.saveRadarPrefs({ ...PREFS.RADAR_DEFAULT }); fr(); }
// ---- a map file's grid reaches far past what anyone walks: the big map frames the walkable part, best fit holds it ----
{ const g = { ...mk('__radarG'), grid: { cols: 20, rows: 20, cell: 10, cells: new Uint8Array(400) } }; for (let r = 2; r < 16; r++) for (let c = 3; c < 18; c++) g.grid.cells[r * 20 + c] = 1; ARENA_MAPS.__radarG = g;   // (walkable x ∈ [−70, 80], z ∈ [−80, 60])
  const GG = { mode: 'arena', arena: { map: '__radarG', match: 1, startedAt: 1 }, combat: { d: { teams: { me: 'ct' }, round: { id: 'g1', phase: 'live' } }, down: {}, nades: [] } }; let mg = { x: cx - 65, y: 9.7, z: cz - 75 };
  const rg = createRadar({ world: { operations: { game: GG } }, lan: { players: [] }, name: () => 'Me', yaw: () => 0, where: () => mg, active: () => true }); radarEl.clientWidth = 210; T += 100; rg.update();
  rg.expand(true); T += 16; rg.update(); const mid = rg.project(cx + 5, cz - 10); check('Tab map: frames the walkable part (150 units + 4 %), centred on it — not the grid\'s empty margins', Math.abs(rg.view - 150 * 1.04) < 1e-6 && Math.abs(mid[0] - 105) < 1e-6 && Math.abs(mid[1] - 105) < 1e-6, rg.view + ' ' + mid.join(',')); rg.expand(false);
  PREFS.saveRadarPrefs({ ...PREFS.RADAR_DEFAULT, centered: false, rotate: false, zoom: 1 }); T += 100; rg.update(); const corner = rg.project(cx - 70, cz - 80);
  check('best fit on a map file: the walkable corner held at the radar\'s corner', Math.abs(corner[0]) < 1e-6 && Math.abs(corner[1]) < 1e-6, corner.join(',')); PREFS.saveRadarPrefs({ ...PREFS.RADAR_DEFAULT }); delete ARENA_MAPS.__radarG; G.arena.map = '__radarA'; }
// ---- with the user's export (user-assets/radar) and CS2 map files: CS2's pictures line up with the world ---------------
{ const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), idx = path.join(root, 'user-assets', 'radar', 'radar.json');
  if (!existsSync(idx)) console.log('SKIP: no user-assets/radar (tools/export-cs2-radar.mjs) — the CS2 picture alignment check');
  else { const index = JSON.parse(readFileSync(idx, 'utf8')), { useMapFile } = await import('../dist/arena-maps.js'), zlib = await import('node:zlib');
    // (a PNG's alpha: 8-bit RGBA / RGB, not interlaced — what Source 2 Viewer writes)
    const alphaOf = file => { const b = readFileSync(file); let p = 8, w = 0, h = 0, ct = 0; const idat = []; while (p < b.length) { const len = b.readUInt32BE(p), t = b.toString('ascii', p + 4, p + 8); if (t === 'IHDR') { w = b.readUInt32BE(p + 8); h = b.readUInt32BE(p + 12); ct = b[p + 17]; } else if (t === 'IDAT') idat.push(b.subarray(p + 8, p + 8 + len)); p += 12 + len; }
      const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), st = w * bpp, out = Buffer.alloc(st * h), A = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) { const f = raw[y * (st + 1)], src = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1)), o = y * st;
        for (let i = 0; i < st; i++) { const a = i >= bpp ? out[o + i - bpp] : 0, up = y ? out[o - st + i] : 0, c = y && i >= bpp ? out[o - st + i - bpp] : 0; let v = src[i];
          if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1; else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; } out[o + i] = v & 255; } }
      for (let i = 0; i < w * h; i++) A[i] = bpp === 4 ? out[i * 4 + 3] : 255; return { w, h, A, px: out, bpp }; };
    for (const id of ['dust2', 'mirage', 'inferno', 'nuke', 'ancient', 'anubis', 'overpass', 'cache']) { const e = index.maps[id], f = path.join(root, 'user-maps', id + '.bsp'); if (!e || !existsSync(f)) { console.log('SKIP ' + id + ': no export or map file'); continue; }
      if (!ARENA_MAPS[id]?.hammer) useMapFile(id, readFileSync(f)); const M = ARENA_MAPS[id], F = ART.overviewFit(e, M.hammer), pic = alphaOf(path.join(root, 'user-assets', 'radar', e.img)), low = e.lower ? alphaOf(path.join(root, 'user-assets', 'radar', e.lower.img)) : null, [w, d] = M.size;
      const uv = (gx, gz, sx = 0) => [Math.round((gx + w / 2) * F.scale + F.ox + sx), Math.round((gz + d / 2) * F.scale + F.oz)];
      const near = (P, gx, gz, rad, test, sx = 0) => { const [u, v] = uv(gx, gz, sx); for (let dv = -rad; dv <= rad; dv++) for (let du = -rad; du <= rad; du++) { const uu = u + du, vv = v + dv; if (uu >= 0 && vv >= 0 && uu < P.w && vv < P.h && du * du + dv * dv <= rad * rad && test(P, vv * P.w + uu)) return true; } return false; };
      const opaque = (P, i) => P.A[i] > 40, orange = (P, i) => { const o = i * P.bpp, r = P.px[o], g = P.px[o + 1], b = P.px[o + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0, hue = mx === r && mx > mn ? (360 + 60 * (g - b) / (mx - mn)) % 360 : -1; return P.A[i] > 120 && mx > 80 && (s >= .45 || (s >= .25 && r - g >= 30 && r - b >= 25)) && hue >= 0 && (hue <= 28 || hue >= 340); };   // (CS2 draws each bomb zone as a red-orange outline: hue −20…28°, saturated — floors are teal, green, grey or sand, hue 30°+; where the thin line is blended into a blue room's floor — Nuke's lower B: 138/99/104 — it is still red over green and blue by 30+)
      const spawns = [...(M.t || []), ...(M.ct || [])], sOn = spawns.filter(s => near(pic, s[0], s[1], 2, opaque)).length;
      // (inside: walking left, right, up and down from the centre meets that outline within 90 px in at least 2 of the 4
      // directions — crates drawn over an edge hide it from one or two)
      const enclosed = (P, gx, gz) => { const [u, v] = uv(gx, gz); let hits = 0; for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let t = 1; t <= 90; t++) { const uu = u + du * t, vv = v + dv * t; if (uu < 0 || vv < 0 || uu >= P.w || vv >= P.h) break; if (orange(P, vv * P.w + uu) || orange(P, (vv + (du ? 1 : 0)) * P.w + uu + (dv ? 1 : 0))) { hits++; break; } } return hits >= 2; };
      const sites = Object.entries(M.sites || {}), inZone = sites.filter(([, s]) => [pic, low].some(P => P && enclosed(P, s[0], s[1])));
      const Gd = M.grid, floor = []; for (let r = 0; r < Gd.rows; r += 3) for (let c = 0; c < Gd.cols; c += 3) if (Gd.cells[r * Gd.cols + c] === 1) floor.push([-w / 2 + (c + .5) * Gd.cell, -d / 2 + (r + .5) * Gd.cell]);
      const share = sx => floor.filter(([a, b]) => near(pic, a, b, 2, opaque, sx)).length / Math.max(1, floor.length), s0 = share(0), sOff = Math.max(share(31), share(-31));
      check(`${id}: every spawn lands on CS2's drawn map (overview pos ${e.pos_x}, ${e.pos_y}, scale ${e.scale})`, sOn === spawns.length, sOn + '/' + spawns.length);
      check(`${id}: each bomb site's centre sits inside CS2's own orange bomb-zone outline`, sites.length >= 2 && inZone.length === sites.length, inZone.map(([L]) => L).join('') + '/' + sites.map(([L, s]) => L + '@' + uv(s[0], s[1]).join(',')).join(' '));
      check(`${id}: walkable floor on CS2's picture ${(s0 * 100).toFixed(1)} % (shifted 31 px = 3 % of it: ${(sOff * 100).toFixed(1)} %)`, s0 >= .9 && s0 - sOff > .04, `${floor.length} cells`); } } }
console.log(ok + '/' + n); process.exit(ok === n ? 0 : 1);
