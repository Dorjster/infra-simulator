// Team voice end to end in three browsers with Chrome's fake microphone (a steady tone): real WebRTC audio between
// team mates, nothing to the enemy. Ann hosts (this computer), Bo joins over the room's HTTPS twin (a secure origin,
// as a second computer's browser would), Cy joins over http on this computer. Ann + Bo are Terrorists, Cy is a CT.
// Checks: voice turns on; team mates connect, the enemy never does; push-to-talk sends real sound (Bo's indicator for
// Ann comes from the received audio level); releasing it stops; per-player mute; a team change re-routes at once;
// turning voice off closes everything and stops the microphone. No page errors.
//   node tests/browser/gd-voice-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDVOX1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gv-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const securePort = +new URL(base).port + 1;
const browsers = [], launch = () => chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 260) : '')); }; const errs = [];
async function open(who, url) { const bw = await launch(); browsers.push(bw); const p = await (await bw.newContext({ viewport: { width: 1100, height: 700 }, ignoreHTTPSErrors: true })).newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(n => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); }, who);
  await p.goto(url); await p.waitForFunction(() => globalThis.__infra?.lab && globalThis.__voice, null, { timeout: 60000 }); await p.waitForTimeout(1000); return p; }
const ann = await open('Ann', base + '/');
await ann.evaluate(() => document.querySelector('[data-start=arena]').click()); await ann.waitForTimeout(400); await ann.selectOption('#ss-ar-kind', 'defuse'); await ann.selectOption('#ss-ar-map', 'dust2'); await ann.selectOption('#ss-ar-bots', '0');
await ann.evaluate(() => document.getElementById('ss-ar-host').click());
await ann.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d, null, { timeout: 30000 });
const code = await ann.evaluate(() => __infra.lab.lan.roomCode);
async function joinAs(who, url) { const p = await open(who, url); await p.evaluate(() => document.querySelector('[data-start=join]').click()); await p.waitForSelector('#ss-code'); await p.fill('#ss-jname', who); await p.fill('#ss-code', code); await p.evaluate(() => document.getElementById('ss-join').click());
  await p.waitForFunction(w => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d?.teams?.[w], who.toLowerCase(), { timeout: 30000 }); return p; }
const bo = await joinAs('Bo', 'https://127.0.0.1:' + securePort + '/'), cy = await joinAs('Cy', base + '/');
check('Bo’s page is a secure https origin (the room’s HTTPS twin)', await bo.evaluate(() => location.protocol === 'https:' && isSecureContext), await bo.evaluate(() => location.href));
const act = (p, a) => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }), a);
await act(cy, { type: 'team', team: 'ct' }); await act(ann, { type: 'team', team: 't' }); await act(bo, { type: 'team', team: 't' }); await ann.waitForTimeout(800);
const teams = await ann.evaluate(() => __infra.lab.world.operations.game.combat.d.teams); check('teams: Ann + Bo Terrorists, Cy Counter-Terrorist (warmup)', teams.ann === 't' && teams.bo === 't' && teams.cy === 'ct', JSON.stringify(teams));
const on = await Promise.all([ann, bo, cy].map(p => p.evaluate(() => __voice.enable())));
check('voice turns on for all three (microphone granted)', on.every(Boolean), JSON.stringify(await Promise.all([ann, bo, cy].map(p => p.evaluate(() => __voice.status + ' ' + __voice.error)))));
const connected = (p, nm) => p.waitForFunction(nm => __voice.peers.some(x => x.name === nm && x.state === 'connected'), nm, { timeout: 15000 }).then(() => true).catch(() => false);
check('Ann ↔ Bo connect (team mates)', await connected(ann, 'Bo') && await connected(bo, 'Ann'), JSON.stringify(await ann.evaluate(() => __voice.peers)));
await ann.waitForTimeout(1500);
check('Cy (enemy) has no voice connection to anyone', await cy.evaluate(() => __voice.peers.length === 0) && await ann.evaluate(() => !__voice.peers.some(x => x.name === 'Cy')), JSON.stringify(await cy.evaluate(() => __voice.peers)));
await ann.evaluate(() => __voice.talk(true));
const hears = (p, nm, want = true) => p.waitForFunction(([nm, want]) => __voice.speaking(nm) === want, [nm, want], { timeout: 6000 }).then(() => true).catch(() => false);
check('push to talk: Bo hears Ann (indicator from the received audio level)', await hears(bo, 'Ann'), await bo.evaluate(() => JSON.stringify(__voice.peers)));
check('…and Ann’s own indicator shows she is sending sound', await hears(ann, 'Ann'));   // the fake microphone beeps about once a second: wait for a beep
check('Cy hears nothing from Ann', !(await cy.evaluate(() => __voice.speaking('Ann'))));
await ann.evaluate(() => __voice.talk(false));
check('releasing the key stops the sound (Bo’s indicator goes off)', await hears(bo, 'Ann', false));
await bo.evaluate(() => __voice.mute('Ann', true)); await ann.evaluate(() => __voice.talk(true)); await bo.waitForTimeout(1200);
check('Bo mutes Ann: no indicator, no sound', !(await bo.evaluate(() => __voice.speaking('Ann'))) && await bo.evaluate(() => [...document.querySelectorAll('audio')].every(a => a.muted)));
await bo.evaluate(() => __voice.mute('Ann', false)); await ann.evaluate(() => __voice.talk(false));
// Team change: Bo → CT, Cy → T. The old pair closes, the new team mates connect.
await act(bo, { type: 'team', team: 'ct' }); await act(cy, { type: 'team', team: 't' }); await ann.waitForTimeout(500);
const gone = await bo.waitForFunction(() => !__voice.peers.some(x => x.name === 'Ann'), null, { timeout: 6000 }).then(() => true).catch(() => false);
check('after the team change Bo’s connection to Ann closes at once', gone && await ann.evaluate(() => !__voice.peers.some(x => x.name === 'Bo')));
check('…and Ann ↔ Cy (new team mates) connect', await connected(ann, 'Cy') && await connected(cy, 'Ann'));
await ann.evaluate(() => __voice.talk(true)); check('Cy now hears Ann; Bo (now an enemy) does not', await hears(cy, 'Ann') && !(await bo.evaluate(() => __voice.speaking('Ann')))); await ann.evaluate(() => __voice.talk(false));
await ann.evaluate(() => __voice.disable()); await ann.waitForTimeout(800);
const offA = await ann.evaluate(() => __voice.peers.length === 0 && __voice.status === 'off'), offC = await cy.waitForFunction(() => !__voice.peers.some(x => x.name === 'Ann'), null, { timeout: 8000 }).then(() => true).catch(() => false);
check('turning voice off closes every connection and stops the microphone', offA && offC, JSON.stringify({ ann: await ann.evaluate(() => [__voice.status, __voice.peers]), cy: await cy.evaluate(() => __voice.peers) }));
check('the match carried on throughout (round state intact)', await ann.evaluate(() => !!__infra.lab.world.operations.game.combat?.d?.round));
check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
console.log(ok + '/' + n); for (const b of browsers) await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
