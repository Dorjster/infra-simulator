// Global Defensive · the round's sounds over LAN, two real browsers on this computer (a host page — Terrorist — and a guest
// page — Counter-Terrorist — against one room server; the guest's page clock 4 s ahead, as on an offline LAN):
//  · the freeze ends → each computer starts exactly one round start radio line, its own team's (in its side's voice);
//  · the round ends (time runs out: CTs win, no MVP) → each computer starts exactly one round-end sound: the CT's "won",
//    the T's "lost"; nothing more on later frames;
//  · the next freeze stops the music; the next round's start → one more line each. No page errors.
// Needs this computer's import of the round sounds (user-assets: node tools/import-cs2-sounds.mjs --only
// music.won,music.lost,music.mvp,radio.start); without it the decisions are checked and the started sounds are reported.
//   node tests/browser/gd-round-sounds-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, readFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const man = path.join(root, 'user-assets/manifest.json'), imported = existsSync(man) && !!JSON.parse(readFileSync(man, 'utf8')).models?.gdSounds?.['music.won'];
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDRSN1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'grs-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const browsers = [], launch = () => chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); }; const errs = [];
async function open(who, skewMs = 0) { const bw = await launch(); browsers.push(bw); const p = await (await bw.newContext({ viewport: { width: 1000, height: 640 } })).newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(([n, skew]) => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); if (skew) { const real = Date.now; Date.now = () => real() + skew; } }, [who, skewMs]);
  await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1000);
  await p.evaluate(async () => { globalThis.__gdS = await import(new URL('gd-sounds.js', document.querySelector('script[type=module]').src).href.replace(/\?.*$/, '')); });   // (the page's own module instance: the URL its modules import it by)
  return p; }
const host = await open('Host'), guest = await open('Guest', 4000);
const act = (p, a) => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }), a);
const S = p => p.evaluate(() => { const m = __gdS, d = __infra.lab.world.operations.game.combat?.d, me = String(localStorage.getItem('infra-name')).toLowerCase(); return { ...m.roundSounds.stats, music: m.voiceStats.music, radio2: m.voiceStats.radio, team: d?.teams?.[me], phase: d?.round?.phase, n: d?.n, mvp: d?.round?.mvp ?? null, voice: m.teamVoice(d?.teams?.[me]) }; });
const phase = (p, ph, ms) => p.waitForFunction(ph => __infra.lab.world.operations.game.combat?.d?.round?.phase === ph, ph, { timeout: ms }).then(() => true).catch(() => false);
// Host: Defuse · Dust II · no bots; the guest joins; 3 s freeze, 60 s rounds (CS2's shortest here); the host starts.
await host.evaluate(() => document.querySelector('[data-start=arena]').click()); await host.waitForTimeout(400); await host.selectOption('#ss-ar-kind', 'defuse'); await host.selectOption('#ss-ar-map', 'dust2'); await host.selectOption('#ss-ar-bots', '0');
await host.evaluate(() => document.getElementById('ss-ar-host').click());
await host.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d, null, { timeout: 30000 });
const code = await host.evaluate(() => __infra.lab.lan.roomCode);
await guest.evaluate(() => document.querySelector('[data-start=join]').click()); await guest.waitForSelector('#ss-code'); await guest.fill('#ss-jname', 'Guest'); await guest.fill('#ss-code', code); await guest.evaluate(() => document.getElementById('ss-join').click());
await guest.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d?.teams?.guest && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 30000 });
await act(host, { type: 'settings', freeze: 3 }); await act(host, { type: 'settings', rules: { roundS: 60 } });
{ const t = await host.evaluate(() => __infra.lab.world.operations.game.combat.d.teams); if (t.host === t.guest) await act(host, { type: 'team', team: t.guest === 'ct' ? 't' : 'ct' }); }
const st = await act(host, { type: 'start-match' }); check('the host starts the match', !st?.error, JSON.stringify(st));
await phase(guest, 'freeze', 15000); await host.waitForTimeout(400);
const t0 = [await S(host), await S(guest)]; check('host and guest on opposite sides', t0[0].team && t0[1].team && t0[0].team !== t0[1].team, JSON.stringify(t0.map(x => x.team)));
// The freeze ends: one line each, its own team's voice.
const live = await phase(guest, 'live', 15000); await host.waitForTimeout(2000);
let s = [await S(host), await S(guest)];
check('the round goes live', live, s.map(x => x.phase).join());
for (const [who, x] of [['host', s[0]], ['guest', s[1]]]) check(`${who} (${x.team}): one round start radio line, in its own team's voice (${x.voice})`, imported ? x.radio === 1 && x.last === 'radio.start.' + x.voice : x.radio === 0, JSON.stringify(x));
check('…and each actually started on its Interface bus (decoded CS2 line)', !imported || (s[0].radio2 === 1 && s[1].radio2 === 1), JSON.stringify(s.map(x => x.radio2)));
// The round runs out (60 s): CTs win, no MVP → CT "won", T "lost", one each.
const over = await phase(host, 'over', 75000); await host.waitForTimeout(2500); s = [await S(host), await S(guest)];
check('the round ends on time (CTs win) with no MVP (nobody did anything)', over && s[0].mvp === null, JSON.stringify(s[0]));
for (const [who, x] of [['host', s[0]], ['guest', s[1]]]) { const want = x.team === 'ct' ? 'music.won' : 'music.lost'; check(`${who} (${x.team}): exactly one round-end sound — ${want}`, imported ? x.end === 1 && x.last === want : x.end === 0, JSON.stringify(x)); }
check('…started once on the Music bus on each computer (never twice, no UI cue on top)', !imported || (s[0].music === 1 && s[1].music === 1), JSON.stringify(s.map(x => x.music)));
await host.waitForTimeout(2000); const s2 = [await S(host), await S(guest)]; check('later frames of the ended round add nothing', s2.every((x, i) => x.end === s[i].end && x.radio === s[i].radio && x.music === s[i].music), JSON.stringify(s2));
// The next round: its freeze stops the music; its start brings one more line each.
const fz = await phase(guest, 'freeze', 15000); await guest.waitForTimeout(500); s = [await S(host), await S(guest)];
check('the next freeze stops the round-end music', fz && s.every(x => x.stops >= 1), JSON.stringify(s.map(x => x.stops)));
await phase(guest, 'live', 15000); await host.waitForTimeout(2000); s = [await S(host), await S(guest)];
check('round 2 goes live: one more line each (two in all), still one end sound', s.every(x => (x.radio === 2 || !imported && x.radio === 0) && x.end <= 1), JSON.stringify(s));
check('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
if (!imported) console.log('NOTE: the round sounds are not imported on this computer: decisions checked, sounds not started');
for (const b of browsers) await b.close().catch(() => {}); server.kill();
console.log(`${ok}/${n} checks passed`); process.exit(ok === n ? 0 : 1);
