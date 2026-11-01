// Global Defensive radar (top left): the map, you (arrow), your team, bomb sites, the planted bomb, the dropped bomb
// (Terrorists), and enemies only while revealed — seen by you or a living team mate (walls, shut doors and smoke block
// that, glass doesn't), or heard firing an unsuppressed gun nearby. A revealed enemy is drawn
// where he is while someone sees him, then, for 2 s, faded at the spot he was last seen or heard (never followed behind
// cover). Dead, you watch someone: the radar centres and turns with them, and your own camera spots nobody. The map image
// is drawn once per map (every floor of it, before the round) and only moved and turned after that (a compositor layer);
// the dots are redrawn every frame at the screen's own pixel density, who is revealed is worked out 15× a second.
// v52 (package Q) — CS2's look and options: on a CS2 map file with the local export (tools/export-cs2-radar.mjs), CS2's
// own overview picture placed by its own overview data (gd-radar-art.js overviewFit; Nuke's lower picture by CS2's
// altitude split); team mates in CS2's five colours (yellow, purple, green, blue, orange: the host's join order per
// side) with their number on the big map and a facing tick, your own arrow in your colour with a view cone, enemies red
// (a flash ring when first spotted, a faded ghost at the last known spot, a red ✕ where one died), the bomb as a C4
// (carried, dropped, planted: flashing), A / B over the sites, ▲ / ▼ for another floor. CS2's five radar options
// (gd-radar-prefs.js: centred, rotating, HUD size, map zoom, whole map with the scoreboard), applied live.
import { ARENA_MAPS, mapBoxes } from './arena-maps.js';
import { ARENA } from './facility-layout.js';
import { clearView, smokeHides } from './arena-nades.js';   // (spotted through smoke unless it hides all of him — head, chest, knees: the rule the screen draws and the models' hiding use)
import * as NADE_RULES from './arena-nades.js';   // (decoyBlip, read when there: see the decoy dots below)
import { weaponById, EYE } from './weapons-data.js';
import { isQuiet } from './sound-bank.js';
import { radarImage, locationOf, cs2Picture, cs2RadarIndex } from './gd-radar-art.js';
import { loadRadarPrefs, saveRadarPrefs, cleanRadarPrefs } from './gd-radar-prefs.js';
import { hostNow } from './host-clock.js';   // (who is dead, when a decoy fires: the host's clock)

const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const DUCK_EYE = 46 * 2.54 / 16.5;   // CS2's crouched eye, 46 HU (the feet of a crouched pose without fy)
const FLOOR = 15;   // FLOOR: eye heights this far apart (game units, ~100 Hammer units) are different floors
// CS2's player colours in slot order (cl_color 0–4: yellow, purple, green, blue, orange), per side, by the host's join
// order (the order of d.teams, the same on every client). ENEMY: the red of a spotted enemy (v51's #ff4040 kept — the
// decoy-dot tests in gd-grenade-slots count fills of exactly this colour).
export const TEAM_COLORS = Object.freeze(['#f2e33a', '#a35bd8', '#35c46b', '#4ba3f2', '#f0902a']); const ENEMY = '#ff4040', NUMS = ['1', '2', '3', '4', '5'];
// How much of the map the radar shows: ZOOM_K / zoom of the overview picture's width (CS2's cl_radar_scale zooms its
// overview: 0.7, the default, shows half of it; 0.25 all of it and a margin; 1 about a third). A built-in map's
// "overview" is its size plus 10 %.
export const ZOOM_K = .35;
// The radar panel's size: about a quarter of the game view's height at "Radar HUD size" 1 (CS2's cl_hud_radar_scale 1),
// 150–270 CSS px, times that size. The game view is the area package A's black bars leave (--gd-view-h, when set), else
// the window. Published on the page as --gd-radar-h so what sits under the radar (the lobby) can follow it.
export const radarSizeCSS = size => `calc(clamp(150px, calc(var(--gd-view-h, 100vh) * .25), 270px) * ${+size || 1})`;
// Your view cone: half of CS2's horizontal field of view at 16:9 (fov 90 at 4:3 → 106°).
const CONE = 53 * Math.PI / 180;
// SPOT_CONE (off): spotting only inside an eye's view — within VIEW_COS of where it looks (65°: the 16:9 screen's
// half-width at CS2's fov 90 is 53°, plus a margin). Off, eyes see all round as before: CS2's spotting cone is not in its
// data files, so it would be a guess (inView stays for when it is confirmed). LINGER: how long a lost enemy stays at his
// last known spot (ms).
const SPOT_CONE = false, VIEW_COS = Math.cos(65 * Math.PI / 180), LINGER = 2000;
// CT_BOMB_SPOTTED (off): the planted bomb on a CT's radar only once a CT has had sight of it (CS:GO's C4 "spotted" flag,
// NOT checked against CS2). Off = v51: every CT sees the planted bomb at once (the plant banner names no site, so hiding
// it changes round information). createRadar's ctBombSpotted turns it on (tests), until the CS2 rule is confirmed.
const CT_BOMB_SPOTTED = false;
// A shut door / whole breakable (not glass) crossing a→b? Live boxes (arena-maps.js movers: off while open or broken).
function moverStops(movers, ax, ay, az, bx, by, bz) {
  if (!movers) return false; const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (let i = 0; i < movers.length; i++) { const b = movers[i]; if (b.off || b.mat === 'glass') continue; let t0 = 0, t1 = 1, ok = true;
    for (let a = 0; a < 3 && ok; a++) { const p = a === 0 ? ax : a === 1 ? ay : az, d = a === 0 ? dx : a === 1 ? dy : dz, lo = a === 0 ? b.minX : a === 1 ? b.y0 : b.minZ, hi = a === 0 ? b.maxX : a === 1 ? b.y1 : b.maxZ;
      if (Math.abs(d) < 1e-12) { if (p <= lo || p >= hi) ok = false; continue; } let u = (lo - p) / d, v = (hi - p) / d; if (u > v) { const s = u; u = v; v = s; } if (u > t0) t0 = u; if (v < t1) t1 = v; if (t0 >= t1) ok = false; }
    if (ok) return true; }
  return false; }
// One line of sight a→b through the map (no smoke): CS2 map files by CS2's triangles that stop sight (boxes.nadeMesh,
// sightOnly — glass, fences and grenade clips let it through, as the flash's light: arena-nades.js lightTo); built maps
// with a nav and no mesh by its sight columns; either way the live doors and breakables on top (moverStops).
function lineSees(m, boxes, ax, ay, az, bx, by, bz, cx, cz) {
  const N = boxes?.nadeMesh; if (N) { if (N.blocked(ax, ay, az, bx, by, bz, true)) return false; } else if (!m.nav.sight(ax - cx, ay, az - cz, bx - cx, by, bz - cz)) return false;
  return !moverStops(boxes?.movers, ax, ay, az, bx, by, bz); }
// Can an eye at e see the enemy whose eye is at o (feet ofy, crouched ocr)? (the radar's spotting rule, GDUI-04) Map files
// and nav maps: a 3D line to his eye, else to his chest; classic maps: the boxes at eye height (clearView). Smoke that
// hides all of him (head, chest, knees — smokeHides, the rule the screen draws) blocks either way.
export function radarSight(m, boxes, game, ex, ey, ez, ox, oy, oz, ofy, ocr, now, cx = ARENA.cx, cz = ARENA.cz) {
  if (!m.nav && !boxes?.nadeMesh) return clearView(game, boxes, ex, ez, ox, oz, 8, now);
  if (!lineSees(m, boxes, ex, ey, ez, ox, oy, oz, cx, cz) && !lineSees(m, boxes, ex, ey, ez, ox, ofy + (oy - ofy) * .55, oz, cx, cz)) return false;
  return !smokeHides(game, ex, ey, ez, ox, ofy, oz, ocr, now); }
// Is (x, z) inside the view of an eye at (ex, ez) looking along yaw (camera forward = (−sin yaw, −cos yaw))? No yaw: yes.
export const inView = (ex, ez, yaw, x, z) => { if (!SPOT_CONE || !Number.isFinite(yaw)) return true; const dx = x - ex, dz = z - ez, d = Math.hypot(dx, dz); return d < 1 || (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / d >= VIEW_COS; };
export function createRadar({ world, lan, name, yaw, where, active, speed = () => 0, pings = () => [], boxes: liveBoxes = null, ctBombSpotted = CT_BOMB_SPOTTED }) {
  // CS2's HUD radar: a square panel top left (inside the game view: package A's --gd-view-left / --gd-view-top when its
  // black bars are on), the map over a dark see-through backing, a thin light rim; the place name at its foot. Its size
  // is "Radar HUD size" (--gd-radar-h, set from the options); Tab's big map sits beside the scoreboard.
  const css = document.createElement('style'); css.textContent = `#gd-radar{position:fixed;left:calc(var(--gd-view-left, 0px) + 12px);top:calc(var(--gd-view-top, 0px) + 12px);z-index:36;width:var(--rs);height:var(--rs);border-radius:3px;overflow:hidden;background:rgba(6,9,11,.76);border:1px solid #ffffff3d;box-shadow:0 0 0 1px #0009,0 3px 14px #0008;pointer-events:none;--rs:var(--gd-radar-h, min(210px,26vh))}#gd-radar[hidden]{display:none}#gd-radar.big{--rs:min(60vh,36vw,620px);z-index:47;border-color:#ffffff5c;background:rgba(6,9,11,.86)}body.gd-mapopen #ar-board{padding-left:calc(min(60vh,36vw,620px) + 30px);box-sizing:border-box}body.gd-mapopen #ar-board>div{width:min(1040px,calc(100vw - min(60vh,36vw,620px) - 54px))}#gd-radar .map{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}#gd-radar .map canvas,#gd-radar .map img{display:block;max-width:none}#gd-radar .map.cs2{opacity:.95}#gd-radar>canvas{position:absolute;inset:0;width:100%;height:100%;display:block}#gd-radar small{position:absolute;left:0;right:0;bottom:3px;text-align:center;font:800 11px system-ui;color:#eef3f4;letter-spacing:.08em;text-shadow:0 1px 2px #000,0 0 4px #000}`;
  (document.head || document.body).append?.(css);
  document.body.insertAdjacentHTML('beforeend', '<div id="gd-radar" hidden><div class="map"></div><canvas width="420" height="420"></canvas><small></small></div>');
  const el = document.getElementById('gd-radar'), mapEl = el.querySelector('.map'), cv = el.querySelector('canvas'), x = cv.getContext('2d'), label = el.querySelector('small');
  cs2RadarIndex();   /* (the CS2 export's index asked for at once: in by the time a map loads) */
  let prefs = loadRadarPrefs();   // CS2's radar options (gd-radar-prefs.js), replaced whenever Settings saves them
  // imgKind: 'cs2' (CS2's overview picture) or 'own' (gd-radar-art.js); mox / moz: the picture px of the map's corner
  // (0 for the built-in picture); ovUnits: the overview's width in game units (the zoom's yardstick); lowerFeet: the feet
  // height under which the lower picture shows (null: one floor); sites: the bomb sites' letters to draw (CS2's picture
  // has none, the built-in one draws its own).
  const BOUNDS = new WeakMap(); let fb = { x0: 0, z0: 0, x1: 0, z1: 0 };   // (fb: the current map's walkable bounds, floorBounds)
  let img = null, imgLow = null, imgMap = null, imgObj = null, imgLayer = null, imgKind = null, mox = 0, moz = 0, ovUnits = 1, lowerFeet = null, sites = [], waitMap = null, waitAt = 0, boxMap = null, boxes = [], scale = 1, at = 0, big = false; const seen = new Map(), lastShots = new Map(), why = new Map();
  const slot = new Map(), sideN = { t: 0, ct: 0 };   // (key → colour slot 0–4 on his side, from d.teams' order: reused, 15× a second)
  // Last known places (GDUI-05): key → { x, y, z, at, live } — where he was when last seen or heard (at: when), live: seen
  // at the latest 15 Hz look (then drawn where he is now). Reused records; cleared on a new round, side, map or match.
  const known = new Map(); let eRound = null, eTeam = null, eMap = null, eMatch = null, eStart = null, bombSpot = null;
  const drawn = []; let nd = 0;   // (enemy dots drawn this frame, for tests: reused records { k, x, z, live })
  const eyes = []; let ne = 0;   // (the eyes that spot, rebuilt 15× a second into reused records { x, y, z, yaw })
  // The map picture (CS-overview style, gd-radar-art.js), drawn once per map, sits under the dots as its own layer:
  // each frame only its transform changes (moved and turned by the compositor, never repainted), so the rotating
  // radar turns as smoothly as the view. layer: null, or 'lower' (Nuke's lower level, while you are down there). Both
  // floors are drawn together when the map comes in (behind the loading card: GDUI-12) and stacked; a floor change only
  // shows the other one.
  // v52: CS2's own picture (decoded, gd-radar-art.js cs2Picture) is placed by CS2's overview data: the same map → picture
  // transform as the built-in one plus the corner offset (mox, moz), so every dot below lines up with it unchanged.
  function drawMap(id, kind = 'own', pic = null) { const m = ARENA_MAPS[id];
    if (kind === 'cs2') { img = pic.img; imgLow = pic.imgLow || null; scale = pic.fit.scale; mox = pic.fit.ox; moz = pic.fit.oz; ovUnits = (img.naturalWidth || img.width || pic.fit.res) / scale; lowerFeet = imgLow ? pic.fit.lowerFeet : null;
      sites = Object.entries(m.sites || {}).map(([L, s]) => { const gy = m.siteGoals?.[L]?.[2] ?? m.nav?.floorAt?.(s[0], s[1]); return { L, x: s[0], z: s[1], low: lowerFeet === null || !Number.isFinite(gy) ? null : gy < lowerFeet }; }); }   /* (Nuke: each letter on its own floor's picture — B's under A) */
    else { const r = radarImage(m, id, 2, null), lo = m.grid?.lower ? radarImage(m, id, 2, 'lower') : null; img = r.canvas; imgLow = lo?.canvas || null; scale = r.scale; mox = moz = 0; ovUnits = Math.max(m.size[0], m.size[1]) * 1.1; lowerFeet = imgLow ? m.grid.lowerY : null; sites = []; }
    imgMap = id; imgObj = m; imgKind = kind; mapEl.classList?.toggle('cs2', kind === 'cs2'); fb = floorBounds(m);
    for (const c of [img, imgLow]) if (c) { c.style.width = (c.naturalWidth || c.width) + 'px'; c.style.height = (c.naturalHeight || c.height) + 'px'; c.style.position = 'absolute'; c.style.left = c.style.top = '0'; c.style.visibility = ''; }
    if (imgLow) mapEl.replaceChildren(img, imgLow); else mapEl.replaceChildren(img); imgLayer = undefined; showLayer(null); }
  // The walkable part of the map (map coordinates from its centre: x0, z0, x1, z1), worked out once per map from its floor
  // cells: a CS2 map file's grid reaches far past what anyone walks (sky, roofs), so the big map frames this, and best
  // fit holds this against the radar's edges. Maps without cells: their whole size.
  function floorBounds(m) { let b = BOUNDS.get(m); if (b) return b; const [w, d] = m.size, G = m.grid; b = { x0: -w / 2, z0: -d / 2, x1: w / 2, z1: d / 2 };
    if (G?.cells && G.cols && G.cell) { let c0 = Infinity, c1 = -1, r0 = Infinity, r1 = -1; for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) if (G.cells[r * G.cols + c] === 1) { if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r; }
      if (c1 >= 0) b = { x0: -w / 2 + c0 * G.cell, z0: -d / 2 + r0 * G.cell, x1: -w / 2 + (c1 + 1) * G.cell, z1: -d / 2 + (r1 + 1) * G.cell }; }
    BOUNDS.set(m, b); return b; }
  function showLayer(layer) { if (imgLayer === layer) return; imgLayer = layer; if (imgLow) { const low = layer === 'lower'; img.style.visibility = low ? 'hidden' : ''; imgLow.style.visibility = low ? '' : 'hidden'; } }
  // Which picture the map gets: CS2's once decoded; while it decodes with the radar hidden (a map loading), nothing new
  // for up to 4 s; otherwise (no export, not a CS2 map file, the radar shown before it is ready) the built-in one —
  // swapped for CS2's the next time the radar is hidden or between rounds (warmup, freeze, round over), never mid-round.
  function picture(A, m, on, calm) { const pic = cs2Picture(m, A.map), same = imgMap === A.map && imgObj === m;
    if (pic?.state === 'ready') { if (!same || (imgKind !== 'cs2' && (!on || calm))) drawMap(A.map, 'cs2', pic); return; }
    if (same) return; if (pic && !on) { const t = performance.now(); if (waitMap !== m) { waitMap = m; waitAt = t; } if (t - waitAt < 4000) return; }
    drawMap(A.map, 'own'); }
  let cssW = 0; const sized = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { cssW = el.clientWidth; }) : null; sized?.observe(el);   // (the radar's size on screen: read on resize, not every frame)
  // Options applied live: the size published for the panel (and what sits under it), the next frame re-reads its size.
  const applyPrefs = () => { document.documentElement?.style?.setProperty?.('--gd-radar-h', radarSizeCSS(prefs.size)); cssW = 0; at = 0; if (big && !prefs.squareTab) expand(false); };
  globalThis.addEventListener?.('gd-radar-prefs', e => { prefs = cleanRadarPrefs(e.detail || loadRadarPrefs()); applyPrefs(); });
  // Hold Tab (with the scoreboard): the whole map, north up, at a large size — when "Toggle radar shape with scoreboard" is on.
  function expand(on) { on = !!on && prefs.squareTab; if (on === big) return; big = on; el.classList.toggle('big', on); document.body.classList.toggle('gd-mapopen', on); at = 0; cssW = 0; }   // Tab: the map sits beside the scoreboard, never over it. cssW = 0: the next frame reads the new size itself (the ResizeObserver reports only after that frame's rAF — one frame drawn at the old scale: GDUI-15)
  // The dots' canvas at the screen's own pixels (its CSS size × devicePixelRatio, remade only when either changes): sharp
  // icons at display scaling 1–2. Icon sizes below are in "radar units" — 0.5 CSS px each, the old 420-px canvas over a
  // 210-px radar — times ICON (a little larger than before: legible on a laptop's 187-px radar at 720p).
  const ICON = 1.3; let W = cv.width, R = W / 2, q = 1, cvCss = 0, cvDpr = 0, bombShownNow = false;
  const isFoe = (G, me, other) => { const t = G.combat?.d?.teams; return !t || !t[me] || t[other] !== t[me]; };
  const byKeys = new Map(), byKey = n => { let k = byKeys.get(n); if (k === undefined) { if (byKeys.size > 64) byKeys.clear(); k = key(n); byKeys.set(n, k); } return k; };   // (a grenade's thrower → key, remembered: nothing made per frame)
  // Everyone we know of, refreshed every frame into reused records: { k, x, y, z, yaw, dead, shot, weapon }.
  const people = []; let np = 0;
  // Per-frame drawing state (the map's place on the canvas) and helpers that read it: nothing allocated per frame.
  // (lmx, lmz: the picture point at the panel's centre this frame; T0, T1, T4, T5: the map layer's matrix as last written)
  let k = 1, ang = 0, mw = 0, md = 0, mcx = 0, mcz = 0, py = EYE, lmx = 0, lmz = 0, view = 1, T0 = NaN, T1 = NaN, T4 = NaN, T5 = NaN;
  const mapX = wx => (wx - mcx + mw / 2) * scale + mox, mapZ = wz => (wz - mcz + md / 2) * scale + moz;
  const fit = (v, lo, hi, h) => hi - lo <= 2 * h ? (lo + hi) / 2 : Math.min(hi - h, Math.max(lo + h, v));   // (best fit: the view kept inside the map's bounds)
  const colorOf = kk => TEAM_COLORS[slot.get(kk) ?? 0];
  // rel: +1 a floor above you, −1 below (a small ▲ / ▼ beside the dot, the dot a little faded), 0 your floor. alpha: a
  // last known place (faded, dashed ring).
  const dot = (wx, wz, color, r = 5, ring = null, rel = 0, alpha = 1) => { x.save(); x.translate(mapX(wx), mapZ(wz)); x.scale(q / k, q / k); x.globalAlpha = rel ? .7 * alpha : alpha; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fillStyle = color; x.fill(); if (ring) { x.lineWidth = 2; x.strokeStyle = ring; if (alpha < 1) x.setLineDash(LKP_DASH); x.stroke(); if (alpha < 1) x.setLineDash(NO_DASH); }
    if (rel) { x.rotate(-ang); x.globalAlpha = 1; x.beginPath(); const s = rel > 0 ? -1 : 1; x.moveTo(r + 2, 0); x.lineTo(r + 10, 0); x.lineTo(r + 6, 6 * s); x.closePath(); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 1; x.strokeStyle = '#000'; x.stroke(); } x.restore(); };
  const LKP_DASH = [3, 2], NO_DASH = [];
  const relOf = o => { const dy = (o.y ?? EYE) - py; return dy > FLOOR ? 1 : dy < -FLOOR ? -1 : 0; };
  // You (or who you watch): CS2's arrow in your colour, white-rimmed, with a faint view cone ahead.
  const arrow = (wx, wz, yw, color) => { x.save(); x.translate(mapX(wx), mapZ(wz)); x.rotate(-yw); x.scale(q / k, q / k); x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 34, -Math.PI / 2 - CONE, -Math.PI / 2 + CONE); x.closePath(); x.fillStyle = 'rgba(255,255,255,.11)'; x.fill();
    x.beginPath(); x.moveTo(0, -11); x.lineTo(7.5, 7.5); x.lineTo(0, 3.5); x.lineTo(-7.5, 7.5); x.closePath(); x.fillStyle = color; x.fill(); x.lineWidth = 1.6; x.strokeStyle = '#fff'; x.stroke(); x.restore(); };
  // A team mate: his colour, a black rim, a tick the way he faces, his number on the big map, a C4 beside the carrier.
  const mate = (o, color, n, carrier, rel) => { dot(o.x, o.z, color, 5.5, '#000', rel); x.save(); x.translate(mapX(o.x), mapZ(o.z)); x.scale(q / k, q / k); const fx = -Math.sin(o.yaw || 0), fz = -Math.cos(o.yaw || 0);
    x.beginPath(); x.moveTo(fx * 6.5, fz * 6.5); x.lineTo(fx * 11, fz * 11); x.lineWidth = 2.2; x.strokeStyle = color; x.stroke(); x.rotate(-ang);
    if (big && n) { x.font = '800 7px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#000'; x.fillText(n, 0, .5); }
    if (carrier) c4At(9, -7, '#ff4a2a'); x.restore(); };
  const c4At = (ox, oy, fill) => { x.fillStyle = fill; x.fillRect(ox - 5.5, oy - 3.5, 11, 7); x.lineWidth = 1.4; x.strokeStyle = '#000'; x.strokeRect(ox - 5.5, oy - 3.5, 11, 7); x.fillStyle = '#000'; x.fillRect(ox - 3, oy - 1.4, 6, 1.6); };
  const c4 = (wx, wz, fill) => { x.save(); x.translate(mapX(wx), mapZ(wz)); x.scale(q / k, q / k); x.rotate(-ang); c4At(0, 0, fill); x.restore(); };   // (the bomb, upright: dropped, planted)
  const cross = (wx, wz, color, alpha) => { x.save(); x.translate(mapX(wx), mapZ(wz)); x.scale(q / k, q / k); x.rotate(-ang); x.globalAlpha = alpha; x.lineCap = 'round'; x.strokeStyle = '#000'; x.lineWidth = 4.2; for (let j = 0; j < 2; j++) { x.beginPath(); x.moveTo(-4.5, -4.5); x.lineTo(4.5, 4.5); x.moveTo(4.5, -4.5); x.lineTo(-4.5, 4.5); x.stroke(); x.strokeStyle = color; x.lineWidth = 2.2; } x.restore(); };   // (a death: CS2's ✕)
  applyPrefs();
  return {
    expand,
    // N (and the option "Radar is rotating"): rotating with your view ⇄ north up. Saved like every radar option.
    toggle() { prefs = saveRadarPrefs({ ...prefs, rotate: !prefs.rotate }); applyPrefs(); return prefs.rotate ? 'rotate' : 'fixed'; },
    get mode() { return prefs.rotate ? 'rotate' : 'fixed'; }, get prefs() { return { ...prefs }; },
    get layer() { return imgLayer; }, get label() { return label.textContent; },
    // Tests: which picture ('cs2' | 'own'), game units across the panel, a world point as drawn this frame (CSS px from
    // the panel's top-left), the same on the map picture (picture px), a player's colour.
    get art() { return imgKind; }, get view() { return view; },
    project(wx, wz) { const u = mapX(wx) - lmx, v = mapZ(wz) - lmz, c = Math.cos(ang), s = Math.sin(ang), f = (cssW || W) / W; return [(R + k * (c * u - s * v)) * f, (R + k * (s * u + c * v)) * f]; },
    picturePoint(wx, wz) { return [mapX(wx), mapZ(wz)]; },
    colorOf(n) { return colorOf(key(n)); },
    // Enemies shown right now (tests): their keys.
    get why() { return Object.fromEntries(why); },
    get revealed() { const now = performance.now(), G = world.operations.game, me = key(name()); return [...seen].filter(([k, t]) => now - t < LINGER && isFoe(G, me, k)).map(([k]) => k); },
    // Tests: enemy dots drawn in the last frame ({ k, x, z, live }: live = where he is, else his last known place), the
    // radar's turn (radians; 0 when north up), the dots' canvas size (device px), how many floor pictures the map layer holds.
    get drawn() { return drawn.slice(0, nd).map(o => ({ ...o })); }, get angle() { return ang; }, get canvasPx() { return W; }, get iconCss() { return q * (cssW || W) / W; }, get pictures() { return imgLow ? 2 : img ? 1 : 0; },
    get bombShown() { return bombShownNow; },
    update() {
      const G = world.operations.game, on = G.mode === 'arena' && !!G.arena && active(); if (el.hidden === on) el.hidden = !on;
      const A = G.arena, m = A && ARENA_MAPS[A.map]; if (!m || m.stub || G.mode !== 'arena') return;   /* (a file-only map's stand-in: its file is still on the way) */
      { const ph = G.combat?.d?.round?.phase; picture(A, m, on, ph !== 'live' && ph !== 'planted'); } if (!on) return;   /* the picture made while the radar is still hidden (the loading card, the lobby): never mid-round; a map file loaded under the same name gets its own */
      const now = performance.now(), p = where(), feet = (p?.y ?? EYE) - EYE, layer = lowerFeet !== null && feet < lowerFeet ? 'lower' : null; showLayer(layer);   /* (Nuke: CS2's own split for its pictures — the feet under −495 Hammer units — else the built-in map's) */
      const me = key(name()), d = G.combat?.d, [w, dd] = m.size, cx = ARENA.cx, cz = ARENA.cz; { const lb = liveBoxes?.(); if (lb && lb.length !== undefined) boxes = lb; else if (boxMap !== m) boxes = mapBoxes(m, cx, cz); boxMap = m; }   /* the scene's own boxes (doors as they are now); else the map's, once per map */
      // A new round, side, map or match: nobody is known any more (their spots were last round's).
      { const myT = d?.teams?.[me] || null, rid = d?.round?.id ?? d?.n ?? null; if (rid !== eRound || myT !== eTeam || A.map !== eMap || A.match !== eMatch || A.startedAt !== eStart) { eRound = rid; eTeam = myT; eMap = A.map; eMatch = A.match; eStart = A.startedAt; seen.clear(); known.clear(); lastShots.clear(); why.clear(); bombSpot = null; at = 0; } }
      np = 0; for (const pl of lan.players || []) { if (!pl.pose || byKey(pl.name) === me) continue; const o = people[np] ??= {}; np++; o.k = byKey(pl.name); o.x = pl.pose.x; o.y = pl.pose.y; o.z = pl.pose.z; o.yaw = pl.pose.yaw; o.cr = !!pl.pose.crouched; o.fy = Number.isFinite(pl.pose.fy) ? pl.pose.fy : (o.y ?? EYE) - (o.cr ? DUCK_EYE : EYE); o.dead = (G.combat?.down?.[o.k]?.until || 0) > hostNow(); o.shot = pl.pose.shot?.n; o.weapon = pl.pose.weapon; }
      // 15× a second: which enemies are revealed — seen by a living team mate or you (alive: dead, the camera you watch
      // with is nobody's eyes — GDUI-05), or heard firing (unsuppressed) within 90 units of where you
      // are — and where you are (the callout under the radar).
      if (now - at >= 66) { at = now; const tNow = hostNow();   /* (smoke at the host's running clock — growth, fade, HE holes, tunnels — as the screen and the models' hiding judge it; G.combat.clock is only the last combat frame's stamp on a client and can stand still for seconds) */
        const meDead = (G.combat?.down?.[me]?.until || 0) > tNow, reach = m.nav || boxes.nadeMesh ? 500 : 220; ne = 0;
        if (d?.teams) { sideN.t = sideN.ct = 0; for (const tk in d.teams) { const s = d.teams[tk]; if (s === 't' || s === 'ct') slot.set(tk, sideN[s]++ % 5); } }   /* (CS2's colours: the n-th player of a side, in the host's join order) */
        if (!meDead && p) { const e = eyes[ne] ??= {}; ne++; e.x = p.x; e.y = p.y ?? EYE; e.z = p.z; e.yaw = yaw(); }
        if (d) for (let i = 0; i < np; i++) { const o = people[i]; if (o.dead || isFoe(G, me, o.k)) continue; const e = eyes[ne] ??= {}; ne++; e.x = o.x; e.y = o.y ?? EYE; e.z = o.z; e.yaw = o.yaw; }
        for (let i = 0; i < np; i++) { const o = people[i]; if (!isFoe(G, me, o.k)) { seen.delete(o.k); known.delete(o.k); continue; } const kn = known.get(o.k), was = !!kn?.live && now - kn.at < 200; if (kn) kn.live = false; if (o.dead) continue;
          let eye = null; for (let j = 0; j < ne && !eye; j++) { const e = eyes[j]; if (Math.hypot(e.x - o.x, e.z - o.z) < reach && inView(e.x, e.z, e.yaw, o.x, o.z) && radarSight(m, boxes, G, e.x, e.y, e.z, o.x, o.y ?? EYE, o.z, o.fy, o.cr, tNow, cx, cz)) eye = e; }
          if (eye) { seen.set(o.k, now); why.set(o.k, 'seen from ' + Math.round(eye.x) + ',' + Math.round(eye.z)); const r = known.get(o.k) || known.set(o.k, { flash: -1e9 }).get(o.k); if (!was) r.flash = now; r.x = o.x; r.y = o.y; r.z = o.z; r.at = now; r.live = true; }   /* (flash: CS2's ring when an enemy is first spotted) */
          const ls = lastShots.get(o.k); if (p && ls !== undefined && o.shot !== ls && !isQuiet(o.weapon) && Math.hypot(p.x - o.x, p.z - o.z) < 90) { seen.set(o.k, now); why.set(o.k, 'heard'); if (!eye) { const r = known.get(o.k) || known.set(o.k, {}).get(o.k); r.x = o.x; r.y = o.y; r.z = o.z; r.at = now; r.live = false; } } lastShots.set(o.k, o.shot); }
        // The planted bomb, for the Counter-Terrorists: shown once one of them has seen it (CS:GO's radar: the C4's spotted
        // flag — taken as CS2's too, not checked against its source); the Terrorists always know where it is.
        const rr = d?.round; if (ctBombSpotted && d && rr?.phase === 'planted' && rr.planted && d.teams?.[me] === 'ct' && bombSpot !== rr.planted.at) { const b = rr.planted, by = (b.y ?? 0) + .6;
          for (let j = 0; j < ne; j++) { const e = eyes[j]; if (Math.hypot(e.x - b.x, e.z - b.z) < reach && inView(e.x, e.z, e.yaw, b.x, b.z) && radarSight(m, boxes, G, e.x, e.y, e.z, b.x, by, b.z, b.y ?? 0, true, tNow, cx, cz)) { bombSpot = b.at; break; } } }
        const lt = (layer ? 'LOWER · ' : '') + (p ? locationOf(m, p.x - cx, p.z - cz, feet) || '' : '').toUpperCase(); if (label.textContent !== lt) label.textContent = lt; }   /* where you are, by callout (CS) */
      // Every frame: the map layer's place and turn, then the dots.
      // CS2's options: the big map (Tab) the whole map, north up; else "Radar map zoom" of the overview, turned with your
      // view when "Radar is rotating", you in the middle when "Radar centers the player" (else best fit: the view held
      // inside the map's bounds, you off centre near its edge). No running zoom (v51's): CS2's radar doesn't do that.
      const full = big; view = full ? Math.max(fb.x1 - fb.x0, fb.z1 - fb.z0) * 1.04 : ovUnits * ZOOM_K / prefs.zoom; k = W / view / scale; ang = full || !prefs.rotate ? 0 : (yaw() || 0); mw = w; md = dd; mcx = cx; mcz = cz; py = p.y ?? EYE;
      let mx = full ? mapX(cx + (fb.x0 + fb.x1) / 2) : mapX(p.x), mz = full ? mapZ(cz + (fb.z0 + fb.z1) / 2) : mapZ(p.z); if (!full && !prefs.centered) { const h = view * scale / 2; mx = fit(mx, mapX(cx + fb.x0), mapX(cx + fb.x1), h); mz = fit(mz, mapZ(cz + fb.z0), mapZ(cz + fb.z1), h); } lmx = mx; lmz = mz;
      if (!cssW) cssW = el.clientWidth; const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
      if (cssW !== cvCss || dpr !== cvDpr) { cvCss = cssW; cvDpr = dpr; const want = Math.max(64, Math.min(1600, Math.round(cssW * dpr))); if (want !== cv.width) { cv.width = cv.height = want; } W = cv.width; R = W / 2; k = W / view / scale; }   /* (on a resize only: remaking the canvas clears it) */
      q = (W / (cssW || W)) * Math.max(.5 * ICON * (full ? 1.25 : 1), (cssW || 420) / 420);   /* device pixels per radar unit: ≥ 0.65 CSS px (1.3× v51's small radar) at any scaling, and never below v51's big map (one unit = 1/420 of the radar's width: 1.48 CSS px on a 620 px Tab map) */
      // The map layer's matrix, written only when it changes (standing still: no style write, no string made).
      const f = cssW / W, c = Math.cos(ang), sn = Math.sin(ang), fk = f * k, t0 = fk * c, t1 = fk * sn, t4 = f * (R - k * (c * mx - sn * mz)), t5 = f * (R - k * (sn * mx + c * mz));
      if (t0 !== T0 || t1 !== T1 || t4 !== T4 || t5 !== T5) { T0 = t0; T1 = t1; T4 = t4; T5 = t5; mapEl.style.transform = `matrix(${t0},${t1},${-t1},${t0},${t4},${t5})`; }
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, W);
      x.save(); x.translate(R, R); x.rotate(ang); x.scale(k, k); x.translate(-mx, -mz);
      const myTeam = d?.teams?.[me] || null;
      // Bomb sites on CS2's picture (it has none of its own): CS2's A / B, upright.
      if (sites.length) { x.font = '900 15px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; for (let i = 0; i < sites.length; i++) { const s = sites[i]; if (s.low !== null && s.low !== (imgLayer === 'lower')) continue; x.save(); x.translate(mapX(cx + s.x), mapZ(cz + s.z)); x.scale(q / k, q / k); x.rotate(-ang); x.lineWidth = 3.5; x.strokeStyle = 'rgba(0,0,0,.85)'; x.strokeText(s.L, 0, 0); x.fillStyle = '#f4f4f4'; x.fillText(s.L, 0, 0); x.restore(); } }
      // The bomb: planted (a flashing C4), on the ground (Terrorists see it), carried by a team mate (beside his dot).
      const r = d?.round; bombShownNow = !!(r?.phase === 'planted' && r.planted && (!ctBombSpotted || myTeam !== 'ct' || bombSpot === r.planted.at)); if (bombShownNow && Math.floor(now / 300) % 2) c4(r.planted.x, r.planted.z, '#ff3030');
      if (d && myTeam === 't') { const gl = G.combat?.ground; if (gl) for (let i = 0; i < gl.length; i++) if (gl[i].item === 'c4') { c4(gl[i].x, gl[i].z, '#f0a030'); break; } }
      nd = 0; for (let i = 0; i < np; i++) { const o = people[i], foe = isFoe(G, me, o.k);
        if (!foe) { const s = slot.get(o.k) ?? 0; if (o.dead) cross(o.x, o.z, TEAM_COLORS[s], .85); else mate(o, TEAM_COLORS[s], NUMS[s], d?.bomb?.carrier === o.k, relOf(o)); continue; }
        if (o.dead) { if (d?.teams?.[o.k]) cross(o.x, o.z, ENEMY, .8); continue; }   /* (an enemy killed: CS2's red ✕ where he fell) */
        const kn = known.get(o.k); if (!kn || now - kn.at >= LINGER) continue;   /* seen now: where he is; lost: faded at his last known place (GDUI-05) */
        const lx = kn.live ? o.x : kn.x, lz = kn.live ? o.z : kn.z, fl = (now - kn.flash) / 500; dot(lx, lz, ENEMY, 5.5, '#000', relOf(kn.live ? o : kn), kn.live ? 1 : .5);
        if (fl >= 0 && fl < 1) { x.save(); x.translate(mapX(lx), mapZ(lz)); x.scale(q / k, q / k); x.globalAlpha = 1 - fl; x.lineWidth = 2; x.strokeStyle = ENEMY; x.beginPath(); x.arc(0, 0, 7 + fl * 12, 0, Math.PI * 2); x.stroke(); x.restore(); }
        const dr = drawn[nd] ??= {}; nd++; dr.k = o.k; dr.x = lx; dr.z = lz; dr.live = kn.live; dr.flash = fl >= 0 && fl < 1; }
      // Decoys (CS2): an enemy's decoy, while it fires, shows here as an enemy at its spot — the host's rule, worked out
      // the same on every client from the grenade's state (arena-nades.js decoyBlip(nade, host time): within a moment
      // of one of its shots); without that rule a live decoy (phase 'decoy') shows while it runs. Never your own or your
      // side's (the thrower's side at the throw: nade.team). Timed on the running host clock (host-clock.js, the one the
      // decoy's shots are heard on: arena-nades-view), never G.combat.clock: that is the stamp of the last combat frame,
      // and the host sends one only when something changes (a firing decoy alone changes nothing), so in a quiet game it
      // stands still for seconds and the dot froze off (or stuck on) while the shots were heard.
      { const cn = G.combat?.nades; if (cn?.length) { const blip = NADE_RULES.decoyBlip, hn = hostNow(), tm = d?.teams?.[me];
        for (let i = 0; i < cn.length; i++) { const n = cn[i]; if (n.kind !== 'decoy') continue; const by = byKey(n.by); if (by === me || (tm && (n.team || d.teams[by]) === tm)) continue;
          if (!(typeof blip === 'function' ? blip(n, hn) : n.phase === 'decoy')) continue; const dy = (n.y ?? 0) + EYE - py;
          dot(n.x, n.z, ENEMY, 5.5, '#000', dy > FLOOR ? 1 : dy < -FLOOR ? -1 : 0); } } }
      // Radio pings from team mates (their own position), pulsing for 3 s.
      for (const pg of pings()) { const t = (now - pg.at) / 3000; x.save(); x.translate(mapX(pg.x), mapZ(pg.z)); x.scale(q / k, q / k); x.strokeStyle = '#ffd65a'; x.globalAlpha = Math.max(0, 1 - t); x.lineWidth = 2.5; for (let j = 0; j < 2; j++) { x.beginPath(); x.arc(0, 0, 6 + ((t * 26) + 13 * j) % 26, 0, Math.PI * 2); x.stroke(); } x.restore(); }
      // You (dead: who you watch) last, on top: centred and pointing up when centred and rotating, else where you are.
      arrow(p.x, p.z, yaw() || 0, colorOf(p.name ? byKey(p.name) : me));
      x.restore();
    },
  };
}
