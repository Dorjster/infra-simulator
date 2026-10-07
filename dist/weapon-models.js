// Low-poly 3D models of the Payday weapons (original shapes, no real products). Muzzle points along −Z, the
// grip sits near the origin; 1 unit ≈ 16.5 cm like the rest of the game. Used for the first-person view model,
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

export function weaponModel(id, scale = 1) {
  if (id === 'cannon') return pistolModel(scale);
  const g = new THREE.Group();
  const box = (w, h, d, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
  const tube = (r, len, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z - len / 2); g.add(m); return m; };
  const grip = (mat, z = .25) => box(.16, .45, .24, mat, 0, -.24, z, -.25);
  // Details every gun gets: trigger guard, trigger, front and rear sights, ejection port.
  const details = (z = .25, top = .3, front = -.5) => { const tg = new THREE.Mesh(GUARD, M.black); tg.position.set(0, -.08, z - .2); tg.rotation.y = Math.PI / 2; g.add(tg); box(.03, .1, .03, M.steel, 0, -.06, z - .2, .3); box(.04, .06, .05, M.steel, 0, top, front); box(.1, .05, .04, M.steel, 0, top, z + .05); box(.012, .07, .18, M.steel, .1, top - .12, z - .45); };
  const rail = (len, y, z) => { for (let k = 0; k < len; k += .14) box(.13, .03, .07, M.black, 0, y, z - k); };
  // Shapes after the real guns (low-poly). Helpers: wedge = box tilted on x; curvedMag = segments that bend forward.
  const wedge = (w, h, d, mat, x, y, z, rx) => box(w, h, d, mat, x, y, z, rx);
  const curvedMag = (mat, x, y, z, n, seg, bend, w = .15, d = .3) => { let yy = y, zz = z, a = 0; for (let i = 0; i < n; i++) { const m = box(w, seg + .02, d, mat, x, yy - seg / 2, zz, -a); yy -= Math.cos(a) * seg; zz -= Math.sin(a) * seg; a += bend; } };
  const scope = (y, z, len, r) => { tube(r * .8, len, M.black, 0, y, z); tube(r * 1.25, .35, M.black, 0, y, z + len / 2 + .1); tube(r * 1.15, .35, M.black, 0, y, z - len / 2 + .2); tube(r * .7, .02, M.glass, 0, y, z - len / 2 - .15); for (const zz of [z + .4, z - .4]) box(.12, .22, .14, M.black, 0, y - .2, zz); };
  if (id === 'pistol') {            // Glock: blocky slide with rear serrations, polymer frame, accessory rail, flared magazine well
    box(.17, .19, 1.05, M.black, 0, .15, -.12); for (let i = 0; i < 5; i++) box(.18, .14, .02, M.steel, 0, .16, .25 + i * .045);
    box(.15, .1, .9, M.poly, 0, .0, -.15); box(.13, .03, .35, M.poly, 0, -.06, -.45); tube(.04, .06, M.steel, 0, .16, -.64);
    const gp = box(.16, .5, .25, M.poly, 0, -.27, .3, -.32); for (let i = 0; i < 3; i++) box(.165, .04, .26, M.poly, 0, -.15 - i * .11, .27 + i * .04, -.32); box(.19, .05, .29, M.poly, 0, -.52, .42, -.32);
    details(.28, .26, -.55);
  }
  else if (id === 'deagle') {       // Desert Eagle: tall triangular-profile slide, fixed barrel with top rib, big steel frame
    box(.22, .26, 1.4, M.steel, 0, .17, -.15); box(.16, .06, 1.4, M.steel, 0, .32, -.15); box(.2, .14, 1.15, M.black, 0, -.02, -.15);
    tube(.065, .12, M.black, 0, .17, -.85); for (let i = 0; i < 6; i++) box(.225, .17, .02, M.black, 0, .18, .32 + i * .04);
    box(.2, .55, .3, M.black, 0, -.3, .38, -.25); box(.22, .05, .33, M.steel, 0, -.58, .5, -.25); details(.36, .36, -.8);
  }
  else if (id === 'smg') {          // MP5: round receiver, slim curved magazine, chunky handguard, ring front sight, sliding stock
    tube(.11, 1.7, M.black, 0, .14, .7); box(.22, .22, .7, M.poly, 0, .08, -1.0); tube(.045, .35, M.steel, 0, .14, -1.35);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.07, .015, 6, 14), M.black); ring.position.set(0, .34, -1.25); g.add(ring); box(.03, .14, .03, M.black, 0, .27, -1.25);
    curvedMag(M.black, 0, -.02, -.32, 6, .13, .07, .12, .22); grip(M.poly, .32);
    box(.04, .04, 1.1, M.steel, .09, .14, 1.15); box(.04, .04, 1.1, M.steel, -.09, .14, 1.15); box(.22, .3, .06, M.black, 0, .05, 1.7); details(.32, .32, -1.15);
  }
  else if (id === 'shotgun') {      // Nova: long barrel over a magazine tube, ribbed pump, polymer stock with pistol grip
    tube(.075, 4.2, M.black, 0, .22, -.25); tube(.07, 3.0, M.black, 0, .05, -.65); box(.04, .03, 4.0, M.steel, 0, .31, -.25);
    const pump = box(.24, .22, 1.0, M.poly, 0, .06, -1.75); for (let i = 0; i < 8; i++) box(.25, .23, .03, M.poly, 0, .06, -2.15 + i * .12);
    box(.24, .32, 1.3, M.poly, 0, .14, .1); grip(M.poly, .55); box(.2, .38, 1.5, M.poly, 0, -.05, 1.5, -.15); box(.22, .42, .1, M.black, 0, -.13, 2.25, -.15); details(.55, .33, -2.3);
  }
  else if (id === 'ak') {           // AK-47: wooden handguard and stock, gas tube over the barrel, curved 30-round magazine, muzzle brake
    box(.22, .3, 1.7, M.black, 0, .13, .1); box(.2, .05, 1.5, M.black, 0, .3, .1);
    tube(.045, 2.0, M.steel, 0, .2, -1.0); tube(.055, .25, M.black, 0, .2, -3.0); tube(.05, 1.1, M.black, 0, .34, -1.3);
    box(.24, .22, 1.0, M.wood, 0, .1, -1.35); box(.2, .1, .9, M.wood, 0, .34, -1.25);
    box(.04, .2, .05, M.black, 0, .42, -2.85); box(.14, .06, .1, M.black, 0, .33, -2.85);
    curvedMag(M.black, 0, -.05, -.45, 7, .14, .09, .15, .3);
    grip(M.wood, .55); box(.2, .33, 1.6, M.wood, 0, -.02, 1.75, -.12); box(.22, .38, .08, M.black, 0, -.1, 2.52, -.12); details(.55, .38, -2.85);
  }
  else if (id === 'm4') {           // M4A1: flat-top receiver with rail, triangle front sight, round handguard, buffer tube and collapsible stock
    box(.22, .32, 1.5, M.black, 0, .15, .05); rail(1.4, .34, .7);
    tube(.1, 1.4, M.black, 0, .18, -1.25); for (let i = 0; i < 6; i++) tube(.105, .03, M.poly, 0, .18, -.7 - i * .2); tube(.04, 1.0, M.black, 0, .18, -2.0);
    box(.05, .32, .06, M.black, 0, .38, -2.35, -.3); tube(.05, .2, M.black, 0, .18, -2.95);
    curvedMag(M.black, 0, -.03, -.4, 6, .14, .03, .15, .28); grip(M.poly, .5);
    tube(.07, 1.0, M.black, 0, .14, 1.35); box(.2, .34, .7, M.poly, 0, .06, 1.75); box(.21, .38, .06, M.black, 0, .03, 2.1); details(.5, .45, -2.35);
  }
  else if (id === 'sniper') {       // AWP: long heavy barrel, large scope, green thumbhole stock, bolt handle, folded bipod
    const green = M.awp; box(.26, .32, 2.7, green, 0, .1, .3); tube(.07, 4.0, M.black, 0, .2, -1.4); tube(.085, .3, M.black, 0, .2, -3.3);
    scope(.58, .4, 1.9, .13); box(.16, .5, .3, M.black, 0, -.3, -.45);
    const bolt = tube(.03, .32, M.steel, .22, .28, .75); bolt.rotation.set(0, 0, Math.PI / 2); { const knob = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), M.steel); knob.position.set(.38, .28, .75); g.add(knob); }
    box(.24, .7, .3, green, 0, -.2, 1.15, -.4); box(.24, .5, 1.6, green, 0, .0, 2.1); box(.26, .2, 1.2, green, 0, -.3, 2.25); box(.26, .48, .1, M.black, 0, -.05, 2.9);
    box(.03, .03, .8, M.steel, .1, -.05, -1.9); box(.03, .03, .8, M.steel, -.1, -.05, -1.9); details(.9, .34, -3.2);
  }
  else if (id === 'lmg') {          // M249: box magazine on the side, carry handle, heat shield, bipod, skeleton stock
    box(.3, .4, 2.4, M.black, 0, .15, .0); tube(.07, 2.3, M.black, 0, .2, -1.5); tube(.08, .2, M.black, 0, .2, -2.75);
    box(.28, .16, 1.0, M.poly, 0, .3, -1.2); box(.5, .55, .6, M.tan, .25, -.2, -.25); box(.08, .2, .9, M.black, 0, .52, -.1); box(.08, .22, .08, M.black, 0, .42, .3); box(.08, .22, .08, M.black, 0, .42, -.5);
    grip(M.poly, .65); box(.2, .4, 1.4, M.poly, 0, .0, 1.85); box(.22, .1, 1.3, M.poly, 0, -.2, 1.85);
    for (const sx of [-1, 1]) { const leg = box(.035, .9, .035, M.steel, sx * .14, -.32, -2.1, .55); leg.rotation.z = sx * .15; } details(.65, .44, -2.8);
  }
  else return pistolModel(scale);
  g.scale.setScalar(scale);
  return g;
}
// Where the muzzle is in model space (for flashes and tracers), per weapon.
export const MUZZLE = { pistol: [0, .16, -.68], deagle: [0, .17, -.92], cannon: [0, .17, -.65], smg: [0, .14, -1.55], shotgun: [0, .22, -2.4], ak: [0, .2, -3.15], m4: [0, .18, -3.05], sniper: [0, .2, -3.48], lmg: [0, .2, -2.88] };
// How the view model sits in front of the camera (pistols close and small, long guns lower and further back).
export const VIEW = { pistol: [.62, -.62, -1.25, .55], deagle: [.62, -.6, -1.25, .5], cannon: [.62, -.62, -1.25, .55], smg: [.55, -.58, -1.15, .4], shotgun: [.52, -.56, -1.15, .3], ak: [.5, -.56, -1.2, .3], m4: [.5, -.55, -1.2, .3], sniper: [.48, -.54, -1.15, .27], lmg: [.52, -.6, -1.2, .28] };
