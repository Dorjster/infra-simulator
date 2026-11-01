// Skins appearing in a live round (package S, PLAN §5.6): a Defuse round goes live, then another player's AK with a CS2
// finish and your knife with a CS2 finish appear — nothing is fetched or uploaded (lab.js gate: a guest on Wi-Fi keeps
// its link, no upload stall), both draw their built-in stand-in, and no shader is built (renderer.info.programs the
// same); the warm-up reported no errors (the Quaternius guns' array materials included: Bug A). Once the gate opens
// (between rounds; forced here) the pictures go up one a frame and the CS2 bake shows, still with no new program.
// Then a no-assets check: the built-in finishes on every built-in model compile and draw (warm-up list) with no error.
// Skipped without imported CS2 finishes.
//   node tests/browser/gd-skin-render-e2e.mjs <repo-root> <out-dir> [map=dust2]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-skin-render-e2e'), ...rest] = process.argv.slice(2); mkdirSync(out, { recursive: true }); const opt = Object.fromEntries(rest.map(a => a.split('=')));
const man = (() => { try { return JSON.parse(readFileSync(path.join(root, 'user-assets', 'skins', 'skins.json'), 'utf8')); } catch { return null; } })();
if (!man?.weapons?.ak || !man?.knives) { console.log('SKIP: no imported CS2 finishes on this computer'); process.exit(0); }
const s = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDSKRE', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gsr-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { s.kill(); } catch {} });
const base = await new Promise(r => s.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 500) : '')); };
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }), errs = [], shaderErr = [];
p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); p.on('console', m => { const t = m.text(); if (/Shader Error|ERROR: 0:|VALIDATE_STATUS/i.test(t)) shaderErr.push(t.slice(0, 800)); });
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Viewer'); localStorage.setItem('infra-face-name', 'Viewer'); localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High' })); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1000);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', opt.map || 'dust2'); await p.selectOption('#ss-ar-bots', '1').catch(() => {}); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 300000 }); await p.waitForTimeout(1500);
if (await p.evaluate(() => { const e = document.getElementById('start-screen'); return !!e && !e.hidden; })) await p.keyboard.press('Escape');
await p.evaluate(async () => { const F = await import('/fp-view.js'); await F.fpSetsReady?.(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); });
const warmErr = await p.evaluate(() => globalThis.__skinWarmErrors);
check('warm-up: every gun and knife skinned and compiled without an error (array materials too: Bug A)', Array.isArray(warmErr) && warmErr.length === 0, JSON.stringify(warmErr));
const live = await p.waitForFunction(() => { const r = __infra.lab.world.operations.game.combat?.d?.round; return r && (r.phase === 'live' || r.phase === 'planted') ? r.phase : false; }, null, { timeout: 90000 }).then(h => h.jsonValue()).catch(() => null);
check('a Defuse round goes live', !!live, live);
const kit = Object.keys(man.weapons.ak.finishes)[0], fam = Object.keys(man.knives).find(f => man.knives[f].models.karambit);
const r1 = await p.evaluate(async ({ kit, fam }) => { const S = await import('/skin-render.js'), T = await import('/skin-textures.js'), W = await import('/weapon-models.js'), R = __infra.renderer; await new Promise(r => setTimeout(r, 300));
  const prog0 = R.info.programs.length, st0 = T.skinTexStats(), gun = W.weaponModel('ak', 1); gun.position.copy(__infra.camera.position).add({ x: 0, y: -1, z: -3 }); __infra.scene.add(gun); S.skinObject(gun, { finish: 'cs2:' + kit, wear: .1, seed: 1 });   // (another player's AK appears, skinned)
  const m = []; gun.traverse(o => { if (o.isMesh) m.push(...[].concat(o.material)); }); const knife = { finish: 'cs2k:' + fam, wear: .02, seed: 3 }, km = new (await import('/three.module.js')).MeshStandardMaterial({ map: m[0].map }); const T3 = await import('/three.module.js'); S.prepareSkins([km], { model: 'karambit', uv: 'cs2', tier: 'fp', M: new T3.Matrix4() }); S.applySkin([km], knife, false);
  await new Promise(r => setTimeout(r, 2500)); const st1 = T.skinTexStats(); globalThis.__skGun = gun; globalThis.__skKm = km;
  return { prog0, prog1: R.info.programs.length, fetched: st1.fetches - st0.fetches, uploaded: st1.uploads - st0.uploads, mode: m[0].userData.skinU?.uSkMode.value, kmode: km.userData.skinU.uSkMode.value, queued: st1.queued, phase: __infra.lab.world.operations.game.combat?.d?.round?.phase }; }, { kit, fam });
check('live round: a CS2-skinned gun and knife appear — nothing fetched, nothing uploaded, their pictures queued', r1.fetched === 0 && r1.uploaded === 0 && r1.queued >= 2 && /live|planted/.test(r1.phase), JSON.stringify(r1));
check('…both draw their built-in stand-in meanwhile (mode 2), and no shader was built', r1.mode === 2 && r1.kmode === 2 && r1.prog1 === r1.prog0, `modes ${r1.mode}/${r1.kmode} programs ${r1.prog0} → ${r1.prog1}`);
const r2 = await p.evaluate(async () => { const T = await import('/skin-textures.js'), R = __infra.renderer, prog0 = R.info.programs.length; let perFrame = 0, last = T.skinTexStats().uploads; T.setSkinGate(() => true);   // (as at the next freeze)
  for (let i = 0; i < 240; i++) { await new Promise(r => requestAnimationFrame(r)); const u = T.skinTexStats().uploads; perFrame = Math.max(perFrame, u - last); last = u; const m = []; __skGun.traverse(o => { if (o.isMesh) m.push(...[].concat(o.material)); }); if (m[0].userData.skinU.uSkMode.value === 3 && __skKm.userData.skinU.uSkMode.value === 3) break; }
  const m = []; __skGun.traverse(o => { if (o.isMesh) m.push(...[].concat(o.material)); }); await new Promise(r => setTimeout(r, 300)); return { perFrame, mode: m[0].userData.skinU.uSkMode.value, kmode: __skKm.userData.skinU.uSkMode.value, prog0, prog1: R.info.programs.length, st: T.skinTexStats() }; });
check('gate open (between rounds): at most one texture to the GPU a frame, then the CS2 bakes show (mode 3), no new program', r2.perFrame <= 1 && r2.mode === 3 && r2.kmode === 3 && r2.prog1 === r2.prog0, JSON.stringify(r2));
writeFileSync(path.join(out, 'live.jpg'), await p.screenshot({ type: 'jpeg', quality: 85 }));
check('no shader errors, no page errors', !shaderErr.length && !errs.length, [...shaderErr, ...errs].slice(0, 3).join(' | '));
console.log(`${ok === n ? 'PASS' : 'FAIL'}: skins in a live round · ${ok}/${n}`); await b.close(); process.exit(ok === n ? 0 : 1);
