// Payday casino room, north of the server hall through the doorway at x 1–9. Built once; the doors stay
// shut (and the room can't be entered) outside Payday mode. The table felts, the roulette wheel, the
// lotto drum and the screens all draw the host's shared casino state, so every engineer sees the same
// cards, ball and jackpot.
import * as THREE from './three.module.js';
import { CASINO, ROOM } from './facility-layout.js';
import { WHEEL, rouletteColor, handValue } from './casino-logic.js';

const BJ = { x: -6, z: 74 }, RL = { x: 16, z: 74 }, LT = { x: 5, z: 89 }, CASH = { x: -15, z: 61 };
export const CASINO_SPOTS = { blackjack: BJ, roulette: RL, lotto: LT, wallet: CASH };

// Headless test harnesses have no 2D canvas: drawing then goes to a no-op context.
const noCanvas = new Proxy({}, { get: () => () => {}, set: () => true });
function canvasTexture(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; const ctx = c.getContext?.('2d'); return { c, g: typeof ctx?.beginPath === 'function' ? ctx : noCanvas, t }; }
const money = n => '$' + Math.round(n || 0).toLocaleString('en-US');
function card(g, x, y, w, text, faceDown) {
  const h = w * 1.4; g.save(); g.fillStyle = faceDown ? '#8c1c2c' : '#fbfaf5'; g.strokeStyle = '#222'; g.lineWidth = 2; g.beginPath(); g.roundRect(x, y, w, h, 6); g.fill(); g.stroke();
  if (faceDown) { g.strokeStyle = '#e8c35a'; g.lineWidth = 3; g.strokeRect(x + 6, y + 6, w - 12, h - 12); }
  else { const red = /[♥♦]/.test(text); g.fillStyle = red ? '#c4142b' : '#111'; g.font = `bold ${w * .34}px Georgia, serif`; g.fillText(text.slice(0, -1), x + 6, y + w * .36); g.font = `${w * .55}px Georgia, serif`; g.fillText(text.slice(-1), x + w * .26, y + h * .7); }
  g.restore();
}

export function createCasinoScene(scene, { pickables = [] } = {}) {
  const group = new THREE.Group(); group.name = 'casino'; scene.add(group);
  const W = CASINO.maxX - CASINO.minX, D = CASINO.maxZ - CASINO.minZ, cx = (CASINO.minX + CASINO.maxX) / 2, cz = (CASINO.minZ + CASINO.maxZ) / 2, H = 14;
  const box = (w, h, d, x, y, z, mat, parent = group) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  // Carpet: deep red with a gold lattice.
  const carpet = canvasTexture(256, 256); { const g = carpet.g; g.fillStyle = '#5b0f1d'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#c99a3c'; g.lineWidth = 3; for (let i = -256; i < 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke(); g.beginPath(); g.moveTo(i + 256, 0); g.lineTo(i, 256); g.stroke(); } g.fillStyle = '#e2bc5c'; for (let x = 0; x <= 256; x += 64) for (let y = 0; y <= 256; y += 64) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); } carpet.t.wrapS = carpet.t.wrapT = THREE.RepeatWrapping; carpet.t.repeat.set(W / 8, D / 8); }
  const mats = {
    carpet: new THREE.MeshStandardMaterial({ map: carpet.t, roughness: .95 }), wall: new THREE.MeshStandardMaterial({ color: 0x3b1222, roughness: .8 }), gold: new THREE.MeshStandardMaterial({ color: 0xd8a945, metalness: .6, roughness: .3, emissive: 0x3a2808 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0x170a10, roughness: .9 }), felt: new THREE.MeshStandardMaterial({ color: 0x0f6b3c, roughness: .9 }), leather: new THREE.MeshStandardMaterial({ color: 0x2a1610, roughness: .6 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a2d16, roughness: .6 }), chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e7, metalness: .6, roughness: .2, emissive: 0x222428 }), glass: new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: .22, roughness: .05, depthWrite: false }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xffe2a0 })
  };
  box(W, .2, D, cx, -.08, cz, mats.carpet); box(W, .3, D, cx, H, cz, mats.ceiling);
  box(.3, H, D, CASINO.minX, H / 2, cz, mats.wall); box(.3, H, D, CASINO.maxX, H / 2, cz, mats.wall); box(W, H, .3, cx, H / 2, CASINO.maxZ, mats.wall);
  const [d0, d1] = CASINO.doorX; box(d0 - CASINO.minX, H, .3, (CASINO.minX + d0) / 2, H / 2, CASINO.minZ - .2, mats.wall); box(CASINO.maxX - d1, H, .3, (d1 + CASINO.maxX) / 2, H / 2, CASINO.minZ - .2, mats.wall);
  for (const [w, x, z, ry] of [[W, cx, CASINO.maxZ - .2, 0], [D, CASINO.minX + .2, cz, Math.PI / 2], [D, CASINO.maxX - .2, cz, Math.PI / 2]]) { const t = box(w, .25, .1, x, 3.2, z, mats.gold); t.rotation.y = ry; const t2 = box(w, .18, .1, x, H - .6, z, mats.gold); t2.rotation.y = ry; }
  // Chandeliers and warm light.
  for (const [x, z] of [[BJ.x, BJ.z], [RL.x, RL.z], [LT.x, LT.z - 2]]) { const c = new THREE.Mesh(new THREE.TorusGeometry(1.6, .12, 8, 24), mats.gold); c.rotation.x = Math.PI / 2; c.position.set(x, H - 2.4, z); group.add(c); for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8), mats.lamp); b.position.set(x + Math.cos(i / 8 * 7) * 1.6, H - 2.7, z + Math.sin(i / 8 * 7) * 1.6); group.add(b); } box(.06, 2.2, .06, x, H - 1.3, z, mats.gold); }
  const light = new THREE.PointLight(0xffd59a, 2.2, 70, 1.2); light.position.set(cx, H - 3, cz); group.add(light);
  // Doorway: gold frame, neon sign over the hall side, glass doors that slide open in Payday mode.
  box(.5, 10, .6, d0, 5, ROOM.maxZ + .5, mats.gold); box(.5, 10, .6, d1, 5, ROOM.maxZ + .5, mats.gold); box(d1 - d0 + .5, .5, .6, (d0 + d1) / 2, 10, ROOM.maxZ + .5, mats.gold);
  const neon = canvasTexture(512, 160), neonMesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.5), new THREE.MeshBasicMaterial({ map: neon.t, transparent: true })); neonMesh.position.set((d0 + d1) / 2, 12.2, ROOM.maxZ + .2); neonMesh.rotation.y = Math.PI; group.add(neonMesh);
  const doors = [-1, 1].map(s => { const m = new THREE.Mesh(new THREE.BoxGeometry((d1 - d0) / 2, 9.6, .12), mats.glass); m.position.set((d0 + d1) / 2 + s * (d1 - d0) / 4, 4.8, ROOM.maxZ + .5); group.add(m); return m; });
  // Screens (canvas) helper.
  const screens = [];
  function screen(w, h, x, y, z, ry = Math.PI, px = 512) { const s = canvasTexture(px, Math.round(px * h / w)), m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: s.t })); m.position.set(x, y, z); m.rotation.y = ry; group.add(m); const frame = box(w + .3, h + .3, .1, x - Math.sin(ry) * .07, y, z - Math.cos(ry) * .07, mats.gold); frame.rotation.y = ry; screens.push(s); return s; }
  const hit = (w, h, d, x, z, kind) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false })); m.position.set(x, h / 2, z); m.userData = { casino: kind }; group.add(m); pickables.push(m); return m; };

  // ---- Blackjack: half-round felt (flat edge = dealer, north), the felt itself shows the hands. ----
  const bj = new THREE.Group(); bj.position.set(BJ.x, 0, BJ.z); group.add(bj);
  { const top = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, .5, 40, 1, false, -Math.PI / 2, Math.PI), mats.leather); top.position.y = 3; bj.add(top); box(7.6, 3, 1.6, 0, 1.5, -.6, mats.wood, bj); box(.6, 3, 3.2, 0, 1.5, 1.2, mats.wood, bj); }
  const bjFelt = canvasTexture(1024, 512), feltGeo = new THREE.CircleGeometry(3.85, 40, Math.PI, Math.PI); { const P = feltGeo.attributes.position, UV = feltGeo.attributes.uv; for (let i = 0; i < P.count; i++) UV.setXY(i, (P.getX(i) / 3.85 + 1) / 2, 1 + P.getY(i) / 3.85); }
  const feltMesh = new THREE.Mesh(feltGeo, new THREE.MeshStandardMaterial({ map: bjFelt.t, roughness: .9 }));
  feltMesh.rotation.x = -Math.PI / 2; feltMesh.position.y = 3.27; bj.add(feltMesh); box(.4, 6, .4, 0, 3, -4.3, mats.leather, bj);
  const bjSign = screen(6, 2.4, BJ.x, 8.6, BJ.z - 3.6); hit(9, 4, 6, BJ.x, BJ.z + .5, 'blackjack');
  // ---- Roulette: table with betting layout + a spinning wheel and ball. ----
  const rl = new THREE.Group(); rl.position.set(RL.x, 0, RL.z); group.add(rl);
  box(10, 3, 4.6, 0, 1.5, 0, mats.wood, rl); const rlFelt = canvasTexture(1024, 470), layout = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 3.9), new THREE.MeshStandardMaterial({ map: rlFelt.t, roughness: .9 })); layout.rotation.x = -Math.PI / 2; layout.position.set(1.4, 3.02, 0); rl.add(layout);
  const wheelTex = canvasTexture(512, 512); { const g = wheelTex.g; g.translate(256, 256); for (let i = 0; i < 37; i++) { const a0 = i / 37 * Math.PI * 2, a1 = (i + 1) / 37 * Math.PI * 2, n = WHEEL[i]; g.fillStyle = rouletteColor(n) === 'red' ? '#b51624' : rouletteColor(n) === 'green' ? '#0d7a3e' : '#151515'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 250, a0, a1); g.fill(); g.save(); g.rotate((a0 + a1) / 2); g.fillStyle = '#fff'; g.font = 'bold 22px Georgia'; g.textAlign = 'center'; g.fillText(String(n), 220, 8); g.restore(); } g.fillStyle = '#6b3a1c'; g.beginPath(); g.arc(0, 0, 150, 0, 7); g.fill(); g.fillStyle = '#d8a945'; g.beginPath(); g.arc(0, 0, 40, 0, 7); g.fill(); }
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.1, .5, 48), mats.wood); bowl.position.set(-3.1, 3.1, 0); rl.add(bowl);
  const wheel = new THREE.Mesh(new THREE.CircleGeometry(1.75, 64), new THREE.MeshStandardMaterial({ map: wheelTex.t, roughness: .5 })); wheel.rotation.x = -Math.PI / 2; wheel.position.set(-3.1, 3.37, 0); rl.add(wheel);
  const spindle = new THREE.Mesh(new THREE.ConeGeometry(.18, .6, 12), mats.gold); spindle.position.set(-3.1, 3.65, 0); rl.add(spindle);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .2 })); rl.add(ball);
  const rlSign = screen(6, 2.4, RL.x, 8.6, RL.z - 3.4); hit(10.4, 4, 5.2, RL.x, RL.z, 'roulette');
  // ---- Lotto drum: glass sphere of 36 tumbling balls on a chrome stand, draw tray in front. ----
  box(2.6, 2.4, 2.6, LT.x, 1.2, LT.z, mats.chrome); box(.4, 1.4, .4, LT.x, 3, LT.z, mats.chrome);
  const drum = new THREE.Mesh(new THREE.SphereGeometry(2.3, 32, 24), mats.glass); drum.position.set(LT.x, 6, LT.z); group.add(drum);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.32, .08, 8, 48), mats.gold); ring.position.copy(drum.position); group.add(ring);
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(.22, 12, 10), new THREE.MeshStandardMaterial({ roughness: .3 }), 36), ballState = [];
  for (let i = 0; i < 36; i++) { const c = new THREE.Color().setHSL(i / 36, .75, .55); balls.setColorAt(i, c); ballState.push({ p: new THREE.Vector3((Math.random() - .5) * 2, (Math.random() - .5) * 2, (Math.random() - .5) * 2), v: new THREE.Vector3() }); }
  group.add(balls); const dummy = new THREE.Object3D(); box(4.2, .3, 1, LT.x, 2.6, LT.z + 2, mats.gold);
  const tray = [0, 1, 2, 3, 4].map(i => { const t = canvasTexture(128, 64), m = new THREE.Mesh(new THREE.SphereGeometry(.34, 16, 12), new THREE.MeshStandardMaterial({ map: t.t, roughness: .3 })); m.position.set(LT.x - 1.6 + i * .8, 3.1, LT.z + 2); m.rotation.y = -Math.PI / 2; m.visible = false; group.add(m); return { m, t }; });
  const ltSign = screen(6, 2.4, LT.x, 10, LT.z - 2.6); hit(5.4, 9, 5.4, LT.x, LT.z + .6, 'lotto');
  // ---- Cashier / wallets kiosk and the rich list. ----
  box(4, 3.6, 2, CASH.x, 1.8, CASH.z, mats.wood); box(4.2, .2, 2.2, CASH.x, 3.7, CASH.z, mats.gold);
  const cashSign = screen(4.4, 2.6, CASH.x, 6.2, CASH.z - .4); hit(4.4, 4, 2.6, CASH.x, CASH.z, 'wallet');
  const rich = screen(10, 5, cx + 12, 8, CASINO.maxZ - .4);
  group.traverse(o => { if (o.isMesh && !pickables.includes(o)) o.matrixAutoUpdate = true; });

  // ---- Drawing ----
  const keys = { felt: '', rl: '', lt: '', cash: '', rich: '', neon: '' };
  function sign(s, title, lines, accent = '#e2bc5c') { const g = s.g, w = s.c.width, h = s.c.height; g.fillStyle = '#12060b'; g.fillRect(0, 0, w, h); g.fillStyle = accent; g.font = `bold ${h * .2}px Georgia, serif`; g.textAlign = 'center'; g.fillText(title, w / 2, h * .25); g.fillStyle = '#f5ead3'; g.font = `${h * .12}px system-ui, sans-serif`; lines.slice(0, 4).forEach((l, i) => g.fillText(l, w / 2, h * (.45 + i * .16))); g.textAlign = 'left'; s.t.needsUpdate = true; }
  function drawFelt(t) {
    const g = bjFelt.g, w = 1024, h = 512; g.fillStyle = '#0f6b3c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e2bc5c'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, 0, 430, 0, Math.PI); g.stroke(); g.fillStyle = '#e2bc5c'; g.font = 'bold 26px Georgia'; g.textAlign = 'center'; g.fillText('BLACKJACK PAYS 3 TO 2', w / 2, 230); g.font = '20px Georgia'; g.fillText('Dealer stands on all 17s', w / 2, 260);
    const hidden = t.phase === 'playing'; t.dealer.forEach((c, i) => card(g, w / 2 - t.dealer.length * 36 + i * 72, 30, 64, c, hidden && i === 1));
    if (t.dealer.length && !hidden) { g.fillStyle = '#fff'; g.font = 'bold 26px system-ui'; g.fillText(String(handValue(t.dealer)), w / 2, 150); }
    t.seats.forEach((s, i) => { const a = Math.PI * (.15 + i * .175), x = w / 2 - Math.cos(a) * 360, y = Math.sin(a) * 360; g.fillStyle = t.turn === i && t.phase === 'playing' ? '#ffe28a' : '#ffffffaa'; g.font = 'bold 20px system-ui'; g.fillText(s.name.slice(0, 12) + ' · ' + money(s.bet), x, y - 64); (s.cards || []).forEach((c, k) => card(g, x - 40 + k * 22, y - 50, 46, c)); if (s.cards?.length) { g.fillStyle = '#fff'; g.fillText(String(handValue(s.cards)) + (s.result ? ' · ' + s.result.toUpperCase() : ''), x, y + 34); } });
    g.textAlign = 'left'; bjFelt.t.needsUpdate = true;
  }
  function drawLayout(r) {
    const g = rlFelt.g, w = 1024, h = 470, cw = w / 13, ch = 100; g.fillStyle = '#0f6b3c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f2e6c4'; g.lineWidth = 2; g.font = 'bold 30px Georgia'; g.textAlign = 'center';
    g.fillStyle = '#0d7a3e'; g.fillRect(0, 0, cw, ch * 3); g.strokeRect(0, 0, cw, ch * 3); g.fillStyle = '#fff'; g.fillText('0', cw / 2, ch * 1.6);
    for (let n = 1; n <= 36; n++) { const col = Math.ceil(n / 3), row = 3 - ((n - 1) % 3) - 1, x = col * cw, y = row * ch; g.fillStyle = rouletteColor(n) === 'red' ? '#b51624' : '#151515'; g.fillRect(x + 4, y + 4, cw - 8, ch - 8); g.strokeRect(x, y, cw, ch); g.fillStyle = '#fff'; g.fillText(String(n), x + cw / 2, y + ch / 2 + 10); }
    ['1st 12', '2nd 12', '3rd 12'].forEach((t, i) => { g.strokeRect(cw + i * 4 * cw, ch * 3, cw * 4, 80); g.fillStyle = '#fff'; g.fillText(t, cw + i * 4 * cw + cw * 2, ch * 3 + 50); });
    if (r.phase === 'betting' && r.result !== null && r.history?.length) { g.fillStyle = '#ffe28a'; g.font = 'bold 26px system-ui'; g.fillText('Last: ' + r.history[0], w - 120, h - 20); }
    for (const b of r.bets) { let x, y; if (b.kind === 'straight') { if (b.value === 0) { x = cw / 2; y = ch * 1.5; } else { x = Math.ceil(b.value / 3) * cw + cw / 2; y = (3 - ((b.value - 1) % 3) - 1) * ch + ch / 2; } } else { x = 200 + Object.keys({ red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1, dozen: 1, column: 1 }).indexOf(b.kind) * 90; y = h - 30; } g.fillStyle = '#e2bc5c'; g.beginPath(); g.arc(x + 18, y - 18, 16, 0, 7); g.fill(); g.fillStyle = '#3b1222'; g.font = 'bold 14px system-ui'; g.fillText(String(b.amount >= 1000 ? Math.round(b.amount / 1000) + 'k' : b.amount), x + 18, y - 13); }
    g.textAlign = 'left'; rlFelt.t.needsUpdate = true;
  }
  let open = false, wheelAngle = 0, wheelSpeed = .25, ballAngle = 0, lastRound = -1, spinStart = 0, lottoKick = 0, lastTicket = 0;
  function update(game, dt, isOpen) {
    open = isOpen; doors.forEach((d, i) => { const target = (CASINO.doorX[0] + CASINO.doorX[1]) / 2 + (i ? 1 : -1) * ((CASINO.doorX[1] - CASINO.doorX[0]) / 4 + (open ? 3.7 : 0)); d.position.x += (target - d.position.x) * Math.min(1, dt * 4); });
    const neonKey = open ? 'open' : 'closed'; if (neonKey !== keys.neon) { keys.neon = neonKey; const g = neon.g; g.clearRect(0, 0, 512, 160); g.shadowColor = open ? '#ff3d8b' : '#555'; g.shadowBlur = 24; g.fillStyle = open ? '#ff7ab0' : '#7a7a7a'; g.font = 'bold 92px Georgia'; g.textAlign = 'center'; g.fillText('CASINO', 256, 100); g.shadowBlur = 0; g.font = '26px system-ui'; g.fillStyle = open ? '#ffe28a' : '#aaa'; g.fillText(open ? 'OPEN · PAYDAY' : 'PAYDAY MODE ONLY', 256, 145); neon.t.needsUpdate = true; }
    group.visible = true; if (!open && !game?.payday) { wheelAngle += dt * .1; wheel.rotation.z = wheelAngle; return; }
    const c = game?.casino; if (!c) return;
    const feltKey = JSON.stringify([c.blackjack.phase, c.blackjack.dealer, c.blackjack.seats, c.blackjack.turn]); if (feltKey !== keys.felt) { keys.felt = feltKey; drawFelt(c.blackjack); const t = c.blackjack; sign(bjSign, 'BLACKJACK', [t.phase === 'betting' ? (t.seats.length ? 'Betting · dealing soon' : 'Place your bets · $10–$5,000') : t.phase === 'playing' ? (t.seats[t.turn]?.name || '') + ' to act' : t.phase === 'done' ? (t.log[0] || '') : 'Dealer plays', ...t.seats.map(s => s.name + ' ' + money(s.bet))]); }
    const r = c.roulette, rlKey = JSON.stringify([r.phase, r.bets, r.history?.[0], r.round]); if (rlKey !== keys.rl) { keys.rl = rlKey; drawLayout(r); sign(rlSign, 'ROULETTE', [r.phase === 'spinning' ? 'No more bets!' : r.bets.length ? r.bets.length + ' bets on the table · press Spin' : 'Place your bets', 'Last numbers: ' + (r.history || []).slice(0, 8).join(' · ')]); }
    // Wheel and ball: spin while the host's ball is rolling, then settle on the result pocket.
    if (r.phase === 'spinning') { if (lastRound !== r.round) { lastRound = r.round; spinStart = Date.now(); } const left = Math.max(0, r.landsAt - Date.now()), total = Math.max(1, r.landsAt - spinStart), k = left / total; wheelSpeed = 1.2 * k + .25; ballAngle -= dt * (9 * k + 1.4); }
    else wheelSpeed += (.25 - wheelSpeed) * Math.min(1, dt);
    wheelAngle += dt * wheelSpeed; wheel.rotation.z = wheelAngle;
    const pocket = r.result !== null && r.result !== undefined ? WHEEL.indexOf(r.result) : 0, pocketAngle = -wheelAngle + (pocket + .5) / 37 * Math.PI * 2;
    const settled = r.phase !== 'spinning' && r.result !== null && r.history?.length, a = settled ? pocketAngle : ballAngle, rad = settled ? 1.55 : 1.85 - Math.min(.3, Math.max(0, (r.landsAt - Date.now()) / 20000));
    ball.position.set(-3.1 + Math.cos(a) * rad, 3.47, -Math.sin(a) * rad);
    // Lotto drum: balls tumble; a fresh ticket shakes the drum and fills the tray.
    const lt = c.lotto; if (lt.tickets !== lastTicket) { lastTicket = lt.tickets; lottoKick = 1.6; const last = lt.last?.[0]; tray.forEach((b, i) => { const n = last?.balls?.[i]; b.m.visible = !!n; if (n) { const g = b.t.g; g.fillStyle = `hsl(${(n - 1) / 36 * 360},75%,55%)`; g.fillRect(0, 0, 128, 64); g.textAlign = 'center'; for (let k = 0; k < 4; k++) { g.fillStyle = '#fff'; g.beginPath(); g.arc(16 + k * 32, 32, 13, 0, 7); g.fill(); g.fillStyle = '#111'; g.font = 'bold 15px system-ui'; g.fillText(String(n), 16 + k * 32, 37); } b.t.t.needsUpdate = true; } }); }
    lottoKick = Math.max(0, lottoKick - dt); const energy = 1.2 + lottoKick * 6;
    ballState.forEach((b, i) => { b.v.add(new THREE.Vector3((Math.random() - .5), (Math.random() - .3), (Math.random() - .5)).multiplyScalar(energy * dt * 6)); b.v.y -= dt * 3; b.p.addScaledVector(b.v, dt); if (b.p.length() > 1.9) { b.p.setLength(1.9); b.v.reflect(b.p.clone().normalize()).multiplyScalar(.7); } dummy.position.copy(drum.position).add(b.p); dummy.updateMatrix(); balls.setMatrixAt(i, dummy.matrix); }); balls.instanceMatrix.needsUpdate = true;
    const ltKey = lt.jackpot + ':' + lt.tickets; if (ltKey !== keys.lt) { keys.lt = ltKey; const last = lt.last?.[0]; sign(ltSign, 'LOTTO · JACKPOT ' + money(lt.jackpot), ['$20 a ticket · pick 5 of 36', last ? last.name + ': ' + last.balls.join(' · ') : 'Match 5 for the jackpot', last ? (last.prize ? 'WON ' + money(last.prize) : last.hits + ' matched') : '2 → $20 · 3 → $150 · 4 → $2,500']); }
    const list = Object.values(game.wallets || {}).sort((x, y) => y.cash - x.cash), richKey = JSON.stringify(list.map(w => [w.name, w.cash])); if (richKey !== keys.rich) { keys.rich = richKey; sign(rich, 'PAYDAY RICH LIST', list.slice(0, 4).map((w, i) => (i + 1) + '. ' + w.name + '  ' + money(w.cash)), '#ff7ab0'); const debts = (game.loans || []).filter(l => l.owed > 0).length; sign(cashSign, 'CASHIER', ['Wallets · loans · salaries', list.length + ' engineers · ' + debts + ' open loans']); }
  }
  // Walkable: the doorway (only when open) and the room, minus the furniture.
  function clear(x, z) {
    if (z < ROOM.maxZ + 1.2) return open && x > CASINO.doorX[0] + .3 && x < CASINO.doorX[1] - .3;
    if (!open || x < CASINO.minX + 1 || x > CASINO.maxX - 1 || z > CASINO.maxZ - 1) return false;
    const near = (p, rx, rz) => Math.abs(x - p.x) < rx && Math.abs(z - p.z) < rz;
    return !near(BJ, 4.6, 3.2) && !(Math.abs(x - BJ.x) < 4.6 && z > BJ.z && Math.hypot(x - BJ.x, z - BJ.z) < 4.7) && !near(RL, 5.4, 2.8) && !near(LT, 2.2, 2.2) && !near({ x: LT.x, z: LT.z + 2 }, 2.4, .8) && !near(CASH, 2.4, 1.4);
  }
  return { group, update, clear, spots: CASINO_SPOTS, get open() { return open; } };
}
