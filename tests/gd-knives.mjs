// v53 KNIVES: CS2's Bayonet, Skeleton Knife, Talon Knife, Flip Knife and Nomad Knife beside the Default, Butterfly,
// Stiletto, M9 Bayonet and Karambit, everywhere a knife exists (dist/gd-knives.js is the one table):
//  1. the table: CS2's names, item classes, model folders and icon names; every knife list of the game and of the
//     importers (skins, first-person sets, holds, kill feed) reads it or names the same knives;
//  2. the rules: the host accepts each pick ('<name> equipped'), refuses an unknown one, keeps it in the room's save;
//     a pick is a look only — every chosen knife is the game's 'knife' (Darja's karambit aside), with the same damage
//     and timings (CS2: weapons.vdata gives every knife the same numbers — gd-knives.js);
//  3. the fallback: a computer without a knife's model draws the side's built-in knife, never another;
//  4. the LAN round trip through the real room: a guest's pick reaches the host and the other page, an unknown one is
//     refused with the host's reason, a restarted host has it back;
//  5. the CS2 files on this computer (skipped without them): each new knife's first-person set with CS2's clips (its
//     two inspects where CS2 has two, picked 2 : 1), its third-person model baked from it, its holds, its CS2
//     finishes (base maps, paint, icons), its kill-feed icon and its clip sounds.
//   node tests/gd-knives.mjs
import assert from 'node:assert/strict'; import { readFileSync, existsSync, mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';
let n = 0, skipped = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); console.log('PASS ' + name + (d ? ' · ' + d : '')); };
const K = await import('../dist/gd-knives.js'), { STAR_KNIVES, NEW_KNIVES, KNIFE_IDS, KNIFE_SKIN_IDS, knifeTitle } = K;
// ── 1. the table ──
const CS2 = { bayonet: ['Bayonet', 'weapon_bayonet', 'knife_bayonet', 'bayonet'], skeleton: ['Skeleton Knife', 'weapon_knife_skeleton', 'knife_skeleton', 'knife_skeleton'],
  talon: ['Talon Knife', 'weapon_knife_widowmaker', 'knife_talon', 'knife_widowmaker'], flip: ['Flip Knife', 'weapon_knife_flip', 'knife_flip', 'knife_flip'], nomad: ['Nomad Knife', 'weapon_knife_outdoor', 'knife_outdoor', 'knife_outdoor'] };
ok('the five new knives, with CS2\'s English names, item classes, model folders and equipment icons (csgo_english SFUI_WPNHUD_*, weapons.vdata m_szName, panorama/images/icons/equipment)',
  NEW_KNIVES.join() === 'bayonet,skeleton,talon,flip,nomad' && NEW_KNIVES.every(k => { const s = STAR_KNIVES[k], c = CS2[k]; return s.name === c[0] && s.cls === c[1] && s.dir === c[2] && s.icon === c[3]; }));
ok('ten picks in the M menu: the default, the four from before, the five new ones', KNIFE_IDS.join() === 'default,butterfly,stiletto,m9,karambit,bayonet,skeleton,talon,flip,nomad' && KNIFE_SKIN_IDS.length === 8 && !KNIFE_SKIN_IDS.includes('karambit'));
ok('CS2\'s star on every star knife\'s name, none on the default', knifeTitle('talon') === '★ Talon Knife' && knifeTitle('nomad') === '★ Nomad Knife' && knifeTitle('default') === null);
ok('two inspects where CS2 has lookat02 (the Skeleton, Talon, Nomad), one on the Bayonet and Flip', ['skeleton', 'talon', 'nomad'].every(k => STAR_KNIVES[k].inspects === 2) && ['bayonet', 'flip'].every(k => STAR_KNIVES[k].inspects === 1));
{ const S = await import('../dist/skins.js'), W = await import('../dist/weapon-models.js'), M = await import('../tools/cs2-skins/models.mjs'), MF = await import('../tools/cs2-skins/manifest.mjs');
  ok('the game\'s lists read the table: the room\'s save (skins.js KNIFE_IDS), the third-person models (weapon-models.js KNIFE_SKINS)', S.KNIFE_IDS === KNIFE_IDS && Object.keys(W.KNIFE_SKINS).join() === KNIFE_SKIN_IDS.join() && W.KNIFE_SKINS.talon === '★ Talon Knife');
  ok('the CS2 finishes importer knows each new knife by CS2\'s class and folder (tools/cs2-skins/models.mjs, manifest.mjs)', NEW_KNIVES.every(k => M.KNIVES[k]?.cls === STAR_KNIVES[k].cls && M.KNIVES[k].model === 'weapon_' + STAR_KNIVES[k].dir && M.KNIVES[k].composite.includes('/' + STAR_KNIVES[k].dir + '/')) && NEW_KNIVES.every(k => MF.KNIFE_MODELS.includes(k)));
  const kf = readFileSync(ROOT + 'tools/import-cs2-killfeed.mjs', 'utf8'), holds = readFileSync(ROOT + 'tools/export-cs2-holds.mjs', 'utf8'), fpx = readFileSync(ROOT + 'tools/cs2-fp/export_missing.py', 'utf8');
  ok('the kill-feed importer maps knife:<id> to the table\'s CS2 icon (bayonet, knife_skeleton, knife_widowmaker, knife_flip, knife_outdoor)', NEW_KNIVES.every(k => kf.includes(`'knife:${k}': '${STAR_KNIVES[k].icon}'`)));
  ok('the holds exporter and the first-person set exporter take each new knife\'s CS2 model', NEW_KNIVES.every(k => holds.includes(`${k}: 'knife/${STAR_KNIVES[k].dir}/weapon_${STAR_KNIVES[k].dir}'`) && fpx.includes(`'${k}': ('weapons/models/knife/${STAR_KNIVES[k].dir}/weapon_${STAR_KNIVES[k].dir}'`))); }
// ── 2. the rules ──
const { startArena, arenaApply } = await import('../dist/arena-logic.js'), { arenaArsenalOf } = await import('../dist/combat-logic.js'), WD = await import('../dist/weapons-data.js'), { cleanSkinSave, skinSave } = await import('../dist/skins.js');
{ const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, 1e9); const P = [{ name: 'Ann', pose: { x: 0, y: 9.7, z: 0, yaw: 0 } }, { name: 'Darja', pose: { x: 0, y: 9.7, z: 0, yaw: 0 } }];
  const says = KNIFE_IDS.map(k => arenaApply(g, { type: 'knife', knife: k }, 'Ann', P, 1e9 + 1) + '|' + g.arena.knives.ann);
  ok('the host accepts every pick and says so as CS2 names it', says.every((s, i) => s === (i ? STAR_KNIVES[KNIFE_IDS[i]].name : 'Default knife') + ' equipped|' + KNIFE_IDS[i]), says.slice(5).join(' · '));
  assert.throws(() => arenaApply(g, { type: 'knife', knife: 'knife_widowmaker' }, 'Ann', P, 1e9 + 2), /Unknown knife/); assert.throws(() => arenaApply(g, { type: 'knife', knife: 'gut' }, 'Ann', P, 1e9 + 2), /Unknown knife/); n++;
  ok('…and refuses a knife it does not offer (CS2\'s own class names included: the ids are the game\'s)', g.arena.knives.ann === 'nomad');
  arenaApply(g, { type: 'knife', knife: 'talon' }, 'Ann', P, 1e9 + 3);
  ok('a skin on a chosen knife is titled by it (★ Talon Knife | …)', /^★ Talon Knife \| /.test(arenaApply(g, { type: 'skin', weapon: 'knife', skin: { finish: 'fade' } }, 'Ann', P, 1e9 + 4)));
  { const S2 = await import('../dist/skins.js'), fileOf = { paint: 'x.jpg', mrw: 'x.png' };   // (v53 KNIVES final: a synthetic catalogue — CS2 makes Lore for the Bayonet, not the Talon)
    S2.setSkinCatalog({ knives: { cu_lore: { name: 'Lore', rarity: 'Covert', wear: [0, 1], fbId: 'none', models: { bayonet: fileOf, flip: fileOf } }, aa_fade: { name: 'Fade', rarity: 'Covert', wear: [0, .08], fbId: 'fade', models: { bayonet: fileOf, talon: fileOf } } } });
    let why = ''; try { arenaApply(g, { type: 'skin', weapon: 'knife', skin: { finish: 'cs2k:cu_lore' } }, 'Ann', P, 1e9 + 5); } catch (e) { why = e.message; }
    const fade = arenaApply(g, { type: 'skin', weapon: 'knife', skin: { finish: 'cs2k:aa_fade' } }, 'Ann', P, 1e9 + 6), sw = arenaApply(g, { type: 'knife', knife: 'skeleton' }, 'Ann', P, 1e9 + 7);
    ok('the host takes only the CS2 finishes CS2 makes for the knife carried: a Talon Lore refused with the reason, a Talon Fade taken, a switch to a knife without it said so', /^CS2 has no Lore for the Talon Knife$/.test(why) && /^★ Talon Knife \| Fade/.test(fade) && /CS2 has no Fade for it/.test(sw)
      && S2.knifeLacks('talon', 'cs2k:cu_lore') && !S2.knifeLacks('bayonet', 'cs2k:cu_lore') && !S2.knifeLacks('default', 'cs2k:cu_lore') && !S2.knifeLacks('talon', 'fade'), why + ' · ' + sw);
    S2.setSkinCatalog(null); delete g.arena.skins?.ann?.knife; arenaApply(g, { type: 'knife', knife: 'talon' }, 'Ann', P, 1e9 + 8); }
  const kOf = who => arenaArsenalOf(g, who).find(id => WD.weaponById(id)?.kind === 'knife'), slots = KNIFE_IDS.map(k => { g.arena.knives.ann = k; return kOf('Ann'); }), dar = KNIFE_IDS.map(k => { g.arena.knives.darja = k; return kOf('Darja'); }); delete g.arena.knives.darja; const dar0 = kOf('Darja');
  ok('a pick is only a look: every knife but the karambit is the game\'s \'knife\' in the knife slot (Darja too: her karambit only with none picked, or the karambit)', slots.every((s, i) => s === (KNIFE_IDS[i] === 'karambit' ? 'karambit' : 'knife')) && dar.every((s, i) => s === (KNIFE_IDS[i] === 'karambit' || KNIFE_IDS[i] === 'default' ? (KNIFE_IDS[i] === 'default' ? 'knife' : 'karambit') : 'knife')) && dar0 === 'karambit', slots.join(',') + ' / ' + dar.join(','));
  const kn = WD.weaponById('knife'), kb = WD.weaponById('karambit'), same = ['dmg', 'ap', 'rateMs', 'range', 'speed', 'reward', 'price'].every(f => kn[f] === kb[f]);
  ok('the same damage and timings for every knife (CS2: weapons.vdata — identical m_nDamage, m_flCycleTime, m_flDeployDuration, m_flMaxSpeed 250, m_nKillAward 1500 for all): one KNIFE table, the karambit\'s numbers the knife\'s', same && kn.speed === 250 && kn.reward === 1500
    && WD.KNIFE.light.front === 40 && WD.KNIFE.light.chain === 25 && WD.KNIFE.light.back === 90 && WD.KNIFE.heavy.front === 65 && WD.KNIFE.heavy.back === 180 && WD.KNIFE.light.rateMs === 400 && WD.KNIFE.heavy.rateMs === 1000, JSON.stringify(WD.KNIFE.light) + ' ' + JSON.stringify(WD.KNIFE.heavy));
  const save = cleanSkinSave(JSON.parse(JSON.stringify({ ...skinSave({ knives: { ann: 'talon', bo: 'skeleton', cy: 'flip', dee: 'bayonet', eve: 'nomad', fox: 'widowmaker' } }) })));
  ok('the room\'s save keeps the new knives and drops an unknown one', save.knives.ann === 'talon' && save.knives.bo === 'skeleton' && save.knives.cy === 'flip' && save.knives.dee === 'bayonet' && save.knives.eve === 'nomad' && !save.knives.fox && save.dropped === 1); }
// ── 3. the fallback ──
{ const W = await import('../dist/weapon-models.js'), drawn = NEW_KNIVES.map(k => W.knifeFor('knife', 'ct', k) + '/' + W.knifeFor('knife', 't', k) + '/' + W.knifeFor('knife', 'ct', k, true));
  ok('without its model a chosen knife is drawn as the side\'s built-in knife in third person; first person asks for its own set (the side\'s default serves until it is in)', drawn.every((d, i) => d === `knife/knife/${NEW_KNIVES[i]}`), drawn.join(' ')); }
// ── 4. the LAN round trip ──
{ const { startRoom } = await import('../lan/room.mjs'), { mergeGdFrame } = await import('../dist/multiplayer.js');
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'gdknives-')); mkdirSync(tmp + '/maps'); mkdirSync(tmp + '/assets');
  const opts = { port: 0, bind: '127.0.0.1', savePath: path.join(tmp, 's.json'), roomCode: 'KNIV01', hostKey: 'k', mapsDir: tmp + '/maps', assetsDir: tmp + '/assets', log: () => {}, error: () => {} };
  const wait = ms => new Promise(r => setTimeout(r, ms)), until = async (f, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await wait(25); } return !!f(); };
  const player = async (room, name, hostKey) => { const base = 'http://127.0.0.1:' + room.port, post = (route, body, token) => fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
    const j = (await post('join', { code: 'KNIV01', name, ...(hostKey ? { hostKey } : {}) })).body; if (!j.token) throw Error('join ' + JSON.stringify(j));
    const P = { token: j.token, revision: j.revision, game: j.world?.operations || null, ac: new AbortController() }, R = { combat: 0, arena: j.arev || 0, loadout: j.lrev || 0, match: null };
    fetch(base + '/api/events?token=' + P.token, { signal: P.ac.signal }).then(async r => { const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf('\n\n')) >= 0) { const msg = buf.slice(0, i); buf = buf.slice(i + 2); const type = /^event: (.*)$/m.exec(msg)?.[1], data = /^data: (.*)$/m.exec(msg)?.[1]; if (!data) continue; const d = JSON.parse(data);
          if (type === 'world' && d.revision > P.revision) { P.revision = d.revision; P.game = d.world.operations; R.arena = Math.max(R.arena, d.arev || 0); R.loadout = Math.max(R.loadout, d.lrev || 0); } else if (type === 'combat' && P.game) mergeGdFrame(P.game, d, R); } } }).catch(() => {});
    P.act = async a => { for (let i = 0; i < 25; i++) { const r = await post('action', { revision: P.revision, action: a }, P.token); if (r.status !== 409) { if (r.body.world && r.body.revision > P.revision) { P.revision = r.body.revision; P.game = r.body.world.operations; } else if (r.body.gd && P.game) mergeGdFrame(P.game, r.body.gd, R); return r; } P.revision = r.body.revision; } };
    return P; };
  let room = await startRoom(opts); const ann = await player(room, 'Ann', 'k'), bo = await player(room, 'Bo'); await wait(150);
  ok('the host starts a Global Defensive match', (await ann.act({ type: 'engineering', action: { type: 'mode', mode: 'arena', kind: 'defuse', map: 'dust2', bots: 0 } }))?.status === 200);
  const H = () => room.world.operations.game.arena; let seen = [];
  for (const k of NEW_KNIVES) { const r = await bo.act({ type: 'arena', action: { type: 'knife', knife: k } }); seen.push(r.status === 200 && H().knives?.bo === k && await until(() => ann.game?.arena?.knives?.bo === k)); }
  ok('each new knife a guest picks: accepted by the host and on the other player\'s page (the arena frame)', seen.every(Boolean), seen.join(','));
  const bad = await bo.act({ type: 'arena', action: { type: 'knife', knife: 'knife_outdoor' } });
  ok('an unknown knife from a guest: refused with the host\'s reason, the pick kept', bad.status === 400 && /Unknown knife/.test(JSON.stringify(bad.body)) && H().knives.bo === 'nomad', bad.status + ' ' + JSON.stringify(bad.body).slice(0, 80));
  await bo.act({ type: 'arena', action: { type: 'knife', knife: 'talon' } }); ann.ac.abort(); bo.ac.abort(); await wait(60); await room.close();
  room = await startRoom(opts); const a2 = await player(room, 'Ann', 'k'); await a2.act({ type: 'engineering', action: { type: 'mode', mode: 'arena', kind: 'dm', map: 'yard', bots: 0 } });
  ok('a restarted host has the guest\'s Talon back (gd-skins.json)', room.world.operations.game.arena.knives?.bo === 'talon', JSON.stringify(room.world.operations.game.arena.knives));
  a2.ac.abort(); await room.close(); }
// ── 5. the CS2 files on this computer ──
const UA = ROOT + 'user-assets/', man = existsSync(UA + 'manifest.json') ? JSON.parse(readFileSync(UA + 'manifest.json', 'utf8')) : null;
if (!man?.models?.viewmodels?.cs2_bayonet) { skipped++; console.log('SKIP: the CS2 files part (no new knife sets on this computer: tools/cs2-fp/export_missing.py bayonet skeleton talon flip nomad --install)'); }
else {
  globalThis.self ??= globalThis; globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
  globalThis.document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }), createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }), getElementById: () => null };
  { const w = console.warn; console.warn = (...a) => { if (!/PropertyBinding/.test(String(a[0]))) w(...a); }; }
  const THREE = await import('../dist/three.module.js'), { gltfLoader } = await import('../dist/gltf-loader.js'), F = await import('../dist/fp-view.js'), W = await import('../dist/weapon-models.js');
  const parse = f => { const b = readFileSync(f); return new Promise((res, rej) => gltfLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)); };
  const VM = man.models.viewmodels, rows = [];
  // (v53 KNIVES final: CS2's knife graph's clips — export_missing.py WANT: the rare draw where a draw2 is the usual one, both
  // light swings, the light hits and backstabs, the heavy hit and backstab, lookat02, lookat01_draw on the Bayonet / Flip)
  const RARE = ['skeleton', 'nomad'], IDRAW = ['bayonet', 'flip'];
  for (const k of NEW_KNIVES) { const v = VM['cs2_' + k], want = ['idle', 'draw', ...(RARE.includes(k) ? ['drawrare'] : []), 'light', 'light2', 'lighthit', 'lighthit2', 'backstab', 'backstab2', 'heavy', 'heavyhit', 'heavystab', 'inspect', ...(STAR_KNIVES[k].inspects === 2 ? ['inspect2'] : []), ...(IDRAW.includes(k) ? ['inspectdraw'] : [])];
    const g = existsSync(UA + v.file) ? await parse(UA + v.file) : null, names = g ? g.animations.map(a => a.name) : [];
    rows.push([k, !!g && want.every(c => names.includes(c)) && v.clips?.join() === want.join() && (STAR_KNIVES[k].inspects === 2 || !names.includes('inspect2')), names.join('/')]); }
  ok('every new knife has its first-person set with CS2\'s own clips: idle, draw (and the rare one), both light swings, light hit and backstab ×2, heavy, its hit and backstab, inspect (and lookat02, lookat01_draw where CS2 has them)', rows.every(r => r[1]), rows.map(r => r[0] + ' ' + r[2]).join(' · '));
  const tp = [], mask = [], insp = [], draws = [], swings = [], idraw = [], rnd = Math.random;
  for (const k of NEW_KNIVES) { const set = F.buildAuthored(await parse(UA + VM['cs2_' + k].file), null, k);
    const m = W.hasReal(k) ? W.weaponModel(k, 1) : null, mesh = m?.children[0], P = mesh?.geometry.attributes.position, C = mesh?.geometry.attributes.color;
    if (m) { const box = new THREE.Box3().setFromBufferAttribute(P), sz = box.getSize(new THREE.Vector3()); let zb = 0, nb = 0, zh = 0, nh = 0, ns = 0; for (let i = 0; i < P.count; i++) { if (C.getY(i) - C.getX(i) > .3) ns++; if (C.getX(i) > .3) { zb += P.getZ(i); nb++; } else { zh += P.getZ(i); nh++; } }
      tp.push([k, zb / nb < 0 && zh / nh > zb / nb && sz.z * 16.5 > 15 && sz.z * 16.5 < 40, (sz.z * 16.5).toFixed(0) + ' cm']); mask.push([k, nb / P.count, ns / P.count]); } else tp.push([k, false, 'no model']);
    // CS2's draw choice (weights [1, 8] over draw / draw2): Math.random stubbed low and high
    const dp = []; for (const r of [.05, .5, .95]) { Math.random = () => r; dp.push(set.drawPick()); } Math.random = rnd; const dur = n => (set.root.animations || []).find?.(a => a.name === n)?.duration;
    draws.push([k, dp.join('/')]);
    // the swing's clip: each of CS2's is there and plays as itself
    swings.push([k, ['light', 'light2', 'lighthit', 'lighthit2', 'backstab', 'backstab2', 'heavy', 'heavyhit', 'heavystab'].every(c => set.swing(c) === c)]); set.hold(k, { draw: false }); set.update(0);
    // inspecting while drawing: lookat01_draw on the Bayonet and the Flip, nowhere else
    set.hold(k, { draw: true }); set.update(0); idraw.push([k, set.canInspectDraw() ? (set.inspect(), set.inspectClip) : 'no']); set.hold(k, { draw: false });
    // CS2's choice between lookat01 and lookat02 (option weights [2, 1]): Math.random stubbed over a third each
    const pick = []; for (const r of [.1, .5, .9]) { Math.random = () => r; set.hold(k, { draw: false }); set.update(0); set.inspect(); pick.push(set.inspectClip); set.hold(k, { draw: false }); } Math.random = rnd; insp.push([k, pick.join('/')]); }
  ok('every new knife is baked for third person from its set (other players, spectators and the death cam see it): blade along −z, handle behind it, 15–40 cm', tp.every(r => r[1]), tp.map(r => r[0] + ' ' + r[2]).join(' · '));
  ok('each one\'s blade mask is CS2\'s own paint coverage (composite masks: the handle CS2 leaves bare stays black under a built-in finish): some blade, some handle', mask.length === 5 && mask.every(([, s]) => s > .05 && s < .95), mask.map(([k, s]) => k + ' ' + (s * 100).toFixed(0) + '%').join(' · '));
  ok('(final) the bare steel CS2 leaves unpainted outside its handle (masks green: the handle) is marked apart — the Bayonet\'s crossguard, ring and pommel, the Talon\'s ring — so only the handle goes black', mask.find(r => r[0] === 'bayonet')?.[2] > .02 && mask.find(r => r[0] === 'talon')?.[2] > .01, mask.map(([k, , s]) => k + ' steel ' + (s * 100).toFixed(0) + '%').join(' · '));
  ok('(final) the draw as CS2 picks it: the Skeleton\'s and Nomad\'s rare draw 1 time in 9 (draw2 the usual one), the others their one draw', draws.every(([k, d]) => d === (RARE.includes(k) ? 'drawrare/draw/draw' : 'draw/draw/draw')), draws.map(r => r.join(' ')).join(' · '));
  ok('(final) every swing plays its own CS2 clip (miss ×2, hit ×2, backstab ×2, heavy miss / hit / backstab)', swings.every(r => r[1]));
  ok('(final) inspecting while drawing plays CS2\'s lookat01_draw on the Bayonet and the Flip (the draw\'s WPN_INSPECT_USE_DRAW_VERSION window), on no other', idraw.every(([k, c]) => c === (IDRAW.includes(k) ? 'inspectdraw' : 'no')), idraw.map(r => r.join(' ')).join(' · '));
  { const old = VM.cs2_butterfly && existsSync(UA + VM.cs2_butterfly.file) ? F.buildAuthored(await parse(UA + VM.cs2_butterfly.file), null, 'butterfly') : null;
    ok('(final) a set made before v53 (the Butterfly: light and heavy only) falls back to them — the second swing, a hit, a backstab play its light / heavy as before', !old || ['light2', 'lighthit', 'backstab2'].every(c => old.swing(c) === 'light') && ['heavyhit', 'heavystab'].every(c => old.swing(c) === 'heavy'), old ? 'butterfly' : 'no butterfly set'); }
  ok('(final) other modes load only the sets they loaded before v53: the five new knives\' sets wait for Global Defensive (fp-view.js gdOnlySet)', NEW_KNIVES.every(F.gdOnlySet) && !['knife', 'knife-t', 'butterfly', 'karambit', 'm9', 'stiletto', 'ak', 'usps'].some(F.gdOnlySet));
  ok('inspect: lookat01 twice as often as lookat02 on the Skeleton, Talon and Nomad (CS2\'s weights 2 : 1), lookat01 alone on the Bayonet and Flip', insp.every(([k, p]) => p === (STAR_KNIVES[k].inspects === 2 ? 'inspect/inspect/inspect2' : 'inspect/inspect/inspect')), insp.map(r => r.join(' ')).join(' · '));
  const HJ = existsSync(UA + 'holds/holds.json') ? JSON.parse(readFileSync(UA + 'holds/holds.json', 'utf8')) : null, HC = existsSync(UA + 'holds/holds-clips.json') ? JSON.parse(readFileSync(UA + 'holds/holds-clips.json', 'utf8')) : null, cn = new Set((HC?.clips || []).map(c => c.name));
  ok('every new knife has CS2\'s third-person hold: its world model in its weapon bone frame and its own idle, standing and crouched (tools/export-cs2-holds.mjs)', NEW_KNIVES.every(k => HJ?.items?.[k]?.kind === 'knife' && HJ.items[k].hands && cn.has(k + '/hold') && cn.has(k + '/hold_crouch')));
  const SK = existsSync(UA + 'skins/skins.json') ? JSON.parse(readFileSync(UA + 'skins/skins.json', 'utf8')) : null, fam = k => Object.entries(SK?.knives || {}).filter(([, f]) => f.models?.[k]);
  const core = ['aa_fade', 'am_doppler_phase1', 'am_doppler_phase2', 'am_doppler_phase3', 'am_doppler_phase4', 'am_ruby_marbleized', 'am_sapphire_marbleized', 'am_blackpearl_marbleized', 'am_marble_fade', 'an_tiger_orange', 'aq_oiled', 'hy_webs', 'am_zebra', 'aq_damascus', 'aq_blued', 'aq_forced', 'hy_forest_boreal', 'so_purple', 'hy_ddpat', 'aq_steel_knife'];
  const fins = NEW_KNIVES.map(k => { const f = fam(k), keys = new Set(f.map(([id]) => id)), files = f.every(([, x]) => existsSync(UA + 'skins/' + x.models[k].paint) && existsSync(UA + 'skins/' + x.models[k].mrw)), icons = f.filter(([, x]) => x.icon?.[k] && existsSync(UA + 'skins/' + x.icon[k])).length;
    return [k, f.length, core.every(c => keys.has(c)) && files && icons === f.length && !!SK.base?.[k] && existsSync(UA + 'skins/' + SK.base[k].color) && existsSync(UA + 'skins/' + SK.base[k].orm) && (!['bayonet', 'flip'].includes(k) || ['cu_lore', 'gs_autotronic', 'so_night', 'am_gamma_doppler_phase1', 'am_emerald_marbleized'].every(c => keys.has(c))), icons]; });
  ok('every new knife has CS2\'s finishes baked (Fade, Doppler phases and gems, Marble Fade, Tiger Tooth, Case Hardened, Crimson Web, Slaughter, Damascus, Blue Steel…; Lore, Autotronic, Night and Gamma Doppler on the Bayonet and Flip, as CS2 has them), their CS2 icons and its CS2 base maps', fins.every(r => r[2] && r[1] >= 20), fins.map(r => r[0] + ' ' + r[1] + ' finishes, ' + r[3] + ' icons').join(' · '));
  const KF = existsSync(UA + 'icons/killfeed/killfeed.json') ? JSON.parse(readFileSync(UA + 'icons/killfeed/killfeed.json', 'utf8')) : null;
  ok('every new knife has its CS2 kill-feed icon (the killer\'s pick: knife:<id>)', NEW_KNIVES.every(k => KF?.weapons?.['knife:' + k] === STAR_KNIVES[k].icon && existsSync(UA + 'icons/killfeed/' + STAR_KNIVES[k].icon + '.svg')));
  const FS = man.models.fpSounds || {}, snd = man.models.sounds || {};
  ok('every new knife has CS2\'s own clip sounds (draw, swings, inspect: its clips\' sound events, tools/cs2-fp/fp_sounds_add.py), their files there', NEW_KNIVES.every(k => ['draw', 'light', 'heavy', 'inspect'].every(c => FS[k]?.[c]?.ev?.length) && Object.values(FS[k]).every(c => c.ev.every(e => e[1].every(s => snd[s] && existsSync(UA + snd[s].file))))), NEW_KNIVES.map(k => k + ' ' + Object.keys(FS[k] || {}).join('/')).join(' · '));
  // (v53 KNIVES final) the pack's own file list (tools/asset-pack-files.mjs, what import-cs2-models.mjs packs and copies)
  const { packFiles } = await import('../tools/asset-pack-files.mjs'), PK = new Set(packFiles(UA.slice(0, -1)).map(f => path.relative(UA, f).split(path.sep).join('/')));
  const need = [...NEW_KNIVES.map(k => VM['cs2_' + k].file), 'holds/holds.json', 'holds/holds-clips.json', 'icons/killfeed/killfeed.json', ...NEW_KNIVES.map(k => 'icons/killfeed/' + STAR_KNIVES[k].icon + '.svg'),
    ...new Set(NEW_KNIVES.flatMap(k => Object.values(FS[k] || {}).flatMap(c => c.ev.flatMap(e => e[1]))).map(nm => snd[nm]?.file).filter(Boolean))], miss = need.filter(f => !PK.has(f)), bak = [...PK].filter(f => /\.bak-/.test(f));
  ok('the asset pack takes them — its file list has every new set, the holds, the kill-feed icons and every clip sound they play — and none of the importers\' *.bak-* back-ups', !miss.length && !bak.length && need.length > 60, need.length + ' files · missing ' + miss.slice(0, 3).join(',') + ' · backups packed ' + bak.slice(0, 3).join(','));
}
console.log(`PASS: knives · ${n} checks${skipped ? ' (CS2 files part skipped)' : ''}`); process.exit(0);
