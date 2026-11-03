// Global Defensive · the round's kill tally (CS2's badge + card fan, v53 spec 2.1 / Addendum 7) and the headshot
// feedback in the real game (2.2), muted. Defuse vs easy bots at 1280×720 (device scale 2): you kill one enemy with body
// shots and one with a headshot, for real (lab.look puts you in a clear line to the bot, weapons.js fire() shoots, the
// host judges). On each kill the tally's CSS animations are paused and stepped (Element.getAnimations, currentTime
// 0 … 950 ms) and pictured — a frame sequence of the pop, shine, lightning and glow-down on the new card. Then a sheet
// page (the same module, its own nodes) pictures a 5-kill round with the ace ring, the marks, CS2's extra card past 5,
// reduce-flashes, ours vs CS2's pictures, next to the user's CS2 reference pictures; and a trace of one burst counts
// the main thread's Layout / Paint / style work against an idle second (the animations must be the compositor's).
//   node tests/browser/gd-kill-emblem-shots.mjs <repo-root> <out-dir> [--kf <dir>] [--sheet <jpg>]
//     --kf <dir>     serve /user-assets/icons/killfeed/ from <dir> (a killfeed import made elsewhere — CS2's pips)
//     --sheet <jpg>  the picture (default <out-dir>/kill-emblems.jpg)
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const KF_DIR = opt('--kf'), SHEET = opt('--sheet');
const [root = '.', out = path.join(os.tmpdir(), 'gd-kill-emblem-shots'), MAP = 'dust2'] = argv; mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDKE01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdke-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const REF = '/private/tmp/claude-501/-Users-dorjoht-Downloads-infra-lan-v31--2-/e36c7b43-670b-481d-8e6b-7efd02f58f36/scratchpad/v53/ref';
const CARDS = null;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const errs = []; let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 300))); };
const report = { frames: {}, kills: [] };
const T = [0, 30, 60, 100, 140, 200, 260, 330, 400, 500, 650, 800, 950];   // ms into the burst (spec: 140 pop, 320 shine, 250–350 lightning, 600 glow-down)
const routeKf = async p => { if (!KF_DIR) return; await p.route('**/user-assets/icons/killfeed/**', r => { const f = path.join(KF_DIR, decodeURIComponent(new URL(r.request().url()).pathname.split('/').pop())); if (!existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: readFileSync(f), contentType: f.endsWith('.svg') ? 'image/svg+xml' : 'application/json' }); }); };
// Step the paused animations under `sel` (and the hit marker) to t ms each and picture the clip.
async function frames(p, tag, clip) {
  const shots = [];
  await p.evaluate(() => { for (const a of [...document.querySelectorAll('#gd-ke, .gd-hm')].flatMap(e => e.getAnimations({ subtree: true }))) a.pause(); });
  for (const t of T) {
    await p.evaluate(t => { for (const a of [...document.querySelectorAll('#gd-ke, .gd-hm')].flatMap(e => e.getAnimations({ subtree: true }))) a.currentTime = t; }, t);
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const f = path.join(out, `${tag}-${String(t).padStart(3, '0')}.jpg`); await p.screenshot({ path: f, type: 'jpeg', quality: 92, clip }); shots.push({ t, f }); }
  await p.evaluate(() => { for (const a of [...document.querySelectorAll('#gd-ke, .gd-hm')].flatMap(e => e.getAnimations({ subtree: true }))) a.play(); });
  report.frames[tag] = shots; return shots; }
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await routeKf(p);
  await p.addInitScript(c => { window.__cards = () => { const m = /\bn(\d|x)\b/.exec(document.getElementById('gd-ke')?.className || ''); return m ? (m[1] === 'x' ? 6 : +m[1]) : 0; }; });   // (cards shown: the root's count class)
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', MAP); await p.selectOption('#ss-ar-bots', '3');
  await p.evaluate(() => { for (const [id, v] of [['ss-ar-warm', '0'], ['ss-ar-freeze', '2'], ['ss-ar-diff', 'easy']]) { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } } }); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
  await p.waitForTimeout(300);
  check('the tally exists: the badge and line shown, no card for 0 kills', await p.evaluate(c => { const r = document.getElementById('gd-ke'); return !!r && !r.hidden && r.querySelectorAll('.ke-f').length === 6 && __cards() === 0 && r.querySelector('.ke-bd').getBoundingClientRect().width > 30; }, CARDS));
  report.badge = await p.evaluate(() => { const r = document.querySelector('#gd-ke .ke-bd').getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, d: r.width, fromBottom: innerHeight - (r.y + r.height / 2) }; });
  check("the badge at the bottom centre, CS2's size (64 px at 1080 p → 42.7 at 720; centre 53 → 35.3 above the bottom)", Math.abs(report.badge.cx - 640) < 2 && Math.abs(report.badge.d - 42.67) < 1.5 && Math.abs(report.badge.fromBottom - 35.33) < 2, JSON.stringify(report.badge));
  await p.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'live', null, { timeout: 60000, polling: 200 });
  await p.evaluate(() => { const L = __infra.lab.lan, c0 = L.combat.bind(L); window.__hits = []; L.combat = a => { const q = c0(a); q.then(r => window.__hits.push({ z: a.zone, w: a.weapon, e: r?.error || null, dmg: r?.result?.dmg ?? r?.dmg, down: r?.result?.down ?? r?.down, hm: r?.hm ?? r?.result?.hm })); return q; }; });
  const audio0 = await p.evaluate(async () => { const S = await import('/gd-sounds.js'); return { ...S.voiceStats }; });
  // One kill: fire at the bot until it is down; head = aim at the head (else the chest). Re-aims every shot (bots move).
  async function killOne(head, tag) {
    const before = await p.evaluate(c => __cards(), CARDS);
    for (let shot = 0; shot < 40; shot++) {
      const st = await p.evaluate(async ({ head }) => {
        const { bulletPath, BulletPath } = await import('/arena-maps.js'); const G = __infra.lab.world.operations.game, C = G.combat, me = 'tester', now = __infra.lab.lan.hostNow?.() ?? Date.now();
        if (C.down?.[me] && C.down[me].until > now) return { dead: true, by: C.down[me].by, weapon: C.down[me].weapon, feed: (C.feed || []).slice(-3).map(f => f.by + '>' + f.target + ':' + f.wid) };
        const team = C.d?.teams?.[me], bx = __infra.lab.arenaScene.boxes;
        const foes = G.arena.bots.filter(b => C.d.teams[b.name.trim().toLowerCase()] !== team && !(C.down?.[b.name.trim().toLowerCase()]?.until > now));
        if (!foes.length) return { none: true };
        const bot = foes[0], down = y0 => { const P = bulletPath(bx, bot.x, y0, bot.z, 0, -1, 0, 400, 0, new BulletPath()); return Number.isFinite(P.stop) && P.stop < 400 ? y0 - P.stop : null; };
        const feet = Number.isFinite(bot.y) ? bot.y : down(14) ?? down(120) ?? 0, ty = feet + (head ? 10.15 : 7.6); let best = null;
        // (behind it if the way is clear: a bot faces (−sin yaw, −cos yaw) — arena-logic.js bot.yaw = heading + π)
        const px = -Math.sin(bot.yaw || 0), pz = -Math.cos(bot.yaw || 0);
        for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a), front = bulletPath(bx, bot.x, feet + 9.7, bot.z, -dx, 0, -dz, 40, 0, new BulletPath()).stop, behind = dx * px + dz * pz; if (!(front < 12) && (!best || behind > best.behind)) best = { dx, dz, behind }; }
        if (!best) return { blocked: bot.name };
        const D = 9, ex = bot.x - best.dx * D, ez = bot.z - best.dz * D, ey = feet + 9.7;
        __infra.lab.look(ex, ez, bot.x, ty, bot.z, ey); __infra.camera.position.set(ex, ey, ez); __infra.camera.lookAt(bot.x, ty, bot.z);
        return { bot: bot.name, hp: C.hp?.[bot.name.trim().toLowerCase()] };
      }, { head });
      if (st.dead || st.none) return { ...st, shots: shot, hits: await p.evaluate(() => window.__hits.splice(0)) };
      if (st.blocked) { await p.waitForTimeout(250); continue; }
      await p.waitForTimeout(140);   // (the pose reaches the host before the shot)
      // (aim at the bot as drawn — its model, where you see it; the host rewinds it to your view: lag-comp.js)
      await p.evaluate(async ({ head, name }) => { let m = null; for (const x of (__infra.lab.lan.models || new Map()).values()) if ((x.name || x.pname) === name) m = x; if (!m) return; const q = m.g.position, { bulletPath, BulletPath } = await import('/arena-maps.js'), P = bulletPath(__infra.lab.arenaScene.boxes, q.x, q.y + 12, q.z, 0, -1, 0, 60, 0, new BulletPath()), feet = Number.isFinite(P.stop) && P.stop < 60 ? q.y + 12 - P.stop : q.y; const c = __infra.camera.position, ty = feet + (head ? 10.15 : 7.6); __infra.lab.look(c.x, c.z, q.x, ty, q.z, c.y); __infra.camera.lookAt(q.x, ty, q.z); __infra.lab.pistol.fire(); }, { head, name: st.bot });
      const got = await p.waitForFunction(([n, c]) => __cards() > n, [before, CARDS], { timeout: 420, polling: 'raf' }).then(() => true, () => false);
      if (got) {
        const shotsF = await frames(p, tag, { x: 540, y: 575, width: 200, height: 145 });
        const fx = await p.evaluate(c => { const G = __infra.lab.world.operations.game, f = G.combat.feed.filter(x => x.by === 'Tester').sort((x, y) => y.at - x.at)[0] || {}, s = [...document.querySelectorAll('#gd-ke .ke-f')].slice(0, __cards()).map(x => x.querySelector('.ke-c')); return { feed: { by: f.by, target: f.target, wid: f.wid, head: !!f.head }, cls: s.map(e => e.className), marker: document.querySelector('.gd-hm')?.className }; }, CARDS);
        await p.screenshot({ path: path.join(out, tag + '-full.jpg'), type: 'jpeg', quality: 85 });
        return { ...fx, shots: shot + 1, frames: shotsF.length }; }
    }
    return { timeout: true };
  }
  // A body kill, then a headshot kill, in one round; killed meanwhile (bots shoot back) → again in the next round.
  let k1 = {}, k2 = {};
  for (let tries = 0; tries < 6; tries++) {
    if (tries) { const r0 = await p.evaluate(() => __infra.lab.world.operations.game.combat.d.round.id); await p.waitForFunction(r => { const d = __infra.lab.world.operations.game.combat.d; return d.round.id !== r && d.round.phase === 'live'; }, r0, { timeout: 240000, polling: 200 }).catch(() => {}); await p.waitForTimeout(300); }
    k1 = await killOne(false, 'body'); console.log('kill 1', JSON.stringify(k1)); if (!k1.cls) continue;
    k2 = await killOne(true, 'head'); console.log('kill 2', JSON.stringify(k2)); if (k2.cls) break; }
  report.kills.push(k1, k2);
  check('a body kill: one card, the default pip, the burst on it', k1.cls?.length === 1 && /\bk[0-4]\b/.test(k1.cls[0]) && !/ h\b/.test(k1.cls[0]) && /n[AB]/.test(k1.cls[0]), JSON.stringify(k1));
  check('the kill\'s hit marker is red (k)', / k\b/.test(k1.marker || ''), k1.marker);
  check('a headshot kill: a second card, the headshot variant, bursting; the first one pulses', k2.cls?.length === 2 && / h\b/.test(k2.cls[1]) && /n[AB]/.test(k2.cls[1]) && /p[AB]/.test(k2.cls[0]) && k2.feed?.head, JSON.stringify(k2));
  check('the headshot kill\'s hit marker: red with the head ticks (k h)', / k h/.test(k2.marker || ''), k2.marker);
  const audio1 = await p.evaluate(async () => { const S = await import('/gd-sounds.js'); return { ...S.voiceStats }; }); report.audio = { audio0, audio1 }; console.log('voices', JSON.stringify(report.audio));
  report.art = await p.evaluate(async () => { const urls = [...new Set([...document.querySelectorAll('#gd-ke .ke-mk')].map(e => (/url\('([^']+)'\)/.exec(e.getAttribute('style') || '') || [])[1]).filter(Boolean))];
    const okN = (await Promise.all(urls.map(u => fetch(u).then(r => r.ok && /svg/.test(r.headers.get('content-type') || ''), () => false)))).filter(Boolean).length;
    return { masks: document.querySelectorAll('#gd-ke .ke-mk').length, lum: document.querySelectorAll('#gd-ke .ke-mk.lum').length, urls: urls.map(u => u.split('/').pop().split('?')[0]), served: okN, maskMode: CSS.supports('mask-mode', 'luminance') }; });
  check("CS2's cards, pips and logos drawn as masks (cards luminance) and served when the killfeed import has them (--kf)", !KF_DIR || (report.art.masks > 40 && report.art.lum === 6 && report.art.urls.includes('kill_1.svg') && report.art.urls.includes('kill_pip_headshot.svg') && report.art.urls.includes('t_logo_1c.svg') && report.art.served === report.art.urls.length && report.art.maskMode), JSON.stringify(report.art));
  // The next round's freeze time clears them (spec): wait for a new round id, then look.
  const rid = await p.evaluate(() => __infra.lab.world.operations.game.combat.d.round.id);
  const cleared = await p.waitForFunction(([r, c]) => { const d = __infra.lab.world.operations.game.combat.d; return d.round.id !== r && __cards() === 0; }, [rid, CARDS], { timeout: 240000, polling: 300 }).then(() => true, () => false);
  check('cleared when the next round\'s freeze time starts', cleared);
  check('no page errors', !errs.length, errs.slice(0, 5).join(' | '));
  await p.close();

  // ── The sheet page: the same module on a bare page — a 5-kill round (the 3rd/4th/ace escalation, the ring wave),
  // marks, CS2's extra card past 5, reduce-flashes, ours vs CS2's pictures; then a trace of one burst. ──
  const q = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }); q.on('pageerror', e => errs.push(e.message)); await routeKf(q);
  await q.goto(base + '/version.js'); await q.evaluate(async () => { document.documentElement.innerHTML = '<head></head><body style="margin:0;background:linear-gradient(#8a7a66,#5e5346)"></body>'; });
  async function rig(label, cs2, rf, ct) { return q.evaluate(async ({ label, cs2, rf, ct }) => {
    const M = await import('/gd-kill-emblem.js'); let art = null;
    if (cs2) { const m = await fetch('/user-assets/icons/killfeed/killfeed.json').then(r => r.ok ? r.json() : null).catch(() => null); if (!m?.cards) return false; const T = { pip: m.pips, card: m.cards, logo: m.logos }; art = { url: (g, n) => T[g]?.[n] ? `/user-assets/icons/killfeed/${T[g][n]}.svg` : null }; }
    document.documentElement.style.cssText = 'height:100%;background:linear-gradient(#8a7a66,#5e5346)'; document.body.style.cssText = 'margin:0;background:transparent'; document.body.innerHTML = `<div style="position:fixed;left:0;right:0;bottom:150px;text-align:center;font:600 15px system-ui;color:#fff;text-shadow:0 1px 2px #000">${label}</div>`;
    const e = M.createKillEmblems({ art, reduce: rf }); e.root.hidden = false; if (ct) e.update(true, { combat: { d: { teams: { me: 'ct' } } } }, 'me', 0); window.__ke = e; return true; }, { label, cs2, rf, ct }); }
  const kill = (kind, marks) => q.evaluate(([k, m]) => window.__ke.kill(k, m), [kind, marks]);
  const clip = { x: 540, y: 560, width: 200, height: 160 };
  async function steps(tag, ts = [0, 60, 130, 200, 300, 450, 700]) { const f = []; await q.evaluate(() => { for (const a of document.getAnimations()) a.pause(); }); for (const t of ts) { await q.evaluate(t => { for (const a of document.getAnimations()) a.currentTime = t; }, t); await q.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); const fp = path.join(out, `${tag}-${t}.jpg`); await q.screenshot({ path: fp, type: 'jpeg', quality: 92, clip }); f.push({ t, f: fp }); } report.frames[tag] = f; }
  const still = async (tag, t) => { await q.waitForTimeout(1100); const fp = path.join(out, tag + '.jpg'); await q.screenshot({ path: fp, type: 'jpeg', quality: 92, clip }); (report.frames.stills ??= []).push({ t, f: fp }); };
  for (const [cs2, tag] of [[false, 'ours'], [true, 'cs2']]) {
    if (!await rig(cs2 ? "CS2's cards, pips and logo (imported)" : 'our own drawings', cs2, false, false)) continue;
    await still(tag + '-0', (cs2 ? 'CS2 · ' : 'ours · ') + '0 kills');
    await kill(0, 0); await still(tag + '-1', '1 kill'); await kill(1, 0); await still(tag + '-2', '2 kills (headshot)'); await kill(2, 1); await still(tag + '-3', '3 (knife, wallbang)'); await kill(1, 4); await q.waitForTimeout(1100);
    await kill(1, 8); await steps(tag + '-ace');
    await kill(0, 0); await kill(1, 0); await still(tag + '-x', '7 kills: the extra card');
  }
  if (await rig('CT side', !!KF_DIR, false, true)) { await kill(1, 0); await kill(3, 0); await kill(4, 2); await still('ct-3', 'CT · 3 kills (HE, fire)'); }
  if (await rig('reduce flashes', false, true, false)) { await kill(0, 0); await kill(1, 0); await kill(1, 0); await steps('rf', [0, 130, 300, 700]); }
  // The trace: one burst (a 3rd kill: arcs, sparks, flash, shine, spotlight) against an idle second, on the main thread.
  { await rig('trace', false, false, false); await kill(0, 0); await kill(1, 0); await q.waitForTimeout(1200);
    const count = buf => { const ev = JSON.parse(buf.toString()).traceEvents || [], c = { Paint: 0, Layout: 0, UpdateLayoutTree: 0, ms: 0, maxMs: 0 }; for (const e of ev) if (e.name in c && e.ph !== 'E') { c[e.name]++; const d = (e.dur || 0) / 1000; c.ms += d; c.maxMs = Math.max(c.maxMs, d); } c.ms = +c.ms.toFixed(2); c.maxMs = +c.maxMs.toFixed(2); return c; };
    await b.startTracing(q, { categories: ['devtools.timeline'] }); await q.waitForTimeout(1000); const idle = count(await b.stopTracing());
    await b.startTracing(q, { categories: ['devtools.timeline'] }); await kill(1, 1); await q.waitForTimeout(1000); const burst = count(await b.stopTracing());
    report.trace = { idle, burst }; console.log('trace', JSON.stringify(report.trace));
    // (Blink still ticks the style of composited animations each frame and records a paint as staggered parts start /
    // end: cheap. What must not happen is layout per frame — animated SVG children did ~20 a kill — or a long task.)
    check('a burst: no layout per frame (≤ 4 in the whole burst), no main-thread task over 4 ms, under 16 ms of style / layout / paint in all', burst.Layout <= 4 && burst.maxMs < 4 && burst.ms < 16, JSON.stringify(report.trace)); }
  await q.close();

  // ── One picture: the user's CS2 reference, the in-game frame sequences, then the sheet rows. ──
  const img = f => 'data:image/' + (f.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + readFileSync(f).toString('base64');
  const row = (title, list, h) => !list?.length ? '' : `<h2>${title}</h2><div class="r">${list.map(x => `<figure><img src="${img(x.f)}"${h ? ` style="height:${h}px"` : ''}><figcaption>${typeof x.t === 'number' ? x.t + ' ms' : x.t}</figcaption></figure>`).join('')}</div>`;
  const refs = ['cs2-kill-emblem.png', 'cs2-kill-emblem-ace.png'].map(n => path.join(REF, n)).filter(existsSync).map(f => ({ f, t: "CS2 (the user's picture) · " + path.basename(f) }));
  const s = await b.newPage({ viewport: { width: 1800, height: 1000 } });
  await s.setContent(`<style>body{margin:0;padding:18px 22px;background:#15181c;color:#e8ecef;font:14px system-ui}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:16px 0 6px;color:#9fd2ff}.r{display:flex;flex-wrap:wrap;gap:6px}figure{margin:0}figure img{display:block;border:1px solid #333;height:160px}figcaption{font:12px ui-monospace,Menlo,monospace;color:#aab;margin-top:2px}.n{color:#aab;margin:0}</style>
    <h1>Global Defensive v53 · the round kill tally (CS2's badge and card fan)</h1><p class="n">In the real game (muted, Defuse vs bots, ${MAP}, 1280×720 at 2×): animations paused and stepped. CS2's fan per count (hudhealthammocenter.vcss), on-kill flash + spotlight 0.7 s; ours on the new card: pop 140 ms (1.35 → 1.0) · shine 320 ms · lightning 300 ms (blue/white body, gold/white headshot) · glow-down 600 ms. Pictures in game: ${KF_DIR ? "CS2's (imported)" : 'ours'}.</p>
    ${row('Reference', refs)}
    ${row('Kill 1 · body kill (in game, ' + (report.kills[0]?.feed?.wid || '') + ')', report.frames.body)}${row('Kill 2 · headshot kill (in game) — the first card pulses', report.frames.head)}
    ${row('Counts 0 … 3, the extra card past 5, CT side', report.frames.stills)}
    ${row('The ace (5th), our drawings: biggest burst + ring wave', report.frames['ours-ace'])}${row("The ace with CS2's pictures", report.frames['cs2-ace'])}${row('Reduce flashes on (3rd kill)', report.frames.rf)}
    <p class="n">Main-thread work in one burst vs an idle second: ${JSON.stringify(report.trace || {})}</p>`);
  await s.waitForTimeout(300); const sheet = SHEET || path.join(out, 'kill-emblems.jpg'); await s.screenshot({ path: sheet, type: 'jpeg', quality: 88, fullPage: true }); await s.close(); console.log('sheet:', sheet);
} catch (e) { failed++; console.log('FAIL run · ' + (e.stack || e).toString().slice(0, 600)); }
finally { writeFileSync(path.join(out, 'report.json'), JSON.stringify({ ...report, errs }, null, 1)); await b.close(); server.kill(); }
console.log(failed ? `FAIL: gd-kill-emblem-shots · ${failed}` : 'PASS: gd-kill-emblem-shots'); process.exit(failed ? 1 : 0);
