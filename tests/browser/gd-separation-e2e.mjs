// Global Defensive on its own, as a brand-new player (nothing saved): the GD start screen asks for your name (no
// engineer / face picker), and in the match none of the Infra / Payday interface appears — no face picker, Face
// button, emote preview, laptop, console or campaign panel; ` does nothing; Esc opens the GD menu (Resume ·
// Settings · Leave match); Settings shows only settings (no campaign tabs, money or room); Leave ends a solo match.
//   node tests/browser/gd-separation-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'SEP001', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'sp-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
// Every visible on-screen element that is not Global Defensive's own interface.
const INFRA = ['scanner', 'terminal', 'boot', 'inventory', 'field-laptop', 'game-bar', 'walk-prompt', 'lab-panel', 'event', 'lan-panel', 'team-chat', 'face-picker', 'face-button', 'emote-wheel', 'emote-preview-tag', 'cz-badge', 'casino-panel', 'engineering-menu', 'engineer-role', 'engineering-panel', 'role-wheel', 'eng-objective', 'carried-item', 'box-contents', 'office-panel', 'level-hud', 'campaign-panel'];
const infraShown = () => p.evaluate(ids => ids.filter(id => { const el = document.getElementById(id); if (!el) return false; const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && r.width > 1 && r.height > 1; }), INFRA);
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
check('the start screen shows the app’s own version', await p.evaluate(() => document.getElementById('ss-version')?.textContent === 'v' + __infraDiagnostics().version), await p.evaluate(() => document.getElementById('ss-version')?.textContent));
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(500);
check('the GD start screen asks for your name', await p.evaluate(() => !!document.getElementById('ss-ar-name')));
await p.fill('#ss-ar-name', 'Bataa'); await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'mirage'); await p.selectOption('#ss-ar-bots', '1');
await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.teams, null, { timeout: 40000 });
await p.mouse.click(720, 450); await p.waitForTimeout(2500);   // the moment a new player starts walking (the face picker used to pop up here)
let shown = await infraShown(); check('in the match: no Infra / Payday interface on screen (no face picker, Face button, emote preview, laptop, campaign…)', shown.length === 0, shown.join(', '));
check('you are named as typed on the GD start screen', await p.evaluate(() => Object.keys(__infra.lab.world.operations.game.combat.d.teams).includes('bataa')), await p.evaluate(() => Object.keys(__infra.lab.world.operations.game.combat.d.teams).join(',')));
await p.screenshot({ path: path.join(out, 'match.png') });
await p.keyboard.press('Backquote'); await p.waitForTimeout(500); shown = await infraShown();
check('` does nothing in a match (no laptop, no console)', shown.length === 0, shown.join(', '));
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
const menu = await p.evaluate(() => { const m = document.getElementById('gd-menu'); return m && !m.hidden ? m.innerText.replace(/\s+/g, ' ') : null; }); shown = await infraShown();
check('Esc opens the Global Defensive menu (Resume · Settings · Leave match), not the campaign', !!menu && /Resume/.test(menu) && /Settings/.test(menu) && /Leave match/.test(menu) && shown.length === 0, menu + ' | ' + shown.join(', '));
await p.screenshot({ path: path.join(out, 'menu.png') });
await p.click('#gd-menu [data-gm=settings]'); await p.waitForTimeout(500);
const st = await p.evaluate(() => ({ open: !document.getElementById('campaign-panel').hidden, title: document.getElementById('cp-title').textContent, context: document.getElementById('cp-context').textContent, tabs: document.querySelectorAll('#cp-nav button').length, body: document.getElementById('cp-body').innerText }));
check('Settings: only settings — titled SETTINGS · Global Defensive, no campaign tabs, money or room', st.open && st.title === 'SETTINGS' && st.context === 'Global Defensive' && st.tabs === 0 && /Mouse sensitivity/.test(st.body) && !/₮|Guidance|Walk speed/.test(st.body), JSON.stringify({ ...st, body: st.body.slice(0, 120) }));
check('Settings: the controls listed are Global Defensive’s', /Buy menu/.test(st.body) && !/Service laptop|Console cable/.test(st.body));
await p.screenshot({ path: path.join(out, 'settings.png') });
await p.click('#cp-close'); await p.waitForTimeout(400); await p.keyboard.press('Escape'); await p.waitForTimeout(400); await p.click('#gd-menu [data-gm=resume]'); await p.waitForTimeout(400);
check('Resume closes the menu', await p.evaluate(() => document.getElementById('gd-menu').hidden));
await p.keyboard.press('Escape'); await p.waitForTimeout(400); await p.click('#gd-menu [data-gm=leave]');
await p.waitForFunction(() => __infra.lab.world.operations.game.mode !== 'arena' && !document.getElementById('start-screen').hidden, null, { timeout: 10000 }).catch(() => {});
check('Leave match (alone): the match ends and the start screen is back', await p.evaluate(() => __infra.lab.world.operations.game.mode !== 'arena' && !document.getElementById('start-screen').hidden), await p.evaluate(() => __infra.lab.world.operations.game.mode));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
