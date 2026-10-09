// Infra Simulator desktop shell (Electron). The game is the same browser client and the same room
// server as the web package: the room runs in this main process, bound to 127.0.0.1 for Solo and
// rebound to the LAN only while the player hosts. Saves live in the per-user app-data folder.
import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile, rename, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import dgram from 'node:dgram';
import http from 'node:http';
import os from 'node:os';

// Windows Squirrel installer events: Setup.exe runs the app with --squirrel-install (and --squirrel-updated /
// --squirrel-uninstall) and waits for it to exit. Create or remove the Start menu and desktop shortcuts and
// quit straight away; the game itself must not start during install or uninstall.
const squirrel = process.platform === 'win32' && /^--squirrel-(install|updated|uninstall|obsolete)$/.exec(process.argv[1] || '');
if (squirrel) {
  const update = path.resolve(path.dirname(process.execPath), '..', 'Update.exe'), exe = path.basename(process.execPath);
  const done = () => app.exit(0);
  if (squirrel[1] === 'obsolete') done();
  else { const p = spawn(update, [squirrel[1] === 'uninstall' ? '--removeShortcut' : '--createShortcut', exe], { detached: true }); p.on('close', done); p.on('error', done); setTimeout(done, 5000); }
  await new Promise(() => {}); // nothing below runs: no window, no room
}
const here = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = await stat(path.join(here, 'game', 'lan', 'room.mjs')).then(() => path.join(here, 'game')).catch(() => path.resolve(here, '..'));
const { startRoom } = await import(pathToFileURL(path.join(gameRoot, 'lan', 'room.mjs')).href);

// Laptops with two GPUs: ask for the discrete one (Chromium/ANGLE picks the low-power GPU otherwise).
app.commandLine.appendSwitch('force_high_performance_gpu');
// No usable GPU driver: keep WebGL on Chromium's software renderer instead of failing (newer Chromium drops the automatic fallback).
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
if (!app.requestSingleInstanceLock()) app.quit(); // one window, one room: no duplicate servers after relaunch
let win = null, room = null, hosting = false, inMatch = false, quitting = false;
const savePath = () => path.join(app.getPath('userData'), 'campaign-save.json');
const origin = () => 'http://127.0.0.1:' + room.port;
// Private LAN hosts a player may join (http only, RFC 1918 + link-local + loopback).
const lanHost = h => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|localhost$)/.test(h);

// The room always tries port 8080, so the address friends type is predictable (192.168.x.x:8080) and the
// page keeps one origin between launches. If 8080 is taken (on this computer or for the LAN), a free port.
const LAN_PORT = 8080;
const portFree = port => new Promise(res => { const s = net.createServer().once('error', () => res(false)).once('listening', () => s.close(() => res(true))); s.listen(port, '0.0.0.0'); });
async function openRoom() {
  room = await startRoom({ port: await portFree(LAN_PORT) ? LAN_PORT : 0, bind: '127.0.0.1', savePath: savePath(), deliveryScale: process.env.INFRA_DELIVERY_SCALE, log: m => console.log('[room]', m), error: m => console.error('[room]', m) });
  hosting = false;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 640, backgroundColor: '#07121b', title: 'Infra Simulator', show: false,
    icon: path.join(here, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false }
  });
  win.once('ready-to-show', () => win.show());
  // In a Global Defensive match, closing the window (Alt+F4, the title bar ×) asks first.
  win.on('close', e => { if (!inMatch || quitting) return; const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Keep playing', 'Quit'], defaultId: 0, cancelId: 0, message: 'Leave the match and quit Infra Simulator?' }); if (r === 0) e.preventDefault(); else quitting = true; });
  // A host that can't be reached (wrong address or port, firewall, different network) must not leave a
  // black window: come back to this computer's start screen and say what happened.
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3 || !room || url.startsWith(origin())) return;
    win.loadURL(origin() + '/');
    dialog.showMessageBox(win, { type: 'warning', message: 'Could not reach the host', detail: `${new URL(url).host} did not answer (${desc}).\n\nCheck that:\n• both computers are on the same network (Wi-Fi / office LAN)\n• you typed the address and port shown in the host's invite bar\n• the host has started hosting and is still in the game\n• the host's firewall allows Infra Simulator on private networks` });
  });
  // Navigation stays on the local room or a LAN host; anything else opens in the system browser.
  win.webContents.on('will-navigate', (e, url) => { const u = new URL(url); if (u.protocol === 'http:' && lanHost(u.hostname)) return; e.preventDefault(); if (u.protocol === 'https:') shell.openExternal(url); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => cb(['pointerLock', 'fullscreen', 'clipboard-sanitized-write'].includes(permission)));
  // Browser downloads (Export campaign save) go through a save dialog.
  // Right-click in text fields and selected text: the standard editing menu.
  win.webContents.on('context-menu', (_e, p) => {
    const items = p.isEditable ? [{ role: 'undo', enabled: p.editFlags.canUndo }, { role: 'redo', enabled: p.editFlags.canRedo }, { type: 'separator' }, { role: 'cut', enabled: p.editFlags.canCut }, { role: 'copy', enabled: p.editFlags.canCopy }, { role: 'paste', enabled: p.editFlags.canPaste }, { type: 'separator' }, { role: 'selectAll' }] : p.selectionText?.trim() ? [{ role: 'copy' }, { role: 'selectAll' }] : [];
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
  win.webContents.session.on('will-download', (_e, item) => { item.setSaveDialogOptions({ title: 'Save file', defaultPath: path.join(app.getPath('documents'), item.getFilename()) }); });
  win.loadURL(origin() + '/');
}

// Import a campaign file (e.g. the web package's lan/campaign-save.json). The current save is backed up
// first and the new one is written atomically; the room restarts on the same port.
async function importSave() {
  const r = await dialog.showOpenDialog(win, { title: 'Import campaign save', filters: [{ name: 'Campaign save', extensions: ['json'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return;
  try {
    const text = await readFile(r.filePaths[0], 'utf8'), data = JSON.parse(text);
    if (data.operations?.mode !== 'campaign' || !Array.isArray(data.nets) || !Array.isArray(data.cables)) throw Error('This file is not a campaign save.');
    const target = savePath(); await copyFile(target, target.replace(/\.json$/, '') + '.before-import.json').catch(() => {});
    await writeFile(target + '.tmp', text); await rename(target + '.tmp', target);
    const port = room.port; await room.close(); room = await startRoom({ port, bind: '127.0.0.1', savePath: target }); hosting = false;
    win.loadURL(origin() + '/'); dialog.showMessageBox(win, { message: 'Campaign imported', detail: 'Choose Solo Campaign → Continue (or LAN Host Campaign) to play it. The previous save was kept as campaign-save.before-import.json.' });
  } catch (e) { dialog.showErrorBox('Import failed', e.message); }
}
async function exportSave() {
  const r = await dialog.showSaveDialog(win, { title: 'Export campaign save', defaultPath: path.join(app.getPath('documents'), 'infra-campaign.json'), filters: [{ name: 'Campaign save', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return;
  try { await copyFile(savePath(), r.filePath); } catch (e) { dialog.showErrorBox('Export failed', e.code === 'ENOENT' ? 'There is no hosted campaign save yet. Solo campaigns: Team → Save → Export in the game.' : e.message); }
}

// LAN discovery: while hosting, the app announces its game once a second (UDP broadcast on port 47790: app,
// version, host name, port, room code); every running app listens, so the Join screen can list
// "Games on your network" for one-click joining. LAN only (broadcasts never leave the local network).
const DISCOVERY_PORT = 47790, found = new Map(); let beacon = null, beaconName = '', listener = null;
function broadcastAddresses() { const out = new Set(['255.255.255.255']); for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal && i.netmask) { const ip = i.address.split('.').map(Number), m = i.netmask.split('.').map(Number); out.add(ip.map((b, k) => (b & m[k]) | (~m[k] & 255)).join('.')); } return [...out]; }
function listen() {
  if (listener) return; listener = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  listener.on('message', (buf, rinfo) => { try { const m = JSON.parse(String(buf)); if (m.app !== 'infra-simulator' || !Number.isInteger(m.port)) return; if (room && m.port === room.port && room.addresses().some(a => a.startsWith(rinfo.address + ':'))) return; found.set(rinfo.address + ':' + m.port, { address: rinfo.address + ':' + m.port, name: String(m.name || 'LAN game').slice(0, 40), code: String(m.code || '').slice(0, 12), version: String(m.version || ''), players: m.players | 0, mode: String(m.mode || ''), seen: Date.now() }); } catch {} });
  listener.on('error', () => { try { listener.close(); } catch {} listener = null; });
  listener.bind(DISCOVERY_PORT, () => { try { listener.setBroadcast(true); } catch {} });
}
function startBeacon() {
  if (beacon) return; const sock = dgram.createSocket('udp4'); sock.bind(() => { try { sock.setBroadcast(true); } catch {} });
  const send = () => { if (!room || !hosting) return; const msg = Buffer.from(JSON.stringify({ app: 'infra-simulator', version: app.getVersion(), name: beaconName || os.hostname(), port: room.port, locked: true, players: room.players, mode: (g => g?.payday ? 'Payday' : g?.mode === 'campaign' ? 'Campaign' : g?.mode || '')(room.world?.operations?.game) })); for (const a of broadcastAddresses()) sock.send(msg, DISCOVERY_PORT, a, () => {}); };
  beacon = { sock, timer: setInterval(send, 1000) }; send();
}
function stopBeacon() { if (!beacon) return; clearInterval(beacon.timer); try { beacon.sock.close(); } catch {} beacon = null; }
// Fallback when broadcasts are blocked (Windows firewall on UDP, Wi-Fi that drops broadcasts): ask every
// address on this computer's /24 networks for a game on port 8080 (the same TCP port joining uses anyway).
// ~254 tiny requests with a short timeout, at most every 5 s while the Join screen is open.
let scanAt = 0, scanning = false;
async function scanSubnets() {
  if (scanning || Date.now() - scanAt < 5000) return; scanning = true; scanAt = Date.now();
  const own = new Set(), targets = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address)) { own.add(i.address); const base = i.address.split('.').slice(0, 3).join('.'); for (let n = 1; n < 255; n++) targets.push(base + '.' + n); }
  const probe = ip => new Promise(res => { const req = http.get({ host: ip, port: LAN_PORT, path: '/api/room', timeout: 600 }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { const m = JSON.parse(d); if (m.protocol === 'infra-lan-v1' && m.hosting !== false && !(own.has(ip) && hosting)) found.set(ip + ':' + LAN_PORT, { address: ip + ':' + LAN_PORT, name: String(m.name || 'LAN game').slice(0, 40), version: '', players: m.players | 0, mode: String(m.mode || ''), seen: Date.now() }); } catch {} res(); }); }); req.on('timeout', () => { req.destroy(); res(); }); req.on('error', () => res()); });
  for (let k = 0; k < targets.length; k += 64) await Promise.all(targets.slice(k, k + 64).map(probe));
  scanning = false;
}
ipcMain.handle('desktop:discover', () => { listen(); scanSubnets(); const now = Date.now(); for (const [k, v] of found) if (now - v.seen > 9000) found.delete(k); return [...found.values()]; });

// Renderer bridge (see preload.cjs): host on the LAN, stop hosting, app info.
ipcMain.handle('desktop:host', async (_e, opts = {}) => {
  beaconName = String(opts?.name || '').slice(0, 40);
  if (opts?.code) await room.setCode(opts.code);
  // Opening to the LAN restarts the listener: connected pages reconnect (`rebound` tells the page to wait for that).
  let rebound = false; if (!hosting) { const port = room.port; try { await room.rebind('0.0.0.0', port); } catch { await room.rebind('0.0.0.0', 0); } hosting = true; rebound = true; }
  startBeacon();
  return { port: room.port, roomCode: room.roomCode, addresses: room.addresses(), hosting, rebound };
});
ipcMain.handle('desktop:stop-hosting', async () => { stopBeacon(); if (hosting) { await room.rebind('127.0.0.1', room.port); hosting = false; } return { hosting }; });
ipcMain.handle('desktop:in-match', (_e, on) => { inMatch = !!on; return inMatch; });
ipcMain.handle('desktop:info', () => ({ version: app.getVersion(), platform: process.platform, hosting, port: room.port, savePath: savePath() }));

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(async () => {
  app.setAboutPanelOptions({ applicationName: 'Infra Simulator', applicationVersion: app.getVersion(), credits: 'Created by Darja', copyright: '© Darja' });
  await openRoom(); listen();
  // Windows / Linux: menu shortcuts are Ctrl+letter (Ctrl+W close, Ctrl+R reload, Ctrl+A select all, Ctrl+± zoom…).
  // In Global Defensive Ctrl is crouch, so crouch-walking (Ctrl+W) closed the game and crouch-reloading (Ctrl+R)
  // reloaded it. There the menu keeps its items but does not register their shortcuts: the keys go to the game
  // (text fields still copy / paste natively). F11 (full screen) stays. macOS uses Cmd, which never collides.
  const mac = process.platform === 'darwin', key = item => mac ? item : { ...item, registerAccelerator: false };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [{ label: 'Import campaign save…', click: importSave }, { label: 'Export hosted campaign save…', click: exportSave }, { label: 'Show saves folder', click: () => shell.openPath(app.getPath('userData')) }, { type: 'separator' }, mac ? { role: 'close' } : key({ role: 'quit' })] },
    // Edit roles give text fields the platform clipboard shortcuts (Cmd+C/V/X/A on macOS need them).
    mac ? { role: 'editMenu' } : { label: 'Edit', submenu: ['undo', 'redo', null, 'cut', 'copy', 'paste', 'selectAll'].map(r => r ? key({ role: r }) : { type: 'separator' }) },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, key({ role: 'resetZoom' }), key({ role: 'zoomIn' }), key({ role: 'zoomOut' }), { type: 'separator' }, key({ role: 'reload' }), key({ role: 'toggleDevTools' })] },
    mac ? { role: 'windowMenu' } : { label: 'Window', submenu: [key({ role: 'minimize' }), key({ role: 'close' })] }
  ]));
  createWindow();
});
app.on('window-all-closed', () => app.quit());
let closing = false;
app.on('before-quit', async e => { if (closing || !room) return; e.preventDefault(); closing = true; try { await room.close(); } finally { app.quit(); } });
