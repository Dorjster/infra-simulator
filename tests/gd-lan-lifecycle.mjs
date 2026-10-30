// Global Defensive match lifecycle and LAN transport through the real room (in-process, built-in maps, plain-HTTP players
// that apply frames as multiplayer.js does — newest arena by arev, loadouts by lrev, combat by rev):
//  · what the host's tick does reaches everyone unasked: the lobby running out, a Defuse match over → the next match on
//    the same map (clean: no gun, armor, grenade or kill kept), the host's next map, a Deathmatch over → its rematch with
//    the host's settings;
//  · readiness: a player still loading a new map is not in the match (not counted, no spawn) until it says it has it;
//  · request budgets: a player's own poses + a spray's hits + a quick buy in one second are never refused; other routes
//    keep their limit; a wrong passcode never frees a quiet player's seat;
//  · late join and reconnect get the match as it is; game files are revalidated (304), not re-sent;
//  · the host's computer asleep: the match resumes where it stood, nobody dropped.
//   node tests/gd-lan-lifecycle.mjs
import assert from 'node:assert/strict'; import os from 'node:os'; import path from 'node:path'; import { mkdtempSync, mkdirSync } from 'node:fs';
import { startRoom } from '../lan/room.mjs'; import { mergeGdFrame } from '../dist/multiplayer.js'; import { NET_PROTOCOL } from '../dist/arena-logic.js';
import { DEFUSE } from '../dist/arena-defuse.js';
import { ARENA_MAPS } from '../dist/arena-maps.js'; import { ARENA } from '../dist/facility-layout.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const realNow = Date.now; let skew = 0; Date.now = () => realNow() + skew;   // (the host's clock, to make it jump as after a sleep)
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gdlc-')); mkdirSync(tmp + '/maps'); mkdirSync(tmp + '/assets');
const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(tmp, 's.json'), roomCode: 'LIFE01', hostKey: 'k', mapsDir: tmp + '/maps', assetsDir: tmp + '/assets', log: () => {}, error: () => {} });
const base = 'http://127.0.0.1:' + room.port, wait = ms => new Promise(r => setTimeout(r, ms)), g = () => room.world.operations.game;
const post = (route, body, token) => fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const until = async (f, ms = 3000) => { const t0 = realNow(); while (realNow() - t0 < ms) { if (f()) return true; await wait(25); } return !!f(); };
// A player: its stream applied as the page does.
async function player(name, hostKey) {
  const j = (await post('join', { code: 'LIFE01', name, ...(hostKey ? { hostKey } : {}) })).body; if (!j.token) throw Error('join: ' + JSON.stringify(j));
  const P = { name: j.name, id: j.id, token: j.token, revision: j.revision, game: j.world?.operations || null, roster: j.players, frames: [], ac: new AbortController() };
  // (the page's own rule — multiplayer.js mergeGdFrame — with its revisions: P.arev, P.lrev, P.rev)
  const R = { combat: 0, arena: j.arev || 0, loadout: j.lrev || 0, match: null }; for (const [k, f] of [['arev', 'arena'], ['lrev', 'loadout'], ['rev', 'combat']]) Object.defineProperty(P, k, { get: () => R[f], set: v => { R[f] = v; } });
  const gd = c => { mergeGdFrame(P.game, c, R); };
  P.apply = gd;
  P.open = () => { P.ac = new AbortController(); fetch(base + '/api/events?token=' + P.token, { signal: P.ac.signal }).then(async r => { const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) { const msg = buf.slice(0, i); buf = buf.slice(i + 2); const type = /^event: (.*)$/m.exec(msg)?.[1], data = /^data: (.*)$/m.exec(msg)?.[1]; if (!data) continue;
        const d = JSON.parse(data); P.frames.push({ type, bytes: data.length, at: realNow(), arena: !!d.arena, arev: d.arev });
        if (type === 'world' && d.revision > P.revision) { P.revision = d.revision; P.game = d.world.operations; P.arev = Math.max(P.arev, d.arev || 0); P.lrev = Math.max(P.lrev, d.lrev || 0); }
        else if (type === 'combat') gd(d); else if (type === 'players') P.roster = d; } } }).catch(() => {}); };
  P.open(); P.act = async a => { const r = await post('action', { revision: P.revision, action: a }, P.token); if (r.body.gd) gd(r.body.gd); if (r.body.world && r.body.revision > P.revision) { P.revision = r.body.revision; P.game = r.body.world.operations; } return r; };
  P.arena = a => P.act({ type: 'arena', action: a });
  return P;
}
const spot = (team, i, id = g().arena.map) => { const M = ARENA_MAPS[id], s = (team === 'ct' ? M.ct : M.t)[i]; return { x: ARENA.cx + s[0], y: 9.7 + (M.nav?.floorAt(s[0], s[1]) || 0), z: ARENA.cz + s[1], yaw: 0, active: true }; };
const ann = await player('Ann', 'k'), bo = await player('Bo'); await wait(200);
{ const info = await (await fetch(base + '/api/room')).json(), j = (await post('join', { code: 'LIFE01', name: 'Vee' })).body; await post('leave', {}, j.token);
  ok('the room and its join reply name the GD protocol (a page of another version is told to reload before it joins)', info.gd === NET_PROTOCOL && j.gd === NET_PROTOCOL, JSON.stringify([info.gd, j.gd])); }
let posing = true; const where = { ann: null, bo: null };   // each stands at its spawn order, 10 poses a second
(async () => { while (posing) { for (const P of [ann, bo]) { const k = P.name.toLowerCase(), so = g().combat?.spawnTo?.[k]; if (so && so.at !== P.spawnAt) { P.spawnAt = so.at; where[k] = { x: so.x, y: (so.y ?? 0) + 9.7, z: so.z, yaw: 0, active: true }; } if (where[k] && g().mode === 'arena') await post('pose', { pose: where[k] }, P.token); } await wait(100); } })();

// ── The lobby runs out on the host's tick: everyone is told (the lobby panel goes, round 1 starts) ──
let r = await ann.act({ type: 'engineering', action: { type: 'mode', mode: 'arena', kind: 'defuse', map: 'dust2', bots: 2, difficulty: 'hard', lobby: true, warmup: 2, freeze: 3 } });
ok('the host starts Defuse with a 2 s lobby', r.status === 200 && g().arena.lobby && !g().arena.lobby.started, JSON.stringify(r.body).slice(0, 160));
where.ann = spot('t', 0); where.bo = spot('ct', 0); await wait(300); Object.assign(g().combat.d.teams, { ann: 't', bo: 'ct' });
ok('…Bo sees the lobby', await until(() => bo.game?.arena?.lobby && !bo.game.arena.lobby.started));
ok('the lobby runs out on the host tick → Bo is told at once (lobby over, a new match id, round 1)', await until(() => bo.game.arena.lobby?.started === true && bo.game.arena.match === g().arena.match && bo.game.combat?.d?.n === 1, 4000), JSON.stringify(bo.game.arena.lobby));

// ── A match played to its end → the next match on the same map, clean for everyone ──
await until(() => g().combat.d.round.phase === 'freeze'); g().combat.d.money.ann = 16000; const rid = () => g().combat.d.round.id;
for (const a of [{ type: 'buy', primary: 'ak' }, { type: 'buy-armor', kind: 'helmet' }, { type: 'buy-nade', kind: 'smoke' }, { type: 'buy-nade', kind: 'he' }]) { r = await ann.arena({ ...a, round: rid() }); ok('Ann buys ' + (a.primary || a.kind), r.status === 200, JSON.stringify(r.body).slice(0, 160)); }
ok('Bo sees Ann’s loadout (a GD frame, no world snapshot)', await until(() => bo.game.arena.loadout?.ann?.primary === 'ak' && bo.game.arena.loadout.ann.nades.length === 2));
const m1 = g().arena.match, d1 = g().combat.d; d1.score.t = d1.rules.win - 1; d1.round.freezeUntil = Date.now(); await wait(150); d1.round.phase = 'planted'; d1.round.planted = { x: 0, z: 0, y: 0, site: 'A', at: Date.now(), explodeAt: Date.now(), by: 'ann' }; await until(() => !!d1.matchOver);
ok('the match is over (T reach the win), on Bo’s screen too', !!d1.matchOver && await until(() => bo.game.combat.d?.matchOver?.winner === 't'), JSON.stringify(d1.score));
d1.matchOver.at -= DEFUSE.matchOverMs + 10;
ok('→ the next match starts by itself and Bo is told: new match id, round 1', await until(() => g().arena.match !== m1 && bo.game.arena.match === g().arena.match && bo.game.combat.d?.n === 1, 3000), JSON.stringify([m1, g().arena.match, bo.game.arena.match]));
ok('…clean on the host: Ann has no rifle, grenades or armor; kills gone; $800', !g().arena.loadout.ann?.primary && !(g().arena.loadout.ann?.nades || []).length && !g().combat.armor?.ann && !Object.keys(g().combat.kills).length && g().combat.d.money.ann === 800, JSON.stringify([g().arena.loadout.ann, g().combat.armor?.ann, g().combat.d.money.ann]));
ok('…and on Bo’s screen (what his client applied)', !bo.game.arena.loadout.ann?.primary && !(bo.game.arena.loadout.ann?.nades || []).length && !bo.game.combat.armor?.ann && bo.game.combat.d.money.ann === 800, JSON.stringify(bo.game.arena.loadout.ann));
ok('…host settings kept (bots, difficulty, freeze)', g().arena.bots.length === 2 && g().arena.difficulty === 'hard' && g().arena.freezeMs === 3000);
r = await ann.arena({ type: 'buy-nade', kind: 'flash', match: m1, round: rid() }); ok('a buy from the match before is refused', r.status !== 200 && /match has ended/.test(r.body.error), JSON.stringify(r.body));

// ── Readiness: the host changes the map; Bo is still loading it ──
r = await post('arena-ready', { map: 'dust2', hash: 'f00d', size: 1234 }, bo.token);
ok('a copy of the map that is not the host’s (a file, where the host plays the built-in one) is refused before spawning: fetch again', r.status === 409 && r.body.refetch === true && bo.roster && await until(() => bo.roster.find(p => p.name === 'Bo')?.loading === true), JSON.stringify(r.body));
r = await post('arena-ready', { map: 'dust2' }, bo.token); ok('Bo says it has Dust II', r.status === 200 && await until(() => !bo.roster.find(p => p.name === 'Bo')?.loading), JSON.stringify(r.body));
r = await post('arena-ready', { map: 'nuke' }, ann.token); ok('a client naming another map is told which one the host is on', r.status === 409 && r.body.map === 'dust2', JSON.stringify(r.body)); await post('arena-ready', { map: 'dust2' }, ann.token);
r = await ann.arena({ type: 'change-map', map: 'mirage' }); ok('the host changes the map to Mirage', r.status === 200 && g().arena.map === 'mirage', JSON.stringify(r.body).slice(0, 120));
ok('…Bo is told (arena on the next frame)', await until(() => bo.game.arena.map === 'mirage'));
await wait(300); const R = await (await fetch(base + '/api/room')).json();
ok('with a host in the room, this computer\'s pages still get the LAN addresses (the GD lobby shows them) — never the host key or code', Array.isArray(R.addresses) && Number.isFinite(R.securePort) && !R.hostKey && !R.roomCode, JSON.stringify(R).slice(0, 200));
ok('Bo (still on Dust II) is `loading`: not in the round, no spawn order, not counted', bo.roster.find(p => p.name === 'Bo')?.loading === true && !g().combat.d.round.here.bo && !g().combat.spawnTo.bo, JSON.stringify({ here: g().combat.d.round.here, sp: g().combat.spawnTo.bo, R: R.players }));
r = await post('combat', { action: { type: 'hit', target: bo.id, weapon: 'pistol', zone: 'head', n: 9001, match: g().arena.match, round: rid() } }, ann.token);
ok('…and can’t be shot at its old-map spot', r.status === 400 && /round hasn|Not in the match/.test(r.body.error), JSON.stringify(r.body));
where.ann = spot('t', 0); await post('arena-ready', { map: 'mirage' }, ann.token); r = await post('arena-ready', { map: 'mirage' }, bo.token);
ok('Bo has loaded Mirage (in the freeze): in the match with a spot of its own on its side', r.status === 200 && await until(() => !!g().combat.spawnTo.bo && g().combat.d.round.here.bo && !bo.roster.find(p => p.name === 'Bo')?.loading), JSON.stringify(g().combat.spawnTo.bo));

// ── Deathmatch: the clock runs out (host tick) → MATCH OVER for everyone → its rematch with the host's settings ──
r = await ann.arena({ type: 'change-map', map: 'yard' }); await post('arena-ready', { map: 'yard' }, ann.token); await post('arena-ready', { map: 'yard' }, bo.token);
ok('Deathmatch on Yard (hard bots kept)', r.status === 200 && g().arena.kind === 'dm' && g().arena.difficulty === 'hard', JSON.stringify(r.body).slice(0, 100));
r = await ann.arena({ type: 'loadout', primary: 'ak', secondary: 'deagle' }); await until(() => bo.game.arena.loadout?.ann?.primary === 'ak');
const s2 = g().arena.startedAt; g().arena.endsAt = Date.now(); ok('the clock runs out → Bo sees MATCH OVER', await until(() => !!bo.game.arena.over));
g().arena.over.at -= 12001; ok('→ the rematch reaches Bo: a new start, no guns kept, the host’s difficulty and bots', await until(() => bo.game.arena.startedAt !== s2 && bo.game.arena.startedAt === g().arena.startedAt) && !bo.game.arena.loadout?.ann?.primary && g().arena.difficulty === 'hard' && g().arena.bots.length === 2, JSON.stringify([g().arena.difficulty, bo.game.arena.loadout?.ann]));

// ── Request budgets: a fighting player's own traffic is never refused; other routes keep their limit ──
{ const codes = { pose: {}, combat: {}, action: {} }, bump = (k, s) => codes[k][s] = (codes[k][s] || 0) + 1, t0 = realNow(); let i = 0, shot = 20000; const jobs = [];
  while (realNow() - t0 < 2000) { const k = i++;
    jobs.push(post('pose', { pose: { ...(where.ann || spot('t', 0)), ct: k } }, ann.token).then(x => bump('pose', x.status)));
    if (k % 2 === 0) jobs.push(post('combat', { action: { type: 'hit', target: 'bot-0', weapon: 'ak', zone: 'chest', n: shot++ } }, ann.token).then(x => bump('combat', x.status)));
    if (k % 6 === 0) jobs.push(ann.arena({ type: 'loadout', primary: 'm4' }).then(x => bump('action', x.status)));
    await wait(33); }
  await Promise.all(jobs); const refused = Object.values(codes).reduce((s, c) => s + (c[429] || 0), 0);
  ok('30 poses + 15 hits + 5 buys a second for 2 s: none refused for rate', refused === 0, JSON.stringify(codes)); }
{ const rs = await Promise.all(Array.from({ length: 60 }, () => post('role', { role: 'field' }, bo.token))); ok('…while 60 other requests at once still meet the limit', rs.some(x => x.status === 429), JSON.stringify(rs.map(x => x.status).filter(s => s !== 200).length)); }

// ── A wrong passcode never frees a quiet player's seat ──
{ const cy = (await post('join', { code: 'LIFE01', name: 'Cy' })).body; await wait(3300);
  r = await post('join', { code: 'WRONG', name: 'Cy' }); const still = await fetch(base + '/api/players-check?token=' + cy.token);
  ok('Cy quiet 3 s; someone joins as “Cy” with a wrong passcode → refused, and Cy keeps the seat', r.status === 403 && still.status === 200, JSON.stringify([r.status, still.status]));
  await post('leave', {}, cy.token); }

// ── Late join and reconnect: the match as it is ──
{ const dee = await player('Dee'); await wait(300); ok('a late joiner gets the current match (arena, match id) at once', dee.game.arena.match === g().arena.match && dee.game.arena.map === g().arena.map && dee.arev > 0, JSON.stringify([dee.game.arena.match, g().arena.match]));
  bo.ac.abort(); await wait(100); const a0 = bo.arev; r = await ann.arena({ type: 'knife', knife: 'stiletto' }); bo.open();   // (a change any time, dead or alive: Ann's knife)
  ok('a reconnecting stream gets the match as it is now (what it missed included)', r.status === 200 && await until(() => bo.arev > a0 && bo.game.arena.knives?.ann === 'stiletto'), JSON.stringify([r.status, a0, bo.arev, bo.game.arena.knives]));
  await post('leave', {}, dee.token); dee.ac.abort(); }

// ── Game files: revalidated, not re-sent ──
{ const a = await fetch(base + '/arena-logic.js'), tag = a.headers.get('etag'); await a.arrayBuffer(); const b = await fetch(base + '/arena-logic.js', { headers: { 'If-None-Match': tag } });
  ok('a game file comes with a validator (no-cache + ETag) and is answered 304 when unchanged', a.status === 200 && !!tag && /no-cache/.test(a.headers.get('cache-control')) && b.status === 304, JSON.stringify([a.status, tag, a.headers.get('cache-control'), b.status])); }

// ── The host's computer sleeps for a minute ──
{ const d = g().combat.d; await ann.arena({ type: 'change-map', map: 'dust2' }); await post('arena-ready', { map: 'dust2' }, ann.token); await post('arena-ready', { map: 'dust2' }, bo.token); await wait(300);
  const rd = g().combat.d.round, f0 = rd.freezeUntil, sp0 = g().combat.spawnTo.ann?.at; skew += 60000; await wait(400);
  ok('asleep 60 s: on waking the round’s clock moved on by the gap (still its freeze), spawn orders untouched', g().combat.d.round === rd && rd.phase === 'freeze' && rd.freezeUntil - f0 > 59000 && g().combat.spawnTo.ann?.at === sp0, JSON.stringify({ phase: rd.phase, shifted: rd.freezeUntil - f0 }));
  const people = (await (await fetch(base + '/api/room')).json()).players; ok('…and nobody was dropped for being quiet while the host slept', people === 2, people); }

// ── A Wi-Fi stall: Eve reads nothing and says nothing for 4 s (11 bots running about), then reads again. The host stops
// queueing positions and combat states for her once she has said nothing for over a second, so on resuming she wades
// through about a second of stale data (plus what the sockets held) before the current state — not the whole stall ──
{ await ann.arena({ type: 'change-map', map: 'yard' }); await ann.arena({ type: 'settings', bots: 11 }); const eve = (await post('join', { code: 'LIFE01', name: 'Eve' })).body; let seen = 0, bytes = 0, before = 0, stalled = false, resumedAt = 0, fresh = null, buf = '';
  const { default: http } = await import('node:http'); const req = http.get(base + '/api/events?token=' + eve.token, res => { res.setEncoding('utf8'); res.on('data', c => { bytes += Buffer.byteLength(c); buf += c; let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const msg = buf.slice(0, i); buf = buf.slice(i + 2); const type = /^event: (.*)$/m.exec(msg)?.[1], data = /^data: (.*)$/m.exec(msg)?.[1]; if (!data) continue; if (['players', 'combat', 'world'].includes(type)) seen += data.length;
      if (resumedAt && fresh === null && type === 'combat') { const d = JSON.parse(data); if ((d.sent || d.clock) >= Date.now() - (realNow() - resumedAt) - 150) fresh = { kb: Math.round((bytes - before) / 1024), ms: realNow() - resumedAt }; } } });
    setTimeout(() => { res.pause(); stalled = true; setTimeout(() => { before = bytes; resumedAt = realNow(); stalled = false; res.resume(); }, 4000); }, 1200); });
  const t0 = realNow(); while (realNow() - t0 < 8000 && !(fresh && realNow() - resumedAt > 300)) { if (!stalled) await post('pose', { pose: { x: ARENA.cx - 20, y: 9.7, z: ARENA.cz, yaw: 0, active: true } }, eve.token).catch(() => {}); await fetch(base + '/api/seen', { method: 'POST', headers: { 'X-Player-Token': eve.token, ...(stalled ? {} : { 'X-Gd-Seen': String(seen) }) } }).catch(() => {}); await post('pose', { pose: { ...(where.ann || spot('t', 0)), yaw: Math.random() } }, ann.token); await wait(40); }
  ok('after a 4 s stall, the current combat state arrives behind at most ~1 s of stale frames (< 450 KB), not the whole stall', !!fresh && fresh.kb < 450, JSON.stringify(fresh)); console.log('  stall: ' + fresh.kb + ' KB of older frames before the current state (' + fresh.ms + ' ms)');
  req.destroy(); await post('leave', {}, eve.token); }

posing = false; ann.ac.abort(); bo.ac.abort(); await room.close(); Date.now = realNow;
console.log('PASS: GD lifecycle through the room · ' + n + ' checks (tick transitions reach clients: lobby end, rematch clean, next match, DM over + rematch with settings; readiness while loading; request budgets; passcode first; late join + reconnect; 304 revalidation; host asleep)');
process.exit(0);
