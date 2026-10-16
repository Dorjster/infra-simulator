// Physics props of a Counter-Strike 2 map (its prop_physics: clay pots, cans, bottles, buckets, stools, cinder blocks —
// cs2-map.js props, bsp-map.js physProps): walked into, they are pushed aside; a bullet or a grenade's blast knocks them
// about; they slide, spin, tip over and settle on the floor; pottery and bottles shatter when shot. Each computer moves
// its own and only for the eye — never in a player's or a bullet's way (CS2 pushes its physics props aside and shoots
// through them). Per frame: no allocation (fixed arrays, scratch vectors).
import * as THREE from './three.module.js';

const U = 2.54 / 16.5;                       // game units per Hammer unit
const GRAVITY = 800 * U, BODY_R = 16 * U;     // CS2: 800 HU/s²; a player's half width, 16 HU
const FRICTION = 4.2, REST = .04, BOUNCE = .3, SPIN_DAMP = 2.5, TIP_SPEED = 3;   // (per second; units/s; of the speed; …)
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _ax = new THREE.Vector3(), NEAR = [];

// props: [{ i, model, mass, breaks, x, z, y, h, rx, rz }] (game units, relative to the map's centre cx, cz);
// pivots: Map(i → THREE.Group at the prop's foot, its look attached); floorAt(x, z, nearY) → the floor's height (game);
// blocked(x, z, y, h, r) → a wall there; onBreak(i, x, y, z, r) → a pot or bottle shattered (debris, sound);
// wake(i) → prop i is about to move or break (a CS2 look draws resting props merged: cs2-render.js propBatch).
export function createPhysProps(props, pivots, { cx = 0, cz = 0, floorAt = () => 0, blocked = () => false, onBreak = () => {}, wake = () => {} } = {}) {
  const n = props.length, S = new Float32Array(n * 12);   // per prop: x z y vx vz vy spin yaw tip tipDir tipping broken
  const R = new Float32Array(n), H = new Float32Array(n), M = new Float32Array(n), awake = new Uint8Array(n);
  const P = [], home = new Float32Array(n * 3);
  props.forEach((p, k) => { const o = k * 12; S[o] = cx + p.x; S[o + 1] = cz + p.z; S[o + 2] = p.y; home[k * 3] = S[o]; home[k * 3 + 1] = S[o + 1]; home[k * 3 + 2] = S[o + 2];
    R[k] = Math.max(.35, Math.min(4, Math.max(p.rx, p.rz))); H[k] = Math.max(.3, p.h); M[k] = Math.max(.2, Math.min(4, p.mass || 1)) * (/cinder|block|bucket|crate/i.test(p.model) ? 3 : 1); P.push(pivots.get(p.i) || null); });
  // A knock: velocity (units/s) added at the prop, a spin, and a tall thin one tips over away from it when hard enough.
  function knock(k, vx, vz, vy, hard) { const o = k * 12, m = M[k]; if (!awake[k]) wake(k); S[o + 3] += vx / m; S[o + 4] += vz / m; S[o + 5] = Math.max(S[o + 5], vy / m); S[o + 6] += (Math.random() - .5) * 14 * hard / m; awake[k] = 1;
    if (S[o + 10] === 0 && H[k] > R[k] * 1.4 && hard > .6) { S[o + 10] = 1; S[o + 9] = Math.atan2(vx, vz); } }
  function place(k) { const g = P[k]; if (!g) return; const o = k * 12; g.position.set(S[o], S[o + 2], S[o + 1]);
    _q.setFromAxisAngle(_ax.set(0, 1, 0), S[o + 7]);
    if (S[o + 8] > 0) { const d = S[o + 9]; _q2.setFromAxisAngle(_ax.set(Math.cos(d), 0, -Math.sin(d)), S[o + 8]); _q.premultiply(_q2); }
    g.quaternion.copy(_q); g.updateMatrixWorld(true); }
  return {
    count: n,
    // Bodies (players, bots): xyz feet triplets in `pos` (count of them): a prop they stand in is pushed out of the way.
    update(dt, pos, count) { if (!n) return; dt = Math.min(dt, .05);
      for (let b = 0; b < count; b++) { const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
        for (let k = 0; k < n; k++) { const o = k * 12; if (S[o + 11]) continue; const dx = S[o] - bx, dz = S[o + 1] - bz, r = R[k] + BODY_R; if (dx > r || dx < -r || dz > r || dz < -r) continue;
          if (S[o + 2] > by + 72 * U || S[o + 2] + H[k] < by - .3) continue; const d = Math.hypot(dx, dz); if (d >= r) continue;
          const ux = d > 1e-4 ? dx / d : Math.random() - .5, uz = d > 1e-4 ? dz / d : Math.random() - .5, push = (r - d) / dt * .6;
          knock(k, ux * push * M[k] * dt * 6, uz * push * M[k] * dt * 6, 0, push / 40); S[o] += ux * (r - d) * .5; S[o + 1] += uz * (r - d) * .5; } }
      for (let k = 0; k < n; k++) { if (!awake[k]) continue; const o = k * 12;
        let vx = S[o + 3], vz = S[o + 4], vy = S[o + 5]; const fl = floorAt(S[o] - cx, S[o + 1] - cz, S[o + 2] + 2), floor = Number.isFinite(fl) ? fl : S[o + 2];
        const nx = S[o] + vx * dt, nz = S[o + 1] + vz * dt;
        if (blocked(nx, nz, S[o + 2], H[k], R[k])) { if (!blocked(nx, S[o + 1], S[o + 2], H[k], R[k])) { S[o] = nx; vz = -vz * BOUNCE; } else if (!blocked(S[o], nz, S[o + 2], H[k], R[k])) { S[o + 1] = nz; vx = -vx * BOUNCE; } else { vx = -vx * BOUNCE; vz = -vz * BOUNCE; } }
        else { S[o] = nx; S[o + 1] = nz; }
        const air = S[o + 2] > floor + .02 || vy > 0;
        if (air) { vy -= GRAVITY * dt; S[o + 2] += vy * dt; if (S[o + 2] <= floor) { S[o + 2] = floor; vy = vy < -2 ? -vy * BOUNCE * .5 : 0; vx *= .7; vz *= .7; } }
        else { S[o + 2] = floor; vy = 0; const f = Math.exp(-FRICTION * dt); vx *= f; vz *= f; }
        S[o + 7] += S[o + 6] * dt; S[o + 6] *= Math.exp(-SPIN_DAMP * dt);
        if (S[o + 10] === 1) { S[o + 8] = Math.min(Math.PI / 2, S[o + 8] + TIP_SPEED * dt); if (S[o + 8] >= Math.PI / 2) S[o + 10] = 2; }   // tipping over: down on its side
        S[o + 3] = vx; S[o + 4] = vz; S[o + 5] = vy;
        if (!air && Math.abs(vx) + Math.abs(vz) < REST && Math.abs(S[o + 6]) < .05 && S[o + 10] !== 1) awake[k] = 0;
        place(k); } },
    // A shot along the ray (origin o, unit direction d) up to `far`: the first prop it passes through is knocked along it
    // (and shattered when it is pottery or glass). Returns that prop's index or −1.
    shot(ox, oy, oz, dx, dy, dz, far = 300, power = 1) { let best = -1, bt = far;
      for (let k = 0; k < n; k++) { const o = k * 12; if (S[o + 11]) continue; const cxk = S[o], cyk = S[o + 2] + H[k] / 2, czk = S[o + 1], r = Math.max(R[k], H[k] / 2);
        const px = cxk - ox, py = cyk - oy, pz = czk - oz, t = px * dx + py * dy + pz * dz; if (t < 0 || t > bt) continue;
        const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t; if (qx * qx + qy * qy + qz * qz > r * r) continue; best = k; bt = t; }
      if (best < 0) return -1; const k = best, o = k * 12;
      if (props[k].breaks) { wake(k); S[o + 11] = 1; awake[k] = 0; if (P[k]) P[k].visible = false; onBreak(k, S[o], S[o + 2] + H[k] / 2, S[o + 1], R[k]); return k; }
      knock(k, dx * 55 * power, dz * 55 * power, 6 + Math.max(0, dy) * 20, 1); return k; },
    // A grenade's blast at (x, y, z), radius r (game units): everything within is thrown outward (pots break near it).
    blast(x, y, z, r) { for (let k = 0; k < n; k++) { const o = k * 12; if (S[o + 11]) continue; const dx = S[o] - x, dz = S[o + 1] - z, dy = S[o + 2] - y, d = Math.hypot(dx, dy, dz); if (d > r) continue;
        const f = 1 - d / r; if (props[k].breaks && f > .45) { wake(k); S[o + 11] = 1; if (P[k]) P[k].visible = false; onBreak(k, S[o], S[o + 2] + H[k] / 2, S[o + 1], R[k]); continue; }
        const u = d > 1e-3 ? 1 / d : 0; knock(k, dx * u * 90 * f, dz * u * 90 * f, 20 * f, 1); } },
    // A new round: every prop back where the map put it, whole.
    reset() { for (let k = 0; k < n; k++) { const o = k * 12; S[o] = home[k * 3]; S[o + 1] = home[k * 3 + 1]; S[o + 2] = home[k * 3 + 2]; for (let j = 3; j < 12; j++) S[o + j] = 0; awake[k] = 0; if (P[k]) { P[k].visible = true; place(k); } } },
    // Is prop k moving (tests)? Its spot.
    awake: k => !!awake[k], at: k => [S[k * 12], S[k * 12 + 2], S[k * 12 + 1]], broken: k => !!S[k * 12 + 11],
  };
}
