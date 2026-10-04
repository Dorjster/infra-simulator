// Low-poly 3D models of the Payday weapons (original shapes, no real products). Muzzle points along −Z, the
// grip sits near the origin; 1 unit ≈ 16.5 cm like the rest of the game. Used for the first-person view model,
// the gun in other engineers' hands and the weapon market display.
import * as THREE from './three.module.js';
import { pistolModel } from './fun-pistol.js';

const M = {
  black: new THREE.MeshStandardMaterial({ color: 0x1c1e21, metalness: .45, roughness: .45 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x5c636b, metalness: .7, roughness: .3 }),
  poly: new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: .1, roughness: .7 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7a4321, metalness: 0, roughness: .6 }),
  tan: new THREE.MeshStandardMaterial({ color: 0x8b7a5a, metalness: .1, roughness: .7 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1d4e7a, metalness: .3, roughness: .1, emissive: 0x0a1c2c }),
};
for (const m of Object.values(M)) m.userData.shared = true;

export function weaponModel(id, scale = 1) {
  if (id === 'cannon') return pistolModel(scale);
  const g = new THREE.Group();
  const box = (w, h, d, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
  const tube = (r, len, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z - len / 2); g.add(m); return m; };
  const grip = (mat, z = .25) => box(.16, .45, .24, mat, 0, -.24, z, -.25);
  if (id === 'pistol') { box(.17, .2, 1.05, M.black, 0, .14, -.1); box(.15, .1, .85, M.poly, 0, .0, -.12); tube(.04, .1, M.steel, 0, .15, -.62); grip(M.poly, .28); }
  else if (id === 'deagle') { box(.22, .24, 1.35, M.steel, 0, .16, -.15); box(.19, .11, 1.1, M.black, 0, -.01, -.15); tube(.06, .1, M.black, 0, .17, -.83); grip(M.black, .35); }
  else if (id === 'smg') { box(.22, .3, 2, M.black, 0, .14, -.5); tube(.05, .55, M.steel, 0, .16, -1.5); box(.12, .62, .16, M.steel, 0, -.32, -.65); grip(M.poly, .25); box(.08, .08, 1.0, M.steel, 0, .16, .95); box(.06, .3, .06, M.steel, 0, .02, 1.42); }
  else if (id === 'shotgun') { tube(.075, 4.4, M.steel, 0, .2, -.2); tube(.06, 3.2, M.black, 0, .04, -.6); box(.2, .18, .9, M.wood, 0, .04, -1.9); box(.22, .3, 1.4, M.black, 0, .13, .05); grip(M.wood, .5); box(.2, .36, 1.6, M.wood, 0, -.02, 1.55, -.12); }
  else if (id === 'ak') { box(.22, .32, 2.2, M.black, 0, .14, -.1); tube(.05, 2.2, M.steel, 0, .2, -1.2); box(.24, .24, 1.1, M.wood, 0, .1, -1.6); const mag = box(.16, .8, .3, M.black, 0, -.38, -.45, .35); mag.position.z = -.55; grip(M.wood, .5); box(.2, .34, 1.7, M.wood, 0, -.02, 1.75, -.1); box(.04, .12, .05, M.steel, 0, .38, -3.25); }
  else if (id === 'm4') { box(.22, .34, 2.1, M.black, 0, .14, -.1); tube(.045, 2.3, M.black, 0, .2, -1.15); box(.26, .26, 1.3, M.poly, 0, .14, -1.65); box(.15, .72, .26, M.black, 0, -.36, -.45, .12); grip(M.poly, .5); box(.16, .3, 1.3, M.poly, 0, .05, 1.6); box(.12, .1, 1.5, M.black, 0, .38, -.5); box(.04, .15, .05, M.black, 0, .42, -2.3); }
  else if (id === 'sniper') { box(.22, .3, 2.6, M.tan, 0, .12, .2); tube(.055, 4.4, M.black, 0, .2, -1.1); tube(.12, 1.6, M.black, 0, .55, .9); for (const z of [.85, -.75]) tube(.15, .25, M.black, 0, .55, z); { const lens = tube(.11, .02, M.glass, 0, .55, -.73); } box(.15, .5, .25, M.black, 0, -.3, -.3); grip(M.tan, .9); box(.2, .38, 1.8, M.tan, 0, .0, 2.3, -.05); box(.03, .7, .03, M.steel, .12, -.3, -2.8, .5); box(.03, .7, .03, M.steel, -.12, -.3, -2.8, .5); }
  else if (id === 'lmg') { box(.3, .4, 2.6, M.black, 0, .15, -.1); tube(.075, 2.6, M.steel, 0, .2, -1.4); box(.45, .5, .55, M.tan, .22, -.3, -.4); grip(M.poly, .6); box(.2, .36, 1.5, M.poly, 0, .02, 1.8); box(.03, .8, .03, M.steel, .14, -.35, -3.3, .45); box(.03, .8, .03, M.steel, -.14, -.35, -3.3, .45); box(.1, .1, .9, M.steel, 0, .44, -.3); }
  else return pistolModel(scale);
  g.scale.setScalar(scale);
  return g;
}
// Where the muzzle is in model space (for flashes and tracers), per weapon.
export const MUZZLE = { pistol: [0, .15, -.7], deagle: [0, .17, -.95], cannon: [0, .17, -.65], smg: [0, .16, -2.1], shotgun: [0, .2, -2.45], ak: [0, .2, -2.35], m4: [0, .2, -2.35], sniper: [0, .2, -3.35], lmg: [0, .2, -2.75] };
// How the view model sits in front of the camera (pistols close and small, long guns lower and further back).
export const VIEW = { pistol: [.62, -.62, -1.25, .55], deagle: [.62, -.6, -1.25, .5], cannon: [.62, -.62, -1.25, .55], smg: [.55, -.6, -.9, .42], shotgun: [.55, -.62, -.6, .36], ak: [.55, -.62, -.55, .36], m4: [.55, -.6, -.55, .36], sniper: [.5, -.58, -.3, .32], lmg: [.55, -.66, -.55, .34] };
