// cs2-render.js mergeGeometry: a CS2 look's meshes merged into one draw — each one's place baked into its points, its
// normals turned as the baked shader turns them, a mirrored one's triangles wound the other way (still facing out), its
// colour per vertex, the other attributes copied (interleaved ones too), and each mesh's span of vertices.
import * as THREE from '../dist/three.module.js';
import { mergeGeometry } from '../dist/cs2-render.js';
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' · ' + info : '')); };
const near = (a, b, e = 1e-5) => Math.abs(a - b) < e;
// One triangle facing +z (counter-clockwise seen from +z), with light-map UVs and a vertex colour.
const tri = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2)); g.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array([.1, .2, .3, .4, .5, .6]), 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Uint16Array([65535, 0, 0, 65535, 0, 65535, 0, 65535, 0, 0, 65535, 32768]), 4, true)); g.setIndex([0, 1, 2]); return g; };
const mesh = (g, color, m) => { const o = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color })); o.matrixAutoUpdate = false; o.matrix.copy(m); return o; };
const g = tri(), A = mesh(g, 0xff0000, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(10, 0, 0)), B = mesh(g, 0x0000ff, new THREE.Matrix4().makeScale(-1, 1, 1).setPosition(0, 5, 0));
const { geometry: M, spans } = mergeGeometry([A, B], true), P = M.attributes.position, N = M.attributes.normal, I = M.index.array, v = new THREE.Vector3();
check('spans: each mesh\'s vertices', JSON.stringify(spans) === '[[0,3],[3,3]]', JSON.stringify(spans));
let placed = true; for (const [o, at] of [[A, 0], [B, 3]]) for (let j = 0; j < 3; j++) { v.fromBufferAttribute(g.attributes.position, j).applyMatrix4(o.matrix); if (!near(P.getX(at + j), v.x) || !near(P.getY(at + j), v.y) || !near(P.getZ(at + j), v.z)) placed = false; }
check('points: each mesh\'s place baked in', placed);
check('normals turned by the matrix (a quarter turn round y: +z → +x)', near(N.getX(0), 1) && near(N.getY(0), 0) && near(N.getZ(0), 0), [N.getX(0), N.getY(0), N.getZ(0)].map(x => x.toFixed(3)).join(','));
// Facing: the merged triangle's winding (p1 − p0) × (p2 − p0) points along its normal, mirrored or not.
const face = t => { const a = new THREE.Vector3().fromBufferAttribute(P, I[t]), b = new THREE.Vector3().fromBufferAttribute(P, I[t + 1]), c = new THREE.Vector3().fromBufferAttribute(P, I[t + 2]); return b.sub(a).cross(c.sub(a)).normalize().dot(new THREE.Vector3().fromBufferAttribute(N, I[t])); };
check('the plain one still faces out', face(0) > .99, face(0).toFixed(3));
check('the mirrored one: wound the other way, still faces out', face(3) > .99 && I[4] === 5 && I[5] === 4, face(3).toFixed(3) + ' ' + Array.from(I.slice(3, 6)));
const T = M.attributes.tint; check('tint: each mesh\'s colour per vertex', T && T.normalized && T.getX(0) === 1 && T.getZ(0) === 0 && T.getX(3) === 0 && T.getZ(3) === 1, T ? [T.getX(0), T.getZ(0), T.getX(3), T.getZ(3)].join(',') : 'none');
check('light-map UVs, UVs and vertex colours copied as they were', near(M.attributes.uv1.getX(4), .3) && near(M.attributes.uv.getY(5), 1) && M.attributes.color.array instanceof Uint16Array && M.attributes.color.normalized && M.attributes.color.array[11 + 12] === 32768);
check('no tint when asked for none', !mergeGeometry([A, B], false).geometry.attributes.tint);
// An interleaved attribute (a glTF buffer view with a stride) is read through its accessor.
{ const h = tri(), ib = new THREE.InterleavedBuffer(new Float32Array([0, 0, 9, 1, 0, 9, 0, 1, 9]), 3); h.setAttribute('uv', new THREE.InterleavedBufferAttribute(ib, 2, 0)); const C = mesh(h, 0xffffff, new THREE.Matrix4()), D = mesh(tri(), 0xffffff, new THREE.Matrix4());
  D.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2)); const q = mergeGeometry([C, D], false).geometry.attributes.uv;
  check('an interleaved attribute copied through its accessor', q.itemSize === 2 && near(q.getX(1), 1) && near(q.getY(2), 1) && near(q.getX(4), 1), Array.from(q.array).join(',')); }
// Big merges index with 32 bits.
{ const big = new THREE.BufferGeometry(), n = 40000; big.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); big.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); const E = mesh(big, 0xffffff, new THREE.Matrix4());
  const r = mergeGeometry([E, E], false).geometry; check('over 65535 vertices: 32-bit indices', r.index.array instanceof Uint32Array && r.index.count === 2 * n - 2, r.index.count); }
console.log((fail ? 'FAIL' : 'PASS') + ': CS2 look merge · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1;
