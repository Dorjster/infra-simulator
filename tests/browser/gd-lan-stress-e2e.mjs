// LAN Defuse under use, on every map (two browsers + 8 bots = 5 vs 5; a third joins mid-round — more browsers than that
// with CS2 maps outgrow one laptop): every join works and is timed — a guest joins, leaves and comes back three times
// (no ghost left behind). (tests/lan-defuse-room.mjs puts the same rules through the room at full scale.) On Dust II and then each map the host changes to mid-match
// (all eight; CS2's when this computer has them), every screen lands on it (the same map built, its look in, round 1,
// still 5 vs 5, everyone on a spot of their own); then a fourth person joins in the middle of a live round: an even team,
// watching until the next round (CS2), then up on a spot of their own on their side, with money, buying in the spawn;
// when they leave, the sides are even again. No page errors.
//   node tests/browser/gd-lan-stress-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out_dir] = process.argv.slice(2); mkdirSync(out_dir, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDSTR1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gs-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const browsers = [], launch = () => chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); }; const errs = [];
const CS2 = existsSync(path.join(root, 'user-maps/mirage.bsp')), MAPS = ['mirage', 'inferno', 'nuke', 'cache', 'anubis', 'ancient', ...(existsSync(path.join(root, 'user-maps/overpass.bsp')) ? ['overpass'] : [])];
async function page(who) { const bw = browsers[who] ??= await launch(); const p = await (await bw.newContext({ viewport: { width: 800, height: 500 } })).newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(n => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); }, who);
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 90000 }); await p.waitForTimeout(800); return p; }
const inMatch = (p, who) => p.waitForFunction(w => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d?.teams?.[w] && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), who.toLowerCase(), { timeout: 150000 }).then(() => true).catch(() => false);
async function join(who, code) { const t0 = Date.now(), p = await page(who); await p.waitForSelector('[data-start=join]', { state: 'attached', timeout: 60000 }); await p.evaluate(() => document.querySelector('[data-start=join]').click()); await p.waitForSelector('#ss-code'); await p.fill('#ss-jname', who); await p.fill('#ss-code', code); await p.evaluate(() => document.getElementById('ss-join').click());
  const okk = await inMatch(p, who); return { p, ok: okk, s: ((Date.now() - t0) / 1000).toFixed(1) }; }
const G = p => p.evaluate(async () => { const g = __infra.lab.world.operations.game, d = g.combat?.d, S = __infra.lab.arenaScene, { teamCounts } = await import('/arena-defuse.js'); return { present: d ? teamCounts(g, (__infra.lab.lan.players || []).filter(x => !x.bot)) : null, map: g.arena?.map, built: S?.map, boxes: S?.boxes?.length, look: !!S?.group?.children?.some(o => o.userData.cs2Render), n: d?.n, phase: d?.round?.phase, teams: d?.teams, inArena: S?.inArena(__infra.camera.position.z), people: (__infra.lab.lan.players || []).filter(x => !x.bot).map(x => x.name) }; });
const act = (p, a) => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }).catch(e => ({ error: e.message })), a);
const count = c => [c?.t ?? 0, c?.ct ?? 0];   // (the host's own count: the people present and the bots — rules.js teamCounts)
// Everyone on a spot of their own (the host's word: people's spawn orders, the bots where they stand), at a round start.
const apart = host => host.evaluate(() => { const g = __infra.lab.world.operations.game, roster = __infra.lab.lan.players || [], people = new Set(roster.filter(x => !x.bot).map(x => x.name.toLowerCase())), at = [...Object.entries(g.combat.spawnTo || {}).filter(([k]) => people.has(k) && !g.combat.down?.[k]).map(([, s]) => [s.x, s.z, s.y]), ...roster.filter(x => x.bot && x.pose).map(b => [b.pose.x, b.pose.z, b.pose.y - 9.7])], HU = 2.54 / 16.5; let close = 0;   // (bots where the room's roster has them now)
  for (let i = 0; i < at.length; i++) for (let j = 0; j < i; j++) if (!(Number.isFinite(at[i][2]) && Number.isFinite(at[j][2]) && Math.abs(at[i][2] - at[j][2]) > 6) && Math.hypot(at[i][0] - at[j][0], at[i][1] - at[j][1]) < 32 * HU) close++; return { placed: at.length, close }; });
try {
  // The host: Defuse on Dust II, then eight bots (2 people + 8 bots = 5 vs 5).
  const host = await page('Host'); await host.evaluate(() => document.querySelector('[data-start=arena]').click()); await host.waitForTimeout(400);
  await host.selectOption('#ss-ar-kind', 'defuse'); await host.selectOption('#ss-ar-map', 'dust2'); await host.selectOption('#ss-ar-bots', '0'); await host.evaluate(() => document.getElementById('ss-ar-host').click());
  check('the host is in its match', await inMatch(host, 'Host')); const code = await host.evaluate(() => __infra.lab.lan.roomCode);
  check('eight bots added', !(await act(host, { type: 'add-bot', count: 8 }))?.error);
  // A guest joins; leaves and joins again, three times.
  let bo = await join('Bo', code); check('Bo joins', bo.ok, bo.s + ' s');
  for (let i = 1; i <= 3; i++) { await bo.p.context().close(); const tg = Date.now();
    const gone = await host.waitForFunction(() => !(__infra.lab.lan.players || []).some(x => !x.bot && x.name === 'Bo'), null, { timeout: 15000 }).then(() => true).catch(() => false), goneS = ((Date.now() - tg) / 1000).toFixed(1); bo = await join('Bo', code);
    const names = await host.evaluate(() => (__infra.lab.lan.players || []).filter(x => !x.bot).map(x => x.name));
    check(`Bo leaves (gone from the room, no ghost) and joins again as Bo (${i}/3)`, gone && bo.ok && names.filter(n => n === 'Bo').length === 1, `gone in ${goneS} s · back in ${bo.s} s · ${JSON.stringify(names)}`); }
  await host.waitForTimeout(1500); const s0 = await G(host), [t0, c0] = count(s0.present);
  check('2 people + 8 bots: 5 vs 5, everyone listed once', t0 === 5 && c0 === 5 && s0.people.filter(x => /^bo$/i.test(x)).length === 1, JSON.stringify({ t: t0, ct: c0, people: s0.people }));
  // A fourth person joins in the middle of a live round: CS2's rules for them, on this map.
  const midJoin = async map => {
    await host.waitForFunction(() => { const r = __infra.lab.world.operations.game.combat?.d?.round; return r?.phase === 'live' && Date.now() - r.at > 6000; }, null, { timeout: 60000 }).catch(() => {});
    const dee = await join('Dee', code), sd = await G(host), [td, cd] = count(sd.present);
    const watching = await host.evaluate(() => __infra.lab.world.operations.game.combat?.down?.dee?.weapon === 'joined mid-round');
    check(`${map}: Dee joins in the middle of a live round, on an even team, watching until the next round`, dee.ok && Math.abs(td - cd) <= 1 && watching, `${dee.s} s · ` + JSON.stringify({ t: td, ct: cd, watching }));
    check(`${map}: the host restarts the round`, !(await act(host, { type: 'restart-round' }))?.error);
    await host.waitForFunction(() => { const g = __infra.lab.world.operations.game; return g.combat?.d?.round?.phase === 'freeze' && !g.combat.down?.dee; }, null, { timeout: 20000 }).catch(() => {}); await host.waitForTimeout(1200);
    const dz = await host.evaluate(() => { const g = __infra.lab.world.operations.game, d = g.combat.d, s = g.combat.spawnTo?.dee; return { up: !g.combat.down?.dee, team: d.teams.dee, money: d.money.dee, spot: !!s }; }), sp = await apart(host);
    check(`${map}: next round Dee is up on a spot of their own, with money`, dz.up && dz.spot && dz.money >= 800 && sp.close === 0, JSON.stringify({ ...dz, ...sp }));
    const buy = await act(dee.p, { type: 'loadout', secondary: 'deagle' }); check(`${map}: Dee buys in the spawn`, /Desert Eagle/.test(JSON.stringify(buy)), JSON.stringify(buy));
    await dee.p.context().close(); await host.waitForFunction(() => !(__infra.lab.lan.players || []).some(x => !x.bot && x.name === 'Dee'), null, { timeout: 15000 }).catch(() => {});
    await act(host, { type: 'restart-round' }); await host.waitForTimeout(1500); const [tl, cl] = count((await G(host)).present);
    check(`${map}: Dee leaves, the next round the sides are even (5 vs 5)`, tl === 5 && cl === 5, JSON.stringify({ t: tl, ct: cl }));
  };
  // The match starts on Dust II.
  const started = await host.evaluate(() => { const L = __infra.lab.world.operations.game.arena.lobby; return !L || L.started; }); check('the host starts the match (or the warmup already has)', started || !(await act(host, { type: 'start-match' }))?.error);
  await host.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'freeze', null, { timeout: 20000 }).catch(() => {});
  await host.waitForTimeout(1000); const a1 = await apart(host); check('round 1 starts with everyone on a spot of their own', a1.close === 0 && a1.placed === 10, JSON.stringify(a1));
  await midJoin('dust2');
  // The host changes the map mid-match, to every other map: every screen lands on it; then a join mid-round there.
  const pages = [['Host', host], ['Bo', bo.p]];
  for (const map of MAPS) { const t1 = Date.now();
    await host.evaluate(() => __infra.lab.arenaUI.teamMenu(true)); await host.waitForTimeout(300); await host.evaluate(() => document.querySelector('#ar-team [data-tab=host]')?.click()); await host.waitForTimeout(200);
    await host.evaluate(m => { document.getElementById('ar-mapsel').value = m; document.querySelector('[data-map-go]').click(); }, map); await host.waitForTimeout(400); await host.evaluate(() => __infra.lab.arenaUI.teamMenu(false)).catch(() => {});
    const landed = await Promise.all(pages.map(([, p]) => p.waitForFunction(([m, cs2]) => { const S = __infra.lab.arenaScene; return __infra.lab.world.operations.game.arena?.map === m && S?.map === m && S.inArena(__infra.camera.position.z) && document.getElementById('ar-load')?.hidden !== false && (!cs2 || S.group.children.some(o => o.userData.cs2Render)); }, [map, CS2], { timeout: 180000 }).then(() => true).catch(() => false)));
    await host.waitForTimeout(1500); const st = await Promise.all(pages.map(([, p]) => G(p))), [tm, cm] = count(st[0].present);
    // (spots are judged at a round start: once the round is live — a slow map load on a busy machine — the bots have walked off together)
    if (st[0].phase !== 'freeze') { await act(host, { type: 'restart-round' }); await host.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'freeze', null, { timeout: 20000 }).catch(() => {}); await host.waitForTimeout(1200); }
    const sp = await apart(host);
    check(`map change to ${map}: every screen on it${CS2 ? ' (CS2 look in)' : ''}, the same map, round 1`, landed.every(Boolean) && st.every(s => s.map === map && s.built === map && s.boxes === st[0].boxes && s.n === 1 && s.inArena), `${((Date.now() - t1) / 1000).toFixed(1)} s · ` + JSON.stringify(st.map(s => [s.map, s.built, s.boxes, s.look, s.n, s.phase])));
    check(`…on ${map} still 5 vs 5, everyone on a spot of their own`, tm === 5 && cm === 5 && sp.close === 0, JSON.stringify({ t: tm, ct: cm, ...sp }));
    await bo.p.screenshot({ path: path.join(out_dir, `bo-${map}.png`) });
    await midJoin(map); }
  check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
} finally { console.log((ok === n ? 'PASS' : 'FAIL') + ': LAN Defuse on every map · joins, rejoins, a join mid-round on each map, map changes, 5 vs 5 · ' + ok + '/' + n); for (const b of Object.values(browsers)) await b.close().catch(() => {}); server.kill(); process.exitCode = ok === n ? 0 : 1; }
