// Global Defensive interface screenshots (before / after pictures, not a pass / fail test): the start panel, the loading
// card, the hosted lobby + HUD, the buy menu, the scoreboard with the big map, the Esc menu, the connection-lost banner
// and the match result, at 1280×720, 1440×900 and 1920×1080. `root=<path>` runs another checkout's game (a baseline)
// with this script.
// `sheet=<file.jpg>` only lays the before-* / after-* pictures already in <out-dir> side by side, labelled, into one JPEG.
//   node tests/browser/gd-ui-shots.mjs <repo-root> <out-dir> [root=<other checkout>] [label=<prefix>] [sheet=<file.jpg>]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, readFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const args = Object.fromEntries(process.argv.slice(4).map(a => a.split('=')));
const [repo, out] = process.argv.slice(2), root = args.root || repo, label = args.label || 'now'; mkdirSync(out, { recursive: true });
if (args.sheet) {
  const rows = [['720-hud-lobby', 'HUD + hosted lobby · 1280×720'], ['720-buy', 'Buy menu · 1280×720'], ['720-scoreboard', 'Scoreboard + big map · 1280×720'], ['720-pause', 'Esc menu · 1280×720'], ['900-connection', 'Host lost · 1440×900'], ['900-hud-lobby', 'HUD + lobby · 1440×900'], ['1080-hud-lobby', 'HUD + lobby · 1920×1080'], ['1080-buy', 'Buy menu · 1920×1080'], ['720-results', 'Match result · 1280×720']];
  const img = f => existsSync(path.join(out, f)) ? `<img src="data:image/jpeg;base64,${readFileSync(path.join(out, f)).toString('base64')}">` : '<div class="none">not captured</div>';
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#101418;color:#e8eef2;font:600 15px system-ui;padding:18px}h1{margin:0 0 4px;font:800 24px system-ui}p{margin:0 0 14px;color:#9fb0bb}.r{display:grid;grid-template-columns:200px 1fr 1fr;gap:10px;align-items:center;margin-bottom:10px}.r b{font:700 14px system-ui}img{width:100%;display:block;border:1px solid #ffffff22}.h{font:800 13px system-ui;letter-spacing:.1em;color:#7fe3f2}.none{aspect-ratio:16/9;display:grid;place-items:center;border:1px dashed #ffffff33;color:#8aa2b0}</style><h1>Global Defensive · v52 interface (package I1)</h1><p>Left: v51.0.0 (released) · right: this wave</p><div class="r"><span></span><span class="h">BEFORE · v51.0.0</span><span class="h">AFTER · v52 wave 2</span></div>${rows.map(([k, t]) => `<div class="r"><b>${t}</b>${img('before-' + k + '.jpg')}${img('after-' + k + '.jpg')}</div>`).join('')}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }), p = await b.newPage({ viewport: { width: 1700, height: 900 } });
  await p.setContent(html); await p.waitForTimeout(500); await p.screenshot({ path: args.sheet, type: 'jpeg', quality: 80, fullPage: true }); console.log('sheet', args.sheet); await b.close(); process.exit(0); }
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'SHOT01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'us-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Rada'); localStorage.setItem('infra-face-name', 'Rada'); localStorage.setItem('infra-face', 'smile'); localStorage.removeItem('gd-radar-mode'); });
const shot = async name => { await p.screenshot({ path: path.join(out, `${label}-${name}.jpg`), type: 'jpeg', quality: 82 }); console.log('shot', label + '-' + name); };
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(500); await shot('720-start');
await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dust2'); await p.selectOption('#ss-ar-bots', '4');
await p.evaluate(() => document.getElementById('ss-ar-host').click());
await p.waitForFunction(() => document.getElementById('ar-load') && !document.getElementById('ar-load').hidden, null, { timeout: 30000 }).then(() => shot('720-loading')).catch(() => console.log('(no loading card caught)'));
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.round, null, { timeout: 60000 });
await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(1500);
for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080]]) { const r = String(h);
  await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(900);
  await p.evaluate(() => __infra.lab.campaignUI?.close?.()); await p.waitForTimeout(300); await shot(r + '-hud-lobby');
  await p.evaluate(() => __infra.lab.arenaUI.buy(true)); await p.waitForTimeout(700); await shot(r + '-buy'); await p.evaluate(() => __infra.lab.arenaUI.buy(false));
  await p.evaluate(() => { __infra.lab.arenaUI.scoreboard(true); __infra.lab.radar.expand(true); }); await p.waitForTimeout(600); await shot(r + '-scoreboard'); await p.evaluate(() => { __infra.lab.arenaUI.scoreboard(false); __infra.lab.radar.expand(false); });
  await p.keyboard.press('Escape'); await p.waitForTimeout(500); if (!(await p.evaluate(() => document.getElementById('gd-menu')?.hidden === false))) { await p.keyboard.press('Escape'); await p.waitForTimeout(500); } await shot(r + '-pause');
  await p.evaluate(() => document.querySelector('#gd-menu [data-gm=resume]')?.click()); await p.waitForTimeout(300); await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(300);
  if (w === 1440) { await ctx.setOffline(true); await p.waitForTimeout(4000); await shot(r + '-connection'); await ctx.setOffline(false); await p.waitForTimeout(6000); }
  await p.evaluate(() => { const d = __infra.lab.world.operations.game.combat.d; d.matchOver = { winner: 't', at: Date.now() }; d.score = { t: 13, ct: 9 }; }); await p.waitForTimeout(450); await shot(r + '-results');
  await p.evaluate(() => { const d = __infra.lab.world.operations.game.combat.d; d.matchOver = null; d.score = { t: 0, ct: 0 }; globalThis.__report?.close?.(); }); await p.waitForTimeout(400);
}
console.log('errors', errs.length, errs.slice(0, 3).join(' | ')); await b.close(); server.kill(); process.exit(0);
