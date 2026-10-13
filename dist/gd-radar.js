// Global Defensive radar (top left): the map, you (arrow), your team, bomb sites, the planted bomb, the dropped bomb
// (Terrorists), and enemies only while revealed — seen by you or a team mate (walls and smoke block that), or heard
// firing an unsuppressed gun nearby, for 2 s. Never through walls otherwise. Two modes (N): rotating with your view,
// or fixed (north up). The map image is drawn once per map; each frame only the dots move (and only 15× a second).
import { ARENA_MAPS, mapBoxes } from './arena-maps.js';
import { ARENA } from './facility-layout.js';
import { clearView, smokeBlocks } from './arena-nades.js';
import { weaponById, EYE } from './weapons-data.js';
import { isQuiet } from './sound-bank.js';
import { radarImage, locationOf } from './gd-radar-art.js';

const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const PREF = 'gd-radar-mode', SPAN = 170, FLOOR = 15;   // FLOOR: eye heights this far apart (game units, ~100 Hammer units) are different floors   // game units shown across the radar (rotating mode)
export function createRadar({ world, lan, name, yaw, where, active, speed = () => 0, pings = () => [] }) {
  const css = document.createElement('style'); css.textContent = `#gd-radar{position:fixed;left:14px;top:14px;z-index:36;width:var(--rs);height:var(--rs);border-radius:10px;overflow:hidden;background:#0d1419d9;border:1px solid #ffffff33;box-shadow:0 2px 10px #0008;pointer-events:none;--rs:min(210px,26vh)}#gd-radar[hidden]{display:none}#gd-radar.big{--rs:min(60vh,36vw,620px);z-index:47;border-color:#ffffff55}body.gd-mapopen #ar-board{padding-left:calc(min(60vh,36vw,620px) + 30px);box-sizing:border-box}body.gd-mapopen #ar-board>div{width:min(1040px,calc(100vw - min(60vh,36vw,620px) - 54px))}#gd-radar canvas{width:100%;height:100%;display:block}#gd-radar small{position:absolute;left:0;right:0;bottom:4px;text-align:center;font:800 11px system-ui;color:#fff;letter-spacing:.06em;text-shadow:0 1px 2px #000,0 0 4px #000}`;
  (document.head || document.body).append?.(css);
  document.body.insertAdjacentHTML('beforeend', '<div id="gd-radar" hidden><canvas width="420" height="420"></canvas><small></small></div>');
  const el = document.getElementById('gd-radar'), cv = el.querySelector('canvas'), x = cv.getContext('2d'), label = el.querySelector('small');
  let mode = (() => { try { return localStorage.getItem(PREF) === 'fixed' ? 'fixed' : 'rotate'; } catch { return 'rotate'; } })();
  let img = null, imgMap = null, imgLayer = null, boxMap = null, boxes = [], scale = 1, at = 0, big = false, span = SPAN; const seen = new Map(), lastShots = new Map(), why = new Map();
  // The map, drawn once: floor, walls (dark), low cover (mid), raised floors / roofs (light outline), sites.
  // The map picture (CS-overview style, gd-radar-art.js), drawn once per map.
  // layer: null, or 'lower' (Nuke's lower level, while you are down there).
  function drawMap(id, layer = null) { const r = radarImage(ARENA_MAPS[id], id, 2, layer); img = r.canvas; scale = r.scale; imgMap = id; imgLayer = layer; }
  const isFoe = (G, me, other) => { const t = G.combat?.d?.teams; return !t || !t[me] || t[other] !== t[me]; };
  return {
    // Hold Tab (with the scoreboard): the whole map, north up, at a large size.
    expand(on) { on = !!on; if (on === big) return; big = on; el.classList.toggle('big', on); document.body.classList.toggle('gd-mapopen', on); at = 0; },   // Tab: the map sits beside the scoreboard, never over it
    toggle() { mode = mode === 'rotate' ? 'fixed' : 'rotate'; try { localStorage.setItem(PREF, mode); } catch {} return mode; },
    get mode() { return mode; },
    get layer() { return imgLayer; }, get label() { return label.textContent; },
    // Enemies shown right now (tests): their keys.
    get why() { return Object.fromEntries(why); },
    get revealed() { const now = performance.now(), G = world.operations.game, me = key(name()); return [...seen].filter(([k, t]) => now - t < 2000 && isFoe(G, me, k)).map(([k]) => k); },
    update() {
      const G = world.operations.game, on = G.mode === 'arena' && !!G.arena && active(); if (el.hidden === on) el.hidden = !on; if (!on) return;
      const now = performance.now(); if (now - at < 66) return; at = now;
      const A = G.arena, m = ARENA_MAPS[A.map]; if (!m) return; const pf = where(), feet = (pf?.y ?? EYE) - EYE, layer = m.grid?.lower && feet < m.grid.lowerY ? 'lower' : null; if (imgMap !== A.map || imgLayer !== layer) drawMap(A.map, layer);
      const me = key(name()), d = G.combat?.d, myTeam = d?.teams?.[me] || null, p = where(), [w, dd] = m.size, cx = ARENA.cx, cz = ARENA.cz; if (boxMap !== A.map) { boxMap = A.map; boxes = m.nav ? [] : mapBoxes(m, cx, cz); }   /* once per map, not per frame */
      // Everyone we know of: [{ k, name, x, z, yaw, dead, bot, shotN, weapon }].
      const people = []; for (const pl of lan.players || []) { if (!pl.pose || key(pl.name) === me) continue; people.push({ k: key(pl.name), x: pl.pose.x, y: pl.pose.y, z: pl.pose.z, yaw: pl.pose.yaw, dead: (G.combat?.down?.[key(pl.name)]?.until || 0) > Date.now(), shot: pl.pose.shot?.n, weapon: pl.pose.weapon }); }
      // Revealed enemies: seen by any living team mate (or you), or heard firing (unsuppressed) within 90 units.
      const eyes = [{ x: p.x, y: p.y ?? 9.7, z: p.z }, ...people.filter(o => !o.dead && !isFoe(G, me, o.k) && d).map(o => ({ x: o.x, y: o.y ?? 9.7, z: o.z }))];
      for (const o of people) { if (!isFoe(G, me, o.k)) { seen.delete(o.k); continue; } if (o.dead) continue;
        const eye = eyes.find(e => Math.hypot(e.x - o.x, e.z - o.z) < (m.nav ? 500 : 220) && (m.nav ? m.nav.sight(e.x - cx, e.y, e.z - cz, o.x - cx, o.y ?? 9.7, o.z - cz) && !smokeBlocks(G, e.x, e.y, e.z, o.x, o.y ?? 9.7, o.z) : clearView(G, boxes, e.x, e.z, o.x, o.z)));   /* classic maps: a real 3D line through the map, at eye heights */ if (eye) { seen.set(o.k, now); why.set(o.k, 'seen from ' + Math.round(eye.x) + ',' + Math.round(eye.z)); }
        const ls = lastShots.get(o.k); if (ls !== undefined && o.shot !== ls && !isQuiet(o.weapon) && Math.hypot(p.x - o.x, p.z - o.z) < 90) { seen.set(o.k, now); why.set(o.k, 'heard'); } lastShots.set(o.k, o.shot); }
      // Draw.
      const run = Math.min(1, (speed() || 0) / 40), want = SPAN * Math.max(1, Math.max(w, dd) / 420) * (1 + run * .3); span += (want - span) * .2;   /* dynamic zoom: wider on bigger maps and while running */
      const full = big || mode !== 'rotate', W = cv.width, R = W / 2, view = full ? Math.max(w, dd) * 1.02 : span, k = W / view / scale, ang = full ? 0 : (yaw() || 0);
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, W); x.fillStyle = '#0b0f12'; x.fillRect(0, 0, W, W);
      const toMap = (wx, wz) => [(wx - cx + w / 2) * scale, (wz - cz + dd / 2) * scale];
      x.save(); x.translate(R, R); x.rotate(ang); x.scale(k, k);
      const [mx, mz] = !full ? toMap(p.x, p.z) : [w / 2 * scale, dd / 2 * scale]; x.translate(-mx, -mz); x.drawImage(img, 0, 0);
      // rel: +1 a floor above you, −1 below (a small ▲ / ▼ beside the dot, the dot a little faded), 0 your floor.
      const dot = (wx, wz, color, r = 5, ring = null, rel = 0) => { const [ax, az] = toMap(wx, wz); x.save(); x.translate(ax, az); x.scale(1 / k, 1 / k); if (rel) x.globalAlpha = .7; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fillStyle = color; x.fill(); if (ring) { x.lineWidth = 2; x.strokeStyle = ring; x.stroke(); }
        if (rel) { x.rotate(-ang); x.globalAlpha = 1; x.beginPath(); const s = rel > 0 ? -1 : 1; x.moveTo(r + 2, 0); x.lineTo(r + 10, 0); x.lineTo(r + 6, 6 * s); x.closePath(); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 1; x.strokeStyle = '#000'; x.stroke(); } x.restore(); };
      const relOf = o => { const dy = (o.y ?? EYE) - (p.y ?? EYE); return dy > FLOOR ? 1 : dy < -FLOOR ? -1 : 0; };
      const arrow = (wx, wz, yw, color) => { const [ax, az] = toMap(wx, wz); x.save(); x.translate(ax, az); x.rotate(-yw); x.scale(1 / k, 1 / k); x.beginPath(); x.moveTo(0, -11); x.lineTo(7, 7); x.lineTo(0, 3); x.lineTo(-7, 7); x.closePath(); x.fillStyle = color; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#000'; x.stroke(); x.restore(); };
      // The bomb: planted (blinking), on the ground (Terrorists see it), carried by a team mate.
      const r = d?.round; if (r?.phase === 'planted' && r.planted && Math.floor(now / 300) % 2) dot(r.planted.x, r.planted.z, '#ff3030', 7, '#fff');
      if (d && myTeam === 't') { const gb = (G.combat?.ground || []).find(it => it.item === 'c4'); if (gb) dot(gb.x, gb.z, '#ff9a30', 6, '#000'); }
      for (const o of people) { const foe = isFoe(G, me, o.k), team = d?.teams?.[o.k];
        if (!foe) { if (o.dead) { const [ax, az] = toMap(o.x, o.z); x.save(); x.translate(ax, az); x.scale(1 / k, 1 / k); x.strokeStyle = '#ffffff88'; x.lineWidth = 2; x.beginPath(); x.moveTo(-4, -4); x.lineTo(4, 4); x.moveTo(4, -4); x.lineTo(-4, 4); x.stroke(); x.restore(); } else { dot(o.x, o.z, team === 'ct' ? '#5b9be8' : '#e8a53f', 5, d?.bomb?.carrier === o.k ? '#ff3030' : '#000', relOf(o)); } continue; }
        if (!o.dead && now - (seen.get(o.k) || -1e9) < 2000) dot(o.x, o.z, '#ff4040', 5, '#000', relOf(o)); }
      // Radio pings from team mates (their own position), pulsing for 3 s.
      for (const pg of pings()) { const [ax, az] = toMap(pg.x, pg.z), t = (performance.now() - pg.at) / 3000; x.save(); x.translate(ax, az); x.scale(1 / k, 1 / k); x.strokeStyle = `rgba(255,214,90,${1 - t})`; x.lineWidth = 2.5; for (const r of [6 + (t * 26) % 26, 6 + ((t * 26) + 13) % 26]) { x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke(); } x.restore(); }
      x.restore();
      // You: centre (rotating: pointing up) or on the map (fixed).
      if (!full) { x.save(); x.translate(R, R); x.beginPath(); x.moveTo(0, -13); x.lineTo(8, 9); x.lineTo(0, 4); x.lineTo(-8, 9); x.closePath(); x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#000'; x.stroke(); x.restore(); }
      else { x.save(); x.translate(R, R); x.scale(k, k); x.translate(-mx, -mz); arrow(p.x, p.z, yaw() || 0, '#ffffff'); x.restore(); }
      const lt = (layer ? 'LOWER · ' : '') + (locationOf(m, p.x - cx, p.z - cz, feet) || '').toUpperCase(); if (label.textContent !== lt) label.textContent = lt;   /* where you are, by callout (CS) */
    },
  };
}
