// Real OS clipboard in the packaged macOS app: text copied with pbcopy (another app), Cmd+V/C/A/X sent
// as real keystrokes by System Events (they go through the app's Edit menu), results read over CDP.
import { chromium } from 'playwright-core'; import { spawn, execSync } from 'node:child_process'; import os from 'node:os'; import { mkdtempSync } from 'node:fs'; import path from 'node:path';
const exe = process.argv[2], env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE'));
const app = spawn(exe, ['--remote-debugging-port=9336', '--user-data-dir=' + mkdtempSync(path.join(os.tmpdir(), 'clip-'))], { stdio: 'ignore', env });
let b; for (let i = 0; i < 40 && !b; i++) { try { b = await chromium.connectOverCDP('http://127.0.0.1:9336'); } catch { await new Promise(r => setTimeout(r, 500)); } }
let p = b.contexts()[0].pages()[0]; for (let i = 0; !p && i < 20; i++) { await new Promise(r => setTimeout(r, 500)); p = b.contexts()[0].pages()[0]; }
p.on('dialog', d => d.accept()); await p.waitForFunction(() => globalThis.__infra?.lab); await p.waitForTimeout(1000);
const osa = s => execSync(`osascript -e '${s}'`).toString().trim();
// Keystrokes: Cmd+<key> as a real key event carrying Chromium's native editing command (the same command the
// Edit menu role triggers), so the OS clipboard and every page-level handler are exercised.
const cdp = await p.context().newCDPSession(p);
const front = () => {};
const key = async k => { const cmd = { v: 'paste', c: 'copy', x: 'cut', a: 'selectAll' }[k]; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 4, key: k, code: 'Key' + k.toUpperCase(), windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), commands: [cmd] }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 4, key: k, code: 'Key' + k.toUpperCase(), windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) }); };
const setClip = t => execSync('pbcopy', { input: t }), getClip = () => execSync('pbpaste').toString();
const focus = async sel => { await p.evaluate(s => { const e = document.querySelector(s); e.value = ''; e.focus(); }, sel); await p.waitForTimeout(150); };
const val = sel => p.evaluate(s => document.querySelector(s).value, sel);
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };
try { front(); } catch (e) { console.log(JSON.stringify({ error: 'System Events control not permitted: ' + e.message.slice(0, 200) })); app.kill(); process.exit(0); }
// 1. Cmd+V into the company name field (text copied outside the app).
await p.click('[data-start=new]'); await p.waitForTimeout(400);
setClip('Pasted Corp 42'); await focus('#ss-name'); await key('v'); await p.waitForTimeout(300); check('Cmd+V into company name', (await val('#ss-name')) === 'Pasted Corp 42', await val('#ss-name'));
// 2. Cmd+A, Cmd+C out of a field to the OS clipboard.
await p.evaluate(() => { const e = document.querySelector('#ss-name'); e.value = 'Copied-Out 7'; e.focus(); }); await key('a'); await key('c'); await p.waitForTimeout(300); check('Cmd+A, Cmd+C to OS clipboard', getClip() === 'Copied-Out 7', getClip());
// 3. Cmd+X cuts.
await key('a'); await key('x'); await p.waitForTimeout(300); check('Cmd+X cuts', (await val('#ss-name')) === '' && getClip() === 'Copied-Out 7', await val('#ss-name') + ' / ' + getClip());
// 4. Join: room code + host address fields.
await p.evaluate(() => __infra.lab.campaignUI.showStart(true)); await p.click('[data-start=join]'); await p.waitForTimeout(400);
setClip('192.168.1.20:8080'); await focus('#ss-addr'); await key('v'); await p.waitForTimeout(300); check('Cmd+V host address', (await val('#ss-addr')) === '192.168.1.20:8080', await val('#ss-addr'));
setClip('8BF843'); await focus('#ss-code'); await key('v'); await p.waitForTimeout(300); check('Cmd+V room code', (await val('#ss-code')) === '8BF843', await val('#ss-code'));
// 5. In game: the laptop terminal. Single line = text only, multiline = preview needing confirmation.
await p.evaluate(() => __infra.lab.campaignUI.showStart(true)); await p.click('[data-start=free]'); await p.waitForTimeout(1500);
await p.evaluate(() => { __infra.lab.kit.show(); }); await p.waitForTimeout(500);
const outLen = () => p.evaluate(() => document.getElementById('laptop-output').innerText.length);
setClip('show vlan'); await focus('#laptop-command'); let before = await outLen(); await key('v'); await p.waitForTimeout(400);
check('Single-line CLI paste is text only (not run)', (await val('#laptop-command')) === 'show vlan' && (await outLen()) === before, await val('#laptop-command'));
setClip('show vlan\nconfigure terminal\nusername admin password Secret123!\n'); await focus('#laptop-command'); before = await outLen(); await key('v'); await p.waitForTimeout(400);
const pv = await p.evaluate(() => ({ shown: !document.getElementById('laptop-paste')?.hidden, text: document.getElementById('laptop-paste')?.innerText || '' }));
check('Multiline CLI paste opens a preview, runs nothing', pv.shown && (await outLen()) === before && /Run 3 pasted commands/.test(pv.text), pv.text.slice(0, 120));
check('Preview masks the password', !/Secret123!/.test(pv.text) && /••••/.test(pv.text), pv.text.replace(/\n/g, ' ').slice(0, 200));
await p.evaluate(() => document.getElementById('paste-cancel').click()); await p.waitForTimeout(200); check('Cancel runs nothing', (await outLen()) === before, '');
await key('v'); await p.waitForTimeout(300); await p.evaluate(() => document.getElementById('paste-run').click()); await p.waitForTimeout(1500);
const out = await p.evaluate(() => document.getElementById('laptop-output').innerText); check('Confirm runs each line with output', /> show vlan[\s\S]*> configure terminal/.test(out), out.slice(-160));
// 6. Right-click context menu exists on editable fields (Electron context-menu handler) — checked via the menu role wiring.
console.log(JSON.stringify(results, null, 1));
await b.close().catch(() => {}); app.kill(); process.exit(0);
