// Reader for Half-Life / Counter-Strike 1.6 player models (GoldSrc .mdl, version 10): skeleton, meshes, 8-bit
// textures and animation sequences. Used only for character models the player imports from their own computer
// (Settings → Arena characters); none are shipped with the game.
//   parseMdl(arrayBuffer) → plain data;  buildMdl(data) → { template, instance() } (three.js skinned meshes)
import * as THREE from './three.module.js';

const str = (dv, o, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = dv.getUint8(o + i); if (!c) break; s += String.fromCharCode(c); } return s; };
const vec = (dv, o) => [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)];

export function parseMdl(buf) {
  const dv = new DataView(buf), I = o => dv.getInt32(o, true);
  if (str(dv, 0, 4) !== 'IDST' || I(4) !== 10) throw Error('Not a GoldSrc (Half-Life / CS 1.6) model');
  const h = { name: str(dv, 8, 64), numbones: I(140), boneindex: I(144), numseq: I(164), seqindex: I(168), numseqgroups: I(172), numtextures: I(180), textureindex: I(184), numskinref: I(192), numskinfamilies: I(196), skinindex: I(200), numbodyparts: I(204), bodypartindex: I(208) };
  if (!h.numtextures) throw Error('This model keeps its textures in a separate file (…T.mdl) — import that file instead');
  const bones = []; for (let i = 0; i < h.numbones; i++) { const o = h.boneindex + i * 112, f = k => dv.getFloat32(o + k, true);
    bones.push({ name: str(dv, o, 32), parent: I(o + 32), value: [0, 1, 2, 3, 4, 5].map(j => f(64 + j * 4)), scale: [0, 1, 2, 3, 4, 5].map(j => f(88 + j * 4)) }); }
  const textures = []; for (let i = 0; i < h.numtextures; i++) { const o = h.textureindex + i * 80, w = I(o + 68), ht = I(o + 72), at = I(o + 76);
    textures.push({ name: str(dv, o, 64), flags: I(o + 64), w, h: ht, pixels: new Uint8Array(buf, at, w * ht), palette: new Uint8Array(buf, at + w * ht, 768) }); }
  const skins = []; for (let i = 0; i < h.numskinref; i++) skins.push(dv.getInt16(h.skinindex + i * 2, true));
  // Meshes: the first model of every body part (head, body…), as indexed triangles with one bone per vertex.
  const parts = [];
  for (let b = 0; b < h.numbodyparts; b++) {
    const bo = h.bodypartindex + b * 76, nummodels = I(bo + 64), modelindex = I(bo + 72); if (!nummodels) continue;
    const mo = modelindex, nummesh = I(mo + 72), meshindex = I(mo + 76), numverts = I(mo + 80), vinfo = I(mo + 84), vindex = I(mo + 88);
    const vb = new Uint8Array(buf, vinfo, numverts), vp = []; for (let v = 0; v < numverts; v++) vp.push(vec(dv, vindex + v * 12));
    for (let m = 0; m < nummesh; m++) {
      const me = meshindex + m * 20, tex = skins[I(me + 8)] ?? 0, T = textures[tex]; let p = I(me + 4); const tris = [];
      for (;;) { let n = dv.getInt16(p, true); p += 2; if (!n) break; const fan = n < 0; n = Math.abs(n); const vs = [];
        for (let k = 0; k < n; k++, p += 8) vs.push([dv.getInt16(p, true), dv.getInt16(p + 4, true), dv.getInt16(p + 6, true)]);
        for (let k = 2; k < n; k++) tris.push(fan ? [vs[0], vs[k - 1], vs[k]] : k % 2 ? [vs[k - 1], vs[k - 2], vs[k]] : [vs[k - 2], vs[k - 1], vs[k]]); }
      parts.push({ tex, tris: tris.map(t => t.map(([vi, s, tt]) => ({ p: vp[vi], bone: vb[vi], u: s / T.w, v: tt / T.h }))) });
    }
  }
  // Sequences (only those stored in this file): decoded to [frame][bone] = [x, y, z, rx, ry, rz].
  const seqs = [];
  for (let i = 0; i < h.numseq; i++) {
    const o = h.seqindex + i * 176, numframes = I(o + 56), motiontype = I(o + 68), numblends = I(o + 120), animindex = I(o + 124), group = I(o + 156);
    if (group !== 0) continue;
    const blends = []; for (let bl = 0; bl < numblends; bl++) {
      const frames = []; for (let f = 0; f < numframes; f++) {
        const fr = new Float32Array(h.numbones * 6);
        for (let bi = 0; bi < h.numbones; bi++) { const a = animindex + (bl * h.numbones + bi) * 12, B = bones[bi];
          for (let j = 0; j < 6; j++) { const off = dv.getUint16(a + j * 2, true); let val = 0;
            if (off) { let q = a + off, k = f; for (let guard = 0; guard < 4096 && dv.getUint8(q + 1) <= k; guard++) { const total = dv.getUint8(q + 1); if (!total) break; k -= total; q += (dv.getUint8(q) + 1) * 2; }
              const valid = dv.getUint8(q); val = dv.getInt16(q + (valid > k ? k + 1 : valid) * 2, true); }
            fr[bi * 6 + j] = B.value[j] + val * B.scale[j]; }
        }
        if (motiontype & 1) fr[0] = 0; if (motiontype & 2) fr[1] = 0;   // play movement in place (the game moves the player)
        frames.push(fr);
      }
      blends.push(frames);
    }
    seqs.push({ name: str(dv, o, 32).toLowerCase(), fps: dv.getFloat32(o + 32, true) || 30, loop: !!(I(o + 36) & 1), numframes, blends });
  }
  return { name: h.name, bones, textures, parts, seqs };
}

// Quake-style Euler angles → quaternion (GoldSrc AngleQuaternion).
function angleQuat(q, x, y, z) {
  const sr = Math.sin(x / 2), cr = Math.cos(x / 2), sp = Math.sin(y / 2), cp = Math.cos(y / 2), sy = Math.sin(z / 2), cy = Math.cos(z / 2);
  return q.set(sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy, cr * cp * cy + sr * sp * sy);
}
function texture(t) {
  const rgba = new Uint8Array(t.w * t.h * 4), masked = t.flags & 0x40;
  for (let i = 0; i < t.w * t.h; i++) { const c = t.pixels[i]; rgba[i * 4] = t.palette[c * 3]; rgba[i * 4 + 1] = t.palette[c * 3 + 1]; rgba[i * 4 + 2] = t.palette[c * 3 + 2]; rgba[i * 4 + 3] = masked && c === 255 ? 0 : 255; }
  const tx = new THREE.DataTexture(rgba, t.w, t.h); tx.colorSpace = THREE.SRGBColorSpace; tx.magFilter = THREE.LinearFilter; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.generateMipmaps = true; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.needsUpdate = true; return tx;
}
const SCALE = 1 / 6.5;   // game units per CS unit (a 72-unit CS player is ~11 game units tall)

export function buildMdl(data) {
  // Reference pose: frame 0 of the first sequence; vertices are stored in bone space, so bake them to model space.
  const nb = data.bones.length, ref = data.seqs[0]?.blends[0][0], q = new THREE.Quaternion(), world = [];
  for (let i = 0; i < nb; i++) { const f = ref ? ref.subarray(i * 6, i * 6 + 6) : data.bones[i].value; angleQuat(q, f[3], f[4], f[5]);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(f[0], f[1], f[2]), q, new THREE.Vector3(1, 1, 1)); const p = data.bones[i].parent; world.push(p >= 0 ? world[p].clone().multiply(m) : m); }
  const mats = data.textures.map(t => new THREE.MeshStandardMaterial({ map: texture(t), roughness: .85, metalness: 0, alphaTest: t.flags & 0x40 ? .5 : 0, side: THREE.DoubleSide }));
  const byTex = new Map(); for (const part of data.parts) { const list = byTex.get(part.tex) || byTex.set(part.tex, []).get(part.tex); list.push(...part.tris); }
  const geos = []; const v = new THREE.Vector3();
  for (const [tex, tris] of byTex) {
    const n = tris.length * 3, P = new Float32Array(n * 3), U = new Float32Array(n * 2), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4); let k = 0;
    for (const t of tris) for (const c of t) { v.set(...c.p).applyMatrix4(world[c.bone]); P.set([v.x, v.y, v.z], k * 3); U.set([c.u, c.v], k * 2); SI[k * 4] = c.bone; SW[k * 4] = 1; k++; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); g.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4)); g.computeVertexNormals(); g.computeBoundingSphere();
    geos.push({ g, mat: mats[tex] });
  }
  const inverses = world.map(m => m.clone().invert()), seqByName = new Map(data.seqs.map(s => [s.name, s]));
  const handBone = data.bones.findIndex(b => /r hand$/i.test(b.name));
  return {
    name: data.name, seqs: [...seqByName.keys()],
    // A posable copy (shares geometry and textures): .g goes into the scene, .update(dt, state) animates it.
    instance() {
      const bones = data.bones.map(b => Object.assign(new THREE.Bone(), { name: b.name })); bones.forEach((b, i) => { const p = data.bones[i].parent; if (p >= 0) bones[p].add(b); });
      const skeleton = new THREE.Skeleton(bones, inverses.map(m => m.clone())), root = new THREE.Group(), body = new THREE.Group();
      // GoldSrc is Z-up with the model facing +X; the game is Y-up and a player faces −Z.
      const turn = new THREE.Group(); turn.rotation.y = Math.PI / 2; body.rotation.x = -Math.PI / 2; body.scale.setScalar(SCALE); turn.add(body); root.add(turn);
      bones.filter((b, i) => data.bones[i].parent < 0).forEach(b => body.add(b));
      const meshes = geos.map(({ g, mat }) => { const m = new THREE.SkinnedMesh(g, mat); m.bind(skeleton, new THREE.Matrix4()); m.frustumCulled = false; m.castShadow = true; body.add(m); return m; });
      let cur = null, t = 0, upper = null, dead = 0;
      const all = data.bones.map((b, i) => i), pose = (fr, list = all) => { for (const i of list) { const o = i * 6; bones[i].position.set(fr[o], fr[o + 1], fr[o + 2]); angleQuat(bones[i].quaternion, fr[o + 3], fr[o + 4], fr[o + 5]); } };
      const frameOf = (s, time, blend = 0) => { const fs = s.blends[Math.min(blend, s.blends.length - 1)]; const f = s.loop ? Math.floor(time * s.fps) % s.numframes : Math.min(s.numframes - 1, Math.floor(time * s.fps)); return fs[f]; };
      const pick = (...names) => { for (const n of names) if (seqByName.has(n)) return seqByName.get(n); return data.seqs[0]; };
      const spine = data.bones.findIndex(b => /spine1$/i.test(b.name)) >= 0 ? data.bones.findIndex(b => /spine1$/i.test(b.name)) : data.bones.findIndex(b => /spine$/i.test(b.name));
      const upperBones = all.filter(i => { for (let j = i; j >= 0; j = data.bones[j].parent) if (j === spine) return true; return false; });
      const hand = new THREE.Group(); if (handBone >= 0) bones[handBone].add(hand);
      const lHand = data.bones.findIndex(b => /l hand$/i.test(b.name)), ground = data.bones.map((b, i) => /toe|foot|head|pelvis|hand/i.test(b.name) ? i : -1).filter(i => i >= 0), tmp = new THREE.Vector3();
      const local = (i, out) => { bones[i].getWorldPosition(out); return root.worldToLocal(out); };
      return {
        g: root, hand, meshes,
        // state: { speed, crouch, dead, aim: 'rifle' | 'pistol' | 'knife' | null }
        update(dt, s = {}) {
          let seq;
          if (s.dead) { seq = pick('death1', 'death2', 'die'); if (!dead) t = 0; dead = 1; }
          else { dead = 0; const run = s.speed > 11, walk = s.speed > 1.5;
            seq = s.crouch ? (walk ? pick('crouchrun', 'crouch_walk', 'crouch_idle') : pick('crouch_idle', 'crouch_aim_carbine')) : run ? pick('run', 'walk') : walk ? pick('walk', 'run') : pick('idle1', 'idle', 'look_idle'); }
          if (seq !== cur) { cur = seq; t = 0; } t += dt;
          pose(frameOf(cur, t));
          // Upper body holds the weapon (CS splits the model at the spine: legs run, arms aim).
          if (!s.dead && s.aim && spine > 0) { const a = s.crouch ? 'crouch_aim_' : 'ref_aim_', n = s.aim === 'knife' ? 'knife' : s.aim === 'pistol' ? 'onehanded' : s.aim === 'sniper' ? 'rifle' : 'ak47';
            const us = seqByName.get(a + n) || seqByName.get(a + 'carbine') || seqByName.get(a + 'rifle') || seqByName.get('ref_aim_' + n); if (us) { const fs = us.blends[Math.floor(us.blends.length / 2)], fr = fs[Math.floor(t * us.fps) % fs.length];   /* middle blend = aiming level */ pose(fr, upperBones); upper = us; } }
          // Stand on the floor: the model's origin is at the hips, so lift it until the lowest foot (or body part,
          // when lying dead) touches y = 0.
          turn.position.y = 0; root.updateMatrixWorld(true); let low = Infinity; for (const i of ground) low = Math.min(low, local(i, tmp).y); if (low < Infinity) { turn.position.y = -low + .25; root.updateMatrixWorld(true); }
        },
        // Right and left hand positions in the character's own space (for holding a gun).
        hands(r, l) { if (handBone < 0) return false; local(handBone, r); if (lHand >= 0) local(lHand, l); else l.copy(r); return true; },
        dispose() { root.removeFromParent(); },
      };
    },
  };
}
