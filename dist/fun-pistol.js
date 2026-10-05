// Darja's pistol: a just-for-fun toy. Only a player named Darja has it (key 4 to draw / holster, left
// click to fire). Each shot fires one glowing tracer (the shotgun a spread of pellets) with a muzzle flash,
// recoil and a bang; tracers leave sparks and small scorch marks that fade. Nothing in the facility is damaged.
// In Payday, engineers can also buy guns (weapons.js) and shots at other engineers take HP (combat-logic.js).
// The model is an original chrome "hand cannon" (long slide, black grip), not a copy of any real product.
import * as THREE from './three.module.js';

export const isDarja = name => /^\s*darja\s*$/i.test(String(name || ''));

const chrome = new THREE.MeshStandardMaterial({ color: 0xe8ebee, metalness: .55, roughness: .22, emissive: 0x2a2d31 });
const steel = new THREE.MeshStandardMaterial({ color: 0xb4bac0, metalness: .5, roughness: .3, emissive: 0x1c1f22 });
const grip = new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: .1, roughness: .85 });
const bore = new THREE.MeshBasicMaterial({ color: 0x050505 });
for (const m of [chrome, steel, grip, bore]) m.userData.shared = true;

// Length along −Z (the muzzle points forward), about 1 unit long at scale 1.
export function pistolModel(scale = 1) {
  const g = new THREE.Group(), add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  add(new THREE.BoxGeometry(.2, .2, 1.02), chrome, 0, .17, -.08);                       // slide
  add(new THREE.BoxGeometry(.21, .05, .5), steel, 0, .26, .1);                          // rear serrations band
  for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(.215, .13, .018), steel, 0, .18, .2 + i * .045);
  add(new THREE.BoxGeometry(.17, .09, .9), chrome, 0, .03, -.12);                        // frame / dust cover
  add(new THREE.CylinderGeometry(.055, .055, .04, 14), bore, 0, .17, -.6, Math.PI / 2);   // muzzle bore
  add(new THREE.BoxGeometry(.04, .05, .06), steel, 0, .3, -.52);                         // front sight
  add(new THREE.BoxGeometry(.12, .05, .05), steel, 0, .3, .38);                          // rear sight
  add(new THREE.BoxGeometry(.07, .12, .07), steel, 0, .27, .45, -.5);                    // hammer
  const guard = add(new THREE.TorusGeometry(.12, .02, 6, 16, Math.PI), chrome, 0, -.06, -.02, 0, Math.PI / 2, Math.PI);
  guard.scale.set(1, 1, 1.25);
  add(new THREE.BoxGeometry(.03, .1, .03), steel, 0, -.06, .0, .3);                      // trigger
  add(new THREE.BoxGeometry(.18, .5, .26), grip, 0, -.24, .3, -.28);                     // grip
  add(new THREE.BoxGeometry(.19, .05, .27), chrome, 0, -.48, .37, -.28);                  // magazine base
  g.scale.setScalar(scale);
  return g;
}

let audio = null;
function bang(volume = .5, pitch = 1) {
  try {
    audio ??= new AudioContext(); if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime, len = .35, buf = audio.createBuffer(1, audio.sampleRate * len, audio.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2);
    const noise = audio.createBufferSource(); noise.buffer = buf;
    const lp = audio.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(5200 * pitch, t); lp.frequency.exponentialRampToValueAtTime(380 * pitch, t + .25);
    const gain = audio.createGain(); gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(.001, t + len);
    const thump = audio.createOscillator(); thump.frequency.setValueAtTime(140 * pitch, t); thump.frequency.exponentialRampToValueAtTime(42 * pitch, t + .18);
    const tg = audio.createGain(); tg.gain.setValueAtTime(volume * .9, t); tg.gain.exponentialRampToValueAtTime(.001, t + .22);
    noise.connect(lp).connect(gain).connect(audio.destination); thump.connect(tg).connect(audio.destination);
    noise.start(t); thump.start(t); thump.stop(t + .25);
  } catch {}
}

const flashTexture = (() => { try { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fffbe8'); gr.addColorStop(.3, '#ffd36b'); gr.addColorStop(.7, 'rgba(255,120,30,.35)'); gr.addColorStop(1, 'rgba(255,90,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); } catch { return null; } })();

// scene effects shared by the local player and remote players' shots.
export function createPistolEffects(scene, { pickables = () => [] } = {}) {
  const pellets = [], sparks = [], marks = [], flashes = [], ray = new THREE.Raycaster(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), tmp = new THREE.Vector3();
  const pelletGeo = new THREE.CylinderGeometry(.02, .02, .9, 5).rotateX(Math.PI / 2), pelletMat = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: .95 });
  const sparkGeo = new THREE.BoxGeometry(.05, .05, .05), sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc35a }), markGeo = new THREE.CircleGeometry(.09, 10), markMat = new THREE.MeshBasicMaterial({ color: 0x141414, transparent: true, opacity: .8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  function hitPoint(origin, dir) {
    ray.set(origin, dir); ray.far = 120;
    const hits = ray.intersectObjects(pickables(), false).filter(h => { for (let o = h.object; o; o = o.parent) if (!o.visible) return false; return !h.object.userData?.link && h.object.material?.visible !== false; });   // invisible interaction zones don't stop bullets
    let best = hits[0] ? { point: hits[0].point.clone(), normal: hits[0].face ? hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld) : dir.clone().negate() } : null;
    if (ray.ray.intersectPlane(floor, tmp) && (!best || tmp.distanceTo(origin) < best.point.distanceTo(origin))) best = { point: tmp.clone(), normal: new THREE.Vector3(0, 1, 0) };
    return best || { point: origin.clone().addScaledVector(dir, 120), normal: null };
  }
  // One muzzle light for every shot, always in the scene (adding and removing lights recompiles every shader).
  const light = new THREE.PointLight(0xffc06a, 0, 9); light.userData.noPool = true; scene.add(light); let lightT = 1;
  function flash(at, dir, size = 1.1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.copy(at).addScaledVector(dir, .25); s.scale.setScalar(size); scene.add(s);
    light.position.copy(s.position); lightT = 0;
    flashes.push({ s, t: 0 });
  }
  // One shot: `count` pellets in a small cone from `origin` along `dir`.
  function shoot(origin, dir, { count = 1, spread = .008, volume = .5, pitch = 1, flashSize = 1.1, dirs = null } = {}) {
    flash(origin, dir, flashSize); bang(volume, pitch);
    if (dirs) { for (const d of dirs) { const hit = hitPoint(origin, d), mesh = new THREE.Mesh(pelletGeo, pelletMat); mesh.position.copy(origin); mesh.lookAt(origin.clone().add(d)); scene.add(mesh); pellets.push({ mesh, from: origin.clone(), dir: d, dist: hit.point.distanceTo(origin), travelled: 0, hit }); } return; }
    for (let i = 0; i < count; i++) {
      const d = dir.clone().add(new THREE.Vector3((Math.random() - .5) * 2, (Math.random() - .5) * 2, (Math.random() - .5) * 2).multiplyScalar(spread)).normalize();
      const hit = hitPoint(origin, d), mesh = new THREE.Mesh(pelletGeo, pelletMat);
      mesh.position.copy(origin); mesh.lookAt(origin.clone().add(d)); scene.add(mesh);
      pellets.push({ mesh, from: origin.clone(), dir: d, dist: hit.point.distanceTo(origin), travelled: 0, hit });
    }
  }
  function impact({ point, normal }) {
    if (!normal) return;
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(sparkGeo, sparkMat); m.position.copy(point); scene.add(m); sparks.push({ m, v: normal.clone().multiplyScalar(4 + Math.random() * 4).add(new THREE.Vector3((Math.random() - .5) * 6, Math.random() * 4, (Math.random() - .5) * 6)), t: 0 }); }
    const mark = new THREE.Mesh(markGeo, markMat.clone()); mark.position.copy(point).addScaledVector(normal, .012); mark.lookAt(point.clone().add(normal)); scene.add(mark); marks.push({ m: mark, t: 0 });
    while (marks.length > 60) { const old = marks.shift(); scene.remove(old.m); old.m.material.dispose(); }
  }
  function update(dt) {
    for (let i = pellets.length - 1; i >= 0; i--) { const p = pellets[i]; p.travelled += dt * 180; if (p.travelled >= p.dist) { impact(p.hit); scene.remove(p.mesh); pellets.splice(i, 1); continue; } p.mesh.position.copy(p.from).addScaledVector(p.dir, p.travelled); }
    for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.t += dt; s.v.y -= 30 * dt; s.m.position.addScaledVector(s.v, dt); s.m.scale.setScalar(Math.max(.01, 1 - s.t * 2.5)); if (s.t > .4) { scene.remove(s.m); sparks.splice(i, 1); } }
    for (let i = marks.length - 1; i >= 0; i--) { const k = marks[i]; k.t += dt; if (k.t > 6) k.m.material.opacity = Math.max(0, .8 - (k.t - 6) * .4); if (k.t > 8) { scene.remove(k.m); k.m.material.dispose(); marks.splice(i, 1); } }
    for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.t += dt; f.s.material.opacity = Math.max(0, 1 - f.t * 14); if (f.t > .08) { scene.remove(f.s); f.s.material.dispose(); flashes.splice(i, 1); } }
    lightT += dt; light.intensity = Math.max(0, 6 - lightT * 90);
  }
  return { shoot, update, hitPoint, get active() { return pellets.length + sparks.length + marks.length; } };
}

// The local player's pistol: a first-person view model on the camera, recoil and a fire-rate limit.
export function createPistol({ scene, camera, effects }) {
  const view = pistolModel(.55); view.position.set(.62, -.62, -1.25); view.rotation.y = .06; view.visible = false; camera.add(view);
  if (!camera.parent) scene.add(camera);
  let equipped = false, shots = 0, lastShot = 0, kick = 0;
  const muzzle = new THREE.Vector3(), dir = new THREE.Vector3();
  return {
    get equipped() { return equipped; }, get shots() { return shots; },
    equip(on) { equipped = !!on; view.visible = equipped; },
    fire() {
      if (!equipped || performance.now() - lastShot < 320) return false;
      lastShot = performance.now(); shots++; kick = 1;
      camera.getWorldDirection(dir); view.updateMatrixWorld(); muzzle.set(0, .17, -.65).applyMatrix4(view.matrixWorld);
      effects.shoot(muzzle, dir.clone(), { volume: .55 });
      return true;
    },
    update(dt) {
      if (!equipped) return; kick = Math.max(0, kick - dt * 7);
      view.position.z = -1.25 + kick * .22; view.rotation.x = kick * .45; view.position.y = -.62 + kick * .05;
    }
  };
}
