// Repack a rigged Tripo export (Mixamo skeleton) as dist/models/dancer.glb (macOS: uses sips for textures).
//   node tools/pack-dancer.mjs <export.glb> dist/models/dancer.glb <scratch-dir>
// Repack the Tripo export for the game: rebuild bone TRS from the inverse bind matrices (Tripo left every
// joint node at the origin), shrink textures to 1K JPEG, drop the metallic-roughness map.
import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
import * as THREE from '../dist/three.module.js';
const [src, out, tmp] = process.argv.slice(2);
const b = fs.readFileSync(src), jl = b.readUInt32LE(12), j = JSON.parse(b.slice(20, 20 + jl)), bin = b.slice(20 + jl + 8);
const view = i => { const v = j.bufferViews[i]; return bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); };
const sk = j.skins[0], ia = j.accessors[sk.inverseBindMatrices], ibmBuf = view(ia.bufferView).slice(ia.byteOffset || 0);
const world = new Map(); sk.joints.forEach((n, k) => { const m = new THREE.Matrix4().fromArray(new Float32Array(ibmBuf.buffer.slice(ibmBuf.byteOffset + k * 64, ibmBuf.byteOffset + k * 64 + 64))); world.set(n, m.invert()); });
// Tripo's skeleton can sit turned about Y relative to the mesh. Find the mesh's front (nose: the furthest
// vertex forward at head height) and turn the skeleton so its left hand lies at up × front, then rewrite
// the inverse bind matrices to match.
{
  const prim = j.meshes[0].primitives[0], pa = j.accessors[prim.attributes.POSITION], pv = j.bufferViews[pa.bufferView], po = (pv.byteOffset || 0) + (pa.byteOffset || 0);
  const P = new Float32Array(bin.buffer.slice(bin.byteOffset + po, bin.byteOffset + po + pa.count * 12)), top = pa.max[1];
  let fz = 0, fx = 0; for (let v = 0; v < pa.count; v++) { const y = P[v * 3 + 1]; if (y < top * .86 || y > top * .93) continue; const x = P[v * 3], z = P[v * 3 + 2]; if (Math.abs(z) > Math.abs(fz) && Math.abs(x) < .03) fz = z; if (Math.abs(x) > Math.abs(fx) && Math.abs(z) < .03) fx = x; }
  const front = Math.abs(fz) >= Math.abs(fx) ? new THREE.Vector3(0, 0, Math.sign(fz)) : new THREE.Vector3(Math.sign(fx), 0, 0), left = new THREE.Vector3(0, 1, 0).cross(front);
  const lh = j.nodes.findIndex(n => /LeftHand$/.test(n.name)), lp = new THREE.Vector3().setFromMatrixPosition(world.get(lh)), hip = new THREE.Vector3().setFromMatrixPosition(world.get(sk.joints[0]));
  const rh = j.nodes.findIndex(n => /RightHand$/.test(n.name)), rp = new THREE.Vector3().setFromMatrixPosition(world.get(rh));
  const d = lp.sub(rp).setY(0).normalize(), turn = Math.round((Math.atan2(d.x, d.z) - Math.atan2(left.x, left.z)) / (Math.PI / 2)) * (Math.PI / 2);   // right→left hand onto left, snapped to 90°
  const R = new THREE.Matrix4().makeRotationY(-turn), C = new THREE.Vector3(hip.x, 0, hip.z);
  const M = new THREE.Matrix4().makeTranslation(C.x, 0, C.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-C.x, 0, -C.z));
  for (const [n, m] of world) world.set(n, M.clone().multiply(m));
  const dst = new Float32Array(bin.buffer, bin.byteOffset + (j.bufferViews[ia.bufferView].byteOffset || 0) + (ia.byteOffset || 0), sk.joints.length * 16);
  sk.joints.forEach((n, k) => world.get(n).clone().invert().toArray(dst, k * 16));
  console.log('front', front.toArray(), 'skeleton turned', (turn * 180 / Math.PI).toFixed(1), 'deg');
}
const parent = new Map(); j.nodes.forEach((n, i) => (n.children || []).forEach(c => parent.set(c, i)));
const W = i => world.get(i) || (parent.has(i) ? W(parent.get(i)) : new THREE.Matrix4());
let fixed = 0;
j.nodes.forEach((n, i) => { if (!world.has(i)) return; const pw = parent.has(parent.get(i)) || world.has(parent.get(i)) ? W(parent.get(i)) : new THREE.Matrix4(); const l = pw.clone().invert().multiply(world.get(i)); const t = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); l.decompose(t, q, s); n.translation = t.toArray(); n.rotation = q.toArray(); fixed++; });
// Skin weights: the export binds every vertex to Hips, so compute envelope weights from the bones (T-pose):
// each vertex takes its nearest bone segments (inverse-distance^6, up to 4), with arm bones limited to
// vertices outside the shoulder joint and leg bones to vertices below the hip joints on their own side.
{
  const prim = j.meshes[0].primitives[0], acc = k => { const a = j.accessors[k], v = j.bufferViews[a.bufferView]; return { a, off: (v.byteOffset || 0) + (a.byteOffset || 0) }; };
  const pos = acc(prim.attributes.POSITION), P = new Float32Array(bin.buffer.slice(bin.byteOffset + pos.off, bin.byteOffset + pos.off + pos.a.count * 12));
  const nameOf = i => j.nodes[i].name.replace(/^mixamorig:/, ''), idx = {}; sk.joints.forEach((n, k) => idx[nameOf(n)] = k);
  const at = nm => new THREE.Vector3().setFromMatrixPosition(world.get(sk.joints[idx[nm]]));
  const segs = [];
  const seg = (bone, a, b, kind) => segs.push({ k: idx[bone], a, b, kind });
  const chain = (names, kind) => { for (let i = 0; i < names.length - 1; i++) seg(names[i], at(names[i]), at(names[i + 1]), kind); };
  chain(['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'], 'torso');
  { const h = at('Head'), n = at('Neck'); seg('Head', h, h.clone().add(h.clone().sub(n).multiplyScalar(2.6)), 'torso'); }
  for (const side of ['Left', 'Right']) {
    const sh = at(side + 'Arm'), sx = Math.sign(sh.x);
    seg(side + 'Shoulder', at(side + 'Shoulder'), sh, 'torso');
    chain([side + 'Arm', side + 'ForeArm', side + 'Hand', side + 'HandMiddle1'], { arm: sx, x: Math.abs(sh.x) - .012 });
    for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) { const ns = [1, 2, 3, 4].map(i => side + 'Hand' + f + i).filter(n => idx[n] !== undefined); chain([side + 'Hand', ...ns].length > 1 ? ns : [], { arm: sx, x: Math.abs(sh.x) - .012 }); }
    const up = at(side + 'UpLeg'), lx = Math.sign(up.x);
    chain([side + 'UpLeg', side + 'Leg', side + 'Foot', side + 'ToeBase', side + 'ToeBase'].filter((n, i, a) => idx[n] !== undefined && a.indexOf(n) === i).concat(idx[side + 'Toe_End'] !== undefined ? [side + 'Toe_End'] : []), { leg: lx, y: up.y + .02 });
  }
  const tmp = new THREE.Vector3(), line = new THREE.Line3(), JN = new Uint16Array(pos.a.count * 4), WT = new Float32Array(pos.a.count * 4);
  for (let v = 0; v < pos.a.count; v++) {
    const p = new THREE.Vector3(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]), cand = [];
    for (const s of segs) {
      const kd = s.kind; if (kd.arm && (Math.sign(p.x) !== kd.arm || Math.abs(p.x) < kd.x)) continue; if (kd.leg && (p.y > kd.y || (Math.abs(p.x) > .02 && Math.sign(p.x) !== kd.leg))) continue;
      line.set(s.a, s.b); line.closestPointToPoint(p, true, tmp); cand.push([s.k, p.distanceTo(tmp)]);
    }
    const best = new Map(); for (const [k, d] of cand) if (!best.has(k) || d < best.get(k)) best.set(k, d);
    const top = [...best].sort((a, b) => a[1] - b[1]).slice(0, 4).map(([k, d]) => [k, 1 / Math.pow(d + .004, 6)]); const sum = top.reduce((m, [, w]) => m + w, 0);
    top.forEach(([k, w], i) => { JN[v * 4 + i] = k; WT[v * 4 + i] = w / sum; });
  }
  const write = (key, arr) => { const { a, off } = acc(prim.attributes[key]); const C = { 5123: Uint16Array, 5126: Float32Array, 5121: Uint8Array }[a.componentType]; const dst = new C(bin.buffer, bin.byteOffset + off, a.count * 4); dst.set(arr); delete a.max; delete a.min; };
  write('JOINTS_0', JN); write('WEIGHTS_0', WT);
  const used = new Set(JN); console.log('weights: segments', segs.length, 'joints used', used.size);
}
// End nodes (not joints): put them a short way past their parent along the parent's bone.
// Images -> 1K JPEG via sips.
const imgs = j.images.map((im, k) => { const f = `${tmp}/img${k}`; fs.writeFileSync(f, view(im.bufferView)); execFileSync('sips', ['-Z', '1024', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', f, '--out', f + '.jpg'], { stdio: 'ignore' }); return fs.readFileSync(f + '.jpg'); });
const mat = j.materials[0]; delete mat.pbrMetallicRoughness.metallicRoughnessTexture; mat.pbrMetallicRoughness.metallicFactor = 0; mat.pbrMetallicRoughness.roughnessFactor = .62;
const texOf = k => j.textures[k].source; const keep = [texOf(mat.pbrMetallicRoughness.baseColorTexture.index), texOf(mat.normalTexture.index)];
// Rebuild buffer: non-image views copied, kept images replaced.
const imageViews = new Set(j.images.map(im => im.bufferView)); const parts = []; let off = 0; const pad = () => { const p = (4 - off % 4) % 4; if (p) { parts.push(Buffer.alloc(p)); off += p; } };
const newViews = []; const remap = new Map();
j.bufferViews.forEach((v, i) => { if (imageViews.has(i)) return; pad(); const d = view(i); remap.set(i, newViews.length); newViews.push({ ...v, byteOffset: off }); parts.push(d); off += d.length; });
const newImages = keep.map(k => { pad(); const d = imgs[k]; newViews.push({ buffer: 0, byteOffset: off, byteLength: d.length }); parts.push(d); off += d.length; return { mimeType: 'image/jpeg', bufferView: newViews.length - 1 }; });
pad(); j.accessors.forEach(a => { if (a.bufferView !== undefined) a.bufferView = remap.get(a.bufferView); });
j.bufferViews = newViews; j.images = newImages; j.textures = [{ source: 0, sampler: 0 }, { source: 1, sampler: 0 }]; mat.pbrMetallicRoughness.baseColorTexture.index = 0; mat.normalTexture.index = 1;
j.buffers = [{ byteLength: off }]; j.asset.generator = 'Tripo (repacked for Infra Simulator)';
let js = Buffer.from(JSON.stringify(j)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]); const body = Buffer.concat(parts);
const hdr = Buffer.alloc(12); hdr.write('glTF', 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(12 + 8 + js.length + 8 + body.length, 8);
const ch = (len, type) => { const c = Buffer.alloc(8); c.writeUInt32LE(len, 0); c.write(type, 4); return c; };
fs.writeFileSync(out, Buffer.concat([hdr, ch(js.length, 'JSON'), js, ch(body.length, 'BIN\0'), body]));
console.log('bones fixed', fixed, 'size', fs.statSync(out).size);
