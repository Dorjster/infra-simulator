// Global Defensive bullet impacts, frame by frame (v53 ADDENDUM 11: "check the result frame by frame against what CS2
// renders"): each surface's CS2 impact (dist/gd-impacts.js — and the helmet dink, gd-blood.js + DINK_EXTRA) drawn alone
// by the game's own pools and shaders in a plain three.js scene, against a wall of that surface's colour, lit as a
// sunlit and a shaded spot, at 0 (the first frame), 60 and 200 ms after the hit, close up. A labelled sheet goes to
// <out>/gd-impacts-look.jpg (and to ~/Desktop/GD-v53-impacts-frames.jpg when DESKTOP=1). Muted Chrome (bt2.sh).
//   node tests/browser/gd-impacts-look.mjs <repo-root> <out-dir> [detail=2]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-impacts-look'), detail = '2', only = ''] = process.argv.slice(2); mkdirSync(out, { recursive: true });   // (only: draw just the emitters whose CS2 name matches — a look check)
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDLK01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdlk-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio'] });
let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 300))); };
try {
  const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(base + '/gd-impacts-look.html', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111"></body>' })); await p.goto(base + '/gd-impacts-look.html', { timeout: 60000 });   // (a blank page of the game's origin: the modules load from it)
  const res = await p.evaluate(async ([detail, only]) => {
    const THREE = await import('/three.module.js'), I = await import('/gd-impacts.js'), B = await import('/gd-blood.js'), { HU } = await import('/weapons-data.js');
    if (only) { const re = new RegExp(only); for (const L of [...Object.values(I.FX), I.DINK_EXTRA]) { const keep = L.filter(e => re.test(e.src)); L.length = 0; L.push(...keep); } }
    const CW = 360, CH = 300, renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(CW, CH); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.LinearToneMapping; document.body.appendChild(renderer.domElement);
    // surface: its wall colour (sRGB, roughly the maps' own: Nuke's grey-blue metal, Dust II's limestone, a wooden door, sand…) and material
    const CASES = [['metal', 'metal', [96, 104, 112], 1], ['metal (shade)', 'metal', [70, 76, 84], .25], ['concrete', 'concrete', [206, 196, 176], 1], ['plaster', 'plaster', [214, 206, 192], 1], ['wood', 'wood', [128, 96, 64], 1], ['sand', 'sand', [196, 176, 138], 1], ['glass', 'glass', [120, 140, 150], 1], ['tile', 'roof', [170, 150, 130], 1], ['helmet dink', 'dink', [150, 175, 205], 1]];
    const AGES = [1 / 120, .06, .2], cells = [];
    for (const [label, mat, col, light] of CASES) {
      const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, CW / CH, .05, 500);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(400 * HU, 400 * HU), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...col.map(v => v / 255), THREE.SRGBColorSpace).multiplyScalar(.35 + .65 * light) }));
      // the wall faces +z at z = 0; a floor under it for the falling bits
      scene.add(wall); const floor = new THREE.Mesh(new THREE.PlaneGeometry(400 * HU, 400 * HU), wall.material); floor.rotation.x = -Math.PI / 2; floor.position.set(0, -40 * HU, 200 * HU); scene.add(floor);
      let imp = null, blood = null; const G = { mode: 'arena', combat: { bl: [], d: { match: 1, n: 1 } }, arena: { map: 'x' } };
      imp = I.createImpacts(scene, { detail: () => +detail, game: () => G, lightAt: () => light }); imp.setViewHeight(CH);
      if (mat === 'dink') { blood = B.createBlood(scene, { game: () => G, me: () => 'me', clock: () => 5000, assets: false, onDink: r => imp.dink(r) }); blood.setViewHeight?.(CH); }
      // the shot: from an eye 40 HU out and 10 HU up-left, into the wall's centre; the camera 36 HU off it, to the side
      const hx = 0, hy = 0, hz = 0, ex = -12 * HU, ey = 10 * HU, ez = 40 * HU, L = Math.hypot(hx - ex, hy - ey, hz - ez), dx = (hx - ex) / L, dy = (hy - ey) / L, dz = (hz - ez) / L;
      cam.position.set(14 * HU, 6 * HU, 34 * HU); cam.lookAt(0, 3 * HU, 6 * HU); cam.updateMatrixWorld();
      if (mat === 'dink') { wall.visible = false; scene.background = wall.material.color; blood.update(); G.combat.bl.push({ i: 4242, at: 5000, v: 'bot', z: 'head', d: 40, hm: 1, p: [0, 0, 6 * HU], r: [dx, dy, dz], s: 'me' }); }
      const t0 = imp.now(); if (mat !== 'dink') imp.hit(hx, hy, hz, 0, 0, 1, dx, dy, dz, mat, true, t0); else blood.update();
      const tB = blood?.time;
      for (const a of AGES) { imp.hold(t0 + a); imp.update(); if (blood) { blood.hold?.(tB + a); blood.update(); }
        renderer.render(scene, cam); cells.push({ label, age: a, url: renderer.domElement.toDataURL('image/jpeg', .92) }); }
      imp.release(); imp.dispose(); blood?.dispose?.();
    }
    // the sheet
    const cols = AGES.length, rows = CASES.length, c = document.createElement('canvas'); c.width = CW * cols + 170; c.height = CH * rows + 50; const x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#fff'; x.font = 'bold 20px sans-serif'; x.fillText('GD v53 impacts frame by frame — CS2 particles/impact_fx numbers, our own sprites (detail ' + ['Low', 'Medium', 'High', 'Ultra'][detail] + ')', 12, 30);
    const imgs = await Promise.all(cells.map(e => new Promise(r => { const im = new Image(); im.onload = () => r({ ...e, im }); im.src = e.url; })));
    imgs.forEach((e, k) => { const cx = 170 + (k % cols) * CW, cy = 50 + Math.floor(k / cols) * CH; x.drawImage(e.im, cx, cy); x.strokeStyle = '#000'; x.strokeRect(cx, cy, CW, CH);
      if (k % cols === 0) { x.fillStyle = '#ffd76a'; x.font = 'bold 18px sans-serif'; x.fillText(e.label.toUpperCase(), 10, cy + CH / 2); }
      if (k < cols) { x.fillStyle = '#ffd76a'; x.font = 'bold 16px sans-serif'; x.fillText(Math.round(e.age * 1000) + ' ms', cx + 8, cy + 20); } });
    return { sheet: c.toDataURL('image/jpeg', .9), n: cells.length, emitters: I.FX.metal.map(e => e.src).join(','), bloom: I.BLOOM_K };
  }, [detail, only]);
  console.log('metal emitters:', res.emitters, '· BLOOM_K', res.bloom); check('every surface drawn at 0, 60 and 200 ms', res.n === 27, res.n);
  const f = path.join(out, 'gd-impacts-look.jpg'); writeFileSync(f, Buffer.from(res.sheet.split(',')[1], 'base64')); console.log('sheet', f);
  if (process.env.DESKTOP === '1') { const d = path.join(os.homedir(), 'Desktop', 'GD-v53-impacts-frames.jpg'); copyFileSync(f, d); console.log('→', d); }
  check('no page errors', !errs.length, errs.slice(0, 5).join(' | '));
} catch (e) { console.log('FAIL run: ' + e.message); failed++; }
finally { await b.close(); server.kill(); }
console.log(failed ? `FAIL: gd-impacts-look · ${failed}` : 'PASS: gd-impacts-look'); process.exit(failed ? 1 : 0);
