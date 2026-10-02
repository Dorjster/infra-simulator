// Centre stage of the Payday casino: a round lit stage with a chrome pole and a performer in a sequinned
// show outfit (costumed, non-explicit). Idle she sways at the pole; a tip requests one of six dances that
// every engineer sees in step (the host's dance round + casino-sync clock). Procedural animation on a
// simple jointed figure — no external assets.
import * as THREE from './three.module.js';
import { startedAt } from './casino-sync.js';
import { DANCES, DANCE_MS } from './casino-logic.js';

export function createStage(parent, at, { hit } = {}) {
  const g = new THREE.Group(); g.position.set(at.x, 0, at.z); parent.add(g);
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .5, ...o });
  const add = (geo, m, x, y, z, p = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
  // Stage: two-tier round platform, LED edge, chrome pole, tip rail, spotlight rig.
  add(new THREE.CylinderGeometry(7.2, 7.4, .9, 48), mat(0x14060c), 0, .45, 0); add(new THREE.CylinderGeometry(5.6, 5.8, .5, 48), mat(0x1c0a12, { metalness: .3 }), 0, 1.15, 0);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xff3d8b }), leds = add(new THREE.TorusGeometry(7.25, .09, 6, 96), ledMat, 0, .92, 0); leds.rotation.x = Math.PI / 2;
  const led2 = add(new THREE.TorusGeometry(5.65, .07, 6, 96), ledMat, 0, 1.42, 0); led2.rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(.13, .13, 24, 16), new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: .9, roughness: .12, emissive: 0x303438 }), 0, 13.4, 0);
  add(new THREE.CylinderGeometry(.6, .6, .2, 20), mat(0xd8a945, { metalness: .6 }), 0, 1.5, 0);
  const railMat = mat(0xd8a945, { metalness: .6, roughness: .3, emissive: 0x2a1c06 }); add(new THREE.TorusGeometry(8.6, .12, 8, 96), railMat, 0, 4.2, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < .25) continue; add(new THREE.CylinderGeometry(.08, .08, 4.2, 8), railMat, Math.cos(a) * 8.6, 2.1, Math.sin(a) * 8.6); }
  const jar = add(new THREE.CylinderGeometry(.5, .45, 1.1, 16), new THREE.MeshStandardMaterial({ color: 0xcfeeff, transparent: true, opacity: .35 }), 0, 4.9, 8.6); const notes = add(new THREE.CylinderGeometry(.42, .42, .1, 16), mat(0x3a8f4a), 0, 4.4, 8.6);
  const spot = new THREE.SpotLight(0xff7ab0, 30, 40, .45, .6, 1.2); spot.position.set(0, 24, 6); spot.target.position.set(0, 2, 0); g.add(spot, spot.target);
  const beams = [0, 1, 2].map(i => { const b = add(new THREE.ConeGeometry(2.6, 20, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7ab0, transparent: true, opacity: .07, depthWrite: false, side: THREE.DoubleSide }), Math.cos(i * 2.1) * 3, 13, Math.sin(i * 2.1) * 3); return b; });
  if (hit) hit(19, 10, 19, at.x, at.z, { casino: 'table', table: 'stage' });

  // Performer: an athletic pole-fitness dancer (~1.70 m, ≈0.165 m per unit) in a patterned two-piece sports
  // set, barefoot, hair tied back. The body is ONE skinned mesh: torso, arms and legs are muscle-shaped lathes
  // whose vertices are weighted across neighbouring bones, so shoulders, elbows, hips and knees bend smoothly
  // like skin instead of showing separate pieces. Head, hands and feet ride on their bones. The bones keep the
  // joint names the dances use (hips, spine, neck, arms[s].sh/el, legs[s].hp/kn).
  const SKIN = 0xc98f6e, FAB_A = 0xd9cbb8, FAB_B = 0x2a2522, TRIM = 0x141212;
  const J = () => new THREE.Bone(), body = new THREE.Group(); g.add(body);
  const bone = (parent, x, y, z = 0) => { const b = J(); b.position.set(x, y, z); parent?.add(b); return b; };
  const hips = bone(null, 0, 5.55), spine = bone(hips, 0, .55), neck = bone(spine, 0, 2.95), headB = bone(neck, 0, .62);
  const arms = {}, legs = {}, wrists = {}, ankles = {};
  for (const s of [-1, 1]) {
    const sh = bone(spine, s * .74, 2.5), el = bone(sh, 0, -1.5); wrists[s] = bone(el, 0, -1.38); arms[s] = { sh, el };
    const hp = bone(hips, s * .4, -.3), kn = bone(hp, 0, -2.55); ankles[s] = bone(kn, 0, -2.42); legs[s] = { hp, kn };
  }
  const boneList = [hips, spine, neck, headB, arms[-1].sh, arms[-1].el, wrists[-1], arms[1].sh, arms[1].el, wrists[1], legs[-1].hp, legs[-1].kn, ankles[-1], legs[1].hp, legs[1].kn, ankles[1]];
  const BI = b => boneList.indexOf(b);
  // Geometry accumulator: lathed parts resampled into fine rows, with per-vertex colour and skin weights.
  const P = [], C = [], SI = [], SW = [], IX = []; const col = new THREE.Color();
  function part({ prof, at, sz = 1, sx = 1, seg = 26, color, weights }) {
    const ys = []; for (let i = 0; i < prof.length - 1; i++) { const [r0, y0] = prof[i], [r1, y1] = prof[i + 1], n = Math.max(1, Math.ceil(Math.abs(y1 - y0) / .05)); for (let k = 0; k < n; k++) { const t = k / n, u = t * t * (3 - 2 * t); ys.push([r0 + (r1 - r0) * (r0 && r1 ? t : u), y0 + (y1 - y0) * t]); } } ys.push(prof.at(-1));
    const base = P.length / 3;
    ys.forEach(([r, y]) => { for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2, x = Math.sin(a) * r * sx, z = Math.cos(a) * r * sz; P.push(at[0] + x, at[1] + y, at[2] + z); col.setHex(color(y, a, x, z)); C.push(col.r, col.g, col.b); const w = weights(y, x, z); const idx = [0, 0, 0, 0], wt = [0, 0, 0, 0]; w.slice(0, 4).forEach(([b, v], i) => { idx[i] = BI(b); wt[i] = v; }); const sum = wt.reduce((m, v) => m + v, 0) || 1; SI.push(...idx); SW.push(...wt.map(v => v / sum)); } });
    for (let i = 0; i < ys.length - 1; i++) for (let j = 0; j < seg; j++) { const p0 = base + i * (seg + 1) + j, p1 = p0 + seg + 1; IX.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1); }
  }
  const smooth = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a))), mixW = (b0, b1, t) => [[b0, 1 - t], [b1, t]];
  // Patterned fabric: a fine chevron in sand and charcoal, like a printed sports set.
  const chevron = (y, a) => ((Math.floor(y * 9 + Math.abs(Math.sin(a)) * 3) % 2) + 2) % 2 ? FAB_A : FAB_B;
  // Torso (hips bone space y): briefs, bare midriff, sports bra with a black under-band, shoulders, neck.
  part({ at: [0, 5.55, 0], sz: .64, seg: 32, prof: [[0, -.66], [.42, -.64], [.8, -.42], [.98, -.12], [1.0, .12], [.9, .55], [.76, 1.05], [.7, 1.45], [.74, 1.85], [.84, 2.3], [.88, 2.7], [.86, 3.0], [.74, 3.2], [.42, 3.36], [.22, 3.48], [.2, 3.8], [0, 3.86]],
    color: (y, a) => y < .32 ? (y > .2 ? TRIM : chevron(y, a)) : y < 1.9 ? SKIN : y < 2.02 ? TRIM : y < 2.72 ? chevron(y, a) : SKIN,
    weights: (y, x) => { const sp = smooth(y, .25, 1.0), nk = smooth(y, 3.2, 3.55); const out = nk > 0 ? mixW(spine, neck, nk) : sp < 1 ? mixW(hips, spine, sp) : [[spine, 1]]; if (y > 2.55 && y < 3.25 && Math.abs(x) > .5) out.push([arms[Math.sign(x)].sh, .45 * smooth(Math.abs(x), .5, .85)]); return out; } });
  for (const s of [-1, 1]) {
    const shY = 8.6, shX = s * .74, hipX = s * .4;
    // Upper arm (deltoid → biceps → elbow), forearm, thigh (glute/quad → knee), shin (calf → ankle).
    part({ at: [shX, shY, 0], sz: .95, prof: [[.2, .28], [.27, .02], [.23, -.45], [.2, -.95], [.165, -1.42], [.16, -1.6]], color: () => SKIN,
      weights: y => y > -.12 ? mixW(spine, arms[s].sh, .55 + smooth(-y, -.3, .12) * .45) : y < -1.25 ? mixW(arms[s].sh, arms[s].el, smooth(-y, 1.25, 1.62)) : [[arms[s].sh, 1]] });
    part({ at: [shX, shY - 1.5, 0], sz: .9, prof: [[.165, .12], [.18, -.3], [.15, -.75], [.1, -1.32], [.09, -1.46]], color: () => SKIN,
      weights: y => y > -.12 ? mixW(arms[s].sh, arms[s].el, .5 + smooth(-y, -.1, .12) * .5) : y < -1.2 ? mixW(arms[s].el, wrists[s], smooth(-y, 1.2, 1.42)) : [[arms[s].el, 1]] });
    part({ at: [hipX, 5.25, 0], sz: .96, prof: [[.36, .5], [.48, .2], [.5, -.3], [.45, -1.1], [.36, -1.9], [.28, -2.5], [.275, -2.66]],
      color: (y, a) => y > .16 ? chevron(y, a) : SKIN,
      weights: y => y > -.4 ? mixW(hips, legs[s].hp, .35 + smooth(-y, -.55, .4) * .65) : y < -2.25 ? mixW(legs[s].hp, legs[s].kn, smooth(-y, 2.25, 2.65)) : [[legs[s].hp, 1]] });
    part({ at: [hipX, 2.7, 0], sz: .95, prof: [[.275, .14], [.285, -.35], [.31, -.75], [.24, -1.35], [.15, -2.0], [.12, -2.38], [.11, -2.5]], color: () => SKIN,
      weights: y => y > -.15 ? mixW(legs[s].hp, legs[s].kn, .5 + smooth(-y, -.12, .15) * .5) : y < -2.2 ? mixW(legs[s].kn, ankles[s], smooth(-y, 2.2, 2.45)) : [[legs[s].kn, 1]] });
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4)); geo.setIndex(IX); geo.computeVertexNormals();
  const bodyMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .55, sheen: .4, sheenColor: 0xffd2bf, sheenRoughness: .7 });
  const skinMesh = new THREE.SkinnedMesh(geo, bodyMat); skinMesh.frustumCulled = false; skinMesh.add(hips); body.add(skinMesh);
  g.updateMatrixWorld(true); skinMesh.bind(new THREE.Skeleton(boneList));
  // Rigid parts on bones: bust (in the top), head with a modelled face and tied-back hair, hands, pointed bare feet.
  const skin = new THREE.MeshPhysicalMaterial({ color: SKIN, roughness: .55, sheen: .4, sheenColor: 0xffd2bf }), fabric = new THREE.MeshStandardMaterial({ roughness: .7, map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext?.('2d'); if (typeof x?.beginPath === 'function') { for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#2a2522' : '#d9cbb8'; x.beginPath(); x.moveTo(0, i * 8 - 16); x.lineTo(32, i * 8 - 8); x.lineTo(64, i * 8 - 16); x.lineTo(64, i * 8 - 8); x.lineTo(32, i * 8); x.lineTo(0, i * 8 - 8); x.fill(); } } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })() });
  for (const s of [-1, 1]) { const b = add(new THREE.SphereGeometry(.28, 18, 14), fabric, s * .29, 2.34, .34, spine); b.scale.set(1, .8, .62); }
  const hairM = new THREE.MeshPhysicalMaterial({ color: 0x5a3a22, roughness: .5, sheen: .6, sheenColor: 0xb8875a });
  const white = mat(0xf6f3ef, { roughness: .3 }), iris = mat(0x3d5a3a, { roughness: .2 }), lipM = new THREE.MeshPhysicalMaterial({ color: 0xb2525a, roughness: .35, clearcoat: .4 }), browM = mat(0x4a2f1c);
  const head = new THREE.Group(); headB.add(head);
  // Original face (not modelled on any real person): oval head, defined cheekbones and chin, almond eyes with
  // liner and lashes, arched brows, a slim nose and full lips.
  add(new THREE.SphereGeometry(.47, 32, 26), skin, 0, .04, -.02, head).scale.set(.78, 1, .9);
  add(new THREE.SphereGeometry(.32, 28, 22), skin, 0, -.2, .06, head).scale.set(.72, .95, .88);
  add(new THREE.SphereGeometry(.075, 14, 10), skin, 0, -.42, .22, head).scale.set(1, .75, .7);                                                     // chin
  for (const sx of [-1, 1]) add(new THREE.SphereGeometry(.09, 14, 10), skin, sx * .19, -.04, .27, head).scale.set(.9, .55, .45);                       // cheekbones
  const nose = add(new THREE.CapsuleGeometry(.035, .16, 4, 8), skin, 0, -.04, .44, head); nose.rotation.x = -.35; add(new THREE.SphereGeometry(.045, 10, 8), skin, 0, -.12, .47, head);
  const liner = mat(0x120c0a, { roughness: .4 }), shadow = mat(0x6e4a5a, { roughness: .8 });
  for (const sx of [-1, 1]) {
    add(new THREE.SphereGeometry(.07, 16, 10), white, sx * .15, .06, .37, head).scale.set(1.25, .52, .5); add(new THREE.SphereGeometry(.034, 12, 8), iris, sx * .15, .06, .405, head);
    add(new THREE.SphereGeometry(.015, 8, 6), mat(0x050505), sx * .15, .06, .422, head);
    const lid = add(new THREE.CapsuleGeometry(.014, .15, 3, 8), liner, sx * .155, .095, .4, head); lid.rotation.z = Math.PI / 2 + sx * .18;            // upper liner / lashes
    add(new THREE.CapsuleGeometry(.008, .05, 2, 4), liner, sx * .25, .1, .37, head).rotation.z = sx * -.9;                                           // winged tip
    add(new THREE.SphereGeometry(.08, 12, 8), shadow, sx * .15, .12, .35, head).scale.set(1.2, .45, .3);                                             // eyeshadow
    const brow = add(new THREE.CapsuleGeometry(.014, .14, 3, 6), browM, sx * .15, .19, .4, head); brow.rotation.z = Math.PI / 2 + sx * .25;
    add(new THREE.SphereGeometry(.06, 10, 8), skin, sx * .36, .0, -.03, head).scale.set(.4, 1, .7);
    add(new THREE.SphereGeometry(.028, 8, 6), mat(0xe8c35a, { metalness: .8, roughness: .2 }), sx * .37, -.11, -.01, head);
  }
  add(new THREE.SphereGeometry(.05, 14, 10), lipM, 0, -.2, .395, head).scale.set(1.45, .38, .5);                                                    // upper lip
  add(new THREE.SphereGeometry(.052, 14, 10), lipM, 0, -.238, .385, head).scale.set(1.3, .45, .5);                                                  // lower lip
  const hairCap = add(new THREE.SphereGeometry(.5, 28, 20, 0, Math.PI * 2, 0, Math.PI * .56), hairM, 0, .05, -.06, head); hairCap.scale.set(.86, 1.02, .98); hairCap.rotation.x = -.5;
  add(new THREE.TorusGeometry(.09, .04, 8, 16), mat(0x111111), 0, .38, -.38, head).rotation.x = .9;                                                   // hair tie
  const tail = new THREE.Group(); tail.position.set(0, .38, -.42); head.add(tail);                                                                          // high ponytail
  { const o = add(new THREE.LatheGeometry([[0, 0], [.13, -.05], [.2, -.4], [.16, -1.0], [.06, -1.35], [0, -1.4]].map(([r, y]) => new THREE.Vector2(r, y)), 18), hairM, 0, 0, 0, tail); o.scale.z = .7; }
  for (const s of [-1, 1]) {
    const h = new THREE.Group(); wrists[s].add(h); const palm = add(new THREE.SphereGeometry(.13, 14, 10), skin, 0, -.12, 0, h); palm.scale.set(.75, 1.2, .42);
    for (let f = 0; f < 4; f++) add(new THREE.CapsuleGeometry(.026, .17 - Math.abs(f - 1.5) * .02, 3, 6), skin, -.07 + f * .047, -.34, 0, h);
    add(new THREE.CapsuleGeometry(.03, .13, 3, 6), skin, s * -.1, -.16, .05, h).rotation.z = s * -.6;
    const foot = new THREE.Group(); ankles[s].add(foot); ankles[s].rotation.x = 1.0;                                                                      // pointed toes
    add(new THREE.SphereGeometry(.15, 14, 10), skin, 0, 0, 0, foot);
    const sole = add(new THREE.CapsuleGeometry(.12, .5, 6, 12), skin, 0, -.02, .3, foot); sole.rotation.x = Math.PI / 2; sole.scale.set(.85, 1, .7);
  }
  const set = (j, x = 0, y = 0, z = 0) => j.rotation.set(x, y, z);
  // Reach: a two-bone solver puts a hand (or foot) on a point of the pole. The hinge (elbow / knee) takes the
  // bend that gives the right distance, then the shoulder (hip) turns so the chain points at the target.
  const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion(), tv = [V(), V(), V(), V()], tq = [Q(), Q(), Q()];
  function reach(root, hinge, end, target, l1, l2, sign, tip = .22) {
    body.updateMatrixWorld(true);
    const P = root.getWorldPosition(tv[0]), d = Math.min(l1 + l2 - .02, Math.max(.4, P.distanceTo(target)));
    const inner = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2)))); hinge.rotation.set(sign * (Math.PI - inner), 0, 0);
    for (let k = 0; k < 3; k++) {
      root.updateMatrixWorld(true); const R = root.getWorldPosition(tv[0]), E = end.localToWorld(tv[1].set(0, -tip, 0));
      const q = tq[0].setFromUnitVectors(E.sub(R).normalize(), tv[2].copy(target).sub(R).normalize());
      const parentQ = root.parent.getWorldQuaternion(tq[1]), worldQ = root.getWorldQuaternion(tq[2]).premultiply(q);
      root.quaternion.copy(parentQ.invert().multiply(worldQ));
    }
  }
  const pole = h => g.localToWorld(new THREE.Vector3(0, h, 0)), grip = (s, h) => reach(arms[s].sh, arms[s].el, wrists[s], pole(h), 1.5, 1.38, -1, .2), hook = (s, h, off = .25) => reach(legs[s].hp, legs[s].kn, ankles[s], pole(h).add(new THREE.Vector3(0, 0, 0)), 2.55, 2.42, 1, off);
  // Poses (after the reference: pole hold, climb-and-sit, lay-back, body wave against the pole).
  // orbit = angle of the dancer around the pole (−π/2 faces the casino entrance); face = her turn on the spot.
  function pose(dance, t) {
    const w = Math.sin; let orbit = -Math.PI / 2, r = .95, y = 0, face = 0, grips = [], hooks = [];
    set(hips); set(spine); set(neck); set(tail, .12 + w(t * 3) * .08); for (const s of [-1, 1]) { set(arms[s].sh, 0, 0, s * .12); set(arms[s].el); set(legs[s].hp); set(legs[s].kn); }
    if (dance === 0) {                       // Pole spin: inner hand high, outer hand low, outer knee lifted, carried around the pole
      orbit = -Math.PI / 2 + t * 2.2; r = 1.05; y = .25 + w(t * 2.2) * .2; set(spine, 0, 0, -.25); set(neck, -.3, 0, -.2);
      set(legs[1].hp, -1.3, 0, .2); set(legs[1].kn, 1.6); set(legs[-1].hp, .25); set(legs[-1].kn, .2); grips = [[-1, 12.6 + y], [1, 8.6 + y]];
    } else if (dance === 1) {                // Climb & sit: climbs hand over hand, then sits with the legs wrapped, and slides down
      const p = t % 9, up = p < 4 ? p / 4 : p < 6.5 ? 1 : 1 - (p - 6.5) / 2.5; y = up * 4.6; r = .82; orbit = -Math.PI / 2 + (p > 6.5 ? (p - 6.5) * 1.8 : 0);
      set(spine, .2, 0, -.15); set(neck, .1, .3, 0); const climb = p < 4 ? w(p * 5) * .5 : 0;
      grips = [[-1, 12.2 + y + climb], [1, 10.4 + y - climb]]; set(legs[-1].hp, -1.35, 0, -.1); set(legs[-1].kn, 1.9); set(legs[1].hp, -.9, 0, .25); set(legs[1].kn, 2.1); hooks = [[-1, 4.1 + y, .35]];
    } else if (dance === 2) {                // Showgirl kicks downstage, hands free
      r = 3; face = Math.PI / 2; const k = Math.floor(t * 1.6) % 2 ? 1 : -1, ph = (t * 1.6) % 1;
      set(legs[k].hp, -Math.sin(ph * Math.PI) * 1.9); set(legs[-k].kn, .2); for (const s of [-1, 1]) set(arms[s].sh, 0, 0, s * (1.4 + w(t * 6 + s) * .5)); set(hips, 0, 0, w(t * 3.2) * .12);
    } else if (dance === 3) {                // Body wave against the pole: both hands high, ankles crossed, a slow wave through the body
      r = .85; face = Math.PI / 2 - .35; const wv = w(t * 2.2); set(hips, -wv * .12, 0, .08); set(spine, wv * .18, 0, -.06); set(neck, -wv * .2 - .15, -.3, 0);
      set(legs[-1].hp, .05, 0, -.12); set(legs[1].hp, -.05, 0, -.14); set(legs[1].kn, .25 + Math.max(0, wv) * .3); grips = [[-1, 12.9 + wv * .2], [1, 12.4 + wv * .2]];
    } else if (dance === 4) {                // Disco: point up, point down, hips side to side
      r = 2.8; face = Math.PI / 2; const up = Math.floor(t * 2) % 2 === 0; set(arms[1].sh, 0, 0, up ? 2.6 : .5); set(arms[1].el, up ? 0 : -1.2); set(arms[-1].sh, 0, 0, -.4); set(arms[-1].el, -1.4); set(hips, 0, 0, up ? .18 : -.18); set(legs[1].hp, 0, 0, .25); set(legs[-1].kn, up ? .4 : 0); set(neck, 0, up ? .3 : -.3);
    } else if (dance === 5) {                // Lay-back: hands high and low on the pole, body arched out, one knee raised; then a slow turn
      const p = t % 8, arch = Math.min(1, p / 1.5) * (p < 6 ? 1 : 1 - (p - 6) / 2); orbit = -Math.PI / 2 + (p > 6 ? (p - 6) * 1.5 : 0); r = 1.3 + arch * .6; face = Math.PI / 2 - .9 * arch;
      set(spine, -.55 * arch, 0, -.25 * arch); set(neck, -.6 * arch, .2, 0); set(legs[1].hp, -1.4 * arch, 0, .3); set(legs[1].kn, 1.9 * arch); set(legs[-1].hp, .35 * arch); set(legs[-1].kn, .3 * arch);
      grips = [[-1, 13 - arch * .4], [1, 6.6 + arch * .3]];
    } else {                                 // Idle pole hold: inner hand high, leaning away, outer knee against the pole, head back
      orbit = -Math.PI / 2 + w(t * .35) * .3; r = 1.0; const b = w(t * 1.3) * .5 + .5;
      set(arms[1].sh, -1.1, 0, -.4); set(arms[1].el, -1.9 - b * .2); set(spine, -.05, 0, -.24 - b * .05); set(neck, -.5 - b * .1, .25, -.15); set(hips, 0, 0, .1);
      set(legs[-1].hp, -.9, 0, -.15); set(legs[-1].kn, 1.4 + b * .15); set(legs[1].hp, .05, 0, .06); grips = [[-1, 12.7]];
    }
    body.position.set(Math.cos(orbit) * r, 1.4 + y, Math.sin(orbit) * r); body.rotation.y = -orbit + face;
    for (const [s, h] of grips) grip(s, h); for (const [s, h, off] of hooks) hook(s, h, off);
  }
  const signLines = []; let shownKey = '';
  function update(t, now, sign) {
    const active = t && t.dance >= 0 && Date.now() < t.until + 1000, dance = active ? t.dance : -1, t0 = active ? startedAt('st:' + t.round) : startedAt('st:idle'), e = (now - t0) / 1000;
    pose(dance, e);
    const hue = active ? (now / 3000) % 1 : .92; ledMat.color.setHSL(hue, .9, active ? .55 + Math.sin(now / 120) * .15 : .5); spot.color.setHSL(hue, .8, .65); beams.forEach((b, i) => { b.material.color.setHSL((hue + i * .2) % 1, .9, .6); b.material.opacity = active ? .1 : .05; b.rotation.z = Math.sin(now / 900 + i) * .25; });
    notes.scale.y = 1 + Math.min(8, (t?.tips || 0) / 200); notes.position.y = 4.4 + notes.scale.y * .05;
    const k = JSON.stringify([dance, t?.round, t?.queue?.length]); if (sign && k !== shownKey) { shownKey = k; sign(['Tip $20+ to request a dance', active ? DANCES[dance] + ' · for ' + t.by : 'Six dances · tips queue in order', t?.queue?.length ? 'Next: ' + t.queue.map(q => DANCES[q.dance]).join(', ') : 'Total tips tonight $' + (t?.tips || 0).toLocaleString('en-US')]); }
  }
  return { group: g, update, clearRadius: 9 };
}
export { DANCES, DANCE_MS };
