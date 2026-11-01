// Built-in finishes without any imported files (the released game, CI: GD_ASSETS_DIR = an empty folder): every finish
// on the built-in models — a Quaternius gun (array materials, no UVs: Bug A), a CC0 rifle, the procedural knife, the
// CC0 karambit — drawn in the models' own space (mode 2) through the real renderer, under one studio light, laid out
// on a labelled sheet. Checks: every cell painted (differs from the unskinned model), no shader or page errors, no
// program added by any finish after the first.
//   node tests/browser/gd-skins-noassets-sheet.mjs <repo-root> <out-dir> [desktop=1]   (desktop=1: ~/Desktop/GD-v52-skins-no-assets.jpg)
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-skins-noassets'), ...rest] = process.argv.slice(2); mkdirSync(out, { recursive: true }); const opt = Object.fromEntries(rest.map(a => a.split('=')));
const empty = mkdtempSync(path.join(os.tmpdir(), 'gd-noassets-'));
const s = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDSKNA', HOST_KEY: 'k', GD_ASSETS_DIR: empty, CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gsn-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { s.kill(); } catch {} });
const base = await new Promise(r => s.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); };
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }), errs = [], shaderErr = [];
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { const t = m.text(); if (/Shader Error|ERROR: 0:|VALIDATE_STATUS/i.test(t)) shaderErr.push(t.slice(0, 800)); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.renderer, null, { timeout: 60000 }); await p.waitForTimeout(800);
const res = await p.evaluate(async () => {
  const T = await import('/three.module.js'), W = await import('/weapon-models.js'), S = await import('/skin-render.js'), { FINISHES } = await import('/skins.js'), { RoomEnvironment } = await import('/post/RoomEnvironment.js'), R = __infra.renderer;
  const ua = await (await fetch('/api/user-assets')).json(); await W.loadRealWeapons();
  const models = [['p90', 'P90 (Quaternius, no UVs)'], ['ak', 'AK-47 (CC0)'], ['knife', 'knife (built-in)'], ['karambit', 'karambit (CC0)'], ['deagle', 'Desert Eagle (variant)']], fins = Object.keys(FINISHES);
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(28, 1.6, .05, 100), pm = new T.PMREMGenerator(R); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; scene.background = new T.Color(0x2a3036);
  const sun = new T.DirectionalLight(0xffffff, 2.2); sun.position.set(2, 4, 3); scene.add(sun, new T.AmbientLight(0xffffff, .3));
  const rt = new T.WebGLRenderTarget(320, 200, { samples: 4 }); rt.texture.colorSpace = T.SRGBColorSpace; const cvs = document.createElement('canvas'); cvs.width = 320; cvs.height = 200; const cx = cvs.getContext('2d'), buf = new Uint8Array(320 * 200 * 4), shots = {}, sums = {};
  const progs = []; const was = R.getRenderTarget();
  for (const [id] of models) { const g = W.weaponModel(id, 1); g.rotation.y = Math.PI / 2; const box = new T.Box3().setFromObject(g), c = box.getCenter(new T.Vector3()), L = box.getSize(new T.Vector3()).length(); g.position.sub(c); scene.add(g); cam.position.set(0, L * .12, L * 1.55); cam.lookAt(0, 0, 0);
    for (const f of fins) { S.skinObject(g, f === 'none' ? null : { finish: f, wear: .05, seed: 300, stickers: [] }); R.setRenderTarget(rt); R.render(scene, cam); R.readRenderTargetPixels(rt, 0, 0, 320, 200, buf); progs.push(R.info.programs.length);
      let sum = 0; const img = cx.createImageData(320, 200); for (let y = 0; y < 200; y++) for (let x = 0; x < 320; x++) { const i = ((199 - y) * 320 + x) * 4, o = (y * 320 + x) * 4; img.data[o] = buf[i]; img.data[o + 1] = buf[i + 1]; img.data[o + 2] = buf[i + 2]; img.data[o + 3] = 255; sum += buf[i] * 3 + buf[i + 1] * 5 + buf[i + 2] * 7; }
      cx.putImageData(img, 0, 0); shots[id + '|' + f] = cvs.toDataURL('image/jpeg', .9); sums[id + '|' + f] = sum; }
    S.skinObject(g, null); scene.remove(g); }
  R.setRenderTarget(was); return { shots, sums, models, fins, progs, hash: ua.hash, warm: globalThis.__skinWarmErrors };
});
check('no imported files served (an empty user-assets)', !res.hash);
const unpainted = []; for (const [id] of res.models) for (const f of res.fins) if (f !== 'none' && res.sums[id + '|' + f] === res.sums[id + '|none']) unpainted.push(id + ':' + f);
check('every built-in finish paints every built-in model (the Quaternius gun with its array materials too)', !unpainted.length, unpainted.join(' '));
const segs = res.models.map((_, i) => res.progs.slice(i * res.fins.length, (i + 1) * res.fins.length));
check('no program added by any finish: per model the count after its plain look stays the same through every finish', segs.every(sg => sg.every(v => v === sg[0])), segs.map(sg => sg[0] + (sg.every(v => v === sg[0]) ? '' : '→' + Math.max(...sg))).join(' '));
check('no shader errors, no page errors', !shaderErr.length && !errs.length, [...shaderErr, ...errs].slice(0, 3).join(' | '));
const data = await p.evaluate(async ({ shots, models, fins }) => { const cw = 240, ch = 150, pad = 4, left = 180, head = 60, W = left + fins.length * (cw + pad), H = head + models.length * (ch + pad), cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#14181c'; g.fillRect(0, 0, W, H); g.fillStyle = '#f0b232'; g.font = 'bold 24px system-ui'; g.fillText('GD v52 built-in finishes, no imported files (released game / CI): object-space patterns, per-finish metal & gloss', 8, 28);
  g.fillStyle = '#9fb3c3'; g.font = 'bold 15px system-ui'; fins.forEach((f, i) => g.fillText(f, left + i * (cw + pad) + 4, 52));
  for (let r = 0; r < models.length; r++) { g.fillStyle = '#e8eef2'; g.font = 'bold 14px system-ui'; g.fillText(models[r][1], 6, head + r * (ch + pad) + ch / 2);
    for (let c = 0; c < fins.length; c++) { const im = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = shots[models[r][0] + '|' + fins[c]]; }); g.drawImage(im, left + c * (cw + pad), head + r * (ch + pad), cw, ch); } }
  return cv.toDataURL('image/jpeg', .9).split(',')[1]; }, res);
const f = path.join(out, 'GD-v52-skins-no-assets.jpg'); writeFileSync(f, Buffer.from(data, 'base64')); if (opt.desktop) copyFileSync(f, path.join(os.homedir(), 'Desktop', 'GD-v52-skins-no-assets.jpg')); console.log('sheet', f);
console.log(`${ok === n ? 'PASS' : 'FAIL'}: built-in finishes without assets · ${ok}/${n}`); await b.close(); process.exit(ok === n ? 0 : 1);
