// Lag compensation (as Counter-Strike's): a shot is judged where the shooter saw the target, not where the host has it
// by the time the hit arrives. The host keeps every player's poses for a second, stamped on the clock each one is
// played back on (a player's own capture clock, bots the host's: multiplayer.js plays them back the same way); a hit
// names the moment of the target it saw (`seen`, on that clock) and the shooter's own moment (`ct`), and range, walls
// and knife reach are checked between those two poses (combat-logic.js) — never further back than MAX_UNLAG behind the
// newest pose, so an old or forged moment buys nothing.
export const MAX_UNLAG = 400, KEEP_MS = 1000, VEL_MS = 150;
export function createPoseHistory() {
  const by = new Map();
  return {
    record(id, s, pose) {
      if (!Number.isFinite(s) || !pose) return; let h = by.get(id); if (!h) by.set(id, h = []);
      const last = h[h.length - 1]; if (last && s <= last.s) { if (s < last.s - 5000) h.length = 0; else return; }   // a restarted clock (reload): start over
      h.push({ s, x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, crouched: !!pose.crouched, ey: Number.isFinite(pose.ey) ? pose.ey : undefined });   // (ey: the eye over the feet — a crouch then is a crouch at that moment, not now)
      while (h.length > 2 && s - h[0].s > KEEP_MS) h.shift();
    },
    // The pose at moment s (between the two poses around it), clamped to [newest − maxBack, newest]; null: none kept.
    at(id, s, maxBack = MAX_UNLAG) {
      const h = by.get(id); if (!h?.length) return null; const last = h[h.length - 1];
      const t = Number.isFinite(s) ? Math.max(last.s - maxBack, Math.min(last.s, s)) : last.s;
      // (lead: how far s is past the newest pose, ms — a hit sent at its trigger usually beats that moment's pose to the host;
      // ya/yb: the facing of the poses either side — a flick between two poses can face anywhere along the turn)
      const lead = Number.isFinite(s) ? Math.max(0, s - last.s) : 0;
      let i = h.length - 1; while (i > 0 && h[i - 1].s > t) i--; const b = h[i], a = h[i - 1];
      if (!a || b.s <= t) return { ...b, lead, ya: b.yaw, yb: b.yaw }; if (a.s >= t) return { ...a, lead, ya: a.yaw, yb: a.yaw };
      const k = (t - a.s) / (b.s - a.s), dy = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
      return { s: t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, yaw: a.yaw + dy * k, crouched: k < .5 ? a.crouched : b.crouched, ey: Number.isFinite(a.ey) && Number.isFinite(b.ey) ? a.ey + (b.ey - a.ey) * k : (k < .5 ? a : b).ey, lead, ya: a.yaw, yb: b.yaw };
    },
    // How fast the body moved through moment s (units/s): { h: across, v: up (−: down) }, the slower of the VEL_MS before
    // and the VEL_MS after it (a counter-strafe decelerates in the window before the shot and stands still after it: only
    // running on both sides is running at the shot); null if unknown — no pose after s yet (a hit is sent at the trigger
    // and usually arrives before the pose of its moment: the window before alone would be the run-up).
    vel(id, s, win = VEL_MS) {
      const h = by.get(id); if (!h?.length || !Number.isFinite(s)) return null; const last = h[h.length - 1], t = Math.max(last.s - MAX_UNLAG, Math.min(last.s, s));
      const sp = (a, b) => { const q0 = this.at(id, a, MAX_UNLAG + win), q1 = this.at(id, b, MAX_UNLAG + win); if (!q0 || !q1 || !(q1.s - q0.s > 20)) return null; const dt = (q1.s - q0.s) / 1000; return { h: Math.hypot(q1.x - q0.x, q1.z - q0.z) / dt, v: (q1.y - q0.y) / dt }; };
      const pre = sp(t - win, t), post = pre && sp(t, Math.min(last.s, t + win)); if (!pre || !post) return null;
      return { h: Math.min(pre.h, post.h), v: Math.abs(pre.v) < Math.abs(post.v) ? pre.v : post.v }; },
    forget(id) { by.delete(id); },
  };
}
// The roster as the shooter saw it: the target at the moment it saw (action.seen), the shooter at its own — the shot's
// trigger moment (action.ft, the same clock) else when it was sent (action.ct) — with how fast the shooter was moving
// then (pose.vel: the host's lower bound for the shot's inaccuracy, combat-logic.js).
export function rewound(history, roster, action, actor) {
  if (!history || !action || action.type !== 'hit') return roster;
  const back = (p, s, me) => { const q = history.at(p.id, s); if (!q) return p; const pose = { ...p.pose, x: q.x, y: q.y, z: q.z, yaw: q.yaw, crouched: q.crouched }; if (Number.isFinite(q.ey)) pose.ey = q.ey; if (me) { pose.vel = history.vel(p.id, s); pose.lead = q.lead; pose.ya = q.ya; pose.yb = q.yb; } return { ...p, pose }; };
  const own = Number.isFinite(action.ft) ? +action.ft : Number.isFinite(action.ct) ? +action.ct : NaN;
  return roster.map(p => p.id === action.target && Number.isFinite(action.seen) ? back(p, +action.seen, false) : p.id === actor && Number.isFinite(own) ? back(p, own, true) : p);
}
