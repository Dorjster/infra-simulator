// What a Counter-Strike 2 look (cs2-render.js) takes out of its fixed surfaces, and how it sets its doors — pure, on
// plain arrays, so the render (once, at load) and the tests (tests/gd-doors-glass.mjs, on the look file) share it.
// The export merges each material's fixed surfaces across the whole map into one mesh, so a cut goes by pieces of it:
// islands (triangles joined where they share a corner, welded at a quarter unit) — a door's frame, a jamb, a trim, a
// door leaf each one island. Whole islands only: a cut triangle by triangle left slits (Nuke's Ramp silo doorways: a
// 1-unit slit down the frame; the duplicate-door cut took Nuke's and Cache's door frames, the frames sharing the doors'
// metal: 2–4 unit see-through strips round every door).

// Islands of a mesh: p — its corners (x y z each, any units), ia — its triangles, q — welding cells per unit (4 for a
// quarter Hammer unit in Hammer units). → { of: island per triangle, n: triangles per island, lo, hi: bounds (3 per island) }.
export function islandsOf(p, ia, q = 4) {
  const nv = p.length / 3, key = new Map(), weld = new Int32Array(nv);
  for (let v = 0; v < nv; v++) { const k = Math.round(p[v * 3] * q) + ',' + Math.round(p[v * 3 + 1] * q) + ',' + Math.round(p[v * 3 + 2] * q); let w = key.get(k); if (w === undefined) key.set(k, w = v); weld[v] = w; }
  const up = new Int32Array(nv); for (let v = 0; v < nv; v++) up[v] = v; const f = x => { while (up[x] !== x) x = up[x] = up[up[x]]; return x; };
  for (let t = 0; t < ia.length; t += 3) { const a = f(weld[ia[t]]); for (let c = 1; c < 3; c++) { const b = f(weld[ia[t + c]]); if (a !== b) up[b] = a; } }
  const of = new Int32Array(ia.length / 3), ids = new Map(), cnt = [], lo = [], hi = [];
  for (let t = 0; t < ia.length; t += 3) { const r = f(weld[ia[t]]); let k = ids.get(r); if (k === undefined) { ids.set(r, k = cnt.length); cnt.push(0); lo.push(Infinity, Infinity, Infinity); hi.push(-Infinity, -Infinity, -Infinity); }
    of[t / 3] = k; cnt[k]++; for (let c = 0; c < 3; c++) { const v = ia[t + c] * 3; for (let j = 0; j < 3; j++) { const x = p[v + j]; if (x < lo[k * 3 + j]) lo[k * 3 + j] = x; if (x > hi[k * 3 + j]) hi[k * 3 + j] = x; } } }
  return { of, n: Int32Array.from(cnt), lo: Float64Array.from(lo), hi: Float64Array.from(hi) };
}
// An island's size, smallest first.
export const sizeOf = (I, k) => [I.hi[k * 3] - I.lo[k * 3], I.hi[k * 3 + 1] - I.lo[k * 3 + 1], I.hi[k * 3 + 2] - I.lo[k * 3 + 2]].sort((a, b) => a - b);

// The duplicate-door cut (a mover's own model a second time as fixed scenery — Nuke's doors: CS2's copy of each stood
// swung open beside the doorway). g: the mesh's corners in game units (x, y up, z); ia: its triangles; near: the movers'
// spaces round it, [{ b: [minX, maxX, minZ, maxZ, y0, y1], shapes: [[s0, s1, s2]…] — the sizes of the mover's own islands,
// smallest first }]; pad: how far round a space counts (game units); tol: how close a size must be (game units).
// An island goes only when it lies wholly in one space and is shaped like one of that mover's own islands (the copy of
// the leaf, its handle, its window) — the frame, the jambs, the trims and the threshold round it (the same material)
// stay. → Uint8Array, 1 a triangle that goes (null: none).
export function dupCut(g, ia, near, pad, tol) {
  const nt = ia.length / 3; let any = false; const cand = new Int16Array(nt).fill(-1);
  for (let t = 0; t < nt; t++) { let sx = 0, sy = 0, sz = 0; for (let c = 0; c < 3; c++) { const v = ia[t * 3 + c] * 3; sx += g[v]; sy += g[v + 1]; sz += g[v + 2]; } sx /= 3; sy /= 3; sz /= 3;
    for (let i = 0; i < near.length; i++) { const b = near[i].b; if (sx >= b[0] - pad && sx <= b[1] + pad && sz >= b[2] - pad && sz <= b[3] + pad && sy >= b[4] - pad && sy <= b[5] + pad) { cand[t] = i; any = true; break; } } }
  if (!any) return null; const I = islandsOf(g, ia, 4 / tol), hit = new Int32Array(I.n.length), go = new Uint8Array(I.n.length);
  for (let t = 0; t < nt; t++) if (cand[t] >= 0) hit[I.of[t]]++;
  for (let k = 0; k < I.n.length; k++) { if (hit[k] !== I.n[k]) continue; const s = sizeOf(I, k);
    for (const o of near) { const b = o.b; if (I.lo[k * 3] < b[0] - pad || I.hi[k * 3] > b[1] + pad || I.lo[k * 3 + 2] < b[2] - pad || I.hi[k * 3 + 2] > b[3] + pad || I.lo[k * 3 + 1] < b[4] - pad || I.hi[k * 3 + 1] > b[5] + pad) continue;
      if (o.shapes.some(d => Math.abs(d[0] - s[0]) <= tol && Math.abs(d[1] - s[1]) <= tol && Math.abs(d[2] - s[2]) <= tol)) { go[k] = 1; break; } } }
  const out = new Uint8Array(nt); let n = 0; for (let t = 0; t < nt; t++) if (go[I.of[t]]) { out[t] = 1; n++; } return n ? out : null;
}

// Another game mode's walls and props (bsp-map.js modeOffHit: a triangle with all its corners in one of the entities'
// boxes, Hammer units): an island goes when every one of its triangles is such — a piece of a bigger island (a frame
// reaching past the box, the door beside it) stays whole. h: the corners in Hammer units; → Uint8Array (null: none).
export function modeCut(h, ia, L, hitFn) {
  const nt = ia.length / 3, hit = new Uint8Array(nt), t9 = new Float64Array(9); let any = false;
  for (let t = 0; t < nt; t++) { for (let c = 0; c < 3; c++) { const v = ia[t * 3 + c] * 3; t9[c * 3] = h[v]; t9[c * 3 + 1] = h[v + 1]; t9[c * 3 + 2] = h[v + 2]; } if (hitFn(L, t9)) { hit[t] = 1; any = true; } }
  if (!any) return null; const I = islandsOf(h, ia, 4), c = new Int32Array(I.n.length); for (let t = 0; t < nt; t++) if (hit[t]) c[I.of[t]]++;
  const out = new Uint8Array(nt); let n = 0; for (let t = 0; t < nt; t++) if (c[I.of[t]] === I.n[I.of[t]]) { out[t] = 1; n++; } return n ? out : null;
}

// A door whose look stands another way than its collision (Overpass's metal door: its model's up is its own x, so the
// export drew it lying on the floor across the doorway while its collision stood shut in it): the quarter turn about an
// axis through the hinge that sets the look's box on the collision's box. look, box: [minX, maxX, minZ, maxZ, y0, y1]
// (game units), hinge: [x, y, z]. → { axis: 'x' | 'y' | 'z', angle } or null when the look already fits (within `tol`
// on every side) or no quarter turn fits it.
export function doorTurn(look, box, hinge, tol) {
  const err = b => Math.max(Math.abs(b[0] - box[0]), Math.abs(b[1] - box[1]), Math.abs(b[2] - box[2]), Math.abs(b[3] - box[3]), Math.abs(b[4] - box[4]), Math.abs(b[5] - box[5]));
  if (err(look) <= tol) return null; let best = null, be = Infinity;
  for (const axis of ['x', 'y', 'z']) for (const angle of [Math.PI / 2, -Math.PI / 2, Math.PI]) { const b = turnBox(look, hinge, axis, angle), e = err(b); if (e < be) { be = e; best = { axis, angle }; } }
  return be <= tol * 2 && be < err(look) / 3 ? best : null;
}
// A box [minX, maxX, minZ, maxZ, y0, y1] turned by `angle` about the line through p along axis (game axes: x, y up, z), as three.js turns.
export function turnBox(b, p, axis, angle) { const c = Math.round(Math.cos(angle)), s = Math.round(Math.sin(angle)), xs = [], ys = [], zs = [];
  for (const x of [b[0], b[1]]) for (const y of [b[4], b[5]]) for (const z of [b[2], b[3]]) { let dx = x - p[0], dy = y - p[1], dz = z - p[2];
    if (axis === 'x') [dy, dz] = [dy * c - dz * s, dy * s + dz * c]; else if (axis === 'y') [dx, dz] = [dx * c + dz * s, -dx * s + dz * c]; else [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
    xs.push(p[0] + dx); ys.push(p[1] + dy); zs.push(p[2] + dz); }
  return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), Math.min(...ys), Math.max(...ys)]; }

// Glass the look draws see-through (CS2's own glass shader: the export gives it no texture — Nuke's hr_glass_panel_001,
// Cache's ch2_sheet_glass_02_trans, Inferno's inferno_glass_01, Overpass's safety_glass_1). Textured "window" materials are
// painted windows (a lit room, a frame) and stay as they are, except where a pane or a glass breakable claims them.
export const SEE_THROUGH = /glass|window_plastic|window_unbroken/i, NOT_GLASS = /opaque|frame|bars|block|mural|stained|illum|decal|insets|_lit|_on$|cull$/i;
export const seeThroughName = (name, textured) => !textured && SEE_THROUGH.test(name) && !NOT_GLASS.test(name);

// A breakable pane shaped like a window — thin (≤ 6 Hammer units) and 8 or more across — as against CS2's glass
// collision round a tree trunk, a lamp or a pipe (thick). m: a mover (bsp-map.js: box [minX, maxX, minZ, maxZ, y0, y1],
// game units); U: game units per Hammer unit.
export const paneShaped = (m, U) => { if (m?.kind !== 'break' || !m.pane) return false; const b = m.box, d = [b[1] - b[0], b[3] - b[2], b[5] - b[4]].sort((p, q) => p - q); return d[0] <= 6 * U && d[1] >= 8 * U; };
