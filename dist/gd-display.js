// Global Defensive's CS2-style video settings (package A, v52): Aspect Ratio, Resolution, the scaling of a ratio that isn't the
// screen's (black bars / stretched) and the Display Mode. Pure maths first (node tests: tests/gd-display.mjs); app.js sizes the
// renderer, the camera and the page box from layout(); campaign-ui shows videoSettingsHTML() under Settings → Global Defensive.
//
// Field of view, CS2's rule: fov 90 is the horizontal angle across a 4:3 picture and the VERTICAL angle stays the same at every
// ratio (73.74°), so 4:3 shows less to the sides — 90° wide at 4:3, 106.26° at 16:9, 100.39° at 16:10. The game's camera is
// already built on that vertical angle (lab.js viewFov 73.74; scopes: weapons-data zoomVfov turns CS2's 4:3 zoom FOVs into
// the same vertical angle), so the camera's aspect is all a ratio changes: the picture's ratio — 4:3 even when stretched.
// Aim: the mouse turns the camera by angles (lab.js), never by screen pixels, so the sensitivity is the same in every mode;
// a stretched picture only looks faster sideways, as in CS2.
// The HUD: HTML at the window's real pixels, never stretched (crisp text, a round radar, a square crosshair). CS2 draws its HUD
// into the 4:3 frame, so it stretches with the picture; a browser page can't stretch text without blurring it, so the HUD
// here keeps its shape over the whole window — except the crosshair, which stretches sideways by gdView.sx (body.gd-stretched,
// --gd-sx) as CS2's does, so its dynamic gap still matches the stretched bullet cone (the scope ring stays round).
// With black bars the whole page (HUD, menus) is laid out inside the picture's
// box, as CS2's 4:3 frame is — app.js boxes the body (body.gd-bars: a containing block for the fixed HUD) and sets
// --gd-view-w / --gd-view-h (the radar's size, the scope) and --gd-view-left / --gd-view-top (0 inside that box).
// Defaults: Native ratio, Auto resolution (the window at the Graphics mode's pixel density — exactly v51's sizing), black
// bars, display mode left as it is. Other modes never read these settings.

// v53 GUNS (mv-mouse-sensitivity-scale): CS2's mouse. One count of the mouse turns the view sensitivity × m_yaw degrees
// sideways and sensitivity × m_pitch up and down (m_yaw = m_pitch = 0.022, sensitivity 1.25 by default — CS2's console
// defaults, FROM MEMORY: the install holds the cvar names only, not their values); scoped, ×zoom_sensitivity_ratio's
// factor as before (lab.js). Global Defensive only (lab.js mouse look: inArena()); the other modes keep .0021 rad × the
// Settings look slider. Set with the console's `sensitivity` (gd-console.js) or Settings → Global Defensive → Mouse;
// saved in the preferences (gdSens). A browser's movementX is the system's pointer pixels, not raw counts.
import { loadPreferences, savePreferences } from './player-preferences.js';
export const M_YAW = .022, M_PITCH = .022, SENS_DEFAULT = 1.25, SENS_RANGE = [.01, 10];
export const sensOf = p => { const v = +p?.gdSens; return Number.isFinite(v) && v > 0 ? Math.max(SENS_RANGE[0], Math.min(SENS_RANGE[1], v)) : SENS_DEFAULT; };
// Radians the view turns per mouse count (yaw: m = M_YAW, pitch: M_PITCH).
export const lookStep = (sens, m = M_YAW) => sens * m * Math.PI / 180;
// The live value lab.js reads every mouse event (no preferences read per event): kept current on every change.
export const gdSens = { v: sensOf(loadPreferences()), yaw: 0, pitch: 0 };
const syncSens = v => { gdSens.v = v; gdSens.yaw = lookStep(v, M_YAW); gdSens.pitch = lookStep(v, M_PITCH); return v; };
syncSens(gdSens.v); globalThis.addEventListener?.('infra-preferences', e => syncSens(sensOf(e.detail || loadPreferences())));
// The game's live preferences object (lab.js `settings`: the Settings panel saves it whole on every change) — bound
// once, so the console's value is in it too and the next Settings change doesn't put the old one back (final review).
let LIVE = null; export function bindSensPrefs(p) { if (p && typeof p === 'object') LIVE = p; return p; }
// The console's `sensitivity v`: clamped to SENS_RANGE, saved, live at once. Returns the value now in use.
export function setSensitivity(v) { const n = +v; if (!Number.isFinite(n) || n <= 0) return gdSens.v; const p = loadPreferences(); p.gdSens = sensOf({ gdSens: n }); if (LIVE) LIVE.gdSens = p.gdSens; syncSens(p.gdSens); savePreferences(LIVE ? { ...p, ...LIVE } : p); return gdSens.v; }

export const GD_VFOV = 2 * Math.atan(Math.tan(Math.PI / 4) * .75) * 180 / Math.PI;   // 73.7397…: CS2's fov 90 on 4:3, up and down
export const hfovOf = (vfov, aspect) => 2 * Math.atan(Math.tan(vfov * Math.PI / 360) * aspect) * 180 / Math.PI;
export const vfovOf = (hfov, aspect) => 2 * Math.atan(Math.tan(hfov * Math.PI / 360) / aspect) * 180 / Math.PI;
export const ASPECTS = { '4:3': 4 / 3, '16:9': 16 / 9, '16:10': 16 / 10 };
// CS2's lists (the modes a monitor offers at each ratio), largest first; only those that fit the display are offered.
export const RESOLUTIONS = {
  '4:3': [[2048, 1536], [1920, 1440], [1600, 1200], [1440, 1080], [1280, 960], [1152, 864], [1024, 768], [800, 600], [640, 480]],
  '16:9': [[3840, 2160], [3200, 1800], [2560, 1440], [1920, 1080], [1600, 900], [1366, 768], [1280, 720]],
  '16:10': [[2880, 1800], [2560, 1600], [1920, 1200], [1680, 1050], [1440, 900], [1280, 800]],
};
export const SCALINGS = ['bars', 'stretched'];
export const DISPLAY_MODES = ['', 'fullscreen', 'borderless', 'windowed'];   // '': left as it is (F11 / View menu)

// The display's ratio among CS2's three (within 1.5 %), else null (a 3:2 / 1.54 laptop, an ultrawide: its own "Native").
export function aspectKeyOf(w, h) { const a = w / h; let best = null, d = .015; for (const k in ASPECTS) { const e = Math.abs(ASPECTS[k] / a - 1); if (e < d) { d = e; best = k; } } return best; }
const even = v => Math.max(2, Math.round(v / 2) * 2);
// The resolutions offered for a ratio on a display of physical pixels sw × sh. 'native': the display's own size and 3/4,
// 2/3, 1/2 of it (its ratio kept).
export function resolutionList(aspect, sw, sh) {
  if (aspect === 'native') { const out = []; for (const k of [1, .75, 2 / 3, .5]) { const w = even(sw * k), h = even(sh * k); if (w >= 640 && !out.some(r => r[0] === w)) out.push([w, h]); } return out; }
  const list = RESOLUTIONS[aspect]; if (!list) return [];
  const fit = list.filter(([w, h]) => w <= sw + 1 && h <= sh + 1); return fit.length ? fit : [list[list.length - 1]];   // (a tiny display: the smallest one still)
}
export const resKey = (w, h) => w + 'x' + h;
export function parseRes(s) { const m = /^(\d{3,5})x(\d{3,5})$/.exec(String(s || '')); return m ? [+m[1], +m[2]] : null; }

// The saved settings checked against this display: an unknown ratio → native; a resolution not offered for the ratio
// (changed ratio, a smaller display) → auto.
export function normalize(p, sw, sh) {
  const aspect = p && (p.gdAspect === 'native' || ASPECTS[p.gdAspect]) ? p.gdAspect : 'native';
  const r = parseRes(p?.gdRes), res = r && resolutionList(aspect, sw, sh).some(x => x[0] === r[0] && x[1] === r[1]) ? r : null;
  return { aspect, res, scale: p?.gdScale === 'stretched' ? 'stretched' : 'bars', mode: DISPLAY_MODES.includes(p?.gdDisplay) ? p.gdDisplay : '' };
}

// The layout for a window of ww × wh CSS pixels: on (anything but native + auto), the camera's aspect, the picture's box in
// CSS pixels (bars: the ratio fitted in the window and centred; else the whole window), the drawing buffer (an explicit
// resolution) or null (auto: the box at the Graphics mode's density). Not in a match (p null): off.
export function layout(p, ww, wh, sw, sh, out = {}) {
  const n = p ? normalize(p, sw, sh) : null; ww = Math.max(1, ww); wh = Math.max(1, wh);
  out.on = !!n && (n.aspect !== 'native' || !!n.res); out.aspectKey = n?.aspect || 'native'; out.scale = n?.scale || 'bars'; out.mode = n?.mode || '';
  const A = n && n.aspect !== 'native' ? ASPECTS[n.aspect] : ww / wh; out.aspect = A;
  out.bars = out.on && n.aspect !== 'native' && n.scale === 'bars' && Math.abs(ww / wh / A - 1) > .002;
  out.stretched = out.on && n.aspect !== 'native' && n.scale === 'stretched';
  if (out.bars) { if (ww / wh > A) { out.h = wh; out.w = Math.round(wh * A); } else { out.w = ww; out.h = Math.round(ww / A); } out.x = Math.floor((ww - out.w) / 2); out.y = Math.floor((wh - out.h) / 2); }
  else { out.x = 0; out.y = 0; out.w = ww; out.h = wh; }
  out.bw = n?.res ? n.res[0] : 0; out.bh = n?.res ? n.res[1] : 0;
  return out;
}
// What the HUD reads (gd-hud: angles → pixels): the picture's box in CSS pixels and its horizontal stretch (1 unless stretched).
// ox / oy (v53 PERF4X review): where a position:fixed HUD element's 0, 0 is in the window — the picture's box with black
// bars (body.gd-bars is the containing block: applyBox), else 0. A fixed element is placed at x - ox, y - oy; x / y stay
// window pixels (the canvas's box, gd-hud-blur.js).
export const gdView = { x: 0, y: 0, w: 0, h: 0, sx: 1, on: false, ox: 0, oy: 0 };
export function setView(L, ww, wh) { gdView.on = !!L.on; gdView.x = L.x; gdView.y = L.y; gdView.w = L.w || ww; gdView.h = L.h || wh; gdView.sx = L.stretched ? (L.w / L.h) / L.aspect : 1; const bx = !!(L.on && L.bars); gdView.ox = bx ? L.x || 0 : 0; gdView.oy = bx ? L.y || 0 : 0; return gdView; }

// The page side (app.js): box the body for black bars, set the view variables. Off: the page exactly as before.
let sheet = null;
export function applyBox(doc, L) {
  const root = doc?.documentElement, body = doc?.body; if (!root?.style?.setProperty || !body?.classList?.contains) return; const rs = root.style;
  if (!sheet) { sheet = doc.createElement('style'); sheet.id = 'gd-display-css'; sheet.textContent = 'html.gd-bars-root{background:#000!important}body.gd-bars{position:fixed!important;left:var(--gd-box-x,0)!important;top:var(--gd-box-y,0)!important;width:var(--gd-box-w,100vw)!important;height:var(--gd-box-h,100vh)!important;margin:0!important;overflow:hidden!important;contain:layout paint}'
    // menus that size themselves from the window (vw / vh resolve against the viewport, not the box, and the box hides what
    // spills over — 4:3 bars on a 1366×768 laptop cut 55 px off the buy menu): the same sizes, from the box
    + 'body.gd-bars #ar-buy>div{left:max(16px,calc(var(--gd-view-w)*.05));top:calc(var(--gd-view-h)*.07);bottom:calc(var(--gd-view-h)*.05);width:min(1120px,calc(var(--gd-view-w)*.74))}'
    + 'body.gd-bars:has(#ar-buy:not([hidden])) #game-notifications{width:max(180px,min(300px,calc(var(--gd-view-w) - max(16px,calc(var(--gd-view-w)*.05)) - min(1120px,calc(var(--gd-view-w)*.74)) - 32px)))}'
    + 'body.gd-bars #ar-board>div{min-width:min(560px,calc(var(--gd-view-w) - 16px));width:min(1040px,calc(var(--gd-view-w)*.96));max-height:calc(var(--gd-view-h)*.88)}'
    + 'body.gd-bars #ar-team>div{max-height:calc(var(--gd-view-h) - 24px);width:min(640px,calc(var(--gd-view-w)*.94))}'
    + 'body.gd-bars #campaign-panel{top:calc(var(--gd-view-h)*.04);bottom:calc(var(--gd-view-h)*.04);width:min(1100px,calc(var(--gd-view-w) - 32px))}'
    + 'body.gd-stretched #gd-x{transform:scaleX(var(--gd-sx,1));transform-origin:50% 50%}'; (doc.head || body).append(sheet); }
  if (L.on && L.stretched && L.aspect) { rs.setProperty('--gd-sx', String((L.w / L.h) / L.aspect)); body.classList.add('gd-stretched'); }
  else if (body.classList.contains('gd-stretched') || rs.getPropertyValue('--gd-sx')) { body.classList.remove('gd-stretched'); rs.removeProperty('--gd-sx'); }
  if (L.on && L.bars) { rs.setProperty('--gd-box-x', L.x + 'px'); rs.setProperty('--gd-box-y', L.y + 'px'); rs.setProperty('--gd-box-w', L.w + 'px'); rs.setProperty('--gd-box-h', L.h + 'px'); rs.setProperty('--gd-view-left', '0px'); rs.setProperty('--gd-view-top', '0px'); rs.setProperty('--gd-view-w', L.w + 'px'); rs.setProperty('--gd-view-h', L.h + 'px'); root.classList.add('gd-bars-root'); body.classList.add('gd-bars'); }
  else if (body.classList.contains('gd-bars') || rs.getPropertyValue('--gd-view-h')) { body.classList.remove('gd-bars'); root.classList.remove('gd-bars-root'); for (const k of ['--gd-box-x', '--gd-box-y', '--gd-box-w', '--gd-box-h', '--gd-view-left', '--gd-view-top', '--gd-view-w', '--gd-view-h']) rs.removeProperty(k); }
}

// Display mode. The desktop app (desktop/main.mjs desktop:display-mode): fullscreen, fullscreen windowed (macOS: a borderless
// window over the whole screen, no separate Space; Windows / Linux: Electron's fullscreen already is a borderless window —
// there is no exclusive mode), windowed. A browser: the Fullscreen API (fullscreen / windowed; it needs a click or key, so a
// match entered without one asks at the next click). '' leaves it as it is.
export function applyDisplayMode(mode, g = globalThis) {
  if (!mode) return 'kept';
  const D = g.infraDesktop; if (D?.setDisplayMode) { D.setDisplayMode(mode).catch?.(() => {}); return 'desktop'; }
  const doc = g.document; if (!doc) return 'none';
  if (mode === 'windowed') { if (doc.fullscreenElement) doc.exitFullscreen?.().catch?.(() => {}); return 'exit'; }
  if (doc.fullscreenElement) return 'already';
  try { const r = doc.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); if (r?.catch) r.catch(() => {}); } catch {}
  return 'asked';
}

// Settings → Global Defensive → Video. env: { sw, sh (the display's physical pixels), desktop, mac }.
export function videoSettingsHTML(p, env) {
  const n = normalize(p, env.sw, env.sh), nk = aspectKeyOf(env.sw, env.sh), A = n.aspect === 'native' ? env.sw / env.sh : ASPECTS[n.aspect];
  const opt = (v, t, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${t}</option>`;
  const aspects = [['native', 'Native' + (nk ? ' · ' + nk : ' · ' + (env.sw / env.sh).toFixed(2) + ':1')], ['4:3', '4:3 (Normal)'], ['16:9', '16:9 (Widescreen)'], ['16:10', '16:10 (Widescreen)']];
  const res = resolutionList(n.aspect, env.sw, env.sh), cur = n.res ? resKey(n.res[0], n.res[1]) : 'auto';
  const modes = [['', 'As it is (F11 / View menu)'], ['fullscreen', 'Fullscreen']].concat(env.desktop && env.mac ? [['borderless', 'Fullscreen windowed']] : env.desktop ? [['borderless', 'Fullscreen windowed (same as fullscreen here)']] : []).concat([['windowed', 'Windowed']]);
  return `<h3>Video</h3><div class="set-grid gd-video">`
    + `<label title="CS2's ratios: 4:3 shows less to the sides (90° across), 16:9 the most (106°); up and down stays the same">Aspect ratio<select data-set="gdAspect">${aspects.map(([v, t]) => opt(v, t, n.aspect)).join('')}</select></label>`
    + `<label title="The picture's real pixels (the dynamic resolution scales this, not the window)">Resolution<select data-set="gdRes">${opt('auto', 'Auto (the window · Graphics mode)', cur)}${res.map(([w, h]) => opt(resKey(w, h), w + ' × ' + h, cur)).join('')}</select></label>`
    + `<label title="A ratio that isn't the screen's: black bars keep the picture's shape; stretched fills the screen (the 4:3 stretched look)">Scaling<select data-set="gdScale"${n.aspect === 'native' ? ' disabled' : ''}>${opt('bars', 'Black bars', n.scale)}${opt('stretched', 'Stretched', n.scale)}</select></label>`
    + `<label>Display mode<select data-set="gdDisplay">${modes.map(([v, t]) => opt(v, t, n.mode)).join('')}</select></label>`
    + `</div><p class="cp-muted">Field of view as CS2: ${hfovOf(GD_VFOV, A).toFixed(1)}° across × ${GD_VFOV.toFixed(1)}° up and down at this ratio. Saved on this computer; takes effect at once in a match.</p>`
    // (v53 GUNS: CS2's sensitivity — the console's `sensitivity` too; Global Defensive only)
    + `<h3>Mouse</h3><div class="set-grid gd-mouse"><label title="CS2's sensitivity: each mouse count turns the view sensitivity × 0.022° (m_yaw / m_pitch); CS2's default 1.25. The console's sensitivity command sets the same value">Sensitivity (CS2)<input data-set="gdSens" type="number" min="${SENS_RANGE[0]}" max="${SENS_RANGE[1]}" step="0.01" value="${sensOf(p)}"></label></div>`;
}
