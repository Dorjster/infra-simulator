// 3D models of the weapons, after the real guns' proportions. Muzzle points along −Z, the trigger sits at the
// origin; 1 unit ≈ 16.5 cm like the rest of the game. Used for the first-person view model,
// the gun in other engineers' hands and the weapon market display.
import * as THREE from './three.module.js';
import { pistolModel } from './fun-pistol.js';

// Surface textures, drawn once at start (256 px, a few KB of GPU memory each): brushed steel, blued metal with
// wear on the edges, stippled polymer, walnut grain. Each also drives roughness, so light catches the grain.
function surface(draw, rough) {
  try { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); if (typeof g?.fillRect !== 'function') return {};
    draw(g); const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const r = document.createElement('canvas'); r.width = r.height = 256; const rg = r.getContext('2d'); rg.drawImage(c, 0, 0); const id = rg.getImageData(0, 0, 256, 256);
    for (let i = 0; i < id.data.length; i += 4) { const l = (id.data[i] + id.data[i + 1] + id.data[i + 2]) / 765, v = Math.max(0, Math.min(255, (rough + (.5 - l) * .35) * 255)); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; }
    rg.putImageData(id, 0, 0); const roughnessMap = new THREE.CanvasTexture(r); roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping; return { map, roughnessMap };
  } catch { return {}; }
}
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const noise = (g, base, amp, n = 9000, w = 1, h = 1) => { g.fillStyle = base; g.fillRect(0, 0, 256, 256); for (let i = 0; i < n; i++) { const v = (rnd() - .5) * amp; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(rnd() * 256, rnd() * 256, w, h); } };
const T = {
  brushed: surface(g => { noise(g, '#4a5057', .12, 2500); for (let y = 0; y < 256; y++) { g.fillStyle = `rgba(255,255,255,${rnd() * .07})`; g.fillRect(0, y, 256, 1); } }, .32),
  blued: surface(g => { noise(g, '#26292e', .1, 7000); g.strokeStyle = 'rgba(160,170,180,.18)'; g.lineWidth = 3; g.strokeRect(1, 1, 254, 254); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(150,160,170,${rnd() * .12})`; g.fillRect(rnd() * 256, rnd() < .5 ? 0 : 250, rnd() * 40, 6); } }, .38),
  polymer: surface(g => noise(g, '#2c2f34', .18, 16000, 2, 2), .78),
  tanPoly: surface(g => noise(g, '#8e7d5c', .16, 16000, 2, 2), .74),
  wood: surface(g => { g.fillStyle = '#6e3a1c'; g.fillRect(0, 0, 256, 256); for (let x = 0; x < 256; x += 2) { const w = Math.sin(x * .09) * 6 + Math.sin(x * .023) * 14; g.fillStyle = `rgba(${40 + rnd() * 30},${15 + rnd() * 12},5,${.25 + rnd() * .3})`; g.fillRect(x, 0, 1 + rnd() * 2, 256); g.fillStyle = `rgba(255,200,140,${rnd() * .08})`; g.fillRect(x + w * .1, 0, 1, 256); } }, .55),
};
const GUARD = new THREE.TorusGeometry(.13, .022, 6, 14, Math.PI);
const M = {
  black: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .55, roughness: 1, envMapIntensity: .6, ...T.blued }),
  steel: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .75, roughness: 1, envMapIntensity: .55, ...T.brushed }),
  poly: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .05, roughness: 1, ...T.polymer }),
  wood: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 1, ...T.wood }),
  tan: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .05, roughness: 1, ...T.tanPoly }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1d4e7a, metalness: .3, roughness: .1, emissive: 0x0a1c2c }),
  awp: new THREE.MeshStandardMaterial({ color: 0x6b7f4a, metalness: .05, roughness: 1, ...T.tanPoly }),
};
// Without a canvas (tests) the textures are missing: fall back to the plain colours.
for (const [k, c] of [['black', 0x24272b], ['steel', 0x6a7179], ['poly', 0x2b2e33], ['wood', 0x6e3a1c], ['tan', 0x8b7a5a]]) if (!M[k].map) { M[k].color.setHex(c); M[k].roughness = .5; }
for (const m of Object.values(M)) m.userData.shared = true;

// Real-proportion models. Every gun is drawn in centimetres from its side profile (z forward = negative, y up,
// origin at the trigger), extruded to its real thickness with rounded edges, then given round parts (barrels, gas
// tubes, scopes, muzzle devices). Each design is built once and cloned (clones share geometry and materials).
const CM = 1 / 16.5;
function build(id) {
  const g = new THREE.Group();
  // Side profile [[z, y], …] in cm, extruded `t` cm thick (centred on x = xo), rounded edges. Optional holes.
  const prof = (pts, t, mat, { xo = 0, holes = [], bevel = .35 } = {}) => {
    const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z * CM, y * CM)));
    for (const h of holes) sh.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z * CM, y * CM))));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: Math.max(.01, t - 2 * bevel) * CM, bevelEnabled: true, bevelThickness: bevel * CM, bevelSize: bevel * CM, bevelSegments: 2, curveSegments: 8 });
    geo.rotateY(-Math.PI / 2); geo.translate((xo + t / 2 - bevel) * CM, 0, 0); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); g.add(m); return m;
  };
  // Round part along z (cm): radius r, from z0 to z1, at height y (and x).
  const rod = (r, z0, z1, y, mat, x = 0, seg = 14) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r * CM, r * CM, Math.abs(z1 - z0) * CM, seg), mat); m.rotation.x = Math.PI / 2; m.position.set(x * CM, y * CM, (z0 + z1) / 2 * CM); g.add(m); return m; };
  const cone = (r0, r1, z0, z1, y, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1 * CM, r0 * CM, Math.abs(z1 - z0) * CM, 14), mat); m.rotation.x = -Math.PI / 2; m.position.set(0, y * CM, (z0 + z1) / 2 * CM); g.add(m); return m; };
  const blk = (w, h, d, z, y, mat, x = 0, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w * CM, h * CM, d * CM), mat); m.position.set(x * CM, y * CM, z * CM); m.rotation.x = rx; g.add(m); return m; };
  const ring = (r, tube, z, y, mat) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r * CM, tube * CM, 6, 16), mat); m.position.set(0, y * CM, z * CM); g.add(m); return m; };
  // Curved magazine: front and back edges as arcs (top at y0 between zf..zb, bending forward by `bend` cm over `len` cm).
  const mag = (zf, zb, y0, len, bend, t, mat) => { const pts = [], n = 8; for (let i = 0; i <= n; i++) { const k = i / n; pts.push([zf - bend * k * k - (zb - zf) * .15 * k, y0 - len * k]); } for (let i = n; i >= 0; i--) { const k = i / n; pts.push([zb - bend * k * k - (zb - zf) * .05 * k, y0 - (len + 1.5) * k]); } return prof(pts, t, mat); };
  const guard = (z0, z1, y0, depth, mat) => prof([[z0, y0], [z0 - .4, y0 - depth], [z1 + 1.5, y0 - depth - .2], [z1, y0 - depth + 1.4], [z1, y0], [z1 - .7, y0], [z1 - .7, y0 - depth + 1.6], [z1 + 1.2, y0 - depth + .7], [z0 + .5, y0 - depth + .7], [z0 + .6, y0]], 1.2, mat, { bevel: .2 });
  const trigger = (z, y, mat) => prof([[z - .3, y], [z + .6, y], [z + .9, y - 2.4], [z + .3, y - 2.6]], .6, mat, { bevel: .1 });
  const serr = (z0, n, gap, y0, h, w, mat) => { for (let i = 0; i < n; i++) blk(w + .1, h, .25, z0 + i * gap, y0, mat); };
  const B = M.black, S = M.steel, P = M.poly, W = M.wood;
  if (id === 'pistol') {            // Glock 17: 20.4 cm, squared slide with rear serrations, polymer frame at 22°, accessory rail
    prof([[4, 1.2], [4, 3.6], [3.6, 4], [-16.2, 4], [-16.6, 3.6], [-16.6, 1.2]], 2.55, B);
    serr(.6, 7, .45, 2.6, 2.4, 2.55, S);
    prof([[3, 1.3], [-15.6, 1.3], [-15.6, -.4], [-1.6, -.4], [-1.6, -.8], [3, -.8]], 3, P);   // frame
    prof([[3.2, -.4], [8.2, -11.4], [7.6, -12.4], [3.4, -12.6], [2.6, -11.6], [.1, -1.4], [.3, -.4]], 3, P);   // grip, 22° rake
    for (let i = 0; i < 4; i++) blk(3.08, .5, 3.6, 2.2 + i * 1.2, -4 - i * 2.2, P, 0, -.38);
    prof([[-6, -.3], [-15.2, -.3], [-15.2, -1.1], [-6, -1.1]], 2.2, P);   // rail
    guard(-1.6, 1.2, -.6, 2.8, P); trigger(-.4, -.6, B);
    blk(.5, .8, .6, -15.6, 4.3, S); blk(1.6, .7, .6, 3.4, 4.3, S); rod(.55, -16.6, -16.7, 3, B);
  }
  else if (id === 'deagle') {       // Desert Eagle: 27 cm, tall slide, fixed triangular-section barrel, big steel frame
    prof([[4.5, .8], [4.5, 4.4], [3.8, 5], [-12, 5], [-12, 4.2], [-22.5, 4.2], [-22.5, .8]], 3.2, S);
    prof([[-12, 5], [-22.5, 4.2], [-22.5, 5.6], [-12, 5.9]], 1.4, S);   // top rib
    serr(.8, 8, .5, 2.8, 3, 3.2, B);
    prof([[3.8, .9], [-20, .9], [-20, -.6], [-1.8, -.6], [-1.8, -1], [3.8, -1]], 3.4, B);
    prof([[3.8, -.6], [9.4, -13.4], [8.6, -14.4], [3.6, -14.6], [2.8, -13.4], [-.2, -1.6], [0, -.6]], 3.6, B);
    guard(-1.8, 1.5, -.8, 3.2, B); trigger(-.5, -.8, S); rod(.9, -22.5, -22.8, 2.6, B);
    blk(.6, .9, .7, -21.5, 5.4, B); blk(2, .9, .7, 3.8, 5.4, B);
  }
  else if (id === 'smg') {          // MP5: 55–70 cm, round receiver tube, slim curved magazine, bulged handguard, hooded front sight
    rod(2.2, 8, -22, 2.4, B); prof([[8, 4.4], [-22, 4.4], [-22, 5], [8, 5]], 1.4, B);
    prof([[-22, 3.6], [-37, 3.4], [-38, 2.4], [-37.5, -1.6], [-23, -2], [-22, -1]], 5.2, P);   // handguard
    rod(.8, -36, -47, 2.4, B); rod(1.3, -44, -47, 2.4, B); rod(1.1, -22, -43, 6.4, B);       // barrel, muzzle, cocking tube
    ring(1.3, .3, -43, 8.4, B); blk(.4, 2, .4, -43, 7.4, B); blk(1.4, 2.2, 1.6, 6.5, 6.6, B); // front-sight hood, rear drum
    prof([[-5, .4], [-11, .4], [-11.5, -1.5], [-5.5, -1.5]], 3.2, B);                          // magwell
    mag(-6, -10.6, -1, 19, 6, 2.2, B);
    prof([[0, .2], [3.6, .2], [7.6, -10.6], [4.4, -11.4], [1, -1.2]], 3, P); guard(-3, .2, .2, 2.6, P); trigger(-1.8, .2, B);
    prof([[8, 4.6], [30, 3], [30, -9], [27, -9], [20, -1], [8, -.2]], 3.4, P, { holes: [[[12, 2.6], [24, 1.6], [24, -.6], [12, .9]]] });   // A2 stock
    blk(4, .6, .6, 2, 5.6, S, 1.4);
  }
  else if (id === 'shotgun') {      // Nova: 100 cm pump shotgun, barrel over magazine tube, ribbed pump, one-piece polymer stock
    prof([[6, -1.5], [6, 4.4], [4, 5.4], [-16, 5.4], [-16, -1.8], [-4, -1.8]], 4.4, B);
    rod(1.25, -16, -66, 4, B); rod(1.3, -16, -56, .8, B); rod(1.45, -65.5, -66, 4, S); blk(.3, .7, 50, -41, 5.6, S);
    prof([[-25, 3.4], [-45, 3.4], [-45.5, -1.6], [-25, -1.6]], 4.8, P); for (let i = 0; i < 9; i++) blk(4.9, .45, .55, -27 - i * 2, -1.2, B);
    prof([[6, 4.6], [36, 2.4], [37, 2.6], [37, -13.5], [35.5, -13.8], [16, -6.6], [13, -6], [10.8, -15.2], [6.8, -15.6], [4.2, -3], [6, -1.5]], 4, P);
    guard(-2, 3.6, -1.8, 3, P); trigger(.4, -1.8, B); blk(.5, .9, .5, -64.5, 6.2, S, 0);
  }
  else if (id === 'ak') {           // AK-47: 88 cm, stamped receiver, wooden furniture, gas tube, 30-round curved magazine, slant brake
    prof([[7, -2.2], [7, 3.2], [5, 5.4], [-22, 5.4], [-22, -2.2]], 4.6, B);                      // receiver + dust cover
    for (let i = 0; i < 3; i++) blk(4.7, .35, 4.8, 2 - i * 6, 5.2, S);                          // dust-cover ribs
    prof([[-22, 6.4], [-27, 6.8], [-27, 2], [-22, 2]], 4, B);                                    // rear-sight block
    prof([[-27, 3], [-45, 2.6], [-46, 1.4], [-46, -2.4], [-44, -3.4], [-29, -3.4], [-27, -2.4]], 5.2, W);   // lower handguard
    prof([[-27, 6.6], [-41, 6.4], [-42, 5.4], [-42, 3.8], [-27, 3.8]], 3.6, W);                  // upper handguard (gas tube cover)
    rod(1.05, -22, -55, 1.6, S); rod(1, -42, -49, 5.2, B);                                       // barrel, gas tube end
    prof([[-46, 1], [-46, 6.4], [-49.5, 6.4], [-49.5, -.4]], 2.6, B); prof([[-50, 2], [-50.5, 9.4], [-52.5, 9.4], [-53, 1.2]], 1.8, B);   // gas block, front-sight post base
    cone(1.5, 1.2, -54.5, -58, 1.6, B);                                                          // slant muzzle brake
    prof([[-4.4, -2.2], [-12.4, -2.2], [-12.4, -3.6], [-4.4, -3.6]], 3.4, B); mag(-5, -12.4, -3, 21, 9.5, 2.8, B);
    prof([[1.2, -2.2], [5.4, -2.2], [9.8, -12.8], [6.6, -14.2], [4.4, -13.8], [1.4, -3.2]], 3, W);   // pistol grip
    guard(-3.6, 1.6, -2.2, 3.4, B); trigger(-1.6, -2.2, B);
    prof([[7, 3.4], [34, -.4], [35, -.4], [35, -12], [34, -12.2], [9, -3.4], [7, -2.4]], 4, W);    // stock
    prof([[34.5, -.2], [36, -.2], [36, -12.3], [34.5, -12.3]], 4.2, B, { bevel: .2 });            // buttplate
    blk(1.4, 1.6, .7, -10, 2.2, S, 2.6);                                                          // charging handle
  }
  else if (id === 'm4') {           // M4A1: 84 cm, flat-top upper with rail, round handguard, A-frame front sight, buffer tube, stock
    prof([[9, 0], [9, 5.6], [-17, 5.6], [-17, 0]], 4.6, B); for (let z = 8; z > -17; z -= 1.2) blk(2.2, .8, .7, z, 6.2, B);   // upper + Picatinny
    prof([[7, -4.2], [7, .2], [-10, .2], [-10, -4.4], [-4, -4.4], [-3, -2.4], [3, -2.4], [6, -4.2]], 4.4, B);   // lower
    prof([[-2.6, -2.2], [-10, -2.2], [-10, -6], [-2.6, -6]], 3.4, B); mag(-3, -9.8, -4, 17, 3, 2.6, B);
    rod(2.8, -17, -35, 2.6, P, 0, 18); for (let i = 0; i < 6; i++) ring(2.85, .2, -19 - i * 2.8, 2.6, B);     // handguard
    rod(.9, -17, -47, 2.6, B); cone(1.1, 1, -46, -50, 2.6, B);
    prof([[-35, 1.4], [-35.5, 5.4], [-37.5, 10.6], [-38.3, 10.6], [-39.4, 5.4], [-40, 1.4]], 1.8, B, { holes: [[[-36.4, 4], [-38.8, 4], [-38, 8.4], [-37.2, 8.4]]] });   // A-frame
    prof([[1.2, -2.2], [4.6, -2.2], [9.2, -12.4], [6, -13.6], [4, -13], [1, -3]], 3, P); guard(-3, 1.4, -2.4, 3, B); trigger(-1.4, -2.4, B);
    rod(1.6, 9, 29, 2.2, B); prof([[17, 5.6], [31, 4.8], [31, -8], [29, -8.4], [24, -2], [17, -.8]], 4, P);   // buffer tube + stock
    blk(1, 1.2, 2.6, 8.6, 5.2, B, 2.6); blk(1.6, 2.6, 2.8, 7, 8.2, B);                              // charging handle, rear sight
  }
  else if (id === 'sniper') {       // AWP: 118 cm, olive thumbhole stock, heavy fluted barrel, big scope, bolt, folded bipod
    const O = M.awp;
    prof([[36, 6], [36, -14], [33, -14.4], [14, -8], [9, -12], [5, -12], [2, -2.6], [-30, -1.6], [-32, 1], [-32, 3.6], [-8, 4], [2, 4.2], [12, 6.2]], 5.4, O, { holes: [[[6, 2], [12, 3], [12, -5], [9.5, -8.6], [6.5, -3]]] });
    prof([[8, 2], [8, 6.6], [-14, 6.6], [-14, 2]], 3.6, B);                                       // action
    rod(1.5, -14, -78, 4.2, B); for (let i = 0; i < 4; i++) blk(.3, .3, 38, -48, 5.7 - (i % 2) * 2.9, M.steel, i < 2 ? 1.2 : -1.2);   // fluted barrel
    rod(1.9, -78, -85, 4.2, B); for (let i = 0; i < 3; i++) rod(2, -79.5 - i * 2, -80.3 - i * 2, 4.2, M.steel);   // muzzle brake
    rod(1.8, 14, -24, 11.6, B, 0, 18); cone(2.4, 2.2, 14, 9, 11.6, B); cone(1.9, 3.1, -16, -26, 11.6, B); rod(2.6, -24, -27, 11.6, B, 0, 18);   // scope tube, eyepiece, objective
    rod(2.2, -27, -27.2, 11.6, M.glass); rod(1.7, 14.2, 14.4, 11.6, M.glass);
    rod(1.1, -2, -6, 15, B).rotation.set(0, 0, 0); rod(1.1, -2, -6, 11.6, B, 2.6).rotation.set(0, 0, Math.PI / 2);   // turrets
    for (const z of [6, -12]) prof([[z + 1.4, 6.6], [z - 1.4, 6.6], [z - 1.4, 9.6], [z + 1.4, 9.6]], 2.6, B);       // scope rings
    const bolt = rod(.6, 0, 6, 5, S, 0); bolt.rotation.set(0, 0, Math.PI / 2); bolt.position.set(4.4 * CM, 5 * CM, 3 * CM); const knob = new THREE.Mesh(new THREE.SphereGeometry(1.2 * CM, 10, 8), S); knob.position.set(7.6 * CM, 5 * CM, 3 * CM); g.add(knob);
    prof([[-1, -1.8], [-9, -1.8], [-9, -8], [-1, -8]], 3.2, B); guard(-1, 3.8, -2.4, 3, B); trigger(.8, -2.4, S);
    prof([[36.2, 6], [37.6, 6], [37.6, -14], [36.2, -14]], 5.6, P, { bevel: .4 });                 // recoil pad
  }
  else if (id === 'lmg') {          // M249: 104 cm, box receiver with feed cover, heat shield, side box magazine, carry handle, bipod
    prof([[9, -3], [9, 6], [6, 7.6], [-20, 7.6], [-20, -3]], 5.6, B); for (let i = 0; i < 3; i++) blk(5.7, .4, 1, 2 - i * 7, 7.6, S);
    rod(1.3, -20, -62, 2.6, B); cone(1.5, 1.3, -62, -67, 2.6, B);
    prof([[-20, 6.2], [-44, 5.6], [-44, 1.8], [-20, 1.8]], 4.6, P, { holes: [[[-24, 5.2], [-28, 5.2], [-28, 3], [-24, 3]], [[-31, 5], [-35, 5], [-35, 3], [-31, 3]], [[-38, 4.8], [-42, 4.8], [-42, 3], [-38, 3]]] });   // heat shield
    prof([[-1, -2.6], [-15, -2.6], [-15, -17], [-1, -17]], 9, M.tan, { xo: -4.4, bevel: 1 });     // box magazine (left)
    prof([[-4, 7.6], [-6, 12], [-16, 12], [-18, 7.6], [-16, 7.6], [-15, 10.6], [-7, 10.6], [-6, 7.6]], 1.6, B);   // carry handle
    prof([[2, -3], [5.4, -3], [9.4, -13], [6.2, -14.2], [4, -13.6], [1.4, -4]], 3, P); guard(-3, 1.8, -3, 3.2, B); trigger(-1.2, -3, B);
    prof([[9, 5], [40, 3], [41, 3.2], [41, -11], [39.4, -11.4], [20, -2], [9, -2.6]], 4.4, P, { holes: [[[14, 3], [30, 1.8], [30, -1.2], [14, .4]]] });
  }
  return g;
}
// Knives (original models): Darja's ruby karambit and the default clip-point knife. Blades are real ground blades —
// thick flat sides, a separately lit bevel tapering to a sharp edge — built from a spine curve and an edge curve.
// Knife metal reflects a small painted sky / ground (no files), so polish and bevels catch the light.
const ENV = (() => { try {
  const face = (top, mid, bottom, sun) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); if (typeof g?.fillRect !== 'function') throw 0;
    const grd = g.createLinearGradient(0, 0, 0, 64); grd.addColorStop(0, top); grd.addColorStop(.5, mid); grd.addColorStop(.52, '#5a554e'); grd.addColorStop(1, bottom); g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    if (sun) { const r = g.createRadialGradient(40, 16, 0, 40, 16, 18); r.addColorStop(0, 'rgba(255,255,245,1)'); r.addColorStop(1, 'rgba(255,255,245,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); } return c; };
  const solid = col => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, 64, 64); return c; };
  const side = sun => face('#d8e8f6', '#a9b4bf', '#2c2925', sun);
  const t = new THREE.CubeTexture([side(true), side(false), solid('#f4f8ff'), solid('#24211e'), side(false), side(false)]); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
} catch { return null; } })();
const RUBY = surface(g => {
  const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#ff6d96'); grd.addColorStop(.45, '#e0204f'); grd.addColorStop(.5, '#9a0624'); grd.addColorStop(1, '#6a0016'); g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 80; i++) { const x = rnd() * 256, y = rnd() * 256, r = 8 + rnd() * 34, c = g.createRadialGradient(x, y, 0, x, y, r), hot = rnd() < .45;
    c.addColorStop(0, hot ? 'rgba(255,140,180,.55)' : 'rgba(60,0,12,.55)'); c.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = c; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  for (let i = 0; i < 30; i++) { g.strokeStyle = `rgba(255,${120 + rnd() * 80 | 0},${170 + rnd() * 60 | 0},${.12 + rnd() * .22})`; g.lineWidth = 1 + rnd() * 3; g.beginPath(); let x = rnd() * 256, y = rnd() * 256; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - .5) * 70; y += (rnd() - .5) * 40; g.lineTo(x, y); } g.stroke(); }
}, .18);
const G10 = surface(g => { noise(g, '#3a3e43', .14, 14000, 2, 2); for (let i = 0; i < 256; i += 4) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, i, 256, 1); g.fillRect(i, 0, 1, 256); } }, .82);
const SATIN = surface(g => { noise(g, '#9aa1a8', .06, 1500); for (let x = 0; x < 256; x++) { g.fillStyle = `rgba(255,255,255,${rnd() * .09})`; g.fillRect(x, 0, 1, 256); } }, .3);
const GRIP = surface(g => { noise(g, '#1d1f22', .1, 6000); for (let y = 0; y < 256; y += 8) for (let x = (y / 8 % 2) * 4; x < 256; x += 8) { g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x, y, 4, 4); } }, .86);
const knifeMat = (opts, tex, fallback) => { const m = new THREE.MeshStandardMaterial({ color: 0xffffff, envMap: ENV, ...opts, ...tex }); if (!tex.map) m.color.setHex(fallback); m.userData.shared = true; return m; };
const KM = {
  ruby: knifeMat({ metalness: .85, roughness: .12, envMapIntensity: 1.5, emissive: 0xffffff, emissiveMap: RUBY.map || null, emissiveIntensity: RUBY.map ? .18 : 0 }, RUBY, 0xc0123a),
  rubyBevel: knifeMat({ metalness: .85, roughness: .1, envMapIntensity: 1.4, color: 0xffd0dc, emissive: 0xffffff, emissiveMap: RUBY.map || null, emissiveIntensity: RUBY.map ? .26 : 0 }, RUBY, 0xff4f7a),
  g10: knifeMat({ metalness: .05, roughness: 1 }, G10, 0x3a3e43),
  satin: knifeMat({ metalness: .9, roughness: 1, envMapIntensity: 1 }, SATIN, 0x9aa1a8),
  edge: knifeMat({ metalness: 1, roughness: .18, envMapIntensity: .75, color: 0xc4cad0 }, {}, 0xc4cad0),
  fuller: knifeMat({ metalness: .9, roughness: .3, envMapIntensity: .6, color: 0x5d636a }, {}, 0x5d636a),
  dark: knifeMat({ metalness: .8, roughness: .35, color: 0x2a2d31 }, {}, 0x2a2d31),
  grip: knifeMat({ metalness: 0, roughness: 1 }, GRIP, 0x1d1f22),
};
if (!RUBY.map) KM.ruby.emissive.setHex(0x3a0008), KM.ruby.emissiveIntensity = 1;
// A ground blade from spine(t) and edge(t) ([z, y] cm, t 0 = base … 1 = tip). `th`: half thickness at the spine.
function groundBlade(g, spine, edge, { th = .21, grind = .5, flat, bevel, N = 36 }) {
  const C = v => v * CM, half = (f, t) => (f < grind ? th : th * (1 - (f - grind) / (1 - grind)) + .012) * (1 - .75 * t ** 3);
  const mesh = (pos, uv, idx, mat) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); };
  // One strip across the blade (fractions fs, spine → edge) on one side; separate strips keep the grind line crisp.
  const strip = (fs, side, mat) => { const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) { const t = i / N, S = spine(t), E = edge(t); for (const f of fs) { pos.push(C(side * half(f, t)), C(S[1] + (E[1] - S[1]) * f), C(S[0] + (E[0] - S[0]) * f)); uv.push(t, 1 - f); } }
    const w = fs.length; for (let i = 0; i < N; i++) for (let j = 0; j < w - 1; j++) { const a = i * w + j, b = a + w; side > 0 ? idx.push(a, b, a + 1, b, b + 1, a + 1) : idx.push(a, a + 1, b, b, a + 1, b + 1); }
    mesh(pos, uv, idx, mat); };
  for (const side of [1, -1]) { strip([0, grind / 2, grind], side, flat); strip([grind, (grind + 1) / 2, 1], side, bevel); }
  const pos = [], idx = []; for (let i = 0; i <= N; i++) { const t = i / N, S = spine(t), h = half(0, t); pos.push(C(h), C(S[1]), C(S[0]), C(-h), C(S[1]), C(S[0])); if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  mesh(pos, null, idx, flat);
}
// Side profile [[z, y], …] (cm) extruded `t` thick with rounded edges, centred on x = 0.
function slab(parent, pts, t, mat, bevel = .3, seg = 3) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z * CM, y * CM)));
  const geo = new THREE.ExtrudeGeometry(sh, { depth: Math.max(.01, t - 2 * bevel) * CM, bevelEnabled: true, bevelThickness: bevel * CM, bevelSize: bevel * .9 * CM, bevelSegments: seg, curveSegments: 8 });
  geo.rotateY(-Math.PI / 2); geo.translate((t / 2 - bevel) * CM, 0, 0); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); return m;
}
const cubic = (a, b, c, d) => t => [0, 1].map(k => (1 - t) ** 3 * a[k] + 3 * (1 - t) ** 2 * t * b[k] + 3 * (1 - t) * t * t * c[k] + t ** 3 * d[k]);
function karambit() {
  // Proportions traced from a side view (≈20 cm overall): a long crescent blade as long as the handle, bent ~50°
  // from a sculpted, rounded handle with three finger grooves, jimping before a flattened retention ring.
  const g = new THREE.Group(), C = v => v * CM, spl = pts => { const c = new THREE.SplineCurve(pts.map(([z, y]) => new THREE.Vector2(z, y))); return t => { const p = c.getPoint(t); return [p.x, p.y]; }; };
  const TIP = [-13, -.4];
  groundBlade(g, spl([[.6, 1.25], [-2.8, 2.45], [-6.1, 2.85], [-9, 2.4], [-11.2, 1.4], [-12.5, .35], TIP]), spl([[.6, -1.3], [-2.8, -.55], [-5.8, -.1], [-8.6, .05], [-10.9, -.1], [-12.3, -.3], TIP]), { th: .25, grind: .45, flat: KM.ruby, bevel: KM.rubyBevel, N: 48 });
  // Handle along its own axis (u, cm), turned down from the blade.
  const h = new THREE.Group(); h.rotation.x = 1.14; g.add(h);
  const L = 10.2, top = u => 1.3 - .25 * (u / L) ** 2 - (u > 6.6 && u < 9.4 ? .14 * ((u * 3.2) % 1 < .5 ? 1 : 0) : 0) - (u > L - 1 ? (u - L + 1) * .35 : 0),
    bottom = u => { let b = 1.25; if (u > .5 && u < 1.9) b += .7 * Math.sin((u - .5) / 1.4 * Math.PI); if (u > 2 && u < 8.6) b += .5 * (.5 - .5 * Math.cos((u - 2) / 6.6 * Math.PI * 6)); return b - (u > L - 1 ? (u - L + 1) * .3 : 0); },
    width = u => .95 - .1 * u / L;
  const NU = 72, NV = 28, U0 = -.8, pos = [], uv = [], idx = [];
  for (let i = 0; i <= NU; i++) { const u = U0 + i / NU * (L - U0), k = Math.sqrt(Math.min(1, (u - U0) / 1.1)) * .75 + .25, tp = top(u) * k, bt = bottom(u) * k, w = width(u) * (.6 + .4 * k), mid = (tp - bt) / 2, hh = (tp + bt) / 2;
    for (let j = 0; j <= NV; j++) { const a = j / NV * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), e = .38;   // rounded-rectangle (superellipse) section
      pos.push(C(w * Math.sign(c) * Math.abs(c) ** e), C(mid + hh * Math.sign(s) * Math.abs(s) ** e), C(u)); uv.push(u / 6, j / NV * 1.2); } }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); hg.setIndex(idx); hg.computeVertexNormals();
  const hm = new THREE.Mesh(hg, KM.g10); hm.castShadow = true; h.add(hm);
  // Flattened ruby ring.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(C(1.15), C(.42), 16, 40), KM.ruby); ring.rotation.y = Math.PI / 2; ring.scale.set(1, 1, 1.9); ring.position.set(0, C(-.1), C(L + .95)); h.add(ring);
  return g;
}
// Default knife: 17 cm clip-point blade (satin flats, polished bevel, fuller), steel guard, textured polymer
// handle with finger grooves, steel pommel.
function knife() {
  const g = new THREE.Group(), lerpPts = pts => { const c = new THREE.SplineCurve(pts.map(([z, y]) => new THREE.Vector2(z, y))); return t => { const p = c.getPoint(t); return [p.x, p.y]; }; };
  groundBlade(g, lerpPts([[0, 1.45], [-6, 1.5], [-11.2, 1.45], [-14.6, .95], [-17.4, .15]]), lerpPts([[0, -1.6], [-6, -1.65], [-11.5, -1.45], [-15.2, -.75], [-17.4, .15]]), { th: .26, grind: .42, flat: KM.satin, bevel: KM.edge });
  for (const x of [-1, 1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(7.5 * CM, .3 * CM), KM.fuller); f.rotation.y = x * Math.PI / 2; f.position.set(x * .262 * CM, .55 * CM, -5.6 * CM); g.add(f); }   // fuller
  slab(g, [[1.4, 2.1], [.3, 2.1], [.3, -2.5], [1.4, -2.5]], 2, KM.dark, .25);                       // guard
  const out = [[1.4, 1.35]]; out.push([7, 1.5], [12.4, 1.25], [12.8, .6]);
  out.push([12.8, -1.5]); for (let i = 0; i <= 30; i++) { const z = 12.2 - i / 30 * 10.6, s = Math.abs(Math.sin((12.2 - z) / 10.6 * Math.PI * 4)); out.push([z, -1.55 - .35 * s]); } out.push([1.4, -1.55]);
  slab(g, out, 2.5, KM.grip, .55, 4);
  slab(g, [[12.6, 1.35], [14.2, 1.1], [14.6, .2], [14.2, -1.4], [12.6, -1.6]], 2.3, KM.satin, .35);   // pommel
  return g;
}
// Realistic models (CC0 "Guns & Explosives" pack by 3dmodelscc0, public domain), converted by
// tools/pack-weapons.mjs to dist/models/weapons/. Loaded once in the background; until then (or if a file is
// missing) the procedural models above are used. FIT: [muzzle along +z in the file?, trigger (or grip) point in
// file cm [x, y, z], extra rotation, file units → cm `scale` when not cm, which texture maps exist when not all do].
const REAL_DIR = new URL('./models/weapons/', import.meta.url).href;
export const REAL_FIT = {
  ak: { at: [0, -5.5, 24] }, m4: { at: [0, -4, 2.5] }, sniper: { at: [0, -7.5, 23.5], rot: [-.19, 0, 0] }, shotgun: { at: [0, -4.5, 39] }, pistol: { at: [0, 1.5, -4.5] },
  karambit: { at: [0, 15, -37], scale: .055 },
  he: { at: [0, 5, 0] }, flash: { at: [0, -2, 0] }, smoke: { at: [0, -4, 0] }, molotov: { at: [0, 0, 0], maps: { bottle: ['base', 'orm'], fabric: ['base', 'normal'], liquid: ['base'] } }, c4: { at: [0, 2, 0] },
};
const real = new Map(); let realLoading = null;
async function loadReal(id) {
  const buf = await (await fetch(REAL_DIR + id + '.bin')).arrayBuffer(), dv = new DataView(buf), hl = dv.getUint32(0, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  let o = 4 + hl; const f32 = n => { const a = new Float32Array(buf.slice(o, o + n * 4)); o += n * 4; return a; };
  // Textures are decoded off the main thread (ImageBitmap), so uploading them never stalls a frame.
  const tex = (part, kind, srgb) => REAL_FIT[id]?.maps && !REAL_FIT[id].maps[part]?.includes(kind) ? Promise.resolve(null) : fetch(`${REAL_DIR}${id}-${part}-${kind}.jpg`).then(r => r.ok ? r.blob() : null).then(b => b && createImageBitmap(b, { imageOrientation: 'flipY' })).then(bmp => {
    if (!bmp) return null; const t = new THREE.Texture(bmp); t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t; }).catch(() => null);
  const g = new THREE.Group(), fit = REAL_FIT[id] || {}, inner = new THREE.Group(); g.add(inner);
  // Muzzle: centre of the vertices within 1 cm of the front end (file cm), for flashes and tracers.
  const zMin = head.box[0][2]; let my = 0, mx = 0, mn = 0;
  for (const pt of head.parts) {
    const P = f32(pt.count * 3); o -= pt.count * 12; for (let i = 0; i < P.length; i += 3) if (P[i + 2] < zMin + 1) { mx += P[i]; my += P[i + 1]; mn++; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(f32(pt.count * 3), 3)); geo.setAttribute('normal', new THREE.BufferAttribute(f32(pt.count * 3), 3)); geo.setAttribute('uv', new THREE.BufferAttribute(f32(pt.count * 2), 2));
    const [map, normalMap, orm] = await Promise.all([tex(pt.name, 'base', true), tex(pt.name, 'normal'), tex(pt.name, 'orm')]);
    const glass = id === 'molotov' && pt.name === 'bottle', mat = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap: orm, metalnessMap: orm, metalness: orm ? 1 : 0, roughness: 1, transparent: glass, opacity: glass ? .55 : 1, envMapIntensity: .9 });
    mat.userData.shared = true; geo.userData.shared = true; const m = new THREE.Mesh(geo, mat); m.castShadow = true; inner.add(m);
  }
  // centimetres → game units; muzzle along −z; trigger / grip at the origin.
  inner.position.set(-fit.at[0], -fit.at[1], -fit.at[2]); g.scale.setScalar(CM * (fit.scale || 1)); if (fit.flip) g.rotation.y = Math.PI; if (fit.rot) g.rotation.set(...fit.rot);
  const wrap = new THREE.Group(); wrap.add(g);
  if (mn && MUZZLE[id] && !['knife', 'karambit'].includes(id)) { g.updateMatrixWorld(true); const v = new THREE.Vector3(mx / mn, my / mn, zMin).applyMatrix4(inner.matrixWorld); wrap.userData.muzzle = v.toArray(); }
  return wrap;
}
// Start loading every realistic model (call once at startup; safe to call again). Resolves when all are ready.
export function loadRealWeapons() {
  if (typeof fetch !== 'function' || typeof document === 'undefined') return Promise.resolve(0);
  return realLoading ??= Promise.all(Object.keys(REAL_FIT).map(id => loadReal(id).then(m => { real.set(id, m); cache.delete(id); if (m.userData.muzzle) MUZZLE[id] = m.userData.muzzle; }, () => {}))).then(() => real.size);
}
export const hasReal = id => real.has(id);
const cache = new Map();
export function weaponModel(id, scale = 1) {
  if (real.has(id)) { const g = real.get(id).clone(); g.scale.setScalar(scale); return g; }
  if (['he', 'flash', 'smoke', 'molotov'].includes(id)) { if (!cache.has(id)) { const t = new THREE.Group(); t.add(new THREE.Mesh(new THREE.SphereGeometry(.28, 12, 10), M.black)); t.traverse(o => { if (o.geometry) o.geometry.userData.shared = true; }); cache.set(id, t); } const g = cache.get(id).clone(); g.scale.setScalar(scale); return g; }   // until the real grenade models are in
  if (id === 'cannon' || !['pistol', 'deagle', 'smg', 'shotgun', 'ak', 'm4', 'sniper', 'lmg', 'knife', 'karambit'].includes(id)) return pistolModel(scale);
  if (!cache.has(id)) { const t = id === 'karambit' ? karambit() : id === 'knife' ? knife() : build(id); t.traverse(o => { if (o.geometry) o.geometry.userData.shared = true; }); cache.set(id, t); }
  const g = cache.get(id).clone(); g.scale.setScalar(scale); return g;
}
// Where the muzzle is in model space (for flashes and tracers), per weapon.
export const MUZZLE = { knife: [0, .1, -1.3], karambit: [0, 0, -.6], pistol: [0, 2.6 * CM, -16.8 * CM], deagle: [0, 2.6 * CM, -23 * CM], cannon: [0, .17, -.65], smg: [0, 2.4 * CM, -47.5 * CM], shotgun: [0, 4 * CM, -66.5 * CM], ak: [0, 1.6 * CM, -58.5 * CM], m4: [0, 2.6 * CM, -50.5 * CM], sniper: [0, 4.2 * CM, -85.5 * CM], lmg: [0, 2.6 * CM, -67.5 * CM] };
// How the view model sits in front of the camera (pistols close and small, long guns lower and further back).
// Extra view-model turns, applied in order about the camera's axes ([axis, radians]). The karambit is held like
// CS2: handle across the fist, ring on the index finger, blade out to the right curling up and forward.
export const VIEW_ROT = { karambit: [['y', -Math.PI / 2], ['x', Math.PI], ['y', .18], ['z', .12]] };
export const VIEW = { c4: [.38, -.5, -.85, 1], he: [.42, -.42, -.85, 1.3], flash: [.42, -.42, -.85, 1.3], smoke: [.42, -.42, -.85, 1.2], molotov: [.42, -.44, -.85, 1.1], knife: [.55, -.5, -.9, .9], karambit: [.42, -.54, -.95, .72], pistol: [.5, -.55, -1.1, .62], deagle: [.5, -.55, -1.1, .55], cannon: [.62, -.62, -1.25, .55], smg: [.48, -.58, -1.1, .45], shotgun: [.46, -.56, -1.05, .34], ak: [.46, -.56, -1.05, .36], m4: [.46, -.55, -1.05, .38], sniper: [.44, -.54, -1.0, .32], lmg: [.48, -.6, -1.1, .34] };
