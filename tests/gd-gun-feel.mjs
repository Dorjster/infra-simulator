// Global Defensive · the CS2 gun feel fixes (v53 GUNS, spec addendum 9): the view model's field of view (CS2's
// viewmodel_fov is a 4:3 horizontal angle: 60 → 46.8° up and down), the empty magazine's clips (the last shot locks the
// slide, held open, the empty reload — when the sets carry CS2's clips), CS2's muzzle flash and shell casings from two
// capped pools with nothing made per shot or per frame (the main flash drawn one frame, the vent two at 60 fps), the
// look's ±89° pitch in Global Defensive against ±1.5 rad elsewhere, and CS2's sensitivity (sensitivity × 0.022° a count;
// the console's `sensitivity`).
//   node tests/gd-gun-feel.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs'; import { fileURLToPath } from 'node:url';
import v8 from 'node:v8'; import vm from 'node:vm'; import inspector from 'node:inspector';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + d : '')); console.log('PASS ' + name + (d !== '' ? ' · ' + d : '')); };
const src = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
// (node stand-ins for the page: pictures are not drawn here)
globalThis.self ??= globalThis; globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
globalThis.document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }), createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }), getElementById: () => null };
{ const w = console.warn; console.warn = (...a) => { if (!/PropertyBinding/.test(String(a[0]))) w(...a); }; }
const D = await import('../dist/weapons-data.js'), THREE = await import('../dist/three.module.js');

// ── 1. The view model's field of view ──
{ const v60 = D.vmVfov(60), v68 = D.vmVfov(68), hz = h => 2 * Math.atan(Math.tan(h * Math.PI / 360) * .75) * 180 / Math.PI;
  ok(`viewmodel_fov is a 4:3 horizontal angle (CS2's fov rule): 60 → ${v60.toFixed(2)}° vertical, 68 → ${v68.toFixed(2)}°`, Math.abs(v60 - 46.83) < .01 && Math.abs(v68 - 53.67) < .01 && Math.abs(v60 - hz(60)) < 1e-12);
  const W = await import('../dist/weapons.js');
  ok(`the preset (a console default, not a file value): viewmodel_fov ${D.VM_FOV.h}; weapons.js VIEWMODEL.fov follows it (${W.VIEWMODEL.fov.toFixed(2)}°)`, [60, 68].includes(D.VM_FOV.h) && Math.abs(W.VIEWMODEL.fov - D.vmVfov()) < 1e-12);
  const old = D.VM_FOV.h; D.VM_FOV.h = 68; const live = W.VIEWMODEL.fov; D.VM_FOV.h = old;
  ok('…live: a preset change applies at once (no re-import, no reload)', Math.abs(live - v68) < 1e-12);
  const wsrc = src('weapons.js'), fsrc = src('fp-view.js'), ssrc = src('spectate-view.js');
  ok('fp-view.js overrides a CS2 set\'s stored FPCam vfov 60 at load (vfov: the converted preset; rawVfov the file\'s, for the other modes)', /get vfov\(\) \{ return cs2Cam \? vmVfov\(\) : rawVfov; \}/.test(fsrc) && /rawVfov = cam\?\.userData\?\.vfov/.test(fsrc));
  ok('weapons.js: Global Defensive (team() set) uses it; the other modes keep the file\'s 60 and their 58', /const gd = team\(\) != null, vf = \(gd \? fp\?\.vfov : fp\?\.rawVfov \?\? fp\?\.vfov\) \|\| \(gd \? VIEWMODEL\.fov : PLAIN_VFOV\)/.test(wsrc) && /PLAIN_VFOV = 58/.test(wsrc));
  ok('spectate-view.js (GD only) reads the same converted value', /set\?\.vfov \|\| VIEWMODEL\.fov/.test(ssrc) && /vmVfov/.test(ssrc));
  if (existsSync('user-assets/fp/cs2_pistol.glb')) {
    globalThis.location ??= { protocol: 'http:', href: 'http://localhost/' }; globalThis.fetch = async () => new Response(null, { status: 404 });
    const { gltfLoader } = await import('../dist/gltf-loader.js'), F = await import('../dist/fp-view.js'), b = readFileSync('user-assets/fp/cs2_pistol.glb');
    const g = await new Promise((res, rej) => gltfLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)), set = F.buildAuthored(g, null, 'pistol');
    ok(`the Glock's CS2 set: its file's FPCam says ${set.rawVfov}, the game draws it at ${set.vfov.toFixed(2)}° (CS2's 60 on 4:3)`, set.rawVfov === 60 && Math.abs(set.vfov - D.vmVfov()) < 1e-12);
    // ── 2. Empty-magazine clips (where the set has them: tools/cs2-fp/export_missing.py) ──
    if (g.animations.some(a => a.name === 'reloadempty')) { const pn = performance.now; let T = pn.call(performance); performance.now = () => T; const seq = [];
      set.hold('pistol', { draw: false }); set.update(0); set.fire(false); seq.push(set.clipNow); T += 500; set.update(.5); set.update(.01); seq.push(set.clipNow);
      set.fire(true); seq.push(set.clipNow); T += 500; set.update(.5); set.update(.01); seq.push(set.clipNow); seq.push(set.reload(2267, true)); set.stopReload(); set.setEmpty(false); set.update(.01); seq.push(set.clipNow); seq.push(set.reload(2267, false)); performance.now = pn;
      ok(`the Glock: a shot ${seq[0]} → ${seq[1]}; the last ${seq[2]} → held open ${seq[3]}; a reload from 0 ${seq[4]}; filled ${seq[5]}; a reload with rounds left ${seq[6]}`, seq.join() === 'fire,idle,fireempty,idleempty,reloadempty,idle,reload', seq.join(' → ')); }
    else console.log('SKIP (empty clips): the Glock set has no CS2 empty clips yet'); }
  else console.log('SKIP (sets): no CS2 first-person sets on this computer');
  ok('weapons.js picks them at magazine 0: the last round fire(true), a reload from 0 reload(ms, true) with the empty clip\'s own sounds, held open each frame', /fp\?\.fire\(!practiceMag\(\) && mag - 1 <= 0\)/.test(wsrc) && /fp\?\.reload\(clipMs, mag === 0\)/.test(wsrc) && /clipStart\(rc, clipMs\)/.test(wsrc) && /fp\.setEmpty\(!!am && am\[0\] === 0 && !practiceMag\(\)\)/.test(wsrc));
  ok('m_bHideViewModelWhenZoomed: the view model hides scoped only for a gun that says so (the AWP, SSG 08)', /if \(scope && view && current\?\.hideZoomed\) view\.visible = false/.test(wsrc)); }

// ── 3. Muzzle flash and shells: capped pools, nothing allocated per shot or frame ──
{ const X = await import('../dist/gd-gunfx.js'), fx = X.createGunFx(null), at = new THREE.Vector3(0, 10, 0), dir = new THREE.Vector3(0, 0, -1);
  const ak = X.fxOf('ak').flash, main = ak.find(c => /glow_04/.test(c.texture)), vent = ak.find(c => /muzzleflashx/.test(c.texture));
  ok('the AK\'s flash is CS2\'s weapon_muzzle_flash_assaultrifle_fp: the vent (1 muzzleflashx, 28–30 ms) and the main flash (6 particle_glow_04, 1–2 ms, radius 2–7 HU, 1–12 HU along, alpha 0.71–0.78, [93,78,63]…[51,28,13] × 4)',
    vent && main && main.count === 6 && main.life[0] === .001 && main.life[1] === .002 && main.radius.join() === '2,7' && main.along.join() === '1,12' && Math.abs(main.alpha[0] - .705882) < 1e-6 && main.c0.join() === '93,78,63' && main.c1.join() === '51,28,13' && main.overbright === 4 && vent.count === 1 && vent.life.join() === '0.028,0.03', JSON.stringify(main));
  const made = fx.flash(at, dir, 'ak'); fx.mesh.onBeforeRender(); fx.update(1 / 60); const after1 = fx.counts.flash; fx.mesh.onBeforeRender(); fx.update(1 / 60); const after2 = fx.counts.flash;
  ok(`one AK shot: ${made} sprites; after the frame it was drawn in only the vent is left (${after1}), a frame later nothing (${after2}) — the main flash ≈ 1 frame, the vent 2 at 60 fps`, made === 7 && after1 === 1 && after2 === 0);
  const born = fx.flash(at, dir, 'ak'); fx.update(.05); const unseen = fx.counts.flash; fx.mesh.onBeforeRender(); fx.update(1 / 60);
  ok('…a particle is never gone before it has been on screen once (CS2\'s minimum frame), however long the frame', born === 7 && unseen === 7 && fx.counts.flash === 0);
  for (let i = 0; i < 500; i++) fx.flash(at, dir, i % 2 ? 'negev' : 'xm1014');
  ok(`a burst of 500 flashes stays within the pool (${fx.counts.flash} of ${X.FLASH_MAX}: the oldest reused)`, fx.counts.flash <= X.FLASH_MAX && fx.counts.flash > 0);
  fx.mesh.onBeforeRender(); for (let i = 0; i < 30; i++) fx.update(1 / 60); ok('…and all gone a moment later', fx.counts.flash === 0);
  // a shell: CS2's weapon_shell_casing_rifle speed out to the right (200–250 HU/s), up (50–75), gravity 600 HU/s²
  const R = X.fxOf('ak').shell; ok('the AK throws CS2\'s weapon_shell_casing_rifle: 200–250 HU/s out, 15…−5 forward, 50–75 up, gravity 600 HU/s², 3 s', R && R.speedMin.join() === '200,15,50' && R.speedMax.join() === '250,-5,75' && R.gravity[2] === -600 && R.life[0] === 3, JSON.stringify(R));
  fx.eject(at, dir, 'ak', 0); fx.update(0); const M = new THREE.Matrix4(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3(); fx.shells.getMatrixAt(0, M); p0.setFromMatrixPosition(M); fx.update(.05); fx.shells.getMatrixAt(0, M); p1.setFromMatrixPosition(M);
  const dx = (p1.x - p0.x) / X.HU_UNITS / .05, dy = (p1.y - p0.y) / X.HU_UNITS / .05;
  ok(`…flying out to the right at ${dx.toFixed(0)} HU/s and up at ${dy.toFixed(0)} HU/s (after 0.05 s of 600 HU/s² gravity)`, dx >= 199 && dx <= 251 && dy > 50 - 600 * .05 - 1 && dy < 75, [dx, dy].map(v => v.toFixed(1)).join(' / '));
  for (let i = 0; i < 200; i++) fx.eject(at, dir, i % 3 ? 'pistol' : 'shotgun', 0); ok(`200 shells: the pool holds ${fx.counts.shells} of ${X.SHELL_MAX} (the oldest reused)`, fx.counts.shells === X.SHELL_MAX);
  for (let i = 0; i < 60 * 6; i++) fx.update(1 / 60); ok('…every case gone after its CS2 life (9 mm 2 s, shotgun 5 s)', fx.counts.shells === 0);
  ok('no shell for a gun whose CS2 effect is missing from the files (the AWP: weapon_shell_casing_50cal is not in the depot) only when imported; built in: a rifle case', !!X.fxOf('sniper').shell);
  // allocation: many frames of shots and updates, the heap measured after a full collection
  v8.setFlagsFromString('--expose_gc'); const gc = vm.runInNewContext('gc'); const frame = i => { if (i % 6 === 0) { fx.flash(at, dir, 'ak'); fx.eject(at, dir, 'ak', 0); } fx.mesh.onBeforeRender(); fx.update(1 / 144); };
  for (let i = 0; i < 20000; i++) frame(i); gc(); const h0 = process.memoryUsage().heapUsed; for (let i = 0; i < 60000; i++) frame(i); gc(); const grow = process.memoryUsage().heapUsed - h0;
  ok(`60 000 frames at 144 fps with a shot every 6th: the heap grew ${(grow / 1024).toFixed(0)} KB (nothing kept per shot or frame)`, grow < 512 * 1024, grow);
  ok('one instanced draw each, warmed at load by stand-ins (the pools never leave the scene); the GD light cut to the flash (≈20 ms)', fx.samples().length === 2 && fx.samples()[0] !== fx.mesh && /LIGHT_GD = 300/.test(src('fun-pistol.js')) && /if \(id && gdOn\(\)\) \{ const made = gunfx\.flash/.test(src('fun-pistol.js')));
  // (final review) allocations COUNTED, not retained: V8's sampling heap profiler with collected objects included, every
  // byte allocated inside gd-gunfx.js over 30 000 warmed frames (5 000 shots of every family: vent arrays, speeds…)
  const ses = new inspector.Session(); ses.connect(); const post = (m, q = {}) => new Promise((res, rej) => ses.post(m, q, (e, r) => e ? rej(e) : res(r)));
  const fams = ['ak', 'negev', 'xm1014', 'pistol', 'mac10', 'm4s', 'sniper'], frame2 = i => { if (i % 6 === 0) { const id = fams[(i / 6 | 0) % fams.length]; fx.flash(at, dir, id, (i & 64) === 0); fx.eject(at, dir, id, 0); } fx.mesh.onBeforeRender(); fx.update(1 / 144); };
  for (let i = 0; i < 30000; i++) frame2(i);
  await post('HeapProfiler.enable'); await post('HeapProfiler.startSampling', { samplingInterval: 64, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  for (let i = 0; i < 30000; i++) frame2(i);
  const { profile } = await post('HeapProfiler.stopSampling'); let mine = 0; const BY = {}; const walk = q => { if (/gd-gunfx\.js/.test(q.callFrame.url)) { mine += q.selfSize; const k = q.callFrame.functionName + ":" + q.callFrame.lineNumber; BY[k] = (BY[k] || 0) + q.selfSize; } q.children.forEach(walk); }; if (process.env.GF_DEBUG) setTimeout(() => console.log(BY)); walk(profile.head); ses.disconnect(); if (process.env.GF_DEBUG) console.log(BY);
  ok(`…counted: ${mine} bytes allocated in gd-gunfx.js over 30 000 frames and 5 000 shots of every family (before the final review ≈ 400 KB: a colour array, a RegExp match and boxed numbers per particle; the few KB left are V8's own, now and then)`, mine < 64 * 1024, mine);
  // (final review) the pools are hidden while empty — no empty draw in any mode — and drawn while something is in them
  for (let i = 0; i < 60 * 6; i++) { fx.mesh.onBeforeRender(); fx.update(1 / 60); }
  const idle = [fx.mesh.visible, fx.shells.visible]; fx.flash(at, dir, 'ak'); fx.eject(at, dir, 'ak', 0); const busy = [fx.mesh.visible, fx.shells.visible];
  ok('the flash and shell pools are hidden while empty (no empty draw: the other modes pay nothing) and shown with a flash / a case in them', idle.join() === 'false,false' && busy.join() === 'true,true', JSON.stringify({ idle, busy }));
  // (final review) first person vs third person, and the silencer-on M4A1-S
  const iC = fx.mesh.geometry.attributes.iCell; fx.update(1); fx.mesh.onBeforeRender(); fx.update(1); const n0 = fx.counts.flash;
  const own = fx.flash(at, dir, 'ak', true), ownZ = iC.array[(n0) * 3 + 2], third = fx.flash(at, dir, 'ak', false), thZ = iC.array[(n0 + own) * 3 + 2];
  const f3 = X.fxOf('ak').flash3; ok(`your own AK shot: its _fp effect (${own} sprites) in the view model's depth range (flag ${ownZ}); another player's: muzzle_flash_effect_3rd_person weapon_muzzle_flash_assaultrifle (${third}: the vent and its glow, flag ${thZ}) in the world`,
    own === 7 && ownZ === 1 && third === 2 && thZ === 0 && f3.some(c => /particle_flare_004/.test(c.texture)) && /if \(iCell\.z > \.5\) gl_Position\.z = \(gl_Position\.z \+ gl_Position\.w\) \* \.01 - gl_Position\.w/.test(src('gd-gunfx.js')));
  const m4s = X.fxOf('m4s').flash; ok('the M4A1-S (carried silencer-on): items_game\'s muzzle_flash_effect_1st_person_alt, weapon_muzzle_flash_assaultrifle_silenced (one smoke1 sprite), not the rifle flash; the importer reads the _alt keys',
    m4s.length === 1 && /smoke1/.test(m4s[0].texture) && X.fxOf('m4s').flash3 === m4s && /muzzle_flash_effect_\(1st\|3rd\)_person\(_alt\)\?/.test(readFileSync(new URL('../tools/import-cs2-gunfx.mjs', import.meta.url), 'utf8')));
  ok('fun-pistol.js: your own shots and the in-eye watched player\'s draw the first-person effect, other players\' the third-person one', /src == null \|\| origin === MZ/.test(src('fun-pistol.js')));
  // (final review) a case lands on the map's ground under its port (floorAt), not at a guess under the muzzle
  for (let i = 0; i < 60 * 6; i++) fx.update(1 / 60); fx.floorAt = (x, z, y) => 7.5; fx.eject(at, dir, 'ak', -50); for (let i = 0; i < 60; i++) fx.update(1 / 60);
  fx.shells.getMatrixAt(0, M); p0.setFromMatrixPosition(M); fx.floorAt = null;
  ok(`a case comes to rest on the ground floorAt gives under its port (y ${p0.y.toFixed(3)}, ground 7.5), not the caller's guess (−50); lab.js gives the map's (arena-move groundAt)`, p0.y >= 7.5 && p0.y < 7.5 + .2 && /pistolFx\.gunfx\.floorAt=\(x,z,y\)=>inArena\(\)&&arenaScene\?\.boxes\?gdGroundAt\(arenaScene\.boxes,x,z,y,0\):null/.test(src('lab.js')));
  ok('the GD muzzle light: full on the first frame the flash is drawn (gunfx.renders), only then the 20 ms fade — a slow frame never loses it', /if \(lightGD && gunfx\.renders === lightAt\) light\.intensity = 6; else/.test(src('fun-pistol.js')) && /lightAt = made \? gunfx\.renders : -1/.test(src('fun-pistol.js'))); }

// ── 4. Pitch: CS2's ±89° in Global Defensive, ±1.5 rad elsewhere ──
{ const M = await import('../dist/arena-move.js'), lab = src('lab.js');
  ok(`PITCH_GD is 89° (${M.PITCH_GD.toFixed(4)} rad: CS2's cl_pitchup / cl_pitchdown, from memory), the other modes keep 1.5 rad`, Math.abs(M.PITCH_GD - 89 * Math.PI / 180) < 1e-12 && M.PITCH_GD > 1.5);
  ok('lab.js: the mouse look clamps to PITCH_GD in Global Defensive, 1.5 elsewhere; the practice look and teleport the same', /pc=gd\?PITCH_GD:1\.5/.test(lab) && /clamp\(rotation\.x-\(settings\.invertY\?-my:my\)\*sp\*zs,-pc,pc\)/.test(lab) && (lab.match(/inArena\(\)\?PITCH_GD:1\.5/g) || []).length >= 4);
  // (final review) the host relays GD's pitch to ±89° too (spectators, the flash facing, others' bullets), and spectating clamps the same
  const room = readFileSync(new URL('../lan/room.mjs', import.meta.url), 'utf8'), S = await import('../dist/arena-spectate.js').catch(() => null);
  ok('lan/room.mjs: the live look pitch and the newest shot\'s raw pitch clamped to ±PITCH_GD in the arena, ±1.5 elsewhere; arena-spectate.js clamps the watched look at ±89°', (room.match(/Math\.max\(-\(inArena\?PITCH_GD:1\.5\),Math\.min\(inArena\?PITCH_GD:1\.5,/g) || []).length === 2 && /PITCH_GD\}=await import/.test(room) && (!S || Math.abs(S.clampPitch(3) - M.PITCH_GD) < 1e-12)); }

// ── 5. CS2's sensitivity ──
{ const G = await import('../dist/gd-display.js'), C = await import('../dist/gd-console.js'), lab = src('lab.js');
  ok(`a mouse count turns the view sensitivity × 0.022° (m_yaw / m_pitch; CS2's default 1.25: ${(G.lookStep(1.25) * 180 / Math.PI).toFixed(4)}° a count)`, Math.abs(G.lookStep(1.25) - 1.25 * .022 * Math.PI / 180) < 1e-15 && G.M_YAW === .022 && G.M_PITCH === .022 && G.SENS_DEFAULT === 1.25 && G.sensOf({}) === 1.25);
  const ctx = { practice: false }, r1 = C.runCommand('sensitivity 2.5', ctx), r0 = C.runCommand('sensitivity', ctx), bad = C.runCommand('sensitivity -1', ctx);
  ok('the console\'s `sensitivity 2.5` sets it (any match, not practice only), `sensitivity` prints it CS2\'s way, a bad value is refused', r1.lines[0] === 'sensitivity 2.5' && Math.abs(G.gdSens.yaw - G.lookStep(2.5)) < 1e-15 && /"sensitivity" = "2.5"/.test(r0.lines[0]) && bad.error === true, JSON.stringify([r1, r0, bad]));
  ok('…clamped to its range; Settings → Global Defensive shows it (gdSens)', G.sensOf({ gdSens: 99 }) === G.SENS_RANGE[1] && /data-set="gdSens"/.test(G.videoSettingsHTML({}, { sw: 1920, sh: 1080 })));
  ok('lab.js: Global Defensive turns by gdSens.yaw / .pitch (zoom_sensitivity_ratio\'s factor kept: ×zs); the other modes .0021 × the look slider as before', /sy=gd\?gdSens\.yaw:\.0021\*settings\.look,sp=gd\?gdSens\.pitch:\.0021\*settings\.look/.test(lab) && /rotation\.y-=mx\*sy\*zs/.test(lab));
  // (final review) the console's value goes into the game's live preferences object (the Settings panel saves it whole), so the next Settings change keeps it
  const live = { look: 1, fov: 78 }; G.bindSensPrefs(live); G.setSensitivity(3.1); const keptLook = live.look;
  ok('the console\'s sensitivity is written into the live preferences (lab.js settings, bound once): a later Settings save keeps it; the other modes\' look slider untouched', live.gdSens === 3.1 && keptLook === 1 && /const settings=gdBindSens\(loadPreferences\(\)\)/.test(lab));
  ok('Settings in Global Defensive: CS2\'s Sensitivity field only — the other modes\' look slider (which GD no longer reads) is not shown there', /\$\{gd \? '' : `<label>Mouse sensitivity<input data-set="look"/.test(readFileSync(new URL('../dist/campaign-ui.js', import.meta.url), 'utf8')));
  G.setSensitivity(G.SENS_DEFAULT); }
// ── 6. open-B#11: a non-reload first-person clip's sound at its own CS2 event's volume (not ×0.9) ──
ok('fp-sounds.js: in Global Defensive a draw / inspect / knife clip plays at its event\'s own volume e[2]; a reload\'s takes (reload and reload_empty) at their events\' level (gdClip); other modes ×0.9', /vol = Math\.min\(1\.4, e\[2\]\) \* \(gdOn\(\) && clip !== 'reload' && clip !== 'reloadempty' \? 1 : \.9\)/.test(src('fp-sounds.js')));
// ── 7. (final review) the empty reload is a reload: its levels, its silent window, no extra bolt, cut when broken off ──
{ const S = await import('../dist/gd-sounds.js').catch(e => (console.log('SKIP gd-sounds import: ' + e.message), null)), wsrc = src('weapons.js');
  if (S) ok('gd-sounds.js: reload_empty\'s takes get the reload levels and curves (reloadTake), inside the empty clip\'s own WPN_RELOAD_SILENT window (the Glock\'s 0–1.633 s, the reload\'s 0–1.733 s)', S.inReloadSilent('pistol', 1.68, true) === false && S.inReloadSilent('pistol', 1.68) === true && S.inReloadSilent('pistol', 1.6, true) === true && /re = clip === 'reloadempty', ev = clip === 'reload' \|\| re \? reloadTake/.test(src('gd-sounds.js')));
  ok('weapons.js: a reload from empty (CS2\'s reload_empty clip, its own slide sound) plays no extra bolt at its end, and its sounds stop when it is broken off', /own = chanKind === 'reload' \|\| chanKind === 'reloadempty'/.test(wsrc) && /if \(chanKind === 'reload' \|\| chanKind === 'reloadempty'\) \{ clipSnd\.stop\(\)/.test(wsrc)); }
ok('arena-ui.js CS_PRICE reads the CS2 table\'s prices (weapons-data weaponById(id).price): one source, no drift', /CS_PRICE = Object\.fromEntries\(\[[^\]]+\]\.map\(id => \[id, weaponById\(id\)\?\.price \?\? 0\]\)\)/.test(src('arena-ui.js')));
console.log(`PASS: gd-gun-feel · ${n} checks (view-model FOV: viewmodel_fov ${D.VM_FOV.h} → ${D.vmVfov().toFixed(1)}° vertical, empty-magazine clips, CS2 muzzle flash + shells in capped pools, ±89° pitch, CS2 sensitivity)`);
