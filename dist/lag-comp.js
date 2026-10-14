// Lag compensation (as Counter-Strike's): a shot is judged where the shooter saw the target, not where the host has it
// by the time the hit arrives. The host keeps every player's poses for a second, stamped on the clock each one is
// played back on (a player's own capture clock, bots the host's: multiplayer.js plays them back the same way); a hit
// names the moment of the target it saw (`seen`, on that clock) and the shooter's own moment (`ct`), and range, walls
// and knife reach are checked between those two poses (combat-logic.js) — never further back than MAX_UNLAG behind the
// newest pose, so an old or forged moment buys nothing.
export const MAX_UNLAG = 400, KEEP_MS = 1000;
export function createPoseHistory() {
  const by = new Map();
  return {
    record(id, s, pose) {
      if (!Number.isFinite(s) || !pose) return; let h = by.get(id); if (!h) by.set(id, h = []);
      const last = h[h.length - 1]; if (last && s <= last.s) { if (s < last.s - 5000) h.length = 0; else return; }   // a restarted clock (reload): start over
      h.push({ s, x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, crouched: !!pose.crouched });
      while (h.length > 2 && s - h[0].s > KEEP_MS) h.shift();
    },
    // The pose at moment s (between the two poses around it), clamped to [newest − maxBack, newest]; null: none kept.
    at(id, s, maxBack = MAX_UNLAG) {
      const h = by.get(id); if (!h?.length) return null; const last = h[h.length - 1];
      const t = Number.isFinite(s) ? Math.max(last.s - maxBack, Math.min(last.s, s)) : last.s;
      let i = h.length - 1; while (i > 0 && h[i - 1].s > t) i--; const b = h[i], a = h[i - 1];
      if (!a || b.s <= t) return { ...b }; if (a.s >= t) return { ...a };
      const k = (t - a.s) / (b.s - a.s), dy = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
      return { s: t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, yaw: a.yaw + dy * k, crouched: k < .5 ? a.crouched : b.crouched };
    },
    forget(id) { by.delete(id); },
  };
}
// The roster as the shooter saw it: the target at the moment it saw (action.seen), the shooter at its own (action.ct).
export function rewound(history, roster, action, actor) {
  if (!history || !action || action.type !== 'hit') return roster;
  const back = (p, s) => { const q = history.at(p.id, s); return q ? { ...p, pose: { ...p.pose, x: q.x, y: q.y, z: q.z, yaw: q.yaw, crouched: q.crouched } } : p; };
  return roster.map(p => p.id === action.target && Number.isFinite(action.seen) ? back(p, +action.seen) : p.id === actor && Number.isFinite(action.ct) ? back(p, +action.ct) : p);
}
