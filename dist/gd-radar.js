// Global Defensive radar (top left): the map, you (arrow), your team, bomb sites, the planted bomb, the dropped bomb
// (Terrorists), and enemies only while revealed — seen by you or a team mate (walls and smoke block that), or heard
// firing an unsuppressed gun nearby, for 2 s. Never through walls otherwise. Two modes (N): rotating with your view,
// or fixed (north up). The map image is drawn once per map and only moved and turned after that (a compositor layer);
// the dots are redrawn every frame, who is revealed is worked out 15× a second.
import { ARENA_MAPS, mapBoxes } from './arena-maps.js';
import { ARENA } from './facility-layout.js';
import { clearView, smokeHides } from './arena-nades.js';   // (spotted through smoke unless it hides all of him — head, chest, knees: the rule the screen draws and the models' hiding use)
import * as NADE_RULES from './arena-nades.js';   // (decoyBlip, read when there: see the decoy dots below)
import { weaponById, EYE } from './weapons-data.js';
import { isQuiet } from './sound-bank.js';
import { radarImage, locationOf } from './gd-radar-art.js';
import { hostNow } from './host-clock.js';   // (who is dead, when a decoy fires: the host's clock)

const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const DUCK_EYE = 46 * 2.54 / 16.5;   // CS2's crouched eye, 46 HU (the feet of a crouched pose without fy)
const PREF = 'gd-radar-mode', SPAN = 170, FLOOR = 15;   // FLOOR: eye heights this far apart (game units, ~100 Hammer units) are different floors   // game units shown across the radar (rotating mode)
export function createRadar({ world, lan, name, yaw, where, active, speed = () => 0, pings = () => [] }) {
  const css = document.createElement('style'); css.textContent = `#gd-radar{position:fixed;left:14px;top:14px;z-index:36;width:var(--rs);height:var(--rs);border-radius:10px;overflow:hidden;background:#0b0f12;border:1px solid #ffffff33;box-shadow:0 2px 10px #0008;pointer-events:none;--rs:min(210px,26vh)}#gd-radar[hidden]{display:none}#gd-radar.big{--rs:min(60vh,36vw,620px);z-index:47;border-color:#ffffff55}body.gd-mapopen #ar-board{padding-left:calc(min(60vh,36vw,620px) + 30px);box-sizing:border-box}body.gd-mapopen #ar-board>div{width:min(1040px,calc(100vw - min(60vh,36vw,620px) - 54px))}#gd-radar .map{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}#gd-radar .map canvas{display:block}#gd-radar>canvas{position:absolute;inset:0;width:100%;height:100%;display:block}#gd-radar small{position:absolute;left:0;right:0;bottom:4px;text-align:center;font:800 11px system-ui;color:#fff;letter-spacing:.06em;text-shadow:0 1px 2px #000,0 0 4px #000}`;
  (document.head || document.body).append?.(css);
  document.body.insertAdjacentHTML('beforeend', '<div id="gd-radar" hidden><div class="map"></div><canvas width="420" height="420"></canvas><small></small></div>');
  const el = document.getElementById('gd-radar'), mapEl = el.querySelector('.map'), cv = el.querySelector('canvas'), x = cv.getContext('2d'), label = el.querySelector('small');
  let mode = (() => { try { return localStorage.getItem(PREF) === 'fixed' ? 'fixed' : 'rotate'; } catch { return 'rotate'; } })();
  let img = null, imgMap = null, imgObj = null, imgLayer = null, boxMap = null, boxes = [], scale = 1, at = 0, big = false, span = SPAN; const seen = new Map(), lastShots = new Map(), why = new Map();
  // The map picture (CS-overview style, gd-radar-art.js), drawn once per map, sits under the dots as its own layer:
  // each frame only its transform changes (moved and turned by the compositor, never repainted), so the rotating
  // radar turns as smoothly as the view. layer: null, or 'lower' (Nuke's lower level, while you are down there).
  function drawMap(id, layer = null) { const r = radarImage(ARENA_MAPS[id], id, 2, layer); img = r.canvas; scale = r.scale; imgMap = id; imgObj = ARENA_MAPS[id]; imgLayer = layer; img.style.width = img.width + 'px'; img.style.height = img.height + 'px'; mapEl.replaceChildren(img); }
  let cssW = 0; const sized = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { cssW = el.clientWidth; }) : null; sized?.observe(el);   // (the radar's size on screen: read on resize, not every frame)
  const isFoe = (G, me, other) => { const t = G.combat?.d?.teams; return !t || !t[me] || t[other] !== t[me]; };
  const byKeys = new Map(), byKey = n => { let k = byKeys.get(n); if (k === undefined) { if (byKeys.size > 64) byKeys.clear(); k = key(n); byKeys.set(n, k); } return k; };   // (a grenade's thrower → key, remembered: nothing made per frame)
  // Everyone we know of, refreshed every frame into reused records: { k, x, y, z, yaw, dead, shot, weapon }.
  const people = []; let np = 0;
  // Per-frame drawing state (the map's place on the canvas) and helpers that read it: nothing allocated per frame.
  const W = cv.width, R = W / 2; let k = 1, ang = 0, mw = 0, md = 0, mcx = 0, mcz = 0, py = EYE, lastT = '', lastNow = 0;
  const mapX = wx => (wx - mcx + mw / 2) * scale, mapZ = wz => (wz - mcz + md / 2) * scale;
  // rel: +1 a floor above you, −1 below (a small ▲ / ▼ beside the dot, the dot a little faded), 0 your floor.
  const dot = (wx, wz, color, r = 5, ring = null, rel = 0) => { x.save(); x.translate(mapX(wx), mapZ(wz)); x.scale(1 / k, 1 / k); if (rel) x.globalAlpha = .7; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fillStyle = color; x.fill(); if (ring) { x.lineWidth = 2; x.strokeStyle = ring; x.stroke(); }
    if (rel) { x.rotate(-ang); x.globalAlpha = 1; x.beginPath(); const s = rel > 0 ? -1 : 1; x.moveTo(r + 2, 0); x.lineTo(r + 10, 0); x.lineTo(r + 6, 6 * s); x.closePath(); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 1; x.strokeStyle = '#000'; x.stroke(); } x.restore(); };
  const relOf = o => { const dy = (o.y ?? EYE) - py; return dy > FLOOR ? 1 : dy < -FLOOR ? -1 : 0; };
  const arrow = (wx, wz, yw, color) => { x.save(); x.translate(mapX(wx), mapZ(wz)); x.rotate(-yw); x.scale(1 / k, 1 / k); x.beginPath(); x.moveTo(0, -11); x.lineTo(7, 7); x.lineTo(0, 3); x.lineTo(-7, 7); x.closePath(); x.fillStyle = color; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#000'; x.stroke(); x.restore(); };
  return {
    // Hold Tab (with the scoreboard): the whole map, north up, at a large size.
    expand(on) { on = !!on; if (on === big) return; big = on; el.classList.toggle('big', on); document.body.classList.toggle('gd-mapopen', on); at = 0; if (!sized) cssW = 0; },   // Tab: the map sits beside the scoreboard, never over it
    toggle() { mode = mode === 'rotate' ? 'fixed' : 'rotate'; try { localStorage.setItem(PREF, mode); } catch {} return mode; },
    get mode() { return mode; },
    get layer() { return imgLayer; }, get label() { return label.textContent; },
    // Enemies shown right now (tests): their keys.
    get why() { return Object.fromEntries(why); },
    get revealed() { const now = performance.now(), G = world.operations.game, me = key(name()); return [...seen].filter(([k, t]) => now - t < 2000 && isFoe(G, me, k)).map(([k]) => k); },
    update() {
      const G = world.operations.game, on = G.mode === 'arena' && !!G.arena && active(); if (el.hidden === on) el.hidden = !on; if (!on) return;
      const now = performance.now(), A = G.arena, m = ARENA_MAPS[A.map]; if (!m || m.stub) return;   /* (a file-only map's stand-in: its file is still on the way) */ const p = where(), feet = (p?.y ?? EYE) - EYE, layer = m.grid?.lower && feet < m.grid.lowerY ? 'lower' : null; if (imgMap !== A.map || imgObj !== m || imgLayer !== layer) drawMap(A.map, layer);   /* (a map file loaded under the same name: its own picture) */
      const me = key(name()), d = G.combat?.d, [w, dd] = m.size, cx = ARENA.cx, cz = ARENA.cz; if (boxMap !== m) { boxMap = m; boxes = m.nav ? [] : mapBoxes(m, cx, cz); }   /* once per map, not per frame */
      np = 0; for (const pl of lan.players || []) { if (!pl.pose || key(pl.name) === me) continue; const o = people[np] ??= {}; np++; o.k = key(pl.name); o.x = pl.pose.x; o.y = pl.pose.y; o.z = pl.pose.z; o.yaw = pl.pose.yaw; o.cr = !!pl.pose.crouched; o.fy = Number.isFinite(pl.pose.fy) ? pl.pose.fy : (o.y ?? EYE) - (o.cr ? DUCK_EYE : EYE); o.dead = (G.combat?.down?.[o.k]?.until || 0) > hostNow(); o.shot = pl.pose.shot?.n; o.weapon = pl.pose.weapon; }
      // 15× a second: which enemies are revealed — seen by any living team mate (or you), or heard firing (unsuppressed)
      // within 90 units — and where you are (the callout under the radar).
      if (now - at >= 66) { at = now; const tNow = hostNow();   /* (smoke at the host's running clock — growth, fade, HE holes, tunnels — as the screen and the models' hiding judge it; G.combat.clock is only the last combat frame's stamp on a client and can stand still for seconds) */
        const eyes = [{ x: p.x, y: p.y ?? 9.7, z: p.z }]; if (d) for (let i = 0; i < np; i++) { const o = people[i]; if (!o.dead && !isFoe(G, me, o.k)) eyes.push({ x: o.x, y: o.y ?? 9.7, z: o.z }); }
        for (let i = 0; i < np; i++) { const o = people[i]; if (!isFoe(G, me, o.k)) { seen.delete(o.k); continue; } if (o.dead) continue;
          const eye = eyes.find(e => Math.hypot(e.x - o.x, e.z - o.z) < (m.nav ? 500 : 220) && (m.nav ? m.nav.sight(e.x - cx, e.y, e.z - cz, o.x - cx, o.y ?? 9.7, o.z - cz) && !smokeHides(G, e.x, e.y, e.z, o.x, o.fy, o.z, o.cr, tNow) : clearView(G, boxes, e.x, e.z, o.x, o.z, 8, tNow)));   /* classic maps: a real 3D line through the map, at eye heights */ if (eye) { seen.set(o.k, now); why.set(o.k, 'seen from ' + Math.round(eye.x) + ',' + Math.round(eye.z)); }
          const ls = lastShots.get(o.k); if (ls !== undefined && o.shot !== ls && !isQuiet(o.weapon) && Math.hypot(p.x - o.x, p.z - o.z) < 90) { seen.set(o.k, now); why.set(o.k, 'heard'); } lastShots.set(o.k, o.shot); }
        const lt = (layer ? 'LOWER · ' : '') + (locationOf(m, p.x - cx, p.z - cz, feet) || '').toUpperCase(); if (label.textContent !== lt) label.textContent = lt; }   /* where you are, by callout (CS) */
      // Every frame: the map layer's place and turn, then the dots.
      const run = Math.min(1, (speed() || 0) / 40), want = SPAN * Math.max(1, Math.max(w, dd) / 420) * (1 + run * .3); span += (want - span) * (1 - Math.pow(.8, Math.min(5, (now - (lastNow || now)) / 66))); lastNow = now;   /* dynamic zoom: wider on bigger maps and while running */
      const full = big || mode !== 'rotate', view = full ? Math.max(w, dd) * 1.02 : span; k = W / view / scale; ang = full ? 0 : (yaw() || 0); mw = w; md = dd; mcx = cx; mcz = cz; py = p.y ?? EYE;
      const mx = full ? w / 2 * scale : mapX(p.x), mz = full ? dd / 2 * scale : mapZ(p.z);
      if (!cssW) cssW = el.clientWidth; const f = cssW / W, c = Math.cos(ang), sn = Math.sin(ang), fk = f * k;
      const T = `matrix(${fk * c},${fk * sn},${-fk * sn},${fk * c},${f * (R - k * (c * mx - sn * mz))},${f * (R - k * (sn * mx + c * mz))})`; if (T !== lastT) { lastT = T; mapEl.style.transform = T; }
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, W);
      x.save(); x.translate(R, R); x.rotate(ang); x.scale(k, k); x.translate(-mx, -mz);
      const myTeam = d?.teams?.[me] || null;
      // The bomb: planted (blinking), on the ground (Terrorists see it), carried by a team mate.
      const r = d?.round; if (r?.phase === 'planted' && r.planted && Math.floor(now / 300) % 2) dot(r.planted.x, r.planted.z, '#ff3030', 7, '#fff');
      if (d && myTeam === 't') { const gb = (G.combat?.ground || []).find(it => it.item === 'c4'); if (gb) dot(gb.x, gb.z, '#ff9a30', 6, '#000'); }
      for (let i = 0; i < np; i++) { const o = people[i], foe = isFoe(G, me, o.k), team = d?.teams?.[o.k];
        if (!foe) { if (o.dead) { x.save(); x.translate(mapX(o.x), mapZ(o.z)); x.scale(1 / k, 1 / k); x.strokeStyle = '#ffffff88'; x.lineWidth = 2; x.beginPath(); x.moveTo(-4, -4); x.lineTo(4, 4); x.moveTo(4, -4); x.lineTo(-4, 4); x.stroke(); x.restore(); } else { dot(o.x, o.z, team === 'ct' ? '#5b9be8' : '#e8a53f', 5, d?.bomb?.carrier === o.k ? '#ff3030' : '#000', relOf(o)); } continue; }
        if (!o.dead && now - (seen.get(o.k) || -1e9) < 2000) dot(o.x, o.z, '#ff4040', 5, '#000', relOf(o)); }
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
          dot(n.x, n.z, '#ff4040', 5, '#000', dy > FLOOR ? 1 : dy < -FLOOR ? -1 : 0); } } }
      // Radio pings from team mates (their own position), pulsing for 3 s.
      for (const pg of pings()) { const t = (now - pg.at) / 3000; x.save(); x.translate(mapX(pg.x), mapZ(pg.z)); x.scale(1 / k, 1 / k); x.strokeStyle = '#ffd65a'; x.globalAlpha = Math.max(0, 1 - t); x.lineWidth = 2.5; for (let j = 0; j < 2; j++) { x.beginPath(); x.arc(0, 0, 6 + ((t * 26) + 13 * j) % 26, 0, Math.PI * 2); x.stroke(); } x.restore(); }
      x.restore();
      // You: centre (rotating: pointing up) or on the map (fixed).
      if (!full) { x.save(); x.translate(R, R); x.beginPath(); x.moveTo(0, -13); x.lineTo(8, 9); x.lineTo(0, 4); x.lineTo(-8, 9); x.closePath(); x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#000'; x.stroke(); x.restore(); }
      else { x.save(); x.translate(R, R); x.scale(k, k); x.translate(-mx, -mz); arrow(p.x, p.z, yaw() || 0, '#ffffff'); x.restore(); }
    },
  };
}
