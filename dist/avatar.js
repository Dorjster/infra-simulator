// Engineer avatar: a round-headed cartoon scout (big glossy eyes, freckles, toothy grin, scout cap,
// khaki uniform with collar, navy sash and badges). Each engineer's colour is on the cap band, the
// neckerchief and the laptop lid, and on the name tag.
// The rig is a handful of pivots (body, head, arms, legs, laptop), each ONE vertex-coloured mesh, so a
// player costs ~8 draw calls. Everything is procedural: walking, crouching, carrying the laptop and six
// emotes are driven by update(dt, state) on every client from the shared pose.
import * as THREE from './three.module.js';
import { EMOTE_IDS as ALLOWED, FACE_IDS as ALLOWED_FACES, SKIN_IDS } from './play-rules.js';

export const EMOTES = [
  { id: 'salute', label: 'Salute', key: '1', bubble: 'o7', face: 'idle', duration: 2.4 },
  { id: 'wave', label: 'Wave', key: '2', bubble: 'Hi!', face: 'wave', duration: 2.4 },
  { id: 'wait', label: 'Wait!', key: '3', bubble: 'WAIT!', face: 'wait', duration: 2.6 },
  { id: 'shrug', label: "I don't know", key: '4', bubble: '???', face: 'unsure', duration: 2.4 },
  { id: 'panic', label: 'Crisis!', key: '5', bubble: '!!!', face: 'panic', duration: 3.2 },
  { id: 'dead', label: 'Dead', key: '6', bubble: 'x_x', face: 'dead', duration: 4.8 },
];
export const EMOTE_IDS = EMOTES.map(e => e.id);
if (EMOTE_IDS.join() !== ALLOWED.join()) throw Error('Emote list differs from play-rules EMOTE_IDS');
const byEmote = Object.fromEntries(EMOTES.map(e => [e.id, e]));

const C = { yellow: 0xf0b400, yellowDark: 0xd8950a, khaki: 0xa98a52, khakiDark: 0x8a6d3e, collar: 0x3d8fd8, cream: 0xdccb9c, navy: 0x1f2d57, shoe: 0x4a3a2f, belt: 0x6b4f32, grey: 0x2b3440, badge: [0xe84a4a, 0x4cc27a, 0x3fb3e6, 0xf2c14e] };

// ---- geometry helpers: bake many primitives into one vertex-coloured geometry --------------------
function bake(parts) {
  let count = 0; const list = [];
  for (const { geo, color, m } of parts) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m); list.push([g, new THREE.Color(color)]); count += g.attributes.position.count; }
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3); let o = 0;
  for (const [g, c] of list) { const n = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); for (let k = 0; k < n; k++) col.set([c.r, c.g, c.b], (o + k) * 3); o += n; g.dispose(); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.computeBoundingSphere();
  return out;
}
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const P = (geo, color, m) => ({ geo, color, m });

// ---- shared resources (never disposed per avatar) ----------------------------------------------
const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72, metalness: 0 });
const faces = new Map(), bubbles = new Map();
// Face styles a player picks (shared with the host so it can validate the pose) and the emote
// expressions drawn on top of that style. Faces are canvas drawings wrapped on the front of the head.
export const FACES = [
  { id: 'cute', label: 'Cute' }, { id: 'smile', label: 'Smile' }, { id: 'bigeyes', label: 'Big eyes' },
  { id: 'grumpy', label: 'Grumpy' }, { id: 'angry', label: 'Angry' }, { id: 'sleepy', label: 'Sleepy' },
];
if (FACES.map(f => f.id).join() !== ALLOWED_FACES.join()) throw Error('Face list differs from play-rules FACE_IDS');
// Head / hand colours (the picker's second row). [main, shade, css]
export const SKINS = { yellow: [0xf0b400, 0xd8950a, '#f5c21b'], red: [0xe0452f, 0xb8321f, '#e8553f'], blue: [0x3f7fd6, 0x2d5fae, '#4f8fe6'], green: [0x6cc43a, 0x4f9a26, '#78d046'], pink: [0xe86fb0, 0xc4508f, '#f07cbc'], mint: [0xbfe8e0, 0x94c9bf, '#c9f0e8'] };
if (Object.keys(SKINS).join() !== SKIN_IDS.join()) throw Error('Skin list differs from play-rules SKIN_IDS');
const INK = '#16203f', MOUTH = '#3a2330', TEETH = '#ffffff', TONGUE = '#ef7f8e';
// expr: 'idle' | 'blink' | 'wave' | 'wait' | 'unsure' | 'panic' | 'dead'
export function faceCanvas(style = 'cute', expr = 'idle') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 384; const g = c.getContext('2d');
  try { drawFace(g, style, expr); } catch { /* canvas stub without 2D drawing (headless tests) */ }
  return c;
}
function faceTexture(style, expr) {
  const key = style + ':' + expr; if (faces.has(key)) return faces.get(key);
  const t = new THREE.CanvasTexture(faceCanvas(style, expr)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; faces.set(key, t); return t;
}
function drawFace(g, style, expr) {
  g.clearRect(0, 0, 512, 384); g.lineCap = 'round'; g.lineJoin = 'round';
  const L = 170, R = 342, Y = 172;
  const circle = (x, y, r, fill) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const line = (w, color, pts, curve) => { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.moveTo(...pts[0]); if (curve) g.quadraticCurveTo(...pts[1], ...pts[2]); else for (const p of pts.slice(1)) g.lineTo(...p); g.stroke(); };
  // Eyes like the reference: pale rim, big navy pupil, one large shine + a small one.
  const eye = (x, y, r = 56, { pupil = .8, look = 0, shine = true, sparkle = false } = {}) => {
    circle(x, y, r + 5, INK); circle(x, y, r, '#eef7fd'); circle(x + look * r * .12, y + r * .06, r * pupil, INK);
    if (!shine) return; circle(x - r * .2 + look * r * .12, y - r * .28, r * .34, '#ffffff'); circle(x + r * .32 + look * r * .12, y + r * .3, r * .1, '#ffffff');
    if (sparkle) { circle(x + r * .3, y - r * .42, r * .1, '#ffffff'); }
  };
  const closedHappy = (x, y) => line(12, INK, [[x - 34, y + 10], [x, y - 26], [x + 34, y + 10]], true);
  const closedFlat = (x, y) => { line(11, INK, [[x - 34, y], [x, y + 14], [x + 34, y]], true); for (const d of [-22, 0, 22]) line(6, INK, [[x + d, y + 8], [x + d * 1.2, y + 22]]); };
  const cheeks = () => { for (const x of [96, 416]) { g.fillStyle = 'rgba(225,80,70,.25)'; g.beginPath(); g.ellipse(x, 244, 40, 28, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#3a2a14'; for (const [dx, dy] of [[-18, -8], [0, -14], [16, -6], [-10, 8], [8, 6]]) circle(x + dx, 244 + dy, 5.5); } };
  const smallGrin = (w = 42, h = 32, y = 262) => { g.fillStyle = MOUTH; g.beginPath(); g.roundRect(256 - w, y, w * 2, h, 12); g.fill(); g.fillStyle = TEETH; const n = 4, tw = (w * 2 - 12) / n; for (let i = 0; i < n; i++) g.fillRect(256 - w + 6 + i * tw + 1.5, y + 4, tw - 3, h * .55); };
  const brows = (tilt, y = 104, color = INK) => { for (const [x, s] of [[L, 1], [R, -1]]) line(10, color, [[x - 30, y - s * tilt], [x + 30, y + s * tilt]]); };
  cheeks();
  // Emote expressions (shared by every style so they read the same for all players).
  if (expr === 'dead') { circle(L, Y, 46, '#f4f8fb'); circle(R, Y, 46, '#f4f8fb'); g.strokeStyle = '#c9d6e0'; g.lineWidth = 4; for (const x of [L, R]) { g.beginPath(); g.arc(x, Y, 46, 0, Math.PI * 2); g.stroke(); } line(8, INK, [[220, 268], [236, 258], [252, 268], [268, 258], [284, 268], [300, 258]]); circle(284, 280, 12, TONGUE); return; }
  if (expr === 'panic') { for (const x of [L, R]) { circle(x, Y, 61, INK); circle(x, Y, 56, '#eef7fd'); g.strokeStyle = INK; g.lineWidth = 7; g.beginPath(); for (let a = 0; a < Math.PI * 7; a += .2) { const r = 4 + a * 2.2; g.lineTo(x + Math.cos(a) * r, Y + Math.sin(a) * r); } g.stroke(); } brows(-10, 96); g.fillStyle = MOUTH; g.beginPath(); g.ellipse(256, 272, 34, 30, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = TEETH; g.fillRect(232, 248, 48, 10); g.fillStyle = TONGUE; g.beginPath(); g.ellipse(256, 290, 18, 9, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#8fd6ff'; g.beginPath(); g.moveTo(452, 70); g.quadraticCurveTo(470, 104, 452, 114); g.quadraticCurveTo(434, 104, 452, 70); g.fill(); return; }
  if (expr === 'unsure') { eye(L, Y + 4, 52, { look: -1 }); eye(R, Y - 4, 52, { look: -1 }); line(9, INK, [[R - 30, 102], [R, 88], [R + 30, 98]], true); line(8, MOUTH, [[228, 266], [256, 254], [284, 270]], true); return; }
  // Styles.
  const blink = expr === 'blink';
  if (style === 'smile') { closedHappy(L, Y); closedHappy(R, Y); g.fillStyle = MOUTH; g.beginPath(); g.moveTo(206, 240); g.quadraticCurveTo(256, 320, 306, 240); g.closePath(); g.fill(); g.fillStyle = TEETH; g.fillRect(222, 242, 68, 12); g.fillStyle = TONGUE; g.beginPath(); g.ellipse(256, 284, 22, 10, 0, 0, Math.PI * 2); g.fill(); return; }
  if (style === 'sleepy') { closedFlat(L, Y + 6); closedFlat(R, Y + 6); circle(256, 266, 11, MOUTH); g.fillStyle = '#8aa6d6'; g.font = 'bold 44px sans-serif'; g.fillText('z', 420, 96); g.font = 'bold 30px sans-serif'; g.fillText('z', 452, 62); return; }
  if (blink) { closedHappy(L, Y); closedHappy(R, Y); }
  if (style === 'bigeyes') { if (!blink) { eye(L - 6, Y - 6, 70, { pupil: .86, sparkle: true }); eye(R + 6, Y - 6, 70, { pupil: .86, sparkle: true }); } circle(256, 262, 12, MOUTH); circle(256, 258, 5, TONGUE); return; }
  if (style === 'grumpy') { if (!blink) for (const x of [L, R]) { g.save(); g.beginPath(); g.rect(x - 70, Y - 6, 140, 80); g.clip(); eye(x, Y, 52, { pupil: .72 }); g.restore(); line(11, INK, [[x - 58, Y - 6], [x + 58, Y - 6]]); } line(10, MOUTH, [[222, 276], [256, 256], [290, 276]], true); return; }
  if (style === 'angry') { if (!blink) { eye(L, Y + 6, 48, { pupil: .55 }); eye(R, Y + 6, 48, { pupil: .55 }); } brows(16, 104); g.fillStyle = MOUTH; g.beginPath(); g.roundRect(222, 252, 68, 26, 8); g.fill(); g.fillStyle = TEETH; g.fillRect(228, 256, 56, 18); g.strokeStyle = MOUTH; g.lineWidth = 3; for (let x = 238; x < 284; x += 12) { g.beginPath(); g.moveTo(x, 256); g.lineTo(x, 274); g.stroke(); } g.beginPath(); g.moveTo(228, 265); g.lineTo(284, 265); g.stroke(); return; }
  // cute (default, like the reference): round shiny eyes and a small toothy smile.
  if (!blink) { eye(L, Y); eye(R, Y); }
  if (expr === 'wave') smallGrin(40, 34, 246); else if (expr === 'wait') line(9, MOUTH, [[234, 264], [278, 264]]); else smallGrin();
}
function bubbleTexture(text) {
  if (bubbles.has(text)) return bubbles.get(text);
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  try {
    g.fillStyle = 'rgba(255,255,255,.95)'; g.strokeStyle = '#1b2233'; g.lineWidth = 6;
    g.beginPath(); g.roundRect(8, 8, 240, 88, 36); g.moveTo(112, 96); g.lineTo(128, 122); g.lineTo(146, 96); g.fill(); g.stroke();
    g.fillStyle = '#1b2233'; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 54, 220);
  } catch { /* headless canvas stub */ }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; bubbles.set(text, t); return t;
}
let screenTex = null;
function screenTexture() {
  if (screenTex) return screenTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 96; const g = c.getContext('2d');
  try { g.fillStyle = '#0c2233'; g.fillRect(0, 0, 128, 96); g.fillStyle = '#5fd0ff'; g.fillRect(0, 0, 128, 12); g.fillStyle = '#9ff0c8'; for (let i = 0; i < 6; i++) g.fillRect(8, 20 + i * 12, 30 + ((i * 37) % 70), 5); } catch { /* headless canvas stub */ }
  screenTex = new THREE.CanvasTexture(c); screenTex.colorSpace = THREE.SRGBColorSpace; return screenTex;
}

// ---- rig ----------------------------------------------------------------------------------------
const HIP = 2.35, SHOULDER = 6.0, NECK = 6.35, HEAD_R = 2.05;
export function createAvatar({ color = 0x6bd9ff, name = '', labelColor, face = 'cute', skin = 'yellow' } = {}) {
  const SK = SKINS[skin] || SKINS.yellow;
  let style = FACES.some(f => f.id === face) ? face : 'cute';
  const g = new THREE.Group(), rig = new THREE.Group(); rig.rotation.y = Math.PI; g.add(rig); // built facing +z; camera looks −z
  const fall = new THREE.Group(); rig.add(fall);                    // pivot at the feet for the "dead" fall
  const body = new THREE.Group(); fall.add(body);
  const mesh = (geo, parent) => { const m = new THREE.Mesh(geo, bodyMaterial); m.castShadow = true; parent.add(m); return m; };
  // Torso: shirt, shorts, belt, collar, neckerchief, sash + badges (front and back).
  const sash = [];
  for (const side of [1, -1]) { sash.push(P(new THREE.BoxGeometry(.58, 4.3, .14), C.navy, M(0, 4.35, side * 1.36, 0, 0, side * .62))); }
  C.badge.forEach((b, i) => sash.push(P(new THREE.CylinderGeometry(.2, .2, .1, 12), b, M(-.62 + i * .42, 3.35 + i * .62 * .72 + .2, 1.47, Math.PI / 2, 0, 0))));
  const torso = new THREE.Group(); torso.position.y = HIP; body.add(torso);
  mesh(bake([
    P(new THREE.CylinderGeometry(1.32, 1.5, 3.3, 18), C.khaki, M(0, 2.0 - .05, 0)),
    P(new THREE.CylinderGeometry(1.52, 1.46, .95, 18), C.khakiDark, M(0, .1, 0)),
    P(new THREE.CylinderGeometry(1.54, 1.54, .3, 18), C.belt, M(0, .62, 0)),
    P(new THREE.CylinderGeometry(1.12, 1.36, .42, 18), C.collar, M(0, 3.5, 0)),
    P(new THREE.ConeGeometry(.5, 1.0, 3), color, M(0, 3.05, 1.24, Math.PI, 0, 0, 1, 1, .5)),
    P(new THREE.BoxGeometry(.28, .5, .12), C.cream, M(.72, 2.55, 1.3, 0, 0, 0)),
    ...sash.map(p => ({ ...p, m: new THREE.Matrix4().makeTranslation(0, -HIP, 0).multiply(p.m) })),
  ]), torso);
  // Head: yellow ball + cap (crown, band in the player colour, rolled brim) + face decal.
  const head = new THREE.Group(); head.position.y = NECK - HIP; torso.add(head);
  mesh(bake([
    P(new THREE.SphereGeometry(HEAD_R, 28, 20), SK[0], M(0, HEAD_R * .96, 0, 0, 0, 0, 1.04, 1, .98)),
    P(new THREE.CylinderGeometry(.55, .7, .5, 12), SK[1], M(0, 0, 0)),
    // Small sailor-style scout cap perched on top, tipped back (crown, player-colour band, rolled brim).
    P(new THREE.CylinderGeometry(.82, .98, .62, 20), C.cream, M(0, HEAD_R * 1.93, -.42, -.42, 0, 0)),
    P(new THREE.SphereGeometry(.82, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.cream, M(0, HEAD_R * 1.93 + .3, -.54, -.42, 0, 0, 1, .38, 1)),
    P(new THREE.CylinderGeometry(1.0, 1.02, .24, 20), color, M(0, HEAD_R * 1.93 - .27, -.3, -.42, 0, 0)),
    P(new THREE.TorusGeometry(1.06, .16, 8, 22), C.cream, M(0, HEAD_R * 1.93 - .42, -.24, Math.PI / 2 - .42, 0, 0)),
  ]), head);
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(style, 'idle'), transparent: true, roughness: .55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  faceMat.userData.shared = true;
  const faceMesh = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.012, 28, 18, Math.PI / 2 - 1.05, 2.1, .78, 1.45), faceMat);
  faceMesh.position.y = HEAD_R * .96; faceMesh.scale.set(1.04, 1, .98); faceMesh.renderOrder = 2; head.add(faceMesh);
  // Arms (sleeve + yellow forearm + mitten hand with thumb), pivot at the shoulder, hanging along −y.
  // Arms: upper arm (shoulder + sleeve) → elbow → forearm with a flat mitten hand and thumb.
  const elbows = {};
  const arm = side => { const p = new THREE.Group(); p.position.set(side * 1.62, SHOULDER - HIP, 0); torso.add(p); mesh(bake([
    P(new THREE.SphereGeometry(.52, 12, 8), C.khaki, M(0, 0, 0)),
    P(new THREE.CylinderGeometry(.5, .44, 1.3, 12), C.khaki, M(0, -.6, 0)),
  ]), p);
    const el = new THREE.Group(); el.position.y = -1.2; p.add(el); elbows[side > 0 ? 'L' : 'R'] = el; mesh(bake([
    P(new THREE.SphereGeometry(.36, 10, 8), SK[0], M(0, 0, 0)),
    P(new THREE.CylinderGeometry(.34, .31, 1.1, 12), SK[0], M(0, -.5, 0)),
    P(new THREE.SphereGeometry(.56, 14, 10), SK[0], M(0, -1.36, .04, 0, 0, 0, .92, 1.12, .6)),
    P(new THREE.SphereGeometry(.22, 10, 8), SK[0], M(-side * .44, -1.12, .2, 0, 0, 0, 1, 1.4, 1)),
  ]), el); return p; };
  const arms = { L: arm(1), R: arm(-1) };
  // Legs (shorts cuff, yellow shin, cream sock, brown shoe), pivot at the hip.
  const leg = side => { const p = new THREE.Group(); p.position.set(side * .7, HIP, 0); body.add(p); mesh(bake([
    P(new THREE.CylinderGeometry(.5, .46, .6, 12), C.khakiDark, M(0, -.25, 0)),
    P(new THREE.CylinderGeometry(.34, .32, 1.0, 12), SK[0], M(0, -.95, 0)),
    P(new THREE.CylinderGeometry(.36, .36, .6, 12), C.cream, M(0, -1.65, 0)),
    P(new THREE.SphereGeometry(.55, 14, 10), C.shoe, M(0, -2.08, .22, 0, 0, 0, .95, .55, 1.35)),
  ]), p); return p; };
  const legs = { L: leg(1), R: leg(-1) };
  // Laptop carried in both hands, screen facing the carrier (others see the lid and the screen glow).
  const laptop = new THREE.Group(); laptop.position.set(0, 3.0, 2.25); laptop.visible = false; torso.add(laptop);
  mesh(bake([P(new THREE.BoxGeometry(2.1, .12, 1.45), C.grey, M(0, 0, 0)), P(new THREE.BoxGeometry(2.1, 1.4, .1), C.grey, M(0, .66, .72, .28, 0, 0)), P(new THREE.BoxGeometry(.5, .5, .02), color, M(0, .7, .79, .28, 0, 0))]), laptop);
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture() }); screenMat.userData.shared = true;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.2), screenMat); screen.position.set(0, .66, .66); screen.rotation.set(.28, Math.PI, 0); laptop.add(screen);
  // Name tag and emote bubble.
  let shownName = name; const label = name ? nameSprite(name, labelColor ?? color) : null; if (label) { label.position.y = 12.1; g.add(label); }
  // Name tag follows renames (LAN /api/name).
  const setName = n => { if (!label || !n || n === shownName) return; shownName = n; const fresh = nameSprite(n, labelColor ?? color); label.material.map?.dispose(); label.material.map = fresh.material.map; label.material.needsUpdate = true; fresh.material.dispose(); };
  const bubbleMat = new THREE.SpriteMaterial({ map: bubbleTexture('!'), transparent: true, depthTest: false }); bubbleMat.userData.shared = true;
  const bubble = new THREE.Sprite(bubbleMat); bubble.scale.set(2.6, 1.3, 1); bubble.position.y = 13.4; bubble.visible = false; bubble.renderOrder = 5; g.add(bubble);

  // ---- animation state ----
  const s = { phase: 0, speed: 0, t: 0, emote: null, emoteT: 0, blinkAt: 2 + Math.random() * 3, face: '', crouch: 0, laptop: 0, w: 0 };
  const cur = { aL: new THREE.Euler(), aR: new THREE.Euler(), bL: new THREE.Euler(), bR: new THREE.Euler(), lL: 0, lR: 0, lLz: 0, lRz: 0, head: new THREE.Euler(), torso: new THREE.Euler(), lift: 0, fall: 0 };
  const aim = (dx, dy, dz) => { const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l; const cf = Math.sqrt(Math.max(1e-6, 1 - dx * dx)); return [Math.atan2(-dz / cf, -dy / cf), 0, Math.asin(dx)]; };
  // Forearm direction (torso space) → elbow rotation, given the upper-arm rotation.
  const qa = new THREE.Quaternion(), va = new THREE.Vector3(), ea = new THREE.Euler();
  const fore = (upper, dx, dy, dz) => { qa.setFromEuler(ea.set(upper[0], upper[1], upper[2])).invert(); va.set(dx, dy, dz).normalize().applyQuaternion(qa); return aim(va.x, va.y, va.z); };
  const setFace = expr => { const key = style + ':' + expr; if (s.face === key) return; s.face = key; faceMat.map = faceTexture(style, expr); faceMat.needsUpdate = true; };
  function play(id) { if (!id || !byEmote[id]) { s.emote = null; return; } s.emote = byEmote[id]; s.emoteT = 0; bubbleMat.map = bubbleTexture(s.emote.bubble); bubbleMat.needsUpdate = true; }
  // state: { speed (units/s), crouch, laptop } — speed comes from the smoothed pose movement.
  function update(dt, st = {}) {
    s.t += dt; s.speed += ((st.speed || 0) - s.speed) * Math.min(1, dt * 8);
    s.crouch += ((st.crouch ? 1 : 0) - s.crouch) * Math.min(1, dt * 10);
    s.laptop += ((st.laptop ? 1 : 0) - s.laptop) * Math.min(1, dt * 8); laptop.visible = s.laptop > .5;
    const moving = Math.min(1, s.speed / 6), stride = Math.min(1.3, s.speed / 9);
    s.phase += dt * (3.2 + s.speed * .55) * (moving > .05 ? 1 : 0);
    if (s.emote) { s.emoteT += dt; if (s.emoteT > s.emote.duration || (moving > .5 && s.emote.id !== 'dead')) s.emote = null; }
    const e = s.emote, et = s.emoteT, D = e?.duration || 1, w = e ? Math.min(1, et / .22, (D - et) / .3) : 0; s.w = w;
    // Base pose: walk cycle + idle breathing + laptop carry.
    const sw = Math.sin(s.phase) * .75 * stride, breathe = Math.sin(s.t * 2.2) * .03;
    let aL = [sw * .9 * (1 - s.laptop), 0, .08], aR = [-sw * .9 * (1 - s.laptop), 0, -.08];
    let bL = [-.25 - .15 * Math.max(0, sw), 0, 0], bR = [-.25 - .15 * Math.max(0, -sw), 0, 0];
    if (s.laptop > .01) { const l = s.laptop, up = [aim(.12, -.95, .3), aim(-.12, -.95, .3)]; aL = mix(aL, up[0], l); aR = mix(aR, up[1], l); bL = mix(bL, fore(up[0], -.28, -.12, 1), l); bR = mix(bR, fore(up[1], .28, -.12, 1), l); }
    let lL = -sw, lR = sw, lLz = 0, lRz = 0, hT = [breathe - .05 * s.laptop * 3, 0, 0], tT = [moving * .08, 0, 0], lift = Math.abs(Math.cos(s.phase)) * .22 * moving, fT = 0;
    // Emote pose, blended in/out.
    if (e) {
      let eL = aL, eR = aR, fL = bL, fR = bR, eh = hT, et2 = tT, ex = 0; const down = [.04, 0, .08], downR = [.04, 0, -.08];
      if (e.id === 'salute') { const snap = Math.min(1, et / .3); eR = aim(-.78, .5 * snap - .3 * (1 - snap), .42); fR = fore(eR, .5, .82, .3); eL = down; fL = [-.1, 0, 0]; eh = [-.1, .12, -.16]; et2 = [-.06, 0, 0]; }
      else if (e.id === 'wave') { eR = aim(-.9, .2, .15); fR = fore(eR, -.25 + .5 * Math.sin(et * 11), 1, .12); eL = down; fL = [-.1, 0, 0]; eh = [0, 0, .12 * Math.sin(et * 5.5)]; }
      else if (e.id === 'wait') { eR = aim(-.1, .05, 1); fR = fore(eR, .05, 1, .2); eL = aim(.5, -.85, -.1); fL = fore(eL, -.6, .2, .3); eh = [.08 * Math.sin(et * 7), 0, 0]; et2 = [.05, 0, 0]; }
      else if (e.id === 'shrug') { const up = Math.min(1, et / .35); eL = aim(.4, -.9, .1); eR = aim(-.4, -.9, .1); fL = fore(eL, .55, -.05, .85); fR = fore(eR, -.55, -.05, .85); eh = [.05, 0, .28 * up]; ex = .22 * up; }
      else if (e.id === 'panic') { const j = Math.sin(et * 38); eL = aim(.8, .6, .1); eR = aim(-.8, .6, .1); fL = fore(eL, -.75, .6, .2); fR = fore(eR, .75, .6, .2); eh = [.1, .22 * Math.sin(et * 24), 0]; et2 = [.12, 0, .05 * j]; lL = .5 * Math.sin(et * 16); lR = -lL; ex = Math.abs(Math.sin(et * 16)) * .25; }
      else if (e.id === 'dead') { const f = Math.min(1, Math.max(0, (et - .35) / .45)), up = Math.max(0, Math.min(1, (et - (D - .6)) / .5)), k = (f < 1 ? f * f : 1) * (1 - up); fT = k; eL = aim(.95, .25 * k, 0); eR = aim(-.95, .25 * k, 0); fL = [0, 0, 0]; fR = [0, 0, 0]; lLz = .2 * k; lRz = -.2 * k; lL = 0; lR = 0; eh = [.2 * k, 0, .35 * k]; if (et < .35) { et2 = [-.25 * (et / .35), 0, 0]; } }
      aL = mix(aL, eL, w); aR = mix(aR, eR, w); bL = mix(bL, fL, w); bR = mix(bR, fR, w); hT = mix(hT, eh, w); tT = mix(tT, et2, w); lift += ex * w;
      if (e.id !== 'dead') { lL *= 1 - w * .6; lR *= 1 - w * .6; }
      if (e.id === 'panic') { lL = .5 * Math.sin(et * 16) * w; lR = -lL; }
      setFace(e.id === 'dead' && fT < .3 ? 'panic' : e.face);
      bubble.visible = true; bubble.position.y = (fT > .5 ? 8.5 : 13.4) + Math.sin(s.t * 4) * .15; bubbleMat.opacity = Math.min(1, w * 1.5);
    } else { bubble.visible = false; s.blinkAt -= dt; setFace(s.blinkAt < 0 ? 'blink' : 'idle'); if (s.blinkAt < -.13) s.blinkAt = 2.5 + Math.random() * 3.5; }
    // Smooth toward the targets (fast enough for snappy gestures, no pops when emotes start/end).
    const k = 1 - Math.exp(-dt * 16);
    ease(cur.aL, aL, k); ease(cur.aR, aR, k); ease(cur.bL, bL, k); ease(cur.bR, bR, k); ease(cur.head, hT, k); ease(cur.torso, tT, k);
    cur.lL += (lL - cur.lL) * k; cur.lR += (lR - cur.lR) * k; cur.lLz += (lLz - cur.lLz) * k; cur.lRz += (lRz - cur.lRz) * k; cur.lift += (lift - cur.lift) * k; cur.fall += (fT - cur.fall) * Math.min(1, dt * 12);
    arms.L.rotation.copy(cur.aL); arms.R.rotation.copy(cur.aR); elbows.L.rotation.copy(cur.bL); elbows.R.rotation.copy(cur.bR); head.rotation.copy(cur.head); torso.rotation.copy(cur.torso);
    legs.L.rotation.set(cur.lL + s.crouch * -1.1, 0, cur.lLz); legs.R.rotation.set(cur.lR + s.crouch * -1.1, 0, cur.lRz);
    torso.position.y = HIP + breathe * 2 + cur.lift - s.crouch * .9; legs.L.position.y = legs.R.position.y = HIP - s.crouch * .9;
    torso.position.z = s.crouch * .7; torso.rotation.x += s.crouch * .25;
    fall.rotation.x = -Math.PI / 2 * cur.fall; fall.position.y = 1.45 * cur.fall;
    if (label) label.position.y = (12.1 - s.crouch * 2.2) * (1 - cur.fall) + 5 * cur.fall;
  }
  function dispose() { g.removeFromParent(); g.traverse(o => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m && m !== bodyMaterial && !m.userData?.shared) { m.map?.dispose(); m.dispose(); } }); }
  return { g, label, update, play, dispose, setName, get name() { return shownName; }, skin: SKINS[skin] ? skin : 'yellow', setStyle(f) { if (FACES.some(x => x.id === f)) { style = f; s.face = ''; } }, get style() { return style; }, get emote() { return s.emote?.id || null; }, get emoteProgress() { return s.emote ? s.emoteT / s.emote.duration : 0; }, parts: { head, face: faceMesh, arms, elbows, legs, laptop, bubble, torso } };
}
function mix(a, b, w) { return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w]; }
function ease(e, t, k) { e.x += (t[0] - e.x) * k; e.y += (t[1] - e.y) * k; e.z += (t[2] - e.z) * k; }
function nameSprite(name, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
  try { g.font = 'bold 42px sans-serif'; g.textAlign = 'center'; g.lineWidth = 8; g.strokeStyle = 'rgba(6,14,20,.85)'; g.strokeText(name, 256, 64, 490); g.fillStyle = '#' + Number(color).toString(16).padStart(6, '0'); g.fillText(name, 256, 64, 490); } catch { /* headless canvas stub */ }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false })); s.scale.set(4.5, .85, 1); return s;
}
