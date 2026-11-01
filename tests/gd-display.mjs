// Global Defensive's CS2-style video settings (dist/gd-display.js, package A v52): CS2's FOV rule (fov 90 across 4:3, the
// vertical angle kept: 106.26° across 16:9, 100.39° across 16:10), the scope FOVs (CS2's 4:3 zoom values, the same vertical
// angle at every ratio), the resolution lists per ratio filtered to the display, the saved settings checked against the
// display, the layout (black bars centred, stretched fills the window with the 4:3 camera, native + auto = off = v51's
// sizing), the HUD's view (stretch factor), the settings HTML and the display mode (desktop bridge / Fullscreen API).
//   node tests/gd-display.mjs
import assert from 'node:assert/strict';
import { GD_VFOV, hfovOf, vfovOf, ASPECTS, resolutionList, normalize, layout, setView, gdView, aspectKeyOf, parseRes, videoSettingsHTML, applyDisplayMode, applyBox } from '../dist/gd-display.js';
import { WEAPONS, zoomVfov, zoomSens } from '../dist/weapons-data.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + d : '')); console.log('PASS ' + name); };
const near = (a, b, e = .01) => Math.abs(a - b) < e;

// FOV: CS2's fov 90 is the horizontal angle at 4:3; the vertical one is kept at every ratio.
ok('CS2 vertical FOV 73.74° (fov 90 on 4:3)', near(GD_VFOV, 73.7398, 1e-3), GD_VFOV);
ok('4:3 → 90° across', near(hfovOf(GD_VFOV, ASPECTS['4:3']), 90, 1e-6), hfovOf(GD_VFOV, 4 / 3));
ok('16:9 → 106.26° across', near(hfovOf(GD_VFOV, ASPECTS['16:9']), 106.26), hfovOf(GD_VFOV, 16 / 9));
ok('16:10 → 100.39° across (≈100.4)', near(hfovOf(GD_VFOV, ASPECTS['16:10']), 100.39), hfovOf(GD_VFOV, 1.6));
ok('vfovOf inverts hfovOf', near(vfovOf(106.26, 16 / 9), GD_VFOV, .01));
// Scopes: CS2's zoom FOVs are horizontal on 4:3; the camera keeps the same vertical angle, so across 4:3 it is CS2's value
// exactly, and wider ratios show more to the sides (AWP 40 → 51.8° across 16:9), never a different zoom up and down.
const zoomed = WEAPONS.filter(w => w.zoom); ok('the scoped guns have zoom FOVs (AWP, SSG 08, AUG, SG 553, G3SG1, SCAR-20)', zoomed.length >= 4, zoomed.map(w => w.id).join(','));
for (const w of zoomed) for (const z of w.zoom) { const v = zoomVfov(z); ok(`${w.id} zoom ${z}: ${z}° across 4:3, the same vertical ${v.toFixed(2)}° at 16:9 / 16:10 (${hfovOf(v, 16 / 9).toFixed(1)}° / ${hfovOf(v, 1.6).toFixed(1)}° across)`, near(hfovOf(v, 4 / 3), z, 1e-6) && hfovOf(v, 16 / 9) > z && hfovOf(v, 1.6) > z && hfovOf(v, 1.6) < hfovOf(v, 16 / 9)); }
ok('AWP first zoom across 16:9 = 51.8° (CS2)', near(hfovOf(zoomVfov(40), 16 / 9), 51.77, .02), hfovOf(zoomVfov(40), 16 / 9));
ok('scoped sensitivity follows the 4:3 zoom value (ratio-independent)', zoomSens(40) === 40 / 90);

// Resolutions: CS2's lists, what fits the display.
const has = (L, w, h) => L.some(r => r[0] === w && r[1] === h);
const r43 = resolutionList('4:3', 1920, 1080), r169 = resolutionList('16:9', 1920, 1080), r1610 = resolutionList('16:10', 1920, 1080);
ok('4:3 on a 1920×1080 display: 1440×1080, 1280×960, 1024×768, 800×600 (no 1600×1200)', [[1440, 1080], [1280, 960], [1024, 768], [800, 600]].every(r => has(r43, ...r)) && !has(r43, 1600, 1200) && !has(r43, 1920, 1440), JSON.stringify(r43));
ok('16:9 on 1920×1080: 1920×1080, 1600×900, 1366×768, 1280×720 (no 2560×1440)', [[1920, 1080], [1600, 900], [1366, 768], [1280, 720]].every(r => has(r169, ...r)) && !has(r169, 2560, 1440), JSON.stringify(r169));
ok('16:10 on 1920×1080: 1680×1050, 1440×900, 1280×800 (no 1920×1200)', [[1680, 1050], [1440, 900], [1280, 800]].every(r => has(r1610, ...r)) && !has(r1610, 1920, 1200), JSON.stringify(r1610));
ok('16:10 on a 2560×1600 display offers 2560×1600', has(resolutionList('16:10', 2560, 1600), 2560, 1600));
ok('largest first', r43[0][0] > r43[r43.length - 1][0] && r169[0][0] === 1920);
ok('a 1366×768 display: 16:9 tops at 1366×768, 4:3 at 1024×768', resolutionList('16:9', 1366, 768)[0].join('x') === '1366x768' && resolutionList('4:3', 1366, 768)[0].join('x') === '1024x768');
const rn = resolutionList('native', 3024, 1964); ok('native (a 3024×1964 laptop): its own size first, then smaller of its ratio', rn[0].join('x') === '3024x1964' && rn.length >= 3 && rn.every(r => near(r[0] / r[1], 3024 / 1964, .01)), JSON.stringify(rn));
ok('display ratio among CS2\'s: 1920×1080 16:9, 1440×900 16:10, 1024×768 4:3, 3024×1964 none', aspectKeyOf(1920, 1080) === '16:9' && aspectKeyOf(1440, 900) === '16:10' && aspectKeyOf(1024, 768) === '4:3' && aspectKeyOf(3024, 1964) === null);
ok('parseRes', parseRes('1280x960').join() === '1280,960' && parseRes('auto') === null && parseRes('12x9') === null);

// Saved settings against the display.
ok('defaults: native, auto, black bars, display mode left as it is', JSON.stringify(normalize({}, 1920, 1080)) === JSON.stringify({ aspect: 'native', res: null, scale: 'bars', mode: '' }));
ok('an unknown ratio → native', normalize({ gdAspect: '21:9' }, 1920, 1080).aspect === 'native');
ok('a resolution of another ratio → auto', normalize({ gdAspect: '4:3', gdRes: '1920x1080' }, 1920, 1080).res === null);
ok('a resolution bigger than the display → auto', normalize({ gdAspect: '4:3', gdRes: '1600x1200' }, 1920, 1080).res === null);
ok('a listed one is kept', normalize({ gdAspect: '4:3', gdRes: '1280x960', gdScale: 'stretched' }, 1920, 1080).res.join() === '1280,960');

// Layout.
const L = (p, ww, wh, sw = 1920, sh = 1080) => ({ ...layout(p, ww, wh, sw, sh) });
ok('not in a match: off', !L(null, 1920, 1080).on);
ok('native + auto: off (v51\'s sizing)', !L({}, 1920, 1080).on && !L({ gdAspect: 'native', gdRes: 'auto' }, 1920, 1080).on);
{ const b = L({ gdAspect: '4:3', gdScale: 'bars' }, 1920, 1080); ok('4:3 black bars in 1920×1080: a centred 1440×1080 picture (pillarbox), camera 4:3', b.on && b.bars && !b.stretched && b.w === 1440 && b.h === 1080 && b.x === 240 && b.y === 0 && near(b.aspect, 4 / 3, 1e-9), JSON.stringify(b)); }
{ const s = L({ gdAspect: '4:3', gdScale: 'stretched', gdRes: '1280x960' }, 1920, 1080); ok('4:3 stretched 1280×960 in 1920×1080: the whole window, camera 4:3, buffer 1280×960', s.on && s.stretched && !s.bars && s.w === 1920 && s.h === 1080 && s.x === 0 && near(s.aspect, 4 / 3, 1e-9) && s.bw === 1280 && s.bh === 960, JSON.stringify(s));
  const v = setView(layout({ gdAspect: '4:3', gdScale: 'stretched' }, 1920, 1080, 1920, 1080), 1920, 1080); ok('stretched view: horizontal stretch 1.333', near(v.sx, (16 / 9) / (4 / 3), 1e-9) && v.h === 1080 && gdView === v); }
{ const b = L({ gdAspect: '16:10' }, 1920, 1080); ok('16:10 black bars in 1920×1080: 1728×1080 centred', b.bars && b.w === 1728 && b.h === 1080 && b.x === 96, JSON.stringify(b)); }
{ const b = L({ gdAspect: '16:9' }, 1440, 900, 1440, 900); ok('16:9 black bars in a 1440×900 window: letterbox 1440×810 at y 45', b.bars && b.w === 1440 && b.h === 810 && b.y === 45 && b.x === 0, JSON.stringify(b)); }
{ const b = L({ gdAspect: '16:9' }, 1920, 1080); ok('16:9 in a 16:9 window: no bars, camera 16:9', b.on && !b.bars && b.w === 1920 && near(b.aspect, 16 / 9, 1e-9)); }
{ const b = L({ gdAspect: '4:3', gdScale: 'bars' }, 1366, 768, 1366, 768); ok('4:3 black bars in 1366×768: 1024×768 at x 171', b.bars && b.w === 1024 && b.h === 768 && b.x === 171, JSON.stringify(b)); }
{ const b = L({ gdRes: '1440x810' }, 1920, 1080); ok('native ratio + an explicit resolution: on, the window\'s ratio, the buffer chosen', b.on && !b.bars && near(b.aspect, 16 / 9, 1e-9) && b.bw === 1440 && b.bh === 810, JSON.stringify(b)); }
ok('camera FOV per layout: 4:3 bars → 90° across, 16:9 → 106.26°, 16:10 → 100.39°', near(hfovOf(GD_VFOV, L({ gdAspect: '4:3' }, 1920, 1080).aspect), 90, 1e-6) && near(hfovOf(GD_VFOV, L({ gdAspect: '16:9' }, 1920, 1080).aspect), 106.26) && near(hfovOf(GD_VFOV, L({ gdAspect: '16:10' }, 1920, 1080).aspect), 100.39));

// The page box (a tiny fake DOM): bars set the box and view variables and box the body; off removes all of it.
{ const props = new Map(), cls = new Set(), rcls = new Set(), made = []; const doc = { createElement: () => { const e = {}; made.push(e); return e; }, head: { append() {} }, documentElement: { style: { setProperty: (k, v) => props.set(k, v), removeProperty: k => props.delete(k), getPropertyValue: k => props.get(k) || '' }, classList: { add: c => rcls.add(c), remove: c => rcls.delete(c) } }, body: { classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) } } };
  applyBox(doc, layout({ gdAspect: '4:3' }, 1920, 1080, 1920, 1080)); ok('bars: body boxed at 240,0 1440×1080; view variables 0 / 1440×1080', cls.has('gd-bars') && rcls.has('gd-bars-root') && props.get('--gd-box-x') === '240px' && props.get('--gd-box-w') === '1440px' && props.get('--gd-view-left') === '0px' && props.get('--gd-view-h') === '1080px', JSON.stringify([...props]));
  applyBox(doc, layout(null, 1920, 1080, 1920, 1080)); ok('off: nothing left on the page', !cls.size && !rcls.size && !props.size, JSON.stringify([...props]));
  // the menus that size from the window (buy menu, scoreboard, team pick, Settings panel) get box-relative sizes under bars:
  // vw / vh are the viewport's, and the boxed body hides what spills over (4:3 bars at 1366×768 cut 55 px off the buy menu)
  const css = made[0]?.textContent || '', rule = sel => (css.match(new RegExp('body\\.gd-bars ' + sel.replace(/[>#()[\]:]/g, '\\$&') + '\\{([^}]*)\\}')) || [])[1];
  ok('bars: buy menu, scoreboard, team pick and Settings panel sized from the box (--gd-view-w/-h), no vw/vh', ['#ar-buy>div', '#ar-board>div', '#ar-team>div', '#campaign-panel'].every(s => { const r = rule(s); return r && /width:[^;]*var\(--gd-view-w\)/.test(r) && !/\d(vw|vh)\b/.test(r); }), css.slice(0, 300));
  // stretched: the crosshair stretches sideways with the picture (CS2's does), so the dynamic gap matches the cone on screen
  applyBox(doc, layout({ gdAspect: '4:3', gdScale: 'stretched' }, 1920, 1080, 1920, 1080)); ok('4:3 stretched in 1920×1080: the crosshair scaled sideways by 1.333, no box', cls.has('gd-stretched') && !cls.has('gd-bars') && near(+props.get('--gd-sx'), (16 / 9) / (4 / 3), 1e-9) && /body\.gd-stretched #gd-x\{transform:scaleX\(var\(--gd-sx/.test(css), JSON.stringify([...props]));
  applyBox(doc, layout({ gdAspect: '4:3', gdScale: 'bars' }, 1920, 1080, 1920, 1080)); ok('then black bars: the crosshair unstretched', !cls.has('gd-stretched') && !props.has('--gd-sx') && cls.has('gd-bars'));
  applyBox(doc, layout(null, 1920, 1080, 1920, 1080)); ok('off again: nothing left on the page', !cls.size && !rcls.size && !props.size, JSON.stringify([...props])); }

// Settings HTML.
{ const h = videoSettingsHTML({ gdAspect: '4:3', gdRes: '1280x960', gdScale: 'stretched' }, { sw: 1920, sh: 1080, desktop: false });
  ok('settings: aspect / resolution / scaling / display mode selects, 4:3 list, current selected', /data-set="gdAspect"/.test(h) && /data-set="gdRes"/.test(h) && /data-set="gdScale"/.test(h) && /data-set="gdDisplay"/.test(h) && /value="1280x960" selected/.test(h) && /value="1440x1080"/.test(h) && !/value="1920x1080"/.test(h) && /value="stretched" selected/.test(h) && /90\.0° across/.test(h));
  ok('browser: no fullscreen windowed option; desktop mac: there is', !/value="borderless"/.test(h) && /value="borderless"/.test(videoSettingsHTML({}, { sw: 1920, sh: 1080, desktop: true, mac: true })));
  ok('native: scaling disabled, 16:9 named', /data-set="gdScale" disabled/.test(videoSettingsHTML({}, { sw: 1920, sh: 1080 })) && /Native · 16:9/.test(videoSettingsHTML({}, { sw: 1920, sh: 1080 }))); }

// Display mode.
{ const calls = []; const g = { infraDesktop: { setDisplayMode: m => { calls.push(m); return Promise.resolve(); } } };
  ok('desktop: the bridge sets the mode', applyDisplayMode('borderless', g) === 'desktop' && calls[0] === 'borderless');
  ok('as it is: nothing', applyDisplayMode('', g) === 'kept' && calls.length === 1);
  let asked = 0, exited = 0; const doc = { fullscreenElement: null, documentElement: { requestFullscreen: () => { asked++; return Promise.resolve(); } }, exitFullscreen: () => { exited++; return Promise.resolve(); } };
  ok('browser fullscreen: the Fullscreen API asked', applyDisplayMode('fullscreen', { document: doc }) === 'asked' && asked === 1);
  doc.fullscreenElement = {}; ok('browser windowed while fullscreen: exits', applyDisplayMode('windowed', { document: doc }) === 'exit' && exited === 1);
  ok('browser fullscreen while already: nothing more', applyDisplayMode('fullscreen', { document: doc }) === 'already' && asked === 1); }
console.log(n + '/' + n + ' gd-display');
