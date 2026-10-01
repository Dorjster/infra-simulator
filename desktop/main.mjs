// Infra Simulator desktop shell (Electron). The game is the same browser client and the same room
// server as the web package: the room runs in this main process, bound to 127.0.0.1 for Solo and
// rebound to the LAN only while the player hosts. Saves live in the per-user app-data folder.
import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile, rename, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = await stat(path.join(here, 'game', 'lan', 'room.mjs')).then(() => path.join(here, 'game')).catch(() => path.resolve(here, '..'));
const { startRoom } = await import(pathToFileURL(path.join(gameRoot, 'lan', 'room.mjs')).href);

// Laptops with two GPUs: ask for the discrete one (Chromium/ANGLE picks the low-power GPU otherwise).
app.commandLine.appendSwitch('force_high_performance_gpu');
if (!app.requestSingleInstanceLock()) app.quit(); // one window, one room: no duplicate servers after relaunch
let win = null, room = null, hosting = false;
const savePath = () => path.join(app.getPath('userData'), 'campaign-save.json');
const origin = () => 'http://127.0.0.1:' + room.port;
// Private LAN hosts a player may join (http only, RFC 1918 + link-local + loopback).
const lanHost = h => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|localhost$)/.test(h);

async function openRoom() {
  room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: savePath(), deliveryScale: process.env.INFRA_DELIVERY_SCALE, log: m => console.log('[room]', m), error: m => console.error('[room]', m) });
  hosting = false;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 640, backgroundColor: '#07121b', title: 'Infra Simulator', show: false,
    icon: path.join(here, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false }
  });
  win.once('ready-to-show', () => win.show());
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

// Renderer bridge (see preload.cjs): host on the LAN, stop hosting, app info.
ipcMain.handle('desktop:host', async () => {
  if (!hosting) { const port = room.port; try { await room.rebind('0.0.0.0', port); } catch { await room.rebind('0.0.0.0', 0); } hosting = true; }
  return { port: room.port, roomCode: room.roomCode, addresses: room.addresses(), hosting };
});
ipcMain.handle('desktop:stop-hosting', async () => { if (hosting) { await room.rebind('127.0.0.1', room.port); hosting = false; } return { hosting }; });
ipcMain.handle('desktop:info', () => ({ version: app.getVersion(), platform: process.platform, hosting, port: room.port, savePath: savePath() }));

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(async () => {
  await openRoom();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [{ label: 'Import campaign save…', click: importSave }, { label: 'Export hosted campaign save…', click: exportSave }, { label: 'Show saves folder', click: () => shell.openPath(app.getPath('userData')) }, { type: 'separator' }, process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }] },
    // Edit roles give text fields the platform clipboard shortcuts (Cmd+C/V/X/A on macOS need them).
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] },
    { role: 'windowMenu' }
  ]));
  createWindow();
});
app.on('window-all-closed', () => app.quit());
let closing = false;
app.on('before-quit', async e => { if (closing || !room) return; e.preventDefault(); closing = true; try { await room.close(); } finally { app.quit(); } });
