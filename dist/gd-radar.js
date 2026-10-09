// Global Defensive radar (top left): the map, you (arrow), your team, bomb sites, the planted bomb, the dropped bomb
// (Terrorists), and enemies only while revealed — seen by you or a team mate (walls and smoke block that), or heard
// firing an unsuppressed gun nearby, for 2 s. Never through walls otherwise. Two modes (N): rotating with your view,
// or fixed (north up). The map image is drawn once per map; each frame only the dots move (and only 15× a second).
import { ARENA_MAPS, mapBoxes } from './arena-maps.js';
import { ARENA } from './facility-layout.js';
import { clearView } from './arena-nades.js';
import { weaponById } from './weapons-data.js';
import { isQuiet } from './sound-bank.js';

const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const PREF = 'gd-radar-mode', SPAN = 170;   // game units shown across the radar (rotating mode)
export function createRadar({ world, lan, name, yaw, where, active }) {
  const css = document.createElement('style'); css.textContent = `#gd-radar{position:fixed;left:14px;top:14px;z-index:36;width:var(--rs);height:var(--rs);border-radius:10px;overflow:hidden;background:#0d1419d9;border:1px solid #ffffff33;box-shadow:0 2px 10px #0008;pointer-events:none;--rs:min(210px,26vh)}#gd-radar[hidden]{display:none}#gd-radar canvas{width:100%;height:100%;display:block}#gd-radar small{position:absolute;right:6px;bottom:3px;font:700 9px system-ui;color:#ffffff88;letter-spacing:.08em}`;
  (document.head || document.body).append?.(css);
  document.body.insertAdjacentHTML('beforeend', '<div id="gd-radar" hidden><canvas width="420" height="420"></canvas><small></small></div>');
  const el = document.getElementById('gd-radar'), cv = el.querySelector('canvas'), x = cv.getContext('2d'), label = el.querySelector('small');
  let mode = (() => { try { return localStorage.getItem(PREF) === 'fixed' ? 'fixed' : 'rotate'; } catch { return 'rotate'; } })();
  let img = null, imgMap = null, scale = 1, at = 0; const seen = new Map(), lastShots = new Map(), why = new Map();
  // The map, drawn once: floor, walls (dark), low cover (mid), raised floors / roofs (light outline), sites.
  function drawMap(id) {
    const m = ARENA_MAPS[id], [w, d] = m.size, px = 4, c = document.createElement('canvas'); c.width = Math.ceil(w * px / 2); c.height = Math.ceil(d * px / 2); const g = c.getContext('2d'), s = px / 2; scale = s;
    g.fillStyle = '#3a4248'; g.fillRect(0, 0, c.width, c.height);
    const boxes = mapBoxes(m, 0, 0).sort((a, b) => a.y1 - b.y1), X = v => (v + w / 2) * s, Z = v => (v + d / 2) * s;
    for (const b of boxes) { const h = b.y1 - b.y0, roof = b.y0 >= 10, wall = h >= 12 && !roof;
      g.fillStyle = roof ? 'rgba(160,170,178,.18)' : wall ? '#141a1f' : h >= 5 ? '#59636b' : '#4a5258'; g.fillRect(X(b.minX), Z(b.minZ), (b.maxX - b.minX) * s, (b.maxZ - b.minZ) * s);
      if (roof) { g.strokeStyle = 'rgba(200,210,218,.35)'; g.lineWidth = 1; g.strokeRect(X(b.minX), Z(b.minZ), (b.maxX - b.minX) * s, (b.maxZ - b.minZ) * s); } }
    for (const [L, [sx, sz, r]] of Object.entries(m.sites || {})) { g.fillStyle = 'rgba(255,214,90,.18)'; g.strokeStyle = 'rgba(255,214,90,.75)'; g.lineWidth = 2; g.beginPath(); g.arc(X(sx), Z(sz), r * s, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#ffd65a'; g.font = `900 ${Math.round(r * s * .9)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L, X(sx), Z(sz)); }
    img = c; imgMap = id;
  }
  const isFoe = (G, me, other) => { const t = G.combat?.d?.teams; return !t || !t[me] || t[other] !== t[me]; };
  return {
    toggle() { mode = mode === 'rotate' ? 'fixed' : 'rotate'; try { localStorage.setItem(PREF, mode); } catch {} return mode; },
    get mode() { return mode; },
    // Enemies shown right now (tests): their keys.
    get why() { return Object.fromEntries(why); },
    get revealed() { const now = performance.now(), G = world.operations.game, me = key(name()); return [...seen].filter(([k, t]) => now - t < 2000 && isFoe(G, me, k)).map(([k]) => k); },
    update() {
      const G = world.operations.game, on = G.mode === 'arena' && !!G.arena && active(); if (el.hidden === on) el.hidden = !on; if (!on) return;
      const now = performance.now(); if (now - at < 66) return; at = now;
      const A = G.arena, m = ARENA_MAPS[A.map]; if (!m) return; if (imgMap !== A.map) drawMap(A.map);
      const me = key(name()), d = G.combat?.d, myTeam = d?.teams?.[me] || null, p = where(), [w, dd] = m.size, cx = ARENA.cx, cz = ARENA.cz, boxes = mapBoxes(m, cx, cz);
      // Everyone we know of: [{ k, name, x, z, yaw, dead, bot, shotN, weapon }].
      const people = []; for (const pl of lan.players || []) { if (!pl.pose || key(pl.name) === me) continue; people.push({ k: key(pl.name), x: pl.pose.x, z: pl.pose.z, yaw: pl.pose.yaw, dead: (G.combat?.down?.[key(pl.name)]?.until || 0) > Date.now(), shot: pl.pose.shot?.n, weapon: pl.pose.weapon }); }
      // Revealed enemies: seen by any living team mate (or you), or heard firing (unsuppressed) within 90 units.
      const eyes = [{ x: p.x, z: p.z }, ...people.filter(o => !o.dead && !isFoe(G, me, o.k) && d).map(o => ({ x: o.x, z: o.z }))];
      for (const o of people) { if (!isFoe(G, me, o.k)) { seen.delete(o.k); continue; } if (o.dead) continue;
        const eye = eyes.find(e => Math.hypot(e.x - o.x, e.z - o.z) < 220 && clearView(G, boxes, e.x, e.z, o.x, o.z)); if (eye) { seen.set(o.k, now); why.set(o.k, 'seen from ' + Math.round(eye.x) + ',' + Math.round(eye.z)); }
        const ls = lastShots.get(o.k); if (ls !== undefined && o.shot !== ls && !isQuiet(o.weapon) && Math.hypot(p.x - o.x, p.z - o.z) < 90) { seen.set(o.k, now); why.set(o.k, 'heard'); } lastShots.set(o.k, o.shot); }
      // Draw.
      const W = cv.width, R = W / 2, view = mode === 'rotate' ? SPAN : Math.max(w, dd), k = W / view / scale, ang = mode === 'rotate' ? (yaw() || 0) : 0;
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, W); x.fillStyle = '#20282e'; x.fillRect(0, 0, W, W);
      const toMap = (wx, wz) => [(wx - cx + w / 2) * scale, (wz - cz + dd / 2) * scale];
      x.save(); x.translate(R, R); x.rotate(ang); x.scale(k, k);
      const [mx, mz] = mode === 'rotate' ? toMap(p.x, p.z) : [w / 2 * scale, dd / 2 * scale]; x.translate(-mx, -mz); x.drawImage(img, 0, 0);
      const dot = (wx, wz, color, r = 5, ring = null) => { const [ax, az] = toMap(wx, wz); x.save(); x.translate(ax, az); x.scale(1 / k, 1 / k); x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fillStyle = color; x.fill(); if (ring) { x.lineWidth = 2; x.strokeStyle = ring; x.stroke(); } x.restore(); };
      const arrow = (wx, wz, yw, color) => { const [ax, az] = toMap(wx, wz); x.save(); x.translate(ax, az); x.rotate(-yw); x.scale(1 / k, 1 / k); x.beginPath(); x.moveTo(0, -11); x.lineTo(7, 7); x.lineTo(0, 3); x.lineTo(-7, 7); x.closePath(); x.fillStyle = color; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#000'; x.stroke(); x.restore(); };
      // The bomb: planted (blinking), on the ground (Terrorists see it), carried by a team mate.
      const r = d?.round; if (r?.phase === 'planted' && r.planted && Math.floor(now / 300) % 2) dot(r.planted.x, r.planted.z, '#ff3030', 7, '#fff');
      if (d && myTeam === 't') { const gb = (G.combat?.ground || []).find(it => it.item === 'c4'); if (gb) dot(gb.x, gb.z, '#ff9a30', 6, '#000'); }
      for (const o of people) { const foe = isFoe(G, me, o.k), team = d?.teams?.[o.k];
        if (!foe) { if (o.dead) { const [ax, az] = toMap(o.x, o.z); x.save(); x.translate(ax, az); x.scale(1 / k, 1 / k); x.strokeStyle = '#ffffff88'; x.lineWidth = 2; x.beginPath(); x.moveTo(-4, -4); x.lineTo(4, 4); x.moveTo(4, -4); x.lineTo(-4, 4); x.stroke(); x.restore(); } else { dot(o.x, o.z, team === 'ct' ? '#5b9be8' : '#e8a53f', 5, d?.bomb?.carrier === o.k ? '#ff3030' : '#000'); } continue; }
        if (!o.dead && now - (seen.get(o.k) || -1e9) < 2000) dot(o.x, o.z, '#ff4040', 5, '#000'); }
      x.restore();
      // You: centre (rotating: pointing up) or on the map (fixed).
      if (mode === 'rotate') { x.save(); x.translate(R, R); x.beginPath(); x.moveTo(0, -13); x.lineTo(8, 9); x.lineTo(0, 4); x.lineTo(-8, 9); x.closePath(); x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#000'; x.stroke(); x.restore(); }
      else { x.save(); x.translate(R, R); x.scale(k, k); x.translate(-mx, -mz); arrow(p.x, p.z, yaw() || 0, '#ffffff'); x.restore(); }
      const lt = mode === 'rotate' ? 'ROTATING · N' : 'FIXED · N'; if (label.textContent !== lt) label.textContent = lt;
    },
  };
}
