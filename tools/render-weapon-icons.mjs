// Renders the buy-menu / kill-feed picture of every gun and knife from its in-game 3D model (side view, barrel to the
// right, transparent background) into dist/icons/w-<id>.png. Pictures, not runtime renders: opening the buy menu
// costs nothing. The kill feed shows the same picture as a white silhouette (CSS filter).
//   node tools/render-weapon-icons.mjs <repo root> [ids…]      (needs playwright-core and Chrome; ids: only those)
// Run it without user-assets/ (imported CS2 models): the pictures ship with the game, so they come from its own models.
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, ...only] = process.argv.slice(2), out = path.join(root, 'dist', 'icons'); mkdirSync(out, { recursive: true });
const s = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'ICONS1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'ic-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => s.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] }), p = await b.newPage();
p.on('pageerror', e => console.log('ERR', e.message)); await p.goto(base + '/models/weapons/ak-main-base.jpg');
const icons = await p.evaluate(async only => {
  const THREE = await import('/three.module.js'), W = await import('/weapon-models.js'), D = await import('/weapons-data.js'); await W.loadRealWeapons();
  const ids = [...D.WEAPONS.map(w => w.id), ...D.KNIVES.map(k => k.id)].filter(id => !only.length || only.includes(id)), Wd = 512, H = 224, r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(Wd, H); r.setClearColor(0, 0); r.outputColorSpace = THREE.SRGBColorSpace;
  const env = new THREE.PMREMGenerator(r).fromScene(new (await import('/post/RoomEnvironment.js')).RoomEnvironment(), .04).texture, res = {};
  for (const id of ids) { const sc = new THREE.Scene(); sc.environment = env; sc.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.6)); const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(8, 6, 2); sc.add(dl);
    const m = W.weaponModel(id, 1); sc.add(m); m.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()), h = Math.max(sz.z / (Wd / H), sz.y) * .54;
    const cam = new THREE.OrthographicCamera(-h * Wd / H, h * Wd / H, h, -h, .01, 100); cam.position.set(c.x + 20, c.y, c.z); cam.lookAt(c); r.render(sc, cam); res[id] = r.domElement.toDataURL('image/png'); }
  return res; }, only);
for (const [id, url] of Object.entries(icons)) { writeFileSync(path.join(out, 'w-' + id + '.png'), Buffer.from(url.split(',')[1], 'base64')); }
console.log(Object.keys(icons).length + ' icons → dist/icons/'); await b.close(); s.kill(); process.exit(0);
