// v53 stage 4 · the CS2 HUD's layout (dist/gd-hud-layout.js, used by dist/gd-hud.js), against the user's CS2 picture
// (Addendum 7: scratchpad v53/ref/cs2-hud.png, 739 × 415 — its measured fractions are gd-hud-layout.js REF):
//  · at 1366 × 768, 1920 × 1080 and 2560 × 1440, and at Windows display scaling 100 / 125 / 150 % (the CSS pixels a
//    page then gets: 1920 × 1080 at 150 % is 1280 × 720), every element's centre (or edge) sits at the picture's fraction
//    of the screen within 0.006 of the width and 0.008 of the height (about 4 px of the 739-px picture);
//  · at the HUD scale slider's ends (0.8 and 1.4) and between, at every one of those sizes: every box stays on the
//    screen; the bottom row reads left to right health · armour · badge · ammo · reserve without overlapping; the avatars
//    clear the radar and the timer; the weapon rows stack without overlapping;
//  · the CSS made from the table (boxCSS: calc() on --gd-u) gives exactly the numbers the test checks, and gd-hud.js lays
//    its boxes out with it (no second set of positions);
//  · the HUD options: CS2's HUD Scale range (0.8 – 1.4), cl_hud_color's colours (Team Color: T #eabe54 / CT
//    rgb(150, 200, 250); White #e8e8e8; Teammate Color: your player colour), the letters, reduce flashes; saved and
//    announced live ('gd-hud-prefs').
//   node tests/gd-hud-layout.mjs
import { readFileSync } from 'node:fs';
const store = new Map(); globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
{ const et = new EventTarget(); globalThis.addEventListener = et.addEventListener.bind(et); globalThis.dispatchEvent = et.dispatchEvent.bind(et); }
const L = await import('../dist/gd-hud-layout.js'), P = await import('../dist/gd-hud-prefs.js');
let n = 0, bad = 0; const check = (name, c, d = '') => { n++; if (!c) bad++; if (!c || process.argv.includes('-v')) console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); };
// the sizes: 3 resolutions × 3 Windows scalings (CSS px = device px / scaling)
const SIZES = []; for (const [w, h] of [[1366, 768], [1920, 1080], [2560, 1440]]) for (const sc of [1, 1.25, 1.5]) SIZES.push([w / sc, h / sc, `${w}×${h} @ ${sc * 100} %`]);
// 1. the picture's fractions at scale 1
let worst = { dx: 0, dy: 0, k: '' };
for (const [W, H, tag] of SIZES) { const B = L.layoutBoxes(W, H, 1);
  for (const [k, [fx, fy, mode]] of Object.entries(L.REF)) { const b = B[k], x = mode === 'l' ? b.x : mode === 'r' ? b.x + b.w : b.cx, dx = Math.abs(x / W - fx), dy = Math.abs(b.cy / H - fy);
    if (dx > worst.dx) worst = { ...worst, dx, kx: k }; if (dy > worst.dy) worst = { ...worst, dy, ky: k };
    check(`${tag}: ${k} at the picture's (${fx}, ${fy})`, dx <= .006 && dy <= .008, `got (${(x / W).toFixed(4)}, ${(b.cy / H).toFixed(4)})`); } }
console.log(`picture match: worst ${(worst.dx * 100).toFixed(2)} % of the width (${worst.kx}), ${(worst.dy * 100).toFixed(2)} % of the height (${worst.ky})`);
// the radar's size: CS2's 250 px round radar = 0.231 of the height (the picture: 0.229)
{ const b = L.boxOf('radar', 1920, 1080); check('the radar: 250 px at 1080 p, round (0.231 of the height; the picture 0.229)', b.w === 250 && Math.abs(b.h / 1080 - .229) < .006); }
// CS2's own sizes (panorama px at 1080 p) kept in the table
check('CS2 sizes: number labels 70 × 42, health bar 65 × 8, clip bar 65 × 4, badge 64, timer box 84 wide, score halves 42 × 30, avatars 270 = 5 × 54',
  [L.BOX.health[4], L.BOX.health[5], L.BOX.healthBar[4], L.BOX.healthBar[5], L.BOX.clipBar[4], L.BOX.clipBar[5], L.BOX.badge[4], L.BOX.timer[4], L.BOX.scoreCT[4], L.BOX.scoreCT[5], L.BOX.avatarsCT[4]].join() === '70,42,65,8,65,4,64,84,42,30,270');
// 2. HUD scale 0.8 … 1.4: on screen, in order, no overlaps
const over = (a, b) => a.x < b.x + b.w - .01 && b.x < a.x + a.w - .01 && a.y < b.y + b.h - .01 && b.y < a.y + a.h - .01;
for (const s of [.8, 1, 1.2, 1.4]) for (const [W, H, tag] of SIZES) { const B = L.layoutBoxes(W, H, s), t = `${tag}, HUD scale ${s}`;
  const off = Object.entries(B).filter(([k]) => k !== 'wpnNum').filter(([, b]) => b.x < -.01 || b.y < -.01 || b.x + b.w > W + .01 || b.y + b.h > H + .01).map(([k]) => k);
  check(t + ': every box on the screen', !off.length, off.join());
  const row = ['health', 'armor', 'badge', 'ammo', 'reserve'].map(k => B[k]);
  check(t + ': bottom row left to right without overlap (health · armour · badge · ammo · reserve)', row.every((b, i) => !i || row[i - 1].x + row[i - 1].w <= b.x + .01));
  check(t + ': the avatars clear the radar and the timer', !over(B.avatarsCT, B.radar) && !over(B.avatarsCT, B.timer) && !over(B.avatarsT, B.timer));
  check(t + ': weapon rows and the bottom row stacked without overlap', !over(B.wpn1, B.wpn2) && !over(B.wpn2, B.wpn3) && !over(B.wpn3, B.nades) && !over(B.nades, B.bombKit));
  check(t + ': money and chat clear of the health number', !over(B.money, B.health) && !over(B.chat, B.money)); }
// 2b. (v53 HUD fix) other aspect ratios — CS2's 4:3 and 16:10 views (gd-display.js: the game view inside black bars or
// the window): the 1080 p unit follows the view's HEIGHT, so the height fractions are the picture's at any width, the
// centre-anchored boxes keep the picture's centre, and nothing leaves the view or overlaps at HUD scale 1. (The same
// table at 16:9 gives the same fractions at every size by construction; the browser test tests/browser/gd-hud-shots.mjs
// measures the live page's boxes against the picture.)
for (const [W, H, tag] of [[1024, 768, '4:3 1024×768'], [1440, 1080, '4:3 1440×1080'], [1680, 1050, '16:10 1680×1050']]) { const B = L.layoutBoxes(W, H, 1);
  let yBad = []; for (const [k, [fx, fy, mode]] of Object.entries(L.REF)) { const b = B[k]; if (Math.abs(b.cy / H - fy) > .008) yBad.push(k); if (Math.abs(fx - .5) < .01 && Math.abs(b.cx / W - fx) > .006) yBad.push(k + '(x)'); }
  check(`${tag}: the picture's height fractions, centred boxes on the centre`, !yBad.length, yBad.join());
  const off = Object.entries(B).filter(([k]) => k !== 'wpnNum').filter(([, b]) => b.x < -.01 || b.y < -.01 || b.x + b.w > W + .01 || b.y + b.h > H + .01).map(([k]) => k);
  check(`${tag}: every box in the view, the avatars clear of the radar, the bottom row in order`, !off.length && !over(B.avatarsCT, B.radar) && !over(B.money, B.health) && ['health', 'armor', 'badge', 'ammo', 'reserve'].map(k => B[k]).every((b, i, r) => !i || r[i - 1].x + r[i - 1].w <= b.x + .01), off.join()); }
// 3. the CSS from the table gives the same numbers (calc() evaluated for a 1920 × 1080 view, u = 1080 / 1080 × s)
{ const ev = (expr, base, u) => { const m = /^calc\((-?[\d.]+)% \+ (-?[\d.]+) \* var\(--gd-u\)\)$/.exec(expr) || /^calc\((-?[\d.]+) \* var\(--gd-u\)\)$/.exec(expr); if (!m) return NaN; return m.length === 3 ? +m[1] / 100 * base + +m[2] * u : +m[1] * u; };
  let okAll = true, why = ''; for (const s of [.8, 1.4]) for (const k of Object.keys(L.BOX)) { const css = Object.fromEntries(L.boxCSS(k).split(';').map(p => [p.slice(0, p.indexOf(':')), p.slice(p.indexOf(':') + 1)])), b = L.boxOf(k, 1920, 1080, s), u = s;
    const got = [ev(css.left, 1920, u), ev(css.top, 1080, u), ev(css.width, 0, u), ev(css.height, 0, u)], want = [b.x, b.y, b.w, b.h];
    if (got.some((v, i) => !(Math.abs(v - want[i]) < 1e-6))) { okAll = false; why = k + ' ' + JSON.stringify(got) + ' vs ' + JSON.stringify(want); } }
  check('boxCSS (what is drawn) = boxOf (what is tested), at HUD scale 0.8 and 1.4', okAll, why); }
{ const src = readFileSync(new URL('../dist/gd-hud.js', import.meta.url), 'utf8');
  const used = ['health', 'armor', 'ammo', 'reserve', 'money', 'timer', 'scoreCT', 'scoreT', 'avatarsCT', 'avatarsT', 'nades', 'bombKit', 'healthBar', 'clipBar'];
  check('gd-hud.js places its boxes with boxCSS from the table (every one named) and the unit --gd-u = view height / 1080 × --gd-hs', used.every(k => src.includes(`'${k}'`)) && /--gd-u:calc\(var\(--gd-view-h, 100vh\) \/ 1080 \* var\(--gd-hs, 1\)\)/.test(src) && src.includes("import { BOX, boxCSS"));
  check('gd-hud.js: white text with soft shadows, no panel backgrounds on health / ammo / money (only the timer and score boxes)', !/#gd-hud \.(num|money|ammo|health|reserve|armor)\{[^}]*background/.test(src) && /text-shadow:0 0 3px #000d/.test(src));
  check('gd-hud.js ships its own open-licence font (Barlow Semi Condensed, OFL) with tabular numbers', src.includes('barlow-semi-condensed-700.ttf.bin') && src.includes('font-variant-numeric:tabular-nums') && readFileSync(new URL('../dist/fonts/OFL-BarlowSemiCondensed.txt', import.meta.url), 'utf8').includes('SIL Open Font License')); }
// v53 LOOK (add12-hud-colours): the default colours as CS2 draws them, the same at every size (colours are CSS, not
// layout: checked once per resolution's default prefs): the money white (hudmoney.vcss defaultColor #ffffff; green
// #8fff6f / red #fd3535 only on its +/− animation), health / armour / ammo / their bars in cl_hud_color (default 0 Team
// Color: the reference picture's T gold "100"), the bars CS2's thin lines (hudhealthammocenter.vcss .hud-HA-bar 8 px, #AmmoClipBar 4 px).
{ const src = readFileSync(new URL('../dist/gd-hud.js', import.meta.url), 'utf8');
  for (const [W, H, tag] of [[1366, 768, '1366×768'], [1920, 1080, '1920×1080'], [2560, 1440, '2560×1440']]) {
    store.delete('gd-hud'); const d = P.loadHudPrefs(), hb = L.boxOf('healthBar', W, H, 1), cb = L.boxOf('clipBar', W, H, 1);
    check(`${tag}: default colours — money white, + green #8fff6f / − red #fd3535, numbers and bars Team Color (T #eabe54)`,
      src.includes('#gd-hud .money{font-size:${U(38)};line-height:${U(38)};color:#fff;') && /\.dm\.add\{color:#8fff6f\}/.test(src) && /\.dm\.rem\{color:#fd3535\}/.test(src) && src.includes('line-height:${U(42)};color:var(--hc);')
      && /#gd-hpbar i\{[^}]*background:var\(--hc\)/.test(src) && d.color === 0 && P.hudColorOf(d, 't') === '#eabe54');
    check(`${tag}: the health and clip bars are CS2's thin lines (.hud-HA-bar 8 px, #AmmoClipBar 4 px at 1080 p)`, Math.abs(hb.h - 8 * H / 1080) < 1e-9 && Math.abs(cb.h - 4 * H / 1080) < 1e-9, hb.h + ' / ' + cb.h); } }
// 4. options
{ const c = P.cleanHudPrefs({ scale: 3, color: 99, letters: 1 }); check('HUD scale clamped to 0.8 – 1.4; unknown colour → Team Color', c.scale === 1.4 && c.color === 0 && c.letters === true && P.cleanHudPrefs({ scale: .1 }).scale === .8); }
check('cl_hud_color 0 (Team Color): T #eabe54, CT rgb(150, 200, 250) (csgostyles.vcss t-color / ct-color)', P.hudColorOf({ color: 0 }, 't') === '#eabe54' && P.hudColorOf({ color: 0 }, 'ct') === '#96c8fa');
check('cl_hud_color 1 White #e8e8e8 (color-hud-1), 12 Teammate Color = your player colour (color-player-*)', P.hudColorOf({ color: 1 }, 't') === '#e8e8e8' && P.hudColorOf({ color: 12 }, 'ct', 2) === '#1da284' && P.PLAYER_COLORS.join() === '#f8f62d,#c03699,#1da284,#88cef5,#ff9b25');
{ let got = null; addEventListener('gd-hud-prefs', e => { got = e.detail; }); const s = P.saveHudPrefs({ scale: 1.2, color: 1, reduceFlashes: true });
  check('saving the options stores them and announces them live (gd-hud-prefs)', got?.scale === 1.2 && P.loadHudPrefs().color === 1 && P.loadHudPrefs().reduceFlashes === true && s.scale === 1.2); }
{ const h = P.hudEditorHTML(P.HUD_DEFAULT); check("the Settings section: CS2's names (HUD scale 0.8 – 1.4, HUD color with its 13 choices, letters, reduce flashes)", /min="0.8" max="1.4"/.test(h) && (h.match(/<option/g) || []).length === 13 && h.includes('Teammate Color') && h.includes('data-hd="letters"') && h.includes('data-hd="reduceFlashes"')); }
// spec 3: CS2's crosshair code (gd-crosshair.js) — the form, a round trip of several looks, the checksum refusing a typo
{ const X = await import('../dist/gd-crosshair.js'), D = X.CROSSHAIR_DEFAULT, looks = [D, { ...D, style: 'tshape', size: 12, thickness: 3, gap: 1, color: '#12abef', opacity: .6, outline: false, dot: false, dynamic: false }, { ...D, style: 'dot', dot: true, color: '#ff0000', outlineWidth: 2, size: 1, dynamic: false }]   // (dot only: length 0, static — what such a code holds);
  const code = X.crosshairCode(D); check('crosshair code: CS2\'s form, CSGO- and five groups of 5 over its alphabet', /^CSGO(-[A-HJ-Za-km-z2-9]{5}){5}$/.test(code) && !/[Igl01]/.test(code.slice(5)), code);
  check('crosshair code: every look comes back the same (style, size, thickness, gap, outline, colour, alpha, dot, dynamic)', looks.every(c => JSON.stringify(X.crosshairFromCode(X.crosshairCode(c))) === JSON.stringify(c)), looks.map(c => JSON.stringify(X.crosshairFromCode(X.crosshairCode(c)))).join(' '));
  const typo = code.slice(0, 6) + (code[6] === 'A' ? 'B' : 'A') + code.slice(7); check('crosshair code: a changed letter or a wrong form is "Invalid or old crosshair code" (null)', X.crosshairFromCode(typo) === null && X.crosshairFromCode('CSGO-123') === null && X.crosshairFromCode('') === null);
  check('the crosshair editor shows your code with Copy and Import', X.crosshairEditorHTML(D).includes(`value="${code}"`) && X.crosshairEditorHTML(D).includes('data-xh-import')); }
console.log(bad ? `FAIL: gd-hud-layout · ${bad} of ${n}` : `PASS: gd-hud-layout · ${n} checks (the picture's fractions at 3 resolutions × 3 scalings, HUD scale 0.8 – 1.4 on screen and in order, CSS = table, CS2 sizes, options, crosshair code)`); if (bad) process.exit(1);
