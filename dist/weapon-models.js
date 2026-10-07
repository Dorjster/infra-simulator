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
  if (id === 'pistol') { box(.17, .2, 1.05, M.black, 0, .14, -.1); box(.15, .1, .85, M.poly, 0, .0, -.12); tube(.04, .1, M.steel, 0, .15, -.62); grip(M.poly, .28);  details(.28, .26, -.55); }
  else if (id === 'deagle') { box(.22, .24, 1.35, M.steel, 0, .16, -.15); box(.19, .11, 1.1, M.black, 0, -.01, -.15); tube(.06, .1, M.black, 0, .17, -.83); grip(M.black, .35);  details(.35, .3, -.75); }
  else if (id === 'smg') { box(.22, .3, 2, M.black, 0, .14, -.5); tube(.05, .55, M.steel, 0, .16, -1.5); box(.12, .62, .16, M.steel, 0, -.32, -.65); grip(M.poly, .25); box(.08, .08, 1.0, M.steel, 0, .16, .95); box(.06, .3, .06, M.steel, 0, .02, 1.42);  details(.25, .3, -1.2); rail(1, .32, .6); }
  else if (id === 'shotgun') { tube(.075, 4.4, M.steel, 0, .2, -.2); tube(.06, 3.2, M.black, 0, .04, -.6); box(.2, .18, .9, M.wood, 0, .04, -1.9); box(.22, .3, 1.4, M.black, 0, .13, .05); grip(M.wood, .5); box(.2, .36, 1.6, M.wood, 0, -.02, 1.55, -.12);  details(.5, .31, -2.2); }
  else if (id === 'ak') { box(.22, .32, 2.2, M.black, 0, .14, -.1); tube(.05, 2.2, M.steel, 0, .2, -1.2); box(.24, .24, 1.1, M.wood, 0, .1, -1.6); const mag = box(.16, .8, .3, M.black, 0, -.38, -.45, .35); mag.position.z = -.55; grip(M.wood, .5); box(.2, .34, 1.7, M.wood, 0, -.02, 1.75, -.1); box(.04, .12, .05, M.steel, 0, .38, -3.25);  details(.5, .38, -3.2); }
  else if (id === 'm4') { box(.22, .34, 2.1, M.black, 0, .14, -.1); tube(.045, 2.3, M.black, 0, .2, -1.15); box(.26, .26, 1.3, M.poly, 0, .14, -1.65); box(.15, .72, .26, M.black, 0, -.36, -.45, .12); grip(M.poly, .5); box(.16, .3, 1.3, M.poly, 0, .05, 1.6); box(.12, .1, 1.5, M.black, 0, .38, -.5); box(.04, .15, .05, M.black, 0, .42, -2.3);  details(.5, .45, -2.2); rail(1.3, .45, .3); }
  else if (id === 'sniper') { box(.22, .3, 2.6, M.tan, 0, .12, .2); tube(.055, 4.4, M.black, 0, .2, -1.1); tube(.12, 1.6, M.black, 0, .55, .9); for (const z of [.85, -.75]) tube(.15, .25, M.black, 0, .55, z); { const lens = tube(.11, .02, M.glass, 0, .55, -.73); } box(.15, .5, .25, M.black, 0, -.3, -.3); grip(M.tan, .9); box(.2, .38, 1.8, M.tan, 0, .0, 2.3, -.05); box(.03, .7, .03, M.steel, .12, -.3, -2.8, .5); box(.03, .7, .03, M.steel, -.12, -.3, -2.8, .5);  details(.9, .32, -3.2); }
  else if (id === 'lmg') { box(.3, .4, 2.6, M.black, 0, .15, -.1); tube(.075, 2.6, M.steel, 0, .2, -1.4); box(.45, .5, .55, M.tan, .22, -.3, -.4); grip(M.poly, .6); box(.2, .36, 1.5, M.poly, 0, .02, 1.8); box(.03, .8, .03, M.steel, .14, -.35, -3.3, .45); box(.03, .8, .03, M.steel, -.14, -.35, -3.3, .45); box(.1, .1, .9, M.steel, 0, .44, -.3);  details(.6, .4, -3.1); rail(1, .5, .2); }
  else return pistolModel(scale);
  g.scale.setScalar(scale);
  return g;
}
// Where the muzzle is in model space (for flashes and tracers), per weapon.
export const MUZZLE = { pistol: [0, .15, -.7], deagle: [0, .17, -.95], cannon: [0, .17, -.65], smg: [0, .16, -2.1], shotgun: [0, .2, -2.45], ak: [0, .2, -2.35], m4: [0, .2, -2.35], sniper: [0, .2, -3.35], lmg: [0, .2, -2.75] };
// How the view model sits in front of the camera (pistols close and small, long guns lower and further back).
export const VIEW = { pistol: [.62, -.62, -1.25, .55], deagle: [.62, -.6, -1.25, .5], cannon: [.62, -.62, -1.25, .55], smg: [.55, -.58, -1.15, .4], shotgun: [.52, -.56, -1.15, .3], ak: [.5, -.56, -1.2, .3], m4: [.5, -.55, -1.2, .3], sniper: [.48, -.54, -1.15, .27], lmg: [.52, -.6, -1.2, .28] };
