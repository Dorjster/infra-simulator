// v53 PERF4X (Global Defensive only): the frame-cost fixes found by the batch B → batch C bisection at CPU ×4.
//   1. The crosshair (gd-crosshair.js gapVar, gd-hud.js): its nodes are built when its look changes; the dynamic gap is one
//      CSS variable (--xg) — the same pixels as the gap baked into the HTML, for every style.
//   2. The baked map's six point-light slots (gd-exposure.js BAKED_LIGHTS_U) are flat Float32Arrays, which three.js
//      uploads as they are (arrays of Vector4 / Vector3 were flattened before every map draw: 12 toArray calls a draw).
//   3. The kill tally's world blur (CS2's hudWorldBlur: the badge, always on screen in a round, and — v53 PERF4X review —
//      every kill card) drawn in the GD composer's last pass (gd-hud-blur.js) instead of CSS backdrop filters — the same
//      shapes, the page's blur kept as the fallback. Review fixes checked here: with 4:3 black bars the page badge and the
//      disc at the same point (gd-display.js gdView.ox / oy); a stretched buffer (sx ≠ sy) keeps the disc round on screen;
//      the cards' shapes at rest and mid-move as the page's CSS animates them; their art masks.
// Run: node tests/gd-perf4x.mjs
import { readFileSync } from 'node:fs';
const X = await import('../dist/gd-crosshair.js'), E = await import('../dist/gd-exposure.js');
let n = 0, bad = 0; const ok = (c, msg, extra = '') => { n++; if (!c) { bad++; console.log('FAIL', msg, extra); } };
const hud = readFileSync(new URL('../dist/gd-hud.js', import.meta.url), 'utf8'), gx = readFileSync(new URL('../dist/graphics.js', import.meta.url), 'utf8');

// 1. crosshair: substitute --xg = g into the variable form and compare with the baked form, every style, gaps 0 … 40
const resolve = (html, g) => html.replace(/calc\((-?[\d.]+)px ([+-]) var\(--xg, 0px\)\)/g, (_, a, s) => (+a + (s === '+' ? g : -g)) + 'px')
  .replace(/calc\((-?[\d.]+)px \+ 2 \* var\(--xg, 0px\)\)/g, (_, a) => (+a + 2 * g) + 'px');
const D = X.CROSSHAIR_DEFAULT; let same = true, where = '';
for (const style of ['classic', 'tshape', 'dot', 'circle', 'cross']) for (const extra of [{}, { dot: false }, { outline: false }, { size: 12, thickness: 3, gap: 1 }])
  for (const g of [0, 1, 7, 23, 40]) { const c = { ...D, style, ...extra }; const a = resolve(X.crosshairHTML(c, 0, true), g), b = X.crosshairHTML(c, g); if (a !== b) { same = false; where = style + ' gap ' + g; } }
ok(same, 'crosshair: the --xg form draws the same pixels as the baked gap (5 styles × 4 looks × 5 gaps)', where);
ok(X.crosshairHTML({ ...D, dynamic: false }, 0, true) === X.crosshairHTML({ ...D, dynamic: false }, 9), 'crosshair: Dynamic off — no variable, the gap fixed');
ok(X.crosshairHTML(D, 5) === X.crosshairHTML(D, 5, false), 'crosshair: the default call (the Settings preview) is unchanged');
ok(/if \(last\.xv !== xhVer\) \{[^}]*els\.x\.innerHTML = crosshairHTML\(xh, 0, true\)/.test(hud) && !/els\.x\.innerHTML = crosshairHTML\(xh, gap\)/.test(hud), 'gd-hud.js: the crosshair HTML is made only when its look changes');
ok(/if \(last\.xg !== gap\) \{ last\.xg = gap; els\.x\.style\.setProperty\('--xg', XG_PX\[gap\]/.test(hud) && /const XG_PX = Array\.from\(\{ length: 41 \}/.test(hud), 'gd-hud.js: the gap step is one property write, from strings made once');

// 2. baked light slots
const P = E.BAKED_LIGHTS_U.uBPLp.value, C = E.BAKED_LIGHTS_U.uBPLc.value;
ok(P instanceof Float32Array && P.length === E.BAKED_LIGHT_N * 4 && C instanceof Float32Array && C.length === E.BAKED_LIGHT_N * 3, 'baked lights: flat Float32Arrays (xyz + range, rgb) × 6');
P.fill(0); E.setBakedLight(2, 1, 2, 3, 40, .5, .25, .125); E.setBakedLight(5, -1, 0, 1, 10, 1, 1, 1);
ok(P[8] === 1 && P[9] === 2 && P[10] === 3 && P[11] === 40 && C[6] === .5 && C[7] === .25 && C[8] === .125 && P[23] === 10, 'baked lights: setBakedLight writes slot k at 4k / 3k');
ok(E.bakedLightsOn() === 2, 'baked lights: bakedLightsOn counts the lit slots'); P.fill(0); C.fill(0);
const fn = /function gdLights\(\) \{[\s\S]*?\n {2}\S/.exec(gx)?.[0] || '';
ok(fn && /setBakedLight\(k\+\+/.test(fn) && !/\.set\(/.test(fn) && /uBPLp\.value\[k \* 4 \+ 3\] = 0/.test(fn), 'graphics.js gdLights: writes the flat slots (no vector .set), empties the rest by range 0');
// three.js's own rule (three.module.js flatten): an array whose first element is a number is uploaded as it is
const three = readFileSync(new URL('../dist/three.module.js', import.meta.url), 'utf8');
ok(/function flatten\( array, nBlocks, blockSize \) \{\s*const firstElem = array\[ 0 \];\s*if \( firstElem <= 0 \|\| firstElem > 0 \) return array;/.test(three), 'three.js flatten returns a numeric array untouched (no copy, no toArray)');

// 3. the kill tally's world blur (badge + cards) in the composer's last pass (gd-hud-blur.js)
const HB = await import('../dist/gd-hud-blur.js'), { OutputShader } = await import('../dist/post/OutputShader.js');
const fake = { uniforms: {}, material: { fragmentShader: OutputShader.fragmentShader, uniforms: null } }; HB.hudBlurPatch(fake); const fs = fake.material.fragmentShader, U = fake.uniforms;
ok(fake.gdHudBlur && U.uHBc && U.uHBk.value === 0 && U.uHBo && U.uHBs && U.uHBq.value instanceof Float32Array && U.uHBq.value.length === 48 && fake.material.needsUpdate, 'blur pass: patched once, off until a frame sets it (uHBk 0); the 6 cards as one flat Float32Array (uploaded as it is)');
ok(/uniform vec4 uHBc;\nuniform float uHBk;\nuniform vec4 uHBo;\nuniform vec2 uHBs;\nuniform vec4 uHBq\[ 12 \];\nuniform float uHBn;/.test(fs) && fs.indexOf('vec3 gdHudOut( vec3 c )') < fs.indexOf('void main()') && /#if defined\( LINEAR_TONE_MAPPING \)[\s\S]*#elif defined\( ACES_FILMIC_TONE_MAPPING \)[\s\S]*#ifdef SRGB_TRANSFER\n {2}c = sRGBTransferOETF/.test(fs), 'blur pass: the output pass\'s own tone mapping and sRGB step per tap (display values, as the browser blurs)');
ok(/for \( int j = - 3; j <= 3; j \+\+ \) for \( int i = - 3; i <= 3; i \+\+ \)/.test(fs) && /exp\( - 0\.28125 \* dot\( u, u \) \)/.test(fs) && /texture2D\( tDiffuse, vUv \+ u \* uHBs \)/.test(fs) && /gl_FragColor\.rgb = ha \/ hw \* uHBk; \} \}\s*\}\s*$/.test(fs) && (fs.match(/void main\(\)/g) || []).length === 1, 'blur pass: one 7 × 7 Gaussian (taps 0.75 σ apart per axis) where any shape covers the pixel, at the end of main(), × 0.373');
const before = fs; HB.hudBlurPatch(fake); ok(fake.material.fragmentShader === before, 'blur pass: patching twice changes nothing');
const v0 = HB.HUD_BLUR.ver; HB.setBadgeBlur(true, 735, 903, 28.3, 1.77); const v1 = HB.HUD_BLUR.ver; HB.setBadgeBlur(true, 735, 903, 28.3, 1.77);
ok(v1 === v0 + 1 && HB.HUD_BLUR.ver === v1, 'setBadgeBlur: a new version only when the disc changes (no work per frame)');
// The shader's own shape test, in JS (the same lines as BLUR_CODE), on the uniforms hudBlurFrame set: a window CSS point →
// gl_FragCoord via the canvas's box and the buffer, then disc or any card.
const inside = (X, Y, box, bw, bh, only = -1) => { const fx = (X - box.left) * bw / box.width, fy = bh - (Y - box.top) * bh / box.height, o = U.uHBo.value, c = U.uHBc.value, q = U.uHBq.value;
  const hx = fx * o.x, hy = (o.z - fy) * o.y; if (only < 0 && c.w > 0 && (hx - c.x) ** 2 + (hy - c.y) ** 2 < c.z * c.z) return true;
  for (let k = 0; k < U.uHBn.value; k++) { if (only >= 0 && k !== only) continue; const a = k * 8; let lx = hx - q[a], ly = hy - q[a + 1]; [lx, ly] = [q[a + 2] * lx + q[a + 3] * ly, q[a + 2] * ly - q[a + 3] * lx];
    const ex = Math.abs(lx) - q[a + 4] + q[a + 6], ey = Math.abs(ly) - q[a + 5] + q[a + 6]; if (Math.hypot(Math.max(ex, 0), Math.max(ey, 0)) + Math.min(Math.max(ex, ey), 0) < q[a + 6]) return true; } return false; };
const ring = (cx, cy, r, box, bw, bh) => { let good = true; for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, ca = Math.cos(a), sa = Math.sin(a); if (!inside(cx + ca * (r - .4), cy + sa * (r - .4), box, bw, bh) || inside(cx + ca * (r + .4), cy + sa * (r + .4), box, bw, bh)) good = false; } return good; };
const SCREENS = [['native at 2×', { left: 0, top: 0, width: 1470, height: 956 }, 2940, 1912], ['4:3 black bars (the canvas 97 px in)', { left: 97, top: 0, width: 1276, height: 956 }, 2552, 1912], ['4:3 stretched 1280 × 960 (sx 0.871, sy 1.004)', { left: 0, top: 0, width: 1470, height: 956 }, 1280, 960], ['16:9 bars (the canvas 45 px down)', { left: 0, top: 45, width: 1440, height: 810 }, 2880, 1620]];
for (const [name, box, bw, bh] of SCREENS) { const cx = box.left + box.width / 2, cy = box.top + box.height - 53 * box.height / 1080; HB.setBadgeBlur(true, cx, cy, 28.3, 1.77); HB.hudBlurFrame(fake, { getBoundingClientRect: () => box }, bw, bh);
  ok(ring(cx, cy, 28.3, box, bw, bh) && U.uHBk.value === HB.HUD_BLUR_K && HB.HUD_BLUR_K === .373 && Math.abs(U.uHBs.value.x - .75 * 1.77 / box.width) < 1e-12 && Math.abs(U.uHBs.value.y - .75 * 1.77 / box.height) < 1e-12, 'blur pass, ' + name + ': the disc a circle of 28.3 CSS px on screen where the badge is (±0.4 px all round), σ 1.77 CSS px on both axes, k = CSS brightness(.373)'); }
HB.setBadgeBlur(false); HB.hudBlurFrame(fake, null, 2940, 1912); ok(fake.uniforms.uHBk.value === 0, 'hudBlurFrame: the badge hidden and no card — nothing drawn');
const ke = readFileSync(new URL('../dist/gd-kill-emblem.js', import.meta.url), 'utf8');
ok(/\.gd-ke\.glb \.ke-bd\{-webkit-backdrop-filter:none;backdrop-filter:none\}/.test(ke) && /if \(HUD_BLUR\.ready !== glb\) \{ glb = HUD_BLUR\.ready; root\.classList\.toggle\('glb', glb\); \}/.test(ke) && /root\.className = rootClass\(n, rf, ct\); if \(glb\) root\.classList\.add\('glb'\)/.test(ke), 'kill emblem: its backdrop filter off only while the output pass draws the disc, kept across class rewrites');
ok(/\.gd-ke\.glb \.ke-ln\.l\{clip-path:inset\(0 \$\{BADGE \/ 2\}px 0 0\)\}\.gd-ke\.glb \.ke-ln\.r\{clip-path:inset\(0 0 0 \$\{BADGE \/ 2\}px\)\}/.test(ke), 'kill emblem: the line stops at the disc while the output pass draws it (it ran under the page blur before)');
ok(/setBadgeBlur\(!down, BB\.x, BB\.y, BB\.r, BB\.s\)/.test(ke) && /BB\.r = BADGE \/ 2 \* \+k\.toFixed\(4\); BB\.s = 2 \* \+k\.toFixed\(4\);/.test(ke), 'kill emblem: the disc where the badge is (radius 32 × k, σ 2 × k), off while dead');
// (v53 PERF4X review) with 4:3 black bars the body is the badge's containing block: the badge's page position and the
// disc must agree — the page transform from the box's corner (gdView.ox / oy), the disc in window pixels
{ const D2 = await import('../dist/gd-display.js'); const VOID = new Set(['img', 'br']);
  class El { constructor(t) { this.tagName = t; this.children = []; this.parent = null; this.className = ''; this.hidden = false; this.style = {}; this.id = ''; } get classList() { const e = this; return { contains: c => e.className.split(' ').includes(c), add: c => { if (!e.classList.contains(c)) e.className += ' ' + c; }, toggle: (c, on) => { if (on) e.classList.add(c); else e.className = e.className.split(' ').filter(x => x !== c).join(' '); } }; }
    append(...k) { for (const c of k) { c.parent = this; this.children.push(c); } } set innerHTML(h) { this.children = []; const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g; let m, cur = this; while ((m = re.exec(h))) { const [, cl, tag, at, self] = m; if (cl) { if (cur.parent && cur.tagName === tag) cur = cur.parent; continue; } const e = new El(tag), k = /\bclass="([^"]*)"/.exec(at); if (k) e.className = k[1]; cur.append(e); if (!self && !VOID.has(tag)) cur = e; } } get innerHTML() { return ''; }
    set textContent(v) {} querySelectorAll(sel) { const c = sel.replace(/^\./, ''), out = []; const w = e => { for (const k of e.children) { if ((' ' + k.className + ' ').includes(' ' + c + ' ')) out.push(k); w(k); } }; w(this); return out; } querySelector(s2) { return this.querySelectorAll(s2)[0] || null; } setAttribute() {} }
  const head = new El('head'), body = new El('body'); globalThis.document = { head, body, createElement: t => new El(t), getElementById: () => null };
  if (!globalThis.addEventListener) { const et = new EventTarget(); globalThis.addEventListener = et.addEventListener.bind(et); }
  globalThis.innerWidth = 1470; globalThis.innerHeight = 956;
  const KE2 = await import('../dist/gd-kill-emblem.js'), G = { combat: { feed: [], down: {}, d: { round: { id: 'r1', phase: 'live' }, teams: { me: 'ct' } } } };
  const tx = el => { const m = /translate3d\(([-\d.]+)px,([-\d.]+)px/.exec(el.style.transform || ''); return m ? [+m[1], +m[2]] : [NaN, NaN]; };
  for (const [name, P, ww, wh] of [['native', null, 1470, 956], ['4:3 bars (side)', { gdAspect: '4:3' }, 1470, 956], ['16:9 bars (top / bottom)', { gdAspect: '16:9' }, 1440, 900], ['4:3 stretched', { gdAspect: '4:3', gdScale: 'stretched', gdRes: '1280x960' }, 1470, 956]]) {
    const L = D2.layout(P, ww, wh, ww * 2, wh * 2); D2.setView(L, ww, wh); globalThis.innerWidth = ww; globalThis.innerHeight = wh;
    const E = KE2.createKillEmblems(); E.update(true, G, 'me', 1); const [px, py] = tx(E.root), H = HB.HUD_BLUR, ox = D2.gdView.ox, oy = D2.gdView.oy;
    const box = L.on && L.bars ? [L.x, L.y] : [0, 0];   // (the containing block's corner in the window: applyBox's body box with bars)
    ok(H.want && Math.abs(px + box[0] - H.x) < .11 && Math.abs(py + box[1] - H.y) < .11 && Math.abs(H.x - ((L.on ? L.x : 0) + (L.on ? L.w : ww) / 2)) < .11 && ox === box[0] && oy === box[1], 'kill emblem, ' + name + ': the page badge and the output pass\'s disc at the same window point, the picture\'s bottom centre', JSON.stringify({ px, py, box, H: [H.x, H.y], L: [L.x, L.y, L.w, L.h] }));
    E.update(false); }
  D2.setView(D2.layout(null, 1470, 956, 2940, 1912), 1470, 956); globalThis.innerWidth = 1470; globalThis.innerHeight = 956;
  // (v53 PERF4X review) the kill cards' world blur: each card's shape in HUD_BLUR.q where the page's CSS puts the card —
  // at rest (FAN), and mid-move (200 ms ease-in-out from where it was, the pop 1.35 → 1 / the pulse) — and the shader's
  // test true inside each card and false 0.4 px past its edge
  const E = KE2.createKillEmblems(), Q = HB.HUD_BLUR.q, FE = []; const G3 = { combat: { feed: FE, down: {}, d: { round: { id: 'r2', phase: 'live' }, teams: { me: 'ct' } } } };
  let t = 1e6; E.update(true, G3, 'me', t); const kill = () => { t += 1; FE.unshift({ at: t, by: 'Me', target: 'Bot' + FE.length, wid: 'ak', head: false }); E.update(true, G3, 'me', t); };
  kill(); kill(); kill(); t += 400; E.update(true, G3, 'me', t);
  const k = 956 / 1080, bx = 735, by = +(956 - 53 * k).toFixed(1), C = [0, 0], shape = (tx, ty, deg, sc) => { KE2.cardCentre(tx, ty, deg, C); return [bx + k * C[0], by + k * C[1], Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180), k * sc * KE2.CARD.w / 2, k * sc * KE2.CARD.h / 2, k * sc * KE2.CARD_RAD]; };
  const near = (i, want) => want.every((v, j) => Math.abs(Q[i * 8 + j] - v) < 2e-3 * Math.max(1, Math.abs(v))) && Q[i * 8 + 7] === 1;
  ok(E.count === 3 && [0, 1, 2].every(i => near(i, shape(...KE2.FAN[3][i], 1))) && !Q[3 * 8 + 7] && !Q[4 * 8 + 7] && !Q[5 * 8 + 7], 'kill cards: 3 kills at rest — 3 shapes where the 3-kill fan puts the cards (centre, angle, size, corners), the rest off', JSON.stringify(Array.from(Q.slice(0, 8))));
  kill(); const t0 = t; t += 100; E.update(true, G3, 'me', t); const e = KE2.bezier(.42, 0, .58, 1, 100 / 200), lerp = (a2, b2) => a2.map((v, j) => v + (b2[j] - v) * e);
  ok(near(3, shape(...lerp([0, 42, 0], KE2.FAN[4][3]), KE2.cardScale(1, 100))) && [0, 1, 2].every(i => near(i, shape(...lerp(KE2.FAN[3][i], KE2.FAN[4][i]), KE2.cardScale(2, 100)))), 'kill cards: 100 ms after the 4th kill — the new card halfway up from its hidden rest and popping, the others turning to the 4-kill fan and pulsing (CSS\'s ease-in-out, ke-pop, ke-pu)');
  t = t0 + 500; E.update(true, G3, 'me', t); const box = { left: 0, top: 0, width: 1470, height: 956 }; HB.hudBlurFrame(fake, { getBoundingClientRect: () => box }, 2940, 1912);
  let edges = U.uHBn.value === 4; for (let i = 0; i < 4; i++) { const o = i * 8, ca = Q[o + 2], sa = Q[o + 3], at = (lx, ly) => inside(Q[o] + ca * lx - sa * ly, Q[o + 1] + sa * lx + ca * ly, box, 2940, 1912, i);
    if (!at(0, 0) || !at(0, -(Q[o + 5] - .4)) || at(0, -(Q[o + 5] + .4)) || !at(Q[o + 4] - .4, 0) || at(Q[o + 4] + .4, 0) || !at(-(Q[o + 4] - .4), 0) || at(-(Q[o + 4] + .4), 0)) edges = false; }   // (this card's own shape: the cards overlap)
  ok(edges, 'blur pass: each card\'s turned rounded rect — inside at its centre and 0.4 px in from its top and side, outside 0.4 px past them');
  G3.combat.down.me = { until: t + 1e6 }; E.update(true, G3, 'me', t + 1); ok(![0, 1, 2, 3].some(i => Q[i * 8 + 7]) && !HB.HUD_BLUR.want, 'kill cards: dead (the emblem hidden) — no card, no disc');
  delete G3.combat.down.me; E.update(true, G3, 'me', t + 2); ok([0, 1, 2, 3].every(i => Q[i * 8 + 7]), '… and back alive: the cards again');
  G3.combat.d.round.id = 'r3'; E.update(true, G3, 'me', t + 3); ok(![0, 1, 2, 3, 4, 5].some(i => Q[i * 8 + 7]), 'kill cards: a new round (the tally cleared) — no card');
  E.update(false); }
// the page side of the cards: their own backdrop filter off while the pass draws them; each card's art masked where the
// badge and the cards above it lie (21 alpha masks: counts 1 … 5 and 6+, card by card), made once
{ const css = (await import('../dist/gd-kill-emblem.js')).KILL_EMBLEM_CSS, rule = (c, i) => { const m = new RegExp('\\.gd-ke\\.glb\\.' + c + ' \\.ke-f' + i + ' \\.ke-st\\{-webkit-mask-image:url\\("data:image/svg\\+xml,([^"]*)"\\)').exec(css); return m ? decodeURIComponent(m[1]) : ''; };
  const n = (css.match(/\.ke-st\{-webkit-mask-image/g) || []).length, r31 = rule('n3', 1), r33 = rule('n3', 3), rx6 = rule('nx', 6), rx1 = rule('nx', 1);
  ok(n === 21 && /\.gd-ke\.glb \.ke-bg\{-webkit-backdrop-filter:none;backdrop-filter:none\}/.test(css) && (r31.match(/<circle/g) || []).length === 1 && (r31.match(/<rect x=/g) || []).length === 2 && (r33.match(/<rect x=/g) || []).length === 0 && /<circle/.test(r33) && (rx1.match(/<rect x=/g) || []).length === 5 && (rx6.match(/<rect x=/g) || []).length === 0 && !rule('n3', 4), 'kill cards: the cards\' backdrop filter off with glb; 21 masks — 3 kills: card 1 under the badge and cards 2–3, card 3 under the badge only; 6+: card 1 under 4 cards + the extra card', n); }
ok(/gdOutPass = gdLast && !software \? hudBlurPatch\(outPass\) : null;/.test(gx) && /HUD_BLUR\.ready = !!gdOutPass && !!gdLast\?\.hudBlur;/.test(gx) && /if \(gdLast && !composer\) HUD_BLUR\.ready = false;/.test(gx), 'graphics.js: only a GD composer\'s last pass, only on presets with the HUD blur (Low / Very Low keep their flat fill), none without a composer');

console.log(bad ? `FAIL: gd-perf4x · ${bad} of ${n}` : `PASS: gd-perf4x · ${n} checks (crosshair gap as one CSS variable, flat baked-light slots, the badge's and the kill cards' blur in the output pass: native, black bars, stretched)`);
process.exit(bad ? 1 : 0);
