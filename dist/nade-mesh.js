// A CS2 map's grenade collision as triangles (the map file's nadeMesh section: tools/maps/nade-mesh.mjs) — grenades
// bounce off CS2's real surfaces: thin walls, slanted roofs, rails, ledges and corners as they are (arena-nades.js).
// contact(x, y, z, r, out): does a ball of radius r at (x, y, z) (Hammer units) touch a surface? out = [nx, ny, nz,
// depth]: the way out from the nearest surface point (a face's own direction on a face, round at an edge or a corner)
// and how far in. blocked(ax, ay, az, bx, by, bz, sightOnly): does the segment a→b cross a surface (sightOnly: only
// those that stop sight — a flash's light passes grenade clips, fences, grates and glass)? first(…): where a→b first
// crosses one (bullets: arena-maps.js). Pure, allocation-free (a fixed stack); the host and every client get the same answer.
const TIE = 1e-3;   // (first(): faces this close along the line, in the mesh's units — Hammer units — are at one point; over the bullets' step past a face, arena-maps.js FINE_EPS ≈ 6.5e-4)
export function createNadeMesh({ o, s, tri, box, links, sight = null }) {
  const ox = o[0], oy = o[1], oz = o[2], sx = s[0], sy = s[1], sz = s[2], stack = new Int32Array(96);
  let qx = 0, qy = 0, qz = 0;   // the closest point found by closest()
  // The point of triangle t nearest to (px, py, pz) into qx qy qz (Ericson, Real-Time Collision Detection 5.1.5).
  function closest(t, px, py, pz) {
    const k = t * 9, ax = ox + tri[k] * sx, ay = oy + tri[k + 1] * sy, az = oz + tri[k + 2] * sz, bx = ox + tri[k + 3] * sx, by = oy + tri[k + 4] * sy, bz = oz + tri[k + 5] * sz, cx = ox + tri[k + 6] * sx, cy = oy + tri[k + 7] * sy, cz = oz + tri[k + 8] * sz;
    const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az, apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz; if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; return; }
    const bpx = px - bx, bpy = py - by, bpz = pz - bz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz; if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; return; }
    const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + abx * v; qy = ay + aby * v; qz = az + abz * v; return; }
    const cpx = px - cx, cpy = py - cy, cpz = pz - cz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz; if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; return; }
    const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + acx * w; qy = ay + acy * w; qz = az + acz * w; return; }
    const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); qx = bx + (cx - bx) * w; qy = by + (cy - by) * w; qz = bz + (cz - bz) * w; return; }
    const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w;
  }
  function faceNormal(t, out) { const k = t * 9, ax = tri[k] * sx, ay = tri[k + 1] * sy, az = tri[k + 2] * sz, ux = tri[k + 3] * sx - ax, uy = tri[k + 4] * sy - ay, uz = tri[k + 5] * sz - az, vx = tri[k + 6] * sx - ax, vy = tri[k + 7] * sy - ay, vz = tri[k + 8] * sz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; out[0] = nx / l; out[1] = ny / l; out[2] = nz / l; }
  return {
    tris: tri.length / 9,
    contact(px, py, pz, r, out) {
      const x0 = Math.floor((px - r - ox) / sx), x1 = Math.ceil((px + r - ox) / sx), y0 = Math.floor((py - r - oy) / sy), y1 = Math.ceil((py + r - oy) / sy), z0 = Math.floor((pz - r - oz) / sz), z1 = Math.ceil((pz + r - oz) / sz);
      let best = r * r, bt = -1, bx = 0, by = 0, bz = 0, sp = 0; stack[sp++] = 0;
      while (sp > 0) { const n = stack[--sp], b = n * 6; if (box[b] > x1 || box[b + 3] < x0 || box[b + 1] > y1 || box[b + 4] < y0 || box[b + 2] > z1 || box[b + 5] < z0) continue;
        const a = links[n * 2], c = links[n * 2 + 1];
        if (c) { for (let t = a; t < a + c; t++) { closest(t, px, py, pz); const dx = px - qx, dy = py - qy, dz = pz - qz, d = dx * dx + dy * dy + dz * dz; if (d < best) { best = d; bt = t; bx = qx; by = qy; bz = qz; } } }
        else if (sp < 94) { stack[sp++] = a; stack[sp++] = n + 1; } }
      if (bt < 0) return false;
      const d = Math.sqrt(best); if (d > 1e-4) { out[0] = (px - bx) / d; out[1] = (py - by) / d; out[2] = (pz - bz) / d; } else faceNormal(bt, out);
      out[3] = r - d; return true; },
    blocked(ax, ay, az, bx, by, bz, sightOnly = false) {
      const dx = bx - ax, dy = by - ay, dz = bz - az, x0 = Math.floor((Math.min(ax, bx) - ox) / sx) - 1, x1 = Math.ceil((Math.max(ax, bx) - ox) / sx) + 1, y0 = Math.floor((Math.min(ay, by) - oy) / sy) - 1, y1 = Math.ceil((Math.max(ay, by) - oy) / sy) + 1, z0 = Math.floor((Math.min(az, bz) - oz) / sz) - 1, z1 = Math.ceil((Math.max(az, bz) - oz) / sz) + 1;
      const ix = 1 / (dx / sx || 1e-30), iy = 1 / (dy / sy || 1e-30), iz = 1 / (dz / sz || 1e-30), qax = (ax - ox) / sx, qay = (ay - oy) / sy, qaz = (az - oz) / sz; let sp = 0; stack[sp++] = 0;
      while (sp > 0) { const n = stack[--sp], b = n * 6; if (box[b] > x1 || box[b + 3] < x0 || box[b + 1] > y1 || box[b + 4] < y0 || box[b + 2] > z1 || box[b + 5] < z0) continue;
        // (the segment's slab test against the node's box, in the box's own quantized units)
        let t0 = 0, t1 = 1, ta = (box[b] - qax) * ix, tb = (box[b + 3] - qax) * ix; if (ta > tb) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
        ta = (box[b + 1] - qay) * iy; tb = (box[b + 4] - qay) * iy; if (ta > tb) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
        ta = (box[b + 2] - qaz) * iz; tb = (box[b + 5] - qaz) * iz; if (ta > tb) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) continue;
        const a = links[n * 2], c = links[n * 2 + 1];
        if (!c) { if (sp < 94) { stack[sp++] = a; stack[sp++] = n + 1; } continue; }
        for (let t = a; t < a + c; t++) { if (sightOnly && sight && !sight[t]) continue; const k = t * 9, Ax = ox + tri[k] * sx, Ay = oy + tri[k + 1] * sy, Az = oz + tri[k + 2] * sz;
          const e1x = ox + tri[k + 3] * sx - Ax, e1y = oy + tri[k + 4] * sy - Ay, e1z = oz + tri[k + 5] * sz - Az, e2x = ox + tri[k + 6] * sx - Ax, e2y = oy + tri[k + 7] * sy - Ay, e2z = oz + tri[k + 8] * sz - Az;
          const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz; if (det > -1e-9 && det < 1e-9) continue; const inv = 1 / det;
          const tx = ax - Ax, ty = ay - Ay, tz = az - Az, u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
          const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) continue;
          const w = (e2x * qx + e2y * qy + e2z * qz) * inv; if (w > 1e-6 && w < 1 - 1e-6) return true; } }
      return false; },
    // The nearest crossing on a→b: its fraction w (0…1 along the segment; Infinity: none) and, into out ([nx, ny, nz]),
    // the crossed triangle's unit normal — CS2's triangles face out of their solid (the first crossing from open space
    // faces the ray on 99.4–100 % of rays on all eight maps), so n·(b − a) > 0 means the segment is leaving a solid.
    // Two faces at one point (within TIE), one facing the ray and one away — hulls built face to face (a wall of two
    // brushes: one's exit is the other's entry), or an edge grazed — cross nothing on balance: the farther of the two is
    // returned and out[3] (when out has room) is 1, else 0; which one came first in the tree no longer decides it.
    // The bullets' fine phase (arena-maps.js bulletPath): where a wall really is inside its 16-unit collision box. Same
    // walk as blocked(), nodes past the best hit skipped; allocation-free.
    first(ax, ay, az, bx, by, bz, sightOnly = false, out = null) {
      const dx = bx - ax, dy = by - ay, dz = bz - az, x0 = Math.floor((Math.min(ax, bx) - ox) / sx) - 1, x1 = Math.ceil((Math.max(ax, bx) - ox) / sx) + 1, y0 = Math.floor((Math.min(ay, by) - oy) / sy) - 1, y1 = Math.ceil((Math.max(ay, by) - oy) / sy) + 1, z0 = Math.floor((Math.min(az, bz) - oz) / sz) - 1, z1 = Math.ceil((Math.max(az, bz) - oz) / sz) + 1;
      const ix = 1 / (dx / sx || 1e-30), iy = 1 / (dy / sy || 1e-30), iz = 1 / (dz / sz || 1e-30), qax = (ax - ox) / sx, qay = (ay - oy) / sy, qaz = (az - oz) / sz, tie = TIE / (Math.hypot(dx, dy, dz) || 1);
      let sp = 0, best = Infinity, wIn = Infinity, wOut = Infinity, tIn = -1, tOut = -1; stack[sp++] = 0;   // (the nearest face toward the ray — det > 0 — and away from it)
      while (sp > 0) { const n = stack[--sp], b = n * 6; if (box[b] > x1 || box[b + 3] < x0 || box[b + 1] > y1 || box[b + 4] < y0 || box[b + 2] > z1 || box[b + 5] < z0) continue;
        let t0 = 0, t1 = 1, ta = (box[b] - qax) * ix, tb = (box[b + 3] - qax) * ix; if (ta > tb) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
        ta = (box[b + 1] - qay) * iy; tb = (box[b + 4] - qay) * iy; if (ta > tb) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
        ta = (box[b + 2] - qaz) * iz; tb = (box[b + 5] - qaz) * iz; if (ta > tb) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1 || t0 > best + tie) continue;
        const a = links[n * 2], c = links[n * 2 + 1];
        if (!c) { if (sp < 94) { stack[sp++] = a; stack[sp++] = n + 1; } continue; }
        for (let t = a; t < a + c; t++) { if (sightOnly && sight && !sight[t]) continue; const k = t * 9, Ax = ox + tri[k] * sx, Ay = oy + tri[k + 1] * sy, Az = oz + tri[k + 2] * sz;
          const e1x = ox + tri[k + 3] * sx - Ax, e1y = oy + tri[k + 4] * sy - Ay, e1z = oz + tri[k + 5] * sz - Az, e2x = ox + tri[k + 6] * sx - Ax, e2y = oy + tri[k + 7] * sy - Ay, e2z = oz + tri[k + 8] * sz - Az;
          const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz; if (det > -1e-9 && det < 1e-9) continue; const inv = 1 / det;
          const tx = ax - Ax, ty = ay - Ay, tz = az - Az, u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
          const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) continue;
          const w = (e2x * qx + e2y * qy + e2z * qz) * inv; if (!(w > 1e-7 && w < 1)) continue;   // (n·d = −det: det < 0, a face away from the ray)
          if (det > 0) { if (w < wIn) { wIn = w; tIn = t; } } else if (w < wOut) { wOut = w; tOut = t; } if (w < best) best = w; } }
      const both = tIn >= 0 && tOut >= 0 && Math.abs(wIn - wOut) <= tie, w = both ? Math.max(wIn, wOut) : best;
      if (out) { if (w !== Infinity) faceNormal(both || wIn <= wOut ? tIn : tOut, out); if (out.length > 3) out[3] = both ? 1 : 0; } return w; },
    // The triangles whose bounds meet the box [x0, x1] × [y0, y1] × [z0, z1] (Hammer units), at most `max`: their corners
    // into out (9 numbers each) and whether each stops sight into flags (1 / 0). Returns how many (a collision view:
    // gd-collision-view.js).
    // Is any triangle's (sightOnly: any that stops sight) bounds within the box [x0, x1] × [y0, y1] × [z0, z1] (Hammer
    // units)? Allocation-free, stops at the first (arena-maps.js: a bullet box with none round it holds a surface the mesh
    // lost — its box stands, as before the fine phase).
    anyIn(x0, y0, z0, x1, y1, z1, sightOnly = false) {
      const qx0 = Math.floor((x0 - ox) / sx), qx1 = Math.ceil((x1 - ox) / sx), qy0 = Math.floor((y0 - oy) / sy), qy1 = Math.ceil((y1 - oy) / sy), qz0 = Math.floor((z0 - oz) / sz), qz1 = Math.ceil((z1 - oz) / sz); let sp = 0; stack[sp++] = 0;
      while (sp > 0) { const nd = stack[--sp], b = nd * 6; if (box[b] > qx1 || box[b + 3] < qx0 || box[b + 1] > qy1 || box[b + 4] < qy0 || box[b + 2] > qz1 || box[b + 5] < qz0) continue;
        const a = links[nd * 2], c = links[nd * 2 + 1];
        if (!c) { if (sp < 94) { stack[sp++] = a; stack[sp++] = nd + 1; } continue; }
        for (let t = a; t < a + c; t++) { if (sightOnly && sight && !sight[t]) continue; const k = t * 9;
          if (Math.min(tri[k], tri[k + 3], tri[k + 6]) > qx1 || Math.max(tri[k], tri[k + 3], tri[k + 6]) < qx0 || Math.min(tri[k + 1], tri[k + 4], tri[k + 7]) > qy1 || Math.max(tri[k + 1], tri[k + 4], tri[k + 7]) < qy0 || Math.min(tri[k + 2], tri[k + 5], tri[k + 8]) > qz1 || Math.max(tri[k + 2], tri[k + 5], tri[k + 8]) < qz0) continue;
          return true; } }
      return false; },
    trianglesIn(x0, y0, z0, x1, y1, z1, out, flags, max) {
      const qx0 = Math.floor((x0 - ox) / sx), qx1 = Math.ceil((x1 - ox) / sx), qy0 = Math.floor((y0 - oy) / sy), qy1 = Math.ceil((y1 - oy) / sy), qz0 = Math.floor((z0 - oz) / sz), qz1 = Math.ceil((z1 - oz) / sz); let sp = 0, n = 0; stack[sp++] = 0;
      while (sp > 0 && n < max) { const nd = stack[--sp], b = nd * 6; if (box[b] > qx1 || box[b + 3] < qx0 || box[b + 1] > qy1 || box[b + 4] < qy0 || box[b + 2] > qz1 || box[b + 5] < qz0) continue;
        const a = links[nd * 2], c = links[nd * 2 + 1];
        if (!c) { if (sp < 94) { stack[sp++] = a; stack[sp++] = nd + 1; } continue; }
        for (let t = a; t < a + c && n < max; t++) { const k = t * 9; let lo = Infinity, hi = -Infinity; for (let j = 0; j < 9; j += 3) { lo = Math.min(lo, tri[k + j]); hi = Math.max(hi, tri[k + j]); } if (lo > qx1 || hi < qx0) continue;
          lo = Infinity; hi = -Infinity; for (let j = 1; j < 9; j += 3) { lo = Math.min(lo, tri[k + j]); hi = Math.max(hi, tri[k + j]); } if (lo > qy1 || hi < qy0) continue;
          lo = Infinity; hi = -Infinity; for (let j = 2; j < 9; j += 3) { lo = Math.min(lo, tri[k + j]); hi = Math.max(hi, tri[k + j]); } if (lo > qz1 || hi < qz0) continue;
          for (let j = 0; j < 9; j += 3) { out[n * 9 + j] = ox + tri[k + j] * sx; out[n * 9 + j + 1] = oy + tri[k + j + 1] * sy; out[n * 9 + j + 2] = oz + tri[k + j + 2] * sz; } flags[n] = !sight || sight[t] ? 1 : 0; n++; } }
      return n; },
  };
}
