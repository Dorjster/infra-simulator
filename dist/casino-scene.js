// Payday casino, north of the server hall through the doorway at x −1…13. Built at real-life scale
// (≈0.165 m per unit: tables 0.8 m high, cards 63 × 88 mm, chips 39 mm). Every table shows the host's
// live game: the 3D cards are the dealt cards, the chips on the felt are the bets on the table, the ball
// lands on the number the host drew at the moment the panel reveals it (casino-sync.js), the reels stop
// on the spin result and the lotto machine blows the drawn balls up its tube into the rack, one by one.
// The doors open only in Payday mode.
import * as THREE from './three.module.js';
import { CASINO, ROOM } from './facility-layout.js';
import { WHEEL, rouletteColor, TABLES, SLOT_SYMBOLS, LOTTO } from './casino-logic.js';
import { startedAt, SYNC, bjReveal, lottoPlan, boardLandsAt, hitLandsAt } from './casino-sync.js';
import { createStage } from './casino-stage.js';
import { drawSymbol } from './slot-symbols.js';

const TABLE_H = 4.8, CARD_W = .38, CARD_H = .53, CHIP_R = .12, CHIP_T = .022;
export const LAYOUT = { 'bj-1': { x: -24, z: 86 }, 'bj-2': { x: -24, z: 152 }, 'rl-1': { x: 12, z: 86 }, 'rl-2': { x: 12, z: 162 }, 'pk-1': { x: 48, z: 152 }, 'sl-1': { x: 64, z: 92 }, 'sl-2': { x: 64, z: 99 }, 'sl-3': { x: 64, z: 106 }, lotto: { x: 46, z: 72 }, wallet: { x: -32, z: 66 }, stage: { x: 14, z: 123 } };
const BJ_SEAT_ANGLES = [0, 1, 2, 3, 4].map(i => Math.PI * (.18 + i * .16)), PK_ANGLES = [172, 128, 90, 52, 8].map(d => d * Math.PI / 180), PK_A = 7, PK_B = 4;
// Where a player stands / looks for a table seat (camera pose for "take a seat").
export function seatPose(id, seat = 0) {
  const L = LAYOUT[id], def = TABLES.find(t => t.id === id); if (!L) return null;
  if (def?.game === 'blackjack') { const a = BJ_SEAT_ANGLES[Math.max(0, Math.min(4, seat))]; return { px: L.x - Math.cos(a) * 9.4, pz: L.z + Math.sin(a) * 9.4, tx: L.x - Math.cos(a) * 2.5, ty: TABLE_H, tz: L.z + Math.sin(a) * 2.5 }; }
  if (def?.game === 'roulette') { const xs = [-4, -.5, 3, 6.5]; return { px: L.x + xs[seat % 4], pz: L.z + 9, tx: L.x + xs[seat % 4] * .6, ty: TABLE_H, tz: L.z }; }
  if (def?.game === 'poker') { const a = PK_ANGLES[Math.max(0, Math.min(4, seat))]; return { px: L.x + Math.cos(a) * PK_A * 1.75, pz: L.z + Math.sin(a) * PK_B * 2.1, tx: L.x, ty: TABLE_H, tz: L.z }; }
  if (def?.game === 'slots') return { px: L.x - 5.2, pz: L.z, tx: L.x, ty: 6.8, tz: L.z };
  if (id === 'lotto') { const dx = (seat % 5 - 2) * 1.6; return { px: L.x - 1 + dx, pz: L.z - 11, tx: L.x + 1.5 + dx * .3, ty: 7, tz: L.z }; }   // watchers stand side by side
  if (id === 'stage') { const a = -Math.PI / 2 + (seat % 5 - 2) * .35; return { px: L.x + Math.cos(a) * 12, pz: L.z + Math.sin(a) * 12, tx: L.x, ty: 7, tz: L.z }; }
  return { px: L.x, pz: L.z - 6, tx: L.x, ty: 4, tz: L.z };
}
// Roulette layout: one function places both the printed felt and the 3D chips (u → east, v → south, 0…1).
const RL_W = 9, RL_D = 4.8;
export function rlSpot(kind, value) {
  const col = n => Math.ceil(n / 3), row = n => n % 3 === 0 ? 0 : n % 3 === 2 ? 1 : 2, cw = 1 / 13, rh = 1 / 4.8;
  if (kind === 'straight') return value === 0 ? [cw / 2, 1.5 * rh] : [(col(value) + .5) * cw, (row(value) + .5) * rh];
  if (kind === 'dozen') return [(1 + (value - 1) * 4 + 2) * cw, 3.45 * rh];
  if (kind === 'column') return [12.5 * cw, (3 - value + .5) * rh];
  const order = ['low', 'even', 'red', 'black', 'odd', 'high']; return [(1 + order.indexOf(kind) * 2 + 1) * cw, 4.35 * rh];
}

const noCanvas = new Proxy({}, { get: () => () => {}, set: () => true });
function canvasTexture(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; const ctx = c.getContext?.('2d'); return { c, g: typeof ctx?.beginPath === 'function' ? ctx : noCanvas, t }; }
const money = n => '$' + Math.round(n || 0).toLocaleString('en-US');
const key = s => String(s || '').trim().toLowerCase();

// Card faces (cached) — '??' is the back.
const cardMats = new Map(), cardGeo = new THREE.PlaneGeometry(CARD_W, CARD_H).rotateX(-Math.PI / 2);
function cardMaterial(card) {
  if (cardMats.has(card)) return cardMats.get(card);
  const s = canvasTexture(128, 180), g = s.g; g.fillStyle = card === '??' ? '#7d1626' : '#fbfaf5'; g.fillRect(0, 0, 128, 180);
  if (card === '??') { g.strokeStyle = '#e8c35a'; g.lineWidth = 6; g.strokeRect(10, 10, 108, 160); for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(10 + i * 10, 10); g.lineTo(118, 170 - i * 12); g.stroke(); } }
  else { const red = /[♥♦]/.test(card), r = card.slice(0, -1), su = card.slice(-1); g.fillStyle = red ? '#c4142b' : '#111'; g.font = 'bold 40px Georgia'; g.fillText(r, 10, 44); g.font = '30px Georgia'; g.fillText(su, 12, 76); g.font = '80px Georgia'; g.textAlign = 'center'; g.fillText(su, 64, 140); }
  const m = new THREE.MeshStandardMaterial({ map: s.t, roughness: .6 }); m.userData.shared = true; cardMats.set(card, m); return m;
}
// Numbered lotto balls (one material per number).
const ballMats = new Map();
function ballMaterial(n) {
  if (ballMats.has(n)) return ballMats.get(n);
  const s = canvasTexture(256, 128), g = s.g; g.fillStyle = `hsl(${(n - 1) / 36 * 360},78%,52%)`; g.fillRect(0, 0, 256, 128); g.textAlign = 'center';
  for (let k = 0; k < 4; k++) { g.fillStyle = '#fff'; g.beginPath(); g.arc(32 + k * 64, 64, 26, 0, 7); g.fill(); g.fillStyle = '#111'; g.font = 'bold 30px system-ui'; g.fillText(String(n), 32 + k * 64, 75); }
  const m = new THREE.MeshStandardMaterial({ map: s.t, roughness: .25, metalness: .05 }); m.userData.shared = true; ballMats.set(n, m); return m;
}
const DENOMS = [[1000, 0xd8a945], [500, 0x8b5cf6], [100, 0x1a1a1a], [25, 0x16a34a], [5, 0xdc2626], [1, 0xf5f5f5]];
function chipsFor(amount, cap = 24) { const out = []; let left = Math.round(amount); for (const [v, c] of DENOMS) while (left >= v && out.length < cap) { out.push(c); left -= v; } return out; }

export function createCasinoScene(scene, { pickables = [], localName = () => '' } = {}) {
  const group = new THREE.Group(); group.name = 'casino'; scene.add(group);
  const { minX, maxX, minZ, maxZ, doorX: [d0, d1], doorH, height: H } = CASINO, W = maxX - minX, D = maxZ - minZ, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const add = (geo, mat, x, y, z, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const box = (w, h, d, x, y, z, mat, parent = group) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  const carpet = canvasTexture(256, 256); { const g = carpet.g; g.fillStyle = '#5b0f1d'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#c99a3c'; g.lineWidth = 3; for (let i = -256; i < 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke(); g.beginPath(); g.moveTo(i + 256, 0); g.lineTo(i, 256); g.stroke(); } g.fillStyle = '#e2bc5c'; for (let x = 0; x <= 256; x += 64) for (let y = 0; y <= 256; y += 64) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); } carpet.t.wrapS = carpet.t.wrapT = THREE.RepeatWrapping; carpet.t.repeat.set(W / 10, D / 10); }
  const M = {
    carpet: new THREE.MeshStandardMaterial({ map: carpet.t, roughness: .95 }), wall: new THREE.MeshStandardMaterial({ color: 0x3b1222, roughness: .8 }), panel: new THREE.MeshStandardMaterial({ color: 0x24090f, roughness: .7 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd8a945, metalness: .6, roughness: .3, emissive: 0x3a2808 }), ceiling: new THREE.MeshStandardMaterial({ color: 0x170a10, roughness: .9 }),
    blueFelt: new THREE.MeshStandardMaterial({ color: 0x0e3f73, roughness: .95 }), leather: new THREE.MeshStandardMaterial({ color: 0x2a1610, roughness: .55 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a2d16, roughness: .55 }), chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e7, metalness: .6, roughness: .2, emissive: 0x222428 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfeeff, transparent: true, opacity: .16, roughness: .05, depthWrite: false, side: THREE.DoubleSide }), lamp: new THREE.MeshBasicMaterial({ color: 0xffe2a0 }), black: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .6 }),
    velvet: new THREE.MeshStandardMaterial({ color: 0x8c1020, roughness: .9 })
  };
  for (const m of Object.values(M)) m.userData.shared = true;
  // Shell: floor, ceiling, walls with gold trim, columns, the doorway with frame, neon sign and glass doors.
  box(W, .2, D, cx, -.08, cz, M.carpet); box(W, .3, D, cx, H, cz, M.ceiling);
  box(.3, H, D, minX, H / 2, cz, M.wall); box(.3, H, D, maxX, H / 2, cz, M.wall); box(W, H, .3, cx, H / 2, maxZ, M.wall);
  box(d0 - minX, H, .3, (minX + d0) / 2, H / 2, minZ - .2, M.wall); box(maxX - d1, H, .3, (d1 + maxX) / 2, H / 2, minZ - .2, M.wall); box(d1 - d0, H - doorH, .3, (d0 + d1) / 2, (H + doorH) / 2, minZ - .2, M.wall);
  for (const [w, x, z, ry] of [[W, cx, maxZ - .2, 0], [D, minX + .2, cz, Math.PI / 2], [D, maxX - .2, cz, Math.PI / 2]]) for (const y of [4, H - .8]) { const t = box(w, .3, .1, x, y, z, M.gold); t.rotation.y = ry; }
  const COLUMNS = []; for (let x = minX + 14; x < maxX - 6; x += 26) for (let z = minZ + 20; z < maxZ - 10; z += 30) { if ([-26, 0, 28].some(cx2 => Math.abs(x - cx2) < 2) && false) continue; COLUMNS.push([x, z]); }
  const columnSpots = COLUMNS.filter(([x, z]) => !Object.values(LAYOUT).some(L => Math.hypot(x - L.x, z - L.z) < 13) && x > minX + 6 && x < maxX - 8);
  for (const [x, z] of columnSpots) { add(new THREE.CylinderGeometry(.9, .9, H, 16), M.panel, x, H / 2, z); for (const y of [.3, H - .3]) add(new THREE.CylinderGeometry(1.15, 1.15, .6, 16), M.gold, x, y, z); }
  box(.6, doorH, .7, d0, doorH / 2, ROOM.maxZ + .5, M.gold); box(.6, doorH, .7, d1, doorH / 2, ROOM.maxZ + .5, M.gold); box(d1 - d0 + .6, .6, .7, (d0 + d1) / 2, doorH, ROOM.maxZ + .5, M.gold);
  const neon = canvasTexture(640, 170), neonMesh = add(new THREE.PlaneGeometry(12, 3.2), new THREE.MeshBasicMaterial({ map: neon.t, transparent: true }), (d0 + d1) / 2, 15.2, ROOM.maxZ + .1); neonMesh.rotation.y = Math.PI;
  const doors = [-1, 1].map(s => add(new THREE.BoxGeometry((d1 - d0) / 2, doorH - .4, .12), M.glass, (d0 + d1) / 2 + s * (d1 - d0) / 4, (doorH - .4) / 2, ROOM.maxZ + .5));
  for (const x of [d0 + 1.5, d1 - 1.5]) for (let z = minZ + 2; z <= minZ + 10; z += 4) { add(new THREE.CylinderGeometry(.12, .2, 5.4, 10), M.gold, x, 2.7, z); add(new THREE.SphereGeometry(.25, 10, 8), M.gold, x, 5.5, z); if (z < minZ + 10) { const r = add(new THREE.CylinderGeometry(.08, .08, 4, 6), M.velvet, x, 4.6, z + 2); r.rotation.x = Math.PI / 2; } }
  const lights = [new THREE.PointLight(0xffd59a, 2.4, 120, 1.1), new THREE.PointLight(0xffc98a, 1.6, 90, 1.2)]; lights[0].position.set(cx - 15, H - 4, cz - 10); lights[1].position.set(cx + 20, H - 4, cz + 25); lights.forEach(l => group.add(l));
  function chandelier(x, z) { const c = add(new THREE.TorusGeometry(2.4, .14, 8, 28), M.gold, x, H - 4, z); c.rotation.x = Math.PI / 2; for (let i = 0; i < 12; i++) add(new THREE.SphereGeometry(.28, 10, 8), M.lamp, x + Math.cos(i / 12 * 6.283) * 2.4, H - 4.35, z + Math.sin(i / 12 * 6.283) * 2.4); box(.08, 4, .08, x, H - 2, z, M.gold); add(new THREE.SphereGeometry(.6, 12, 10), M.lamp, x, H - 4.6, z); }
  function screen(w, h, x, y, z, ry = Math.PI, px = 640) { const s = canvasTexture(px, Math.round(px * h / w)), m = add(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: s.t }), x, y, z); m.rotation.y = ry; const f = box(w + .35, h + .35, .1, x - Math.sin(ry) * .07, y, z - Math.cos(ry) * .07, M.gold); f.rotation.y = ry; return s; }
  function sign(s, title, lines, accent = '#e2bc5c') { const g = s.g, w = s.c.width, h = s.c.height; g.fillStyle = '#12060b'; g.fillRect(0, 0, w, h); g.textAlign = 'center'; g.fillStyle = accent; g.font = `bold ${h * .19}px Georgia, serif`; g.fillText(title, w / 2, h * .24); g.fillStyle = '#f5ead3'; g.font = `${h * .115}px system-ui, sans-serif`; lines.slice(0, 4).forEach((l, i) => g.fillText(String(l).slice(0, 60), w / 2, h * (.44 + i * .155))); g.textAlign = 'left'; s.t.needsUpdate = true; }
  const hit = (w, h, d, x, z, data) => { const m = add(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }), x, h / 2, z); m.userData = data; pickables.push(m); return m; };
  // Chip stacks (instanced, per table) — world coordinates.
  function chipLayer(max = 600) { const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_T, 14), new THREE.MeshStandardMaterial({ roughness: .4 }), max); m.count = 0; m.frustumCulled = false; group.add(m); const d = new THREE.Object3D(), c = new THREE.Color(); let n = 0; return { m, begin() { n = 0; }, stack(x, z, amount, y = TABLE_H + .02, cap = 24) { chipsFor(amount, cap).forEach((col, i) => { if (n >= max) return; d.position.set(x + Math.floor(i / 12) * CHIP_R * 2.1, y + (i % 12) * CHIP_T + CHIP_T / 2, z); d.updateMatrix(); m.setMatrixAt(n, d.matrix); m.setColorAt(n, c.setHex(col)); n++; }); }, end() { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } }; }
  // Card pool (per table): cards keyed by identity, dealt from the shoe with a short arc; flips when revealed.
  function cardLayer(shoe) {
    const live = new Map();
    return { live, landed() { const now = performance.now(); return [...live.entries()].filter(([, c]) => now >= c.born + 320).map(([id, c]) => [id, c.card]); }, place(id, card, x, z, rot = 0, delay = 0, y = TABLE_H + .03) { let c = live.get(id); if (!c) { c = { mesh: add(cardGeo, cardMaterial(card), shoe.x, y, shoe.z), born: performance.now() + delay, card }; live.set(id, c); } if (c.card !== card) { c.card = card; c.flipAt = performance.now(); c.mesh.material = cardMaterial(card); } c.target = [x, y, z, rot]; c.seen = true; },
      begin() { for (const c of live.values()) c.seen = false; },
      end() { const now = performance.now(); for (const [id, c] of live) { if (!c.seen) { group.remove(c.mesh); live.delete(id); continue; } const t = Math.min(1, Math.max(0, (now - c.born) / 320)), e = t * (2 - t); c.mesh.visible = now >= c.born; c.mesh.position.set(shoe.x + (c.target[0] - shoe.x) * e, c.target[1] + Math.sin(t * Math.PI) * .6, shoe.z + (c.target[2] - shoe.z) * e); c.mesh.rotation.y = c.target[3]; const f = c.flipAt ? Math.min(1, (now - c.flipAt) / 300) : 1; c.mesh.scale.x = Math.abs(Math.cos(f * Math.PI)) * .9 + .1; } } };
  }
  const tables = {};

  // ---- Blackjack: half-round table, dealer on the flat (north) edge, five seats on the arc. ----
  function buildBlackjack(id, felt) {
    const L = LAYOUT[id], def = TABLES.find(t => t.id === id), g = new THREE.Group(); g.position.set(L.x, 0, L.z); group.add(g);
    add(new THREE.CylinderGeometry(6.4, 6.4, .45, 48, 1, false, -Math.PI / 2, Math.PI), M.leather, 0, TABLE_H - .2, 0, g); add(new THREE.TorusGeometry(6.2, .22, 8, 48, Math.PI), M.leather, 0, TABLE_H + .05, 0, g).rotation.x = -Math.PI / 2;
    const feltTex = canvasTexture(1024, 512), feltGeo = new THREE.CircleGeometry(6, 48, Math.PI, Math.PI); { const P = feltGeo.attributes.position, UV = feltGeo.attributes.uv; for (let i = 0; i < P.count; i++) UV.setXY(i, (P.getX(i) / 6 + 1) / 2, 1 + P.getY(i) / 6); }
    const fm = add(feltGeo, new THREE.MeshStandardMaterial({ map: feltTex.t, roughness: .95 }), 0, TABLE_H + .05, 0, g); fm.rotation.x = -Math.PI / 2;
    { const c = feltTex.g; c.fillStyle = felt; c.fillRect(0, 0, 1024, 512); c.strokeStyle = '#e2bc5c'; c.lineWidth = 3; c.beginPath(); c.arc(512, 0, 300, 0, Math.PI); c.stroke(); c.textAlign = 'center'; c.fillStyle = '#e2bc5c'; c.font = 'bold 30px Georgia'; c.fillText('BLACKJACK PAYS 3 TO 2', 512, 200); c.font = '22px Georgia'; c.fillText('Dealer must stand on all 17s · ' + money(def.min) + '–' + money(def.max), 512, 236); BJ_SEAT_ANGLES.forEach(a => { c.beginPath(); c.arc(512 - Math.cos(a) * 512 * (5 / 6), Math.sin(a) * 512 * (5 / 6), 30, 0, 7); c.stroke(); }); feltTex.t.needsUpdate = true; }
    box(10.5, TABLE_H - .5, 2.4, 0, (TABLE_H - .5) / 2, .6, M.wood, g); add(new THREE.CylinderGeometry(.8, 1.2, TABLE_H - .5, 12), M.wood, 0, (TABLE_H - .5) / 2, 3.2, g);
    box(.9, .6, 1.4, 4.6, TABLE_H + .3, .9, M.black, g); BJ_SEAT_ANGLES.forEach(a => add(new THREE.CylinderGeometry(.8, .8, 2.9, 14), M.leather, -Math.cos(a) * 8.3, 1.45, Math.sin(a) * 8.3, g));
    box(2.2, 7.8, 1.4, 0, 3.9, -2.4, M.panel, g);
    const sg = screen(8, 3, L.x, 11.5, L.z - 3.2); chandelier(L.x, L.z + 2); hit(14, 9, 9, L.x, L.z + 3, { casino: 'table', table: id });
    tables[id] = { L, sg, chips: chipLayer(), cards: cardLayer({ x: L.x + 4.6, z: L.z + .9 }), key: '' };
    tables[id].chips.y = TABLE_H + .07;
  }
  function updateBlackjack(id, t) {
    const T = tables[id], L = T.L, t0 = startedAt('bj:' + id + ':' + t.round), now = performance.now(), n = t.seats.length;
    T.cards.begin(); T.chips.begin(); const rv = bjReveal(id, t, now), shownDealer = t.dealer.filter((c, i) => now >= rv.cardAt(i));
    // Hole card stays face down until the dealer's turn is shown; extra dealer cards land one by one.
    shownDealer.forEach((c, i) => { const order = i === 0 ? n : i === 1 ? 2 * n + 1 : 0; T.cards.place('d' + t.round + ':' + i, i === 1 && rv.cardAt(1) > now ? '??' : c, L.x - (shownDealer.length - 1) * .22 + i * .44, L.z + 1.2, 0, i < 2 ? Math.max(0, order * SYNC.dealCard - (now - t0)) : 0, TABLE_H + .08); });
    t.seats.forEach((s, si) => { const a = BJ_SEAT_ANGLES[si], bx = L.x - Math.cos(a) * 5, bz = L.z + Math.sin(a) * 5, px = L.x - Math.cos(a) * 3.9, pz = L.z + Math.sin(a) * 3.9, paid = rv.settled;
      if (!(paid && s.result && s.result !== 'push' && !s.payout)) T.chips.stack(bx, bz, s.bet, TABLE_H + .07); if (paid && s.payout > s.bet) T.chips.stack(bx + .45, bz - .2, s.payout - s.bet, TABLE_H + .07);
      (s.cards || []).forEach((c, i) => { const order = i === 0 ? si : n + 1 + si; T.cards.place('p' + t.round + ':' + si + ':' + i, c, px + i * .16 - .1, pz - i * .12, -a + Math.PI / 2, i < 2 ? Math.max(0, order * SYNC.dealCard - (now - t0)) : Math.max(0, hitLandsAt(id + ':' + t.round + ':' + si + ':' + i, now) - SYNC.cardFlight - now), TABLE_H + .08 + i * .004); }); });
    T.cards.end(); T.chips.end();
    const k = JSON.stringify([t.phase, t.seats.map(s => [s.name, s.bet, s.cards?.length, s.result]), t.dealer.length, rv.settled]); if (k !== T.key) { T.key = k; const def = TABLES.find(d => d.id === id); sign(T.sg, def.name.toUpperCase(), [money(def.min) + '–' + money(def.max) + ' · 3:2', t.phase === 'betting' ? (t.seats.length ? 'Bets in · dealing soon' : 'Place your bets') : t.phase === 'playing' ? (t.seats[t.turn]?.name || '') + ' to act' : t.phase === 'done' && rv.settled ? (t.log[0] || '') : 'Dealer plays', t.seats.map(s => s.name + ' ' + money(s.bet)).join(' · ')]); }
  }

  // ---- Roulette: 2.7 × 1.2 m table, wheel at the west end, the layout to the east. ----
  const wheelTex = canvasTexture(512, 512); { const g = wheelTex.g; g.translate(256, 256); for (let i = 0; i < 37; i++) { const a0 = i / 37 * Math.PI * 2, a1 = (i + 1) / 37 * Math.PI * 2, n = WHEEL[i]; g.fillStyle = rouletteColor(n) === 'red' ? '#b51624' : rouletteColor(n) === 'green' ? '#0d7a3e' : '#151515'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 250, a0, a1); g.fill(); g.save(); g.rotate((a0 + a1) / 2); g.fillStyle = '#fff'; g.font = 'bold 22px Georgia'; g.textAlign = 'center'; g.fillText(String(n), 222, 8); g.restore(); } g.fillStyle = '#6b3a1c'; g.beginPath(); g.arc(0, 0, 165, 0, 7); g.fill(); g.strokeStyle = '#d8a945'; g.lineWidth = 6; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(i * .785) * 150, Math.sin(i * .785) * 150); g.stroke(); } }
  function buildRoulette(id) {
    const L = LAYOUT[id], g = new THREE.Group(); g.position.set(L.x, 0, L.z); group.add(g);
    box(16.6, TABLE_H - .3, 7.4, 1, (TABLE_H - .3) / 2, 0, M.wood, g); box(17, .3, 7.8, 1, TABLE_H - .15, 0, M.leather, g);
    const layoutTex = canvasTexture(1300, 693), lay = add(new THREE.PlaneGeometry(RL_W, RL_D), new THREE.MeshStandardMaterial({ map: layoutTex.t, roughness: .95 }), 3.3, TABLE_H + .01, 0, g); lay.rotation.x = -Math.PI / 2;
    { const c = layoutTex.g, w = 1300, h = 693, cw = w / 13, rh = h / 4.8; c.fillStyle = '#0f6b3c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#f2e6c4'; c.lineWidth = 2; c.textAlign = 'center'; c.font = 'bold 40px Georgia';
      c.fillStyle = '#0d7a3e'; c.fillRect(0, 0, cw, rh * 3); c.strokeRect(0, 0, cw, rh * 3); c.fillStyle = '#fff'; c.fillText('0', cw / 2, rh * 1.6);
      for (let n = 1; n <= 36; n++) { const [u, v] = rlSpot('straight', n), x = u * w - cw / 2, y = v * h - rh / 2; c.fillStyle = rouletteColor(n) === 'red' ? '#b51624' : '#151515'; c.fillRect(x + 6, y + 6, cw - 12, rh - 12); c.strokeRect(x, y, cw, rh); c.fillStyle = '#fff'; c.fillText(String(n), x + cw / 2, y + rh / 2 + 14); }
      for (let v = 1; v <= 3; v++) { const [u, vv] = rlSpot('column', v); c.strokeRect(u * w - cw / 2, vv * h - rh / 2, cw, rh); c.fillStyle = '#fff'; c.font = 'bold 26px Georgia'; c.fillText('2:1', u * w, vv * h + 9); }
      for (let v = 1; v <= 3; v++) { const [u, vv] = rlSpot('dozen', v); c.strokeRect(u * w - cw * 2, vv * h - rh * .45, cw * 4, rh * .9); c.fillStyle = '#fff'; c.font = 'bold 30px Georgia'; c.fillText(['1st 12', '2nd 12', '3rd 12'][v - 1], u * w, vv * h + 10); }
      [['low', '1–18'], ['even', 'EVEN'], ['red', ''], ['black', ''], ['odd', 'ODD'], ['high', '19–36']].forEach(([k2, label]) => { const [u, vv] = rlSpot(k2), x = u * w; c.strokeRect(x - cw, vv * h - rh * .45, cw * 2, rh * .9); if (k2 === 'red' || k2 === 'black') { c.fillStyle = k2 === 'red' ? '#b51624' : '#151515'; c.beginPath(); c.moveTo(x, vv * h - rh * .35); c.lineTo(x + cw * .7, vv * h); c.lineTo(x, vv * h + rh * .35); c.lineTo(x - cw * .7, vv * h); c.fill(); } else { c.fillStyle = '#fff'; c.font = 'bold 28px Georgia'; c.fillText(label, x, vv * h + 10); } });
      layoutTex.t.needsUpdate = true; }
    add(new THREE.CylinderGeometry(2.7, 2.9, .8, 48), M.wood, -4.4, TABLE_H + .2, 0, g);
    const wheel = add(new THREE.CircleGeometry(2.35, 74), new THREE.MeshStandardMaterial({ map: wheelTex.t, roughness: .45 }), -4.4, TABLE_H + .62, 0, g); wheel.rotation.x = -Math.PI / 2;
    add(new THREE.ConeGeometry(.22, .8, 12), M.gold, -4.4, TABLE_H + 1, 0, g); add(new THREE.TorusGeometry(2.55, .12, 8, 60), M.gold, -4.4, TABLE_H + .62, 0, g).rotation.x = Math.PI / 2;
    const ball = add(new THREE.SphereGeometry(.09, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .2, emissive: 0x333333 }), 0, 0, 0, g);
    const dolly = add(new THREE.CylinderGeometry(.14, .2, .5, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .3, roughness: .3, emissive: 0x444444 }), 0, 0, 0, g); dolly.visible = false;
    box(2.2, 7.8, 1.4, -4.4, 3.9, -5.2, M.panel, g);
    const sg = screen(8, 3, L.x + 2, 11.5, L.z - 4.6); chandelier(L.x + 1, L.z); hit(18, 9, 10, L.x + 1, L.z + 1, { casino: 'table', table: id });
    tables[id] = { L, wheel, ball, dolly, sg, chips: chipLayer(), key: '' };
  }
  const wheelAngleAt = ms => ms / 1000 * .55;
  function updateRoulette(id, t) {
    const T = tables[id], L = T.L, now = performance.now(), wa = wheelAngleAt(now); T.wheel.rotation.z = wa;
    const t0 = t.round ? startedAt('rl:' + id + ':' + t.round) : 0, rolling = t.round && (t.phase === 'spinning' || now - t0 < SYNC.roulette), result = t.result ?? t.history?.[0] ?? null;
    const off = ((result === null ? 0 : WHEEL.indexOf(result)) + .5) / 37 * Math.PI * 2;
    if (rolling) { const left = Math.max(0, (t0 + SYNC.roulette - now) / 1000), a = wheelAngleAt(t0 + SYNC.roulette) + off + 1.15 * left * left + 2.1 * left, rad = left > 1.6 ? 2.15 : 1.78 + (left / 1.6) * .37 + Math.abs(Math.sin(left * 9)) * .05 * (left / 1.6); T.ball.position.set(-4.4 + Math.cos(a) * rad, TABLE_H + .72, -Math.sin(a) * rad); }
    else if (result !== null && t.round) { const a = wa + off; T.ball.position.set(-4.4 + Math.cos(a) * 1.78, TABLE_H + .72, -Math.sin(a) * 1.78); }
    else T.ball.position.set(-4.4 + 2.15, TABLE_H + .72, 0);
    const landed = !rolling && result !== null && t.round > 0;
    // Chips: the live bets; once the ball has landed, the winning bets with their payouts beside them.
    T.chips.begin(); const place = (b, amount, dx = 0) => { const [u, v] = rlSpot(b.kind, b.value); T.chips.stack(L.x - 1.2 + u * RL_W + dx, L.z - RL_D / 2 + v * RL_D, amount); };
    const showLast = landed && t.phase === 'betting' && !t.bets.length && t.lastBets;
    for (const b of (showLast ? t.lastBets.filter(x => x.won) : t.bets)) { place(b, b.amount); if (showLast) place(b, b.amount * ({ straight: 35, dozen: 2, column: 2 }[b.kind] || 1), .3); }
    T.chips.end();
    T.dolly.visible = landed; if (landed) { const [u, v] = rlSpot('straight', result); T.dolly.position.set(-1.2 + u * RL_W, TABLE_H + .27, -RL_D / 2 + v * RL_D); }
    const k = JSON.stringify([t.phase, t.bets.length, landed, result, t.history?.slice(0, 8)]); if (k !== T.key) { T.key = k; const def = TABLES.find(d => d.id === id); sign(T.sg, def.name.toUpperCase(), [money(def.min) + '–' + money(def.max) + ' · single zero', rolling ? 'No more bets!' : landed ? 'Last: ' + result + ' ' + rouletteColor(result).toUpperCase() : 'Place your bets', (t.history || []).slice(0, 10).join(' · ')]); }
  }

  // ---- Texas Hold'em: 2.3 × 1.3 m oval, dealer on the north side, five seats. ----
  function buildPoker(id) {
    const L = LAYOUT[id], g = new THREE.Group(); g.position.set(L.x, 0, L.z); group.add(g);
    add(new THREE.CylinderGeometry(1, 1, .45, 48), M.leather, 0, TABLE_H - .2, 0, g).scale.set(PK_A + .5, 1, PK_B + .5);
    add(new THREE.CylinderGeometry(1, 1, .1, 48), M.blueFelt, 0, TABLE_H + .02, 0, g).scale.set(PK_A - .2, 1, PK_B - .2);
    add(new THREE.CylinderGeometry(1.4, 2, TABLE_H - .5, 16), M.wood, 0, (TABLE_H - .5) / 2, 0, g);
    PK_ANGLES.forEach(a => add(new THREE.CylinderGeometry(.8, .8, 2.9, 14), M.leather, Math.cos(a) * PK_A * 1.45, 1.45, Math.sin(a) * PK_B * 1.75, g));
    box(2.2, 7.8, 1.4, 0, 3.9, -PK_B - 2.2, M.panel, g);
    const button = add(new THREE.CylinderGeometry(.2, .2, .05, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x333333 }), 0, TABLE_H + .1, 0, g);
    const turn = add(new THREE.TorusGeometry(1.1, .06, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffe28a }), 0, .1, 0, g); turn.rotation.x = Math.PI / 2;
    const sg = screen(9, 3.2, L.x, 11.8, L.z - 6.6); chandelier(L.x, L.z); hit(17, 9, 11, L.x, L.z, { casino: 'table', table: id });
    tables[id] = { L, button, turn, sg, chips: chipLayer(800), cards: cardLayer({ x: L.x, z: L.z - PK_B + .8 }), key: '' };
  }
  function updatePoker(id, t) {
    const T = tables[id], L = T.L, me = key(localName()), now = performance.now(), t0 = startedAt('pk:' + id + ':' + t.hand), seated = t.seats.filter(Boolean).length;
    const at = (i, r) => { const a = PK_ANGLES[i]; return [L.x + Math.cos(a) * PK_A * r, L.z + Math.sin(a) * PK_B * r]; };
    T.cards.begin(); T.chips.begin();
    t.seats.forEach((s, i) => { if (!s) return; const [sx, sz] = at(i, .78), [hx, hz] = at(i, .58), [bx, bz] = at(i, .45);
      T.chips.stack(sx, sz, s.stack, TABLE_H + .08, 30); if (s.bet) T.chips.stack(bx, bz, s.bet, TABLE_H + .08, 16);
      (s.cards || []).forEach((c, k) => T.cards.place('h' + t.hand + ':' + i + ':' + k, s.folded ? '??' : s.shown || key(s.name) === me ? c : '??', hx + (k - .5) * .42, hz, -PK_ANGLES[i] + Math.PI / 2, Math.max(0, (k * seated + i) * SYNC.dealCard - (now - t0)), TABLE_H + .08)); });
    t.board.forEach((c, i) => T.cards.place('b' + t.hand + ':' + i, c, L.x - 1.1 + i * .55, L.z, 0, Math.max(0, boardLandsAt(id, t.hand, i, now) - SYNC.cardFlight - now), TABLE_H + .08));
    const pot = t.seats.reduce((a, s) => a + (s ? s.total - s.bet : 0), 0); if (pot > 0 && t.phase !== 'showdown') T.chips.stack(L.x + .2, L.z + .9, pot, TABLE_H + .08, 30);
    T.cards.end(); T.chips.end();
    if (t.button >= 0) { const [bx, bz] = at(t.button, .62); T.button.position.set(bx - L.x + .5, TABLE_H + .1, bz - L.z); }
    T.turn.visible = t.toAct >= 0 && !['waiting', 'showdown'].includes(t.phase); if (T.turn.visible) { const [tx, tz] = at(t.toAct, 1.45); T.turn.position.set(tx - L.x, .1, tz - L.z); }
    const k = JSON.stringify([t.phase, t.hand, t.board, t.seats.map(s => s && [s.name, s.stack, s.lastAction]), t.results?.winners]); if (k !== T.key) { T.key = k; sign(T.sg, "TEXAS HOLD'EM", ['Blinds $10/$20 · 5 seats · buy-in $200–$5,000', t.phase === 'waiting' ? (seated < 2 ? 'Waiting for players' : 'Next hand shortly') : t.phase === 'showdown' ? (t.results?.winners || []).map(w => w.name + ' +' + money(w.amount) + ' ' + w.hand).join(' · ') : t.phase.toUpperCase() + ' · pot ' + money(t.seats.reduce((a, s) => a + (s?.total || 0), 0)), t.seats.filter(Boolean).map(s => s.name + ' ' + money(s.stack)).join(' · ')]); }
  }

  // ---- Slots: three cabinets on the east wall; the reels stop on the host's result. ----
  // Reel strip: six symbols around the circumference (u), drawn turned so they stand upright on the pay line.
  const reelTex = canvasTexture(768, 128); { const g = reelTex.g; g.fillStyle = '#fbf6e8'; g.fillRect(0, 0, 768, 128); SLOT_SYMBOLS.forEach((_, i) => { g.save(); g.translate(i * 128 + 64, 64); g.rotate(-Math.PI / 2); drawSymbol(g, i, 104); g.restore(); g.strokeStyle = '#d8cfb8'; g.lineWidth = 3; g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 128); g.stroke(); }); }
  function buildSlot(id, color) {
    const L = LAYOUT[id], g = new THREE.Group(); g.position.set(L.x, 0, L.z); group.add(g);
    box(3, 11, 4.4, .5, 5.5, 0, new THREE.MeshStandardMaterial({ color, roughness: .4, metalness: .3, emissive: color, emissiveIntensity: .12 }), g);
    box(.2, 3.4, 3.8, -1.05, 7, 0, M.black, g);
    const reels = [-1, 0, 1].map(k => { const r = add(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), new THREE.MeshStandardMaterial({ map: reelTex.t, roughness: .5 }), -.6, 7, k * 1.1, g); r.rotation.x = Math.PI / 2; return r; });
    box(.05, .06, 3.6, -1.62, 7, 0, new THREE.MeshBasicMaterial({ color: 0xff3d3d }), g);   // pay line
    box(.4, .8, 3.6, -1.1, 4.6, 0, M.chrome, g); const beacon = add(new THREE.SphereGeometry(.3, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff3d3d }), .5, 11.4, 0, g);
    const lever = new THREE.Group(); lever.position.set(.5, 7.4, 2.35); g.add(lever); box(.15, 2.2, .15, 0, 1.1, 0, M.chrome, lever); add(new THREE.SphereGeometry(.3, 12, 10), M.velvet, 0, 2.2, 0, lever);
    add(new THREE.CylinderGeometry(.6, .6, 2.6, 12), M.leather, -3.6, 1.3, 0, g);
    const sg = screen(3, 1.4, L.x - 1.2, 10, L.z, -Math.PI / 2, 360); hit(4.4, 11, 4.6, L.x, L.z, { casino: 'table', table: id });
    tables[id] = { L, reels, lever, beacon, sg, key: '' };
  }
  // Reel angle that shows symbol i on the pay line (facing west).
  const symbolAngle = i => Math.PI * 1.5 - (i + .5) / 6 * Math.PI * 2;
  function updateSlot(id, t) {
    const T = tables[id], last = t.last, now = performance.now(), def = TABLES.find(d => d.id === id);
    let done = !last;
    if (last) { const e = now - startedAt('sl:' + id + ':' + last.spin); done = e > SYNC.slots;
      T.reels.forEach((r, k) => { const stop = SYNC.slots * (.55 + k * .2), target = symbolAngle(last.reels[k]); r.rotation.y = e < stop ? target - (stop - e) / 1000 * 16 : target; });
      T.lever.rotation.z = e < 400 ? -Math.sin(e / 400 * Math.PI) * .9 : 0; T.beacon.material.color.setHex(done && last.pay ? (Math.floor(now / 200) % 2 ? 0xffe28a : 0xff3d3d) : 0xff3d3d); }
    const k = JSON.stringify([last?.spin, done]); if (k !== T.key) { T.key = k; sign(T.sg, def.name.replace('Slot · ', '').toUpperCase(), [money(def.min) + '–' + money(def.max) + ' a spin', !last ? '7 · 7 · 7 pays 250×' : done ? (last.pay ? last.name + ' WON ' + money(last.pay) : last.name + ' · no win') : 'Spinning…']); }
  }

  // ---- Lotto draw machine: a glass drum of 36 numbered balls mixed by air; each drawn ball is blown up
  //      the exit tube and rolls into the display rack. ----
  const LT = LAYOUT.lotto, DRUM = new THREE.Vector3(LT.x - 1.5, 8, LT.z), DR = 3;
  box(4, 3.4, 4, DRUM.x, 1.7, DRUM.z, M.chrome); add(new THREE.CylinderGeometry(.5, .8, 2.2, 16), M.chrome, DRUM.x, 4.5, DRUM.z);
  add(new THREE.SphereGeometry(DR, 36, 26), M.glass, DRUM.x, DRUM.y, DRUM.z); add(new THREE.TorusGeometry(DR + .02, .1, 8, 48), M.gold, DRUM.x, DRUM.y, DRUM.z);
  const ring2 = add(new THREE.TorusGeometry(DR + .02, .08, 8, 48), M.gold, DRUM.x, DRUM.y, DRUM.z); ring2.rotation.y = Math.PI / 2;
  const tubeCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(DRUM.x, DRUM.y + DR - .3, DRUM.z), new THREE.Vector3(DRUM.x, DRUM.y + DR + 1.6, DRUM.z), new THREE.Vector3(DRUM.x + 1.2, DRUM.y + DR + 2.4, DRUM.z), new THREE.Vector3(DRUM.x + 3.6, DRUM.y + DR + 1.8, DRUM.z), new THREE.Vector3(DRUM.x + 4.6, DRUM.y + 1, DRUM.z - 1.2), new THREE.Vector3(DRUM.x + 4.6, 6.1, DRUM.z - 2.4)], false, 'centripetal');
  add(new THREE.TubeGeometry(tubeCurve, 60, .42, 12, false), M.glass, 0, 0, 0);
  const RACK = i => new THREE.Vector3(DRUM.x + 4.6, 5.55, DRUM.z - 2.4 + i * .95);
  box(1.1, .2, 5.4, DRUM.x + 4.6, 5.05, DRUM.z - .5, M.gold); box(.9, .9, 5.4, DRUM.x + 4.6, 5.55, DRUM.z - .5, M.glass); box(1.4, 5, 6, DRUM.x + 4.6, 2.5, DRUM.z - .5, M.wood);
  const lotto = []; for (let n = 1; n <= LOTTO.numbers; n++) { const m = add(new THREE.SphereGeometry(.34, 16, 12), ballMaterial(n), DRUM.x, DRUM.y - 2, DRUM.z); m.rotation.set(Math.random() * 6, Math.random() * 6, 0); lotto.push({ n, m, p: new THREE.Vector3((Math.random() - .5) * 3, -2 + Math.random(), (Math.random() - .5) * 3), v: new THREE.Vector3() }); }
  const ltSign = screen(8, 3, LT.x, 14.5, LT.z - 3.2); hit(10, 13, 8, LT.x + .5, LT.z - .5, { casino: 'table', table: 'lotto' }); let ltKey = '';
  function updateLotto(lt, dt) {
    const now = performance.now(), plan = lottoPlan(lt, now), last = plan.shown?.x, e = plan.shown ? plan.shown.e : 1e9, drawing = e < SYNC.lottoBall * (LOTTO.picks + .5), queued = plan.items.filter(i => i.e < 0).length;
    const order = last ? last.balls : [], energy = drawing ? 26 : .6;
    for (const b of lotto) {
      const idx = order.indexOf(b.n), at = (idx + 1) * SYNC.lottoBall, travel = 700;
      if (idx >= 0 && e >= at - travel) {                              // this ball is being drawn / sits in the rack
        const u = Math.min(1, (e - (at - travel)) / travel); b.m.position.copy(u < 1 ? tubeCurve.getPointAt(u) : RACK(idx)); b.m.rotation.x += dt * (u < 1 ? 12 : 0); continue;
      }
      b.v.x += (Math.random() - .5) * energy * dt * 6; b.v.z += (Math.random() - .5) * energy * dt * 6; b.v.y += (drawing ? (Math.random() * 1.2 - .25) * energy : 0) * dt * 6 - 18 * dt;
      b.p.addScaledVector(b.v, dt); if (b.p.length() > DR - .4) { b.p.setLength(DR - .4); b.v.reflect(b.p.clone().normalize()).multiplyScalar(drawing ? .9 : .35); }
      b.m.position.copy(DRUM).add(b.p); b.m.rotation.y += b.v.length() * dt;
    }
    const done = !drawing, lk = lt.jackpot + ':' + lt.tickets + ':' + done + ':' + last?.ticket + ':' + queued; if (lk !== ltKey) { ltKey = lk; sign(ltSign, 'LOTTO · JACKPOT ' + money(lt.jackpot), [queued ? queued + ' ticket' + (queued > 1 ? 's' : '') + ' waiting · drawn in order' : '$20 a ticket · pick 5 of 36 · draws on demand', last ? last.name + ': ' + (done ? last.balls.join(' · ') : 'drawing…') : 'Match all 5 for the jackpot', last && done ? (last.prize ? 'WON ' + money(last.prize) : last.hits + ' matched') : '2 → $20 · 3 → $150 · 4 → $2,500']); }
  }

  // ---- Cashier, rich list, bar, plants ----
  const CA = LAYOUT.wallet; box(13, 4.6, 2.6, CA.x, 2.3, CA.z, M.wood); box(13.4, .3, 3, CA.x, 4.75, CA.z, M.gold); box(13, 9, .3, CA.x, 9.5, CA.z + 3.5, M.panel);
  for (let i = 0; i < 3; i++) box(.15, 4, .15, CA.x - 4 + i * 4, 7, CA.z - 1.1, M.gold);
  const cashSign = screen(9, 3, CA.x, 11, CA.z + 3.2); hit(14, 6, 3.6, CA.x, CA.z, { casino: 'wallet' });
  const rich = screen(16, 7.5, minX + .4, 11, cz - 10, Math.PI / 2, 800); let richKey = '';
  box(50, 4.4, 2.6, 5, 2.2, maxZ - 7, M.wood); box(50.4, .3, 3, 5, 4.55, maxZ - 7, M.gold); box(50, 12, .4, 5, 9, maxZ - .6, M.panel);
  for (let r = 0; r < 3; r++) { box(46, .2, 1.2, 5, 7 + r * 3, maxZ - 1.2, M.gold); for (let i = 0; i < 22; i++) add(new THREE.CylinderGeometry(.18, .22, 1.4, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((i * 37 % 100) / 100, .6, .45), roughness: .2, transparent: true, opacity: .85 }), -16 + i * 2, 7.8 + r * 3, maxZ - 1.2); }
  for (let i = 0; i < 9; i++) { add(new THREE.CylinderGeometry(.9, .9, .3, 16), M.velvet, -15 + i * 5, 4.6, maxZ - 10.5); add(new THREE.CylinderGeometry(.12, .12, 4.4, 8), M.chrome, -15 + i * 5, 2.2, maxZ - 10.5); }
  sign(screen(12, 2.6, 5, 15.5, maxZ - .9, Math.PI, 600), 'THE PAYDAY BAR', ['Drinks on the house · play responsibly', 'Play money only']);
  for (const [x, z] of [[minX + 3, minZ + 3], [maxX - 3, minZ + 3], [minX + 3, maxZ - 3], [maxX - 3, maxZ - 14]]) { add(new THREE.CylinderGeometry(1, .8, 2.4, 12), M.gold, x, 1.2, z); add(new THREE.SphereGeometry(1.8, 12, 10), new THREE.MeshStandardMaterial({ color: 0x1f6b35, roughness: .8 }), x, 3.6, z); }

  const ST = LAYOUT.stage, stage = createStage(group, ST, { hit }), stageSign = screen(10, 3, ST.x, 21, ST.z - 9.6); chandelier(ST.x - 14, ST.z); chandelier(ST.x + 14, ST.z);
  buildBlackjack('bj-1', '#0f6b3c'); buildBlackjack('bj-2', '#13304f'); buildRoulette('rl-1'); buildRoulette('rl-2'); buildPoker('pk-1');
  buildSlot('sl-1', 0xb51624); buildSlot('sl-2', 0x1d4ed8); buildSlot('sl-3', 0x7c3aed); chandelier(LT.x, LT.z); chandelier(CA.x, CA.z + 2);

  let open = false;
  function update(game, dt, isOpen, near = true) {
    open = isOpen; doors.forEach((d, i) => { const target = (d0 + d1) / 2 + (i ? 1 : -1) * ((d1 - d0) / 4 + (open ? (d1 - d0) / 2 - .3 : 0)); d.position.x += (target - d.position.x) * Math.min(1, dt * 4); });
    const nk = open ? 'open' : 'closed'; if (neon.key !== nk) { neon.key = nk; const g = neon.g; g.clearRect(0, 0, 640, 170); g.shadowColor = open ? '#ff3d8b' : '#555'; g.shadowBlur = 26; g.fillStyle = open ? '#ff7ab0' : '#7a7a7a'; g.font = 'bold 104px Georgia'; g.textAlign = 'center'; g.fillText('CASINO', 320, 108); g.shadowBlur = 0; g.font = '28px system-ui'; g.fillStyle = open ? '#ffe28a' : '#aaa'; g.fillText(open ? 'OPEN · PAYDAY' : 'PAYDAY MODE ONLY', 320, 154); neon.t.needsUpdate = true; }
    // The room is skipped (not drawn, not animated) while nobody can see into it.
    for (const c of group.children) if (c !== neonMesh && !doors.includes(c)) c.visible = near; if (!near) return;
    const c = game?.casino?.tables; if (!game?.payday || !c) { stage.update(null, performance.now()); for (const T of Object.values(tables)) if (T.wheel) T.wheel.rotation.z = wheelAngleAt(performance.now()); return; }
    for (const def of TABLES) { const t = c[def.id]; if (!t) continue; if (def.game === 'blackjack') updateBlackjack(def.id, t); else if (def.game === 'roulette') updateRoulette(def.id, t); else if (def.game === 'poker') updatePoker(def.id, t); else if (def.game === 'slots') updateSlot(def.id, t); else if (def.game === 'lotto') updateLotto(t, dt); else if (def.game === 'stage') stage.update(t, performance.now(), lines => sign(stageSign, 'CENTER STAGE', lines, '#ff7ab0')); }
    const list = Object.values(game.wallets || {}).sort((x, y) => y.cash - x.cash), rk = JSON.stringify([list.map(w => [w.name, w.cash]), (game.loans || []).filter(l => l.owed > 0).length]); if (rk !== richKey) { richKey = rk; sign(rich, 'PAYDAY RICH LIST', list.slice(0, 4).map((w, i) => (i + 1) + '. ' + w.name + '   ' + money(w.cash)), '#ff7ab0'); sign(cashSign, 'CASHIER', ['Wallets · loans · salaries', list.length + ' engineers · ' + (game.loans || []).filter(l => l.owed > 0).length + ' open loans']); }
  }
  // Walkable: the doorway (only when open) and the room, minus furniture.
  function clear(x, z) {
    if (z < ROOM.maxZ + 1.2) return open && x > d0 + .4 && x < d1 - .4;
    if (!open || x < minX + 1 || x > maxX - 1 || z > maxZ - 1) return false;
    for (const id of ['bj-1', 'bj-2']) { const L = LAYOUT[id]; if (Math.abs(x - L.x) < 7.2 && z > L.z - 3.4 && z < L.z + 1.2) return false; if (z >= L.z && Math.hypot(x - L.x, z - L.z) < 7.2) return false; }
    for (const id of ['rl-1', 'rl-2']) { const L = LAYOUT[id]; if (Math.abs(x - L.x - 1) < 9 && Math.abs(z - L.z) < 4.4 || Math.abs(x - L.x + 4.4) < 1.6 && Math.abs(z - L.z + 5.2) < 1.2) return false; }
    { const L = LAYOUT['pk-1']; if (((x - L.x) / (PK_A + 1)) ** 2 + ((z - L.z) / (PK_B + 1)) ** 2 < 1 || Math.abs(x - L.x) < 1.6 && Math.abs(z - L.z + PK_B + 2.2) < 1.2) return false; }
    for (const id of ['sl-1', 'sl-2', 'sl-3']) { const L = LAYOUT[id]; if (Math.abs(x - L.x - .5) < 2 && Math.abs(z - L.z) < 2.6) return false; }
    if (Math.hypot(x - DRUM.x, z - DRUM.z) < 3.4 || Math.abs(x - DRUM.x - 4.6) < 1.2 && Math.abs(z - DRUM.z + .5) < 3.4) return false;
    if (Math.abs(x - CA.x) < 7 && Math.abs(z - CA.z) < 1.8) return false;
    if (Math.hypot(x - ST.x, z - ST.z) < 9.2) return false;
    if (z > maxZ - 9) return false;
    for (const [px, pz] of columnSpots) if (Math.hypot(x - px, z - pz) < 1.5) return false;
    return true;
  }
  // What the 3D tables show right now (for tests): landed card faces, the symbol on each reel's pay line
  // (-1 while turning), the lotto balls sitting in the rack.
  function probe() {
    const out = {}, TAU = Math.PI * 2, sym = r => { for (let i = 0; i < 6; i++) { const d = ((r.rotation.y - symbolAngle(i)) % TAU + TAU) % TAU; if (d < .02 || d > TAU - .02) return i; } return -1; };
    for (const [id, T] of Object.entries(tables)) out[id] = T.cards ? { cards: T.cards.landed() } : T.reels ? { reels: T.reels.map(sym) } : {};
    out.lotto = { rack: lotto.filter(b => [0, 1, 2, 3, 4].some(i => b.m.position.distanceTo(RACK(i)) < .01)).sort((a, b) => a.m.position.z - b.m.position.z).map(b => b.n) };
    return out;
  }
  return { group, update, clear, seatPose, probe, get open() { return open; } };
}
