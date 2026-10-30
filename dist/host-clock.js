// The LAN host's clock, on this computer (Global Defensive). Every match time — round, buy and bomb clocks, when the dead
// come back, the lobby, the Deathmatch clock, kill-feed stamps — is the host's Date.now(); computers on an offline LAN are
// often seconds apart (manual time, no internet time), and comparing those stamps with this computer's own clock made a
// guest see itself dead seconds after its respawn (unable to fire), or the buy menu shut early.
// hostNow(): the host's time now. Each state frame from the host carries its send time (lan/room.mjs: `sent`, else the
// tick's `clock`); the offset kept is the best (largest) of the last 3 s of samples — the least delayed frame, so network
// jitter never pulls it back. Ahead of the offset in use (a less delayed frame, a host clock step forward): eased in at 5 %
// of the time passing (no jumps on screen), at once when 250 ms or more ahead. Behind it: eased back at 1 % when under
// 250 ms (clock drift), but a larger step back only once it has held for 3 s more of arriving frames (DOWN_HOLD): after a
// stall of 3 s or more (Wi-Fi, this page busy building a map) the frames queued meanwhile arrive first, oldest first, and
// the window holds nothing else — taken as is, hostNow went back by the stall and every round, buy and bomb clock with it.
// (A host whose clock was set back is followed 3–6 s later.) Measured on performance.now() (monotonic: this computer's own
// clock being changed doesn't move it). Before the first sample (solo without a room, other modes): Date.now(). On the
// host itself the offset is the delivery delay (≈0). Allocation-free (a fixed ring of samples).
const N = 64, WINDOW = 3000, STEP = 250, DOWN_HOLD = 3000, sampAt = new Float64Array(N), sampOff = new Float64Array(N);
let count = 0, head = 0, best = 0, cur = null, curAt = 0, lowSince = -1;
export function hostClockSample(hostT) {
  if (!Number.isFinite(hostT)) return; const p = performance.now(), o = hostT - p;
  sampAt[head] = p; sampOff[head] = o; head = (head + 1) % N; if (count < N) count++;
  let b = -Infinity; for (let i = 0; i < count; i++) if (p - sampAt[i] < WINDOW && sampOff[i] > b) b = sampOff[i]; best = b === -Infinity ? o : b;
  const d = cur === null ? 0 : best - cur, dt = p - curAt;
  if (cur === null || d >= STEP) { cur = best; lowSince = -1; }
  else if (d >= 0) { cur += Math.min(d, dt * .05); lowSince = -1; }
  else if (d > -STEP) { cur += Math.max(d, -dt * .01); lowSince = -1; }
  else if (lowSince < 0) lowSince = p;   // every frame in the window late by 250 ms or more: hold, and wait for fresher ones
  else if (p - lowSince >= DOWN_HOLD) { cur = best; lowSince = -1; }
  curAt = p;
}
export const hostNow = () => cur === null ? Date.now() : performance.now() + cur;
// The offset in use (host − this computer's wall clock, ms) and whether any frame has set it: the perf overlay, tests.
export const hostClockOffset = () => cur === null ? 0 : Math.round(performance.now() + cur - Date.now());
export const hostClockSynced = () => cur !== null;
// A new room (joined another host, or the host restarted): its clock is learnt afresh.
export function resetHostClock() { count = 0; head = 0; best = 0; cur = null; curAt = 0; lowSince = -1; }
