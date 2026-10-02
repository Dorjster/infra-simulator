// Structured cable routing: a cable leaves its port straight out, runs along the cabinet face to that
// cable type's vertical manager, climbs to the overhead tray, follows the row, and comes down the far
// cabinet the same way. Every bend is a short rounded corner, never a free-swinging spline. Each cable
// type has its own side of the cabinet and its own lane, so different colours never share a path (no
// flicker where tubes of two colours would overlap) and bundles read as tidy dressed runs.
import * as THREE from './three.module.js';

// Side of the cabinet (−1 left, +1 right) and lane within that side's manager / tray for each type.
const LANES = { mgmt: [-1, 0], cat6: [-1, 1], power: [-1, 2], fiber: [1, 0], os2: [1, 1], fc: [1, 2], dac: [1, 3], aoc: [1, 4] };
export const TRAY_Y = 13.14;
// Two overhead trays run behind the row: copper on the nearer one, fibre/DAC/AOC on the farther one.
export const TRAY_Z = { [-1]: -3.88, [1]: -4.43 };
const MANAGER_X = 1.63, FACE = 3.16, OUT = .32, LANE = .06, BEND = .22;

export function cableLane(type) { return LANES[type] || LANES.cat6; }

// pts: corner points; returns a dense polyline with rounded corners (5 samples per bend).
function rounded(pts, r = BEND) {
  const clean = pts.filter((p, i) => i === 0 || p.distanceToSquared(pts[i - 1]) > 1e-6);
  if (clean.length < 3) return clean;
  const out = [clean[0]], a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 1; i < clean.length - 1; i++) {
    const p0 = clean[i - 1], p1 = clean[i], p2 = clean[i + 1];
    a.subVectors(p1, p0); b.subVectors(p2, p1);
    const la = a.length(), lb = b.length(), rr = Math.min(r, la / 2, lb / 2);
    if (rr < 1e-3 || a.clone().normalize().dot(b.clone().normalize()) > .999) { out.push(p1.clone()); continue; }
    const s = p1.clone().addScaledVector(a, -rr / la), e = p1.clone().addScaledVector(b, rr / lb);
    for (let k = 0; k <= 4; k++) { const t = k / 4, u = 1 - t; out.push(new THREE.Vector3().addScaledVector(s, u * u).addScaledVector(p1, 2 * u * t).addScaledVector(e, t * t)); }
  }
  out.push(clean.at(-1));
  return out.filter((p, i, list) => i === 0 || p.distanceToSquared(list[i - 1]) > 1e-8);
}

// start/end: world positions of the two ports; sideA/sideB: 'front' | 'rear'; rackA/rackB: {x, z} or null.
// bundle: small integer that spreads cables of one type into a neat bundle instead of one tube.
export function routeCable({ start, end, sideA, sideB, rackA, rackB, type, bundle = 0 }) {
  const [side, lane] = cableLane(type), spread = ((bundle % 3) - 1) * .035;
  if (!rackA && !rackB) return rounded([start, new THREE.Vector3(start.x, Math.max(start.y, end.y), start.z), new THREE.Vector3(end.x, Math.max(start.y, end.y), end.z), end], .4);
  const ends = [[start, sideA, rackA], [end, sideB, rackB]].map(([p, face, rack]) => {
    if (!rack) return null;
    const dir = face === 'rear' ? -1 : 1, rz = rack.z || 0;
    const z = dir > 0 ? Math.max(p.z + .2, rz + FACE + OUT) + lane * LANE : Math.min(p.z - .2, rz - FACE - OUT) - lane * LANE;
    const x = rack.x + side * (MANAGER_X + spread);
    return { out: new THREE.Vector3(p.x, p.y, z), side: new THREE.Vector3(x, p.y, z), x, z };
  });
  const [A, B] = ends, pts = [start];
  if (A) pts.push(A.out, A.side);
  if (A && B && rackA === rackB) {
    // Same cabinet: along the manager to the other unit (through the side channel if the faces differ).
    pts.push(new THREE.Vector3(A.x, end.y, A.z));
    if (Math.abs(A.z - B.z) > 1e-3) pts.push(new THREE.Vector3(B.x, end.y, B.z));
  } else {
    const trayZ = TRAY_Z[side] + (lane - 1.5) * .07 + spread * .6, trayY = TRAY_Y + (bundle % 3) * .03;
    if (A) pts.push(new THREE.Vector3(A.x, trayY, A.z), new THREE.Vector3(A.x, trayY, trayZ));
    else pts.push(new THREE.Vector3(start.x, trayY, start.z), new THREE.Vector3(start.x, trayY, trayZ));
    if (B) pts.push(new THREE.Vector3(B.x, trayY, trayZ), new THREE.Vector3(B.x, trayY, B.z));
    else pts.push(new THREE.Vector3(end.x, trayY, trayZ), new THREE.Vector3(end.x, end.y, trayZ), new THREE.Vector3(end.x, end.y, end.z));
  }
  if (B) pts.push(B.side, B.out);
  pts.push(end);
  return rounded(pts);
}

// A tube along a polyline (parallel-transport frames): one ring per point, so straight runs cost nothing.
export function tubeGeometry(points, radius, radial = 5) {
  const n = points.length, pos = new Float32Array(n * (radial + 1) * 3), index = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if (i === 0) T.subVectors(points[1], points[0]).normalize();
    else if (i === n - 1) T.subVectors(points[i], points[i - 1]).normalize();
    else T.subVectors(points[i + 1], points[i]).normalize().add(v.subVectors(points[i], points[i - 1]).normalize()).normalize();
    if (i === 0) N.crossVectors(T, Math.abs(T.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    else { N.addScaledVector(T, -N.dot(T)); if (N.lengthSq() < 1e-8) N.crossVectors(T, new THREE.Vector3(1, 0, 0)); N.normalize(); }
    B.crossVectors(T, N);
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2, c = Math.cos(a) * radius, s = Math.sin(a) * radius, o = (i * (radial + 1) + j) * 3;
      pos[o] = points[i].x + N.x * c + B.x * s; pos[o + 1] = points[i].y + N.y * c + B.y * s; pos[o + 2] = points[i].z + N.z * c + B.z * s;
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; index.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(index); g.computeBoundingSphere();
  return g;
}

// A curve along the same polyline (traffic particles and anything else that samples the cable).
export function polylineCurve(points) {
  const path = new THREE.CurvePath();
  for (let i = 1; i < points.length; i++) path.add(new THREE.LineCurve3(points[i - 1], points[i]));
  return path;
}
