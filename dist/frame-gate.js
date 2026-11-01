// Frame limiter for a capped frame rate on any display (60 / 75 / 100 / 120 / 144 / 165 / 240 Hz), used by Global Defensive
// (app.js animate). requestAnimationFrame only ticks on the display's refresh, so a cap can only be met on average: the old
// test "at least 1000/cap − 2 ms since the last drawn frame" drew on whole multiples of the refresh ≥ 14.7 ms — every 3rd
// tick on 144 Hz (48 fps), every 2nd on 75 Hz (37.5), 100 Hz 50, 165 Hz 55. Here each frame has a due time on a fixed
// schedule (1000/cap apart) and a tick draws when it is within half a refresh of it, so 144 Hz draws 2-3-2-3 ticks apart
// (60.0 fps), and a display not much faster than the cap (≤ 1.3×: 60 / 75 Hz under a 60 cap) is not limited at all —
// 75 Hz draws 75 fps, not 37.5. After a stall the schedule restarts from now (never a burst of catch-up frames).
// The refresh interval is the shortest tick gap among the last 32 (rAF timestamps are refresh-aligned: a missed refresh
// shows as a double gap, never a shorter one) — but a game that can't keep up gets a rAF tick only every 2nd / 3rd refresh
// (Chrome sends no BeginFrame while the last frame is still busy), so that window's shortest gap is then the slow frame
// itself (33.3 ms at 30 fps on 60 Hz, 20.8 at 48 fps on 144 Hz), and the dynamic resolution's thresholds built on it would
// stop seeing exactly the overload they exist for. So the estimate only rises to a window minimum that is NOT a whole
// multiple (×2, ×3 … ±0.12) of the current one — a window of missed refreshes is; a move to another display (144 → 60 Hz:
// ×2.4) is not — and always falls to a shorter one. (Known limit: a move from 120 to exactly 60 Hz keeps 8.3 ms — the
// schedule then still draws every 60 Hz tick, the thresholds sit ~4 ms lower than they should.) Allocation-free: one per
// page, called on every rAF tick.
// `auto`: the cap is the "Auto · 60" setting, not one the player chose — a display not much faster than it (≤ 1.3×) is
// then not limited (75 Hz draws 75: a 60 schedule there would double every 5th frame — judder). A chosen cap is kept.
export function createFrameGate(size = 32) {
  const gaps = new Float32Array(size); let n = 0, at = 0, last = 0, next = 0, vsync = 1000 / 60, seeded = false;
  function tick(now) {
    if (last) { const d = now - last; if (d > 2 && d < 100) { gaps[at] = d; at = (at + 1) % size; if (n < size) n++; } }   // (a hidden tab's or a stall's gap is no refresh)
    last = now; if (!n) return; let v = Infinity; for (let i = 0; i < n; i++) if (gaps[i] < v) v = gaps[i];
    if (!seeded || v <= vsync) { vsync = v; seeded = true; return; }
    const r = v / vsync, k = Math.round(r); if (k < 2 || Math.abs(r - k) > .12) vsync = v;   // (×1.0–1.5: drift / jitter, taken; ≈×2, ×3: missed refreshes, kept)
  }
  const slack = (cap, auto) => auto && vsync * 1.3 >= 1000 / cap;
  return {
    get vsync() { return vsync; },
    // the frame interval aimed at under `cap` fps (0: none): the cap's, or the refresh when that is slower (or, auto, not much faster)
    interval(cap, auto = false) { return cap > 0 && vsync < 1000 / cap && !slack(cap, auto) ? 1000 / cap : vsync; },
    // this rAF tick (its timestamp): draw a frame now?
    due(now, cap, auto = false) {
      tick(now); if (!(cap > 0)) return true;
      const I = 1000 / cap; if (vsync >= I || slack(cap, auto)) { next = now; return true; }
      const h = vsync / 2; if (now < next - h) return false;
      next = Math.max(next + I, now + I - h); return true;   // (drawn over half a refresh late — a stall, a slow frame: the schedule restarts from this frame)
    },
    reset() { n = at = last = next = 0; vsync = 1000 / 60; seeded = false; }
  };
}
// Thresholds for the dynamic resolution's frame-time test (app.js scaleResolution, Global Defensive) from the frame interval
// aimed at (I) and the refresh (v): a frame is late when it took more than about one extra refresh beyond its slot, the
// median is slow when it sits above the slot by over half a refresh (+1.85 ms, the old 18.5 − 16.67 margin). On a 60 Hz
// display under the 60 cap they sort frames exactly as the old fixed 24 / 18.5 ms did (gaps there are 16.7 or 33.3);
// on 144 Hz under the 60 cap the 13.9 / 20.8 ms gaps the schedule draws are neither late nor slow. `mean`: the drawn
// interval's average over the window above 1.1× the slot is slow too — the schedule's 2-3-2-3 gaps on 144 Hz average the
// slot (16.7), a game managing only every 3rd refresh there (20.8 ms each: 48 fps) averages 1.25× while its median and
// every gap pass the two tests above. Measured against the cap's slot when the display is at or near it (`cap`): the
// refresh estimate is a minimum of jittery gaps (15.8 ms on a 60 Hz Mac in real Chrome), and 1.1× that would sit within
// 4 % of a full 60 fps — a display slower than the cap is overloaded only below the cap, not below its own refresh.
export function frameThresholds(I, v, out = { late: 24, slow: 18.5, mean: 18.3 }, cap = 0) { out.late = I + v * .8; out.slow = I + v / 2 + 1.85; out.mean = Math.max(I, cap > 0 ? 1000 / cap : 0) * 1.1; return out; }
// The dynamic resolution's decisions (app.js scaleResolution, every 0.5 s while playing at full rate), here so whole
// matches can be played through them (tests/frame-gate.mjs). decide(x) → the pixel ratio to draw at (x.current: no
// change); applied(now) once a change is made; quiet() while loading. x: now, gd (a Global Defensive match), median /
// mean / late of the last 40 drawn frames, th (frameThresholds), interval (the slot aimed at), gpu (median GPU ms of a
// frame, or null: no timer queries — Apple's Metal never sends them, some Windows drivers neither), budget (the GPU's
// share of the slot), cap, current / ceiling / steps (the ratios allowed, largest first), hold (GD: mid-fight, no quiet
// moment for a 50–130 ms buffer remake), cpu (median main-thread ms of a drawn frame: script + three.js submit).
// Everything as before, and in a GD match (package W — weak Windows laptops):
//  · CPU-bound is no reason for a hitch mid-fight: with no GPU times, frames that are slow while the main thread's own
//    time fills > 85 % of the slot (an i5 laptop's CPU in a 10-player fight) take no "severe" step mid-fight — a smaller
//    picture can't bring them back, and each step is a 50–130 ms hitch (measured, CPU ×4: two steps down in the first 6 s
//    of the fight, still 34 fps). That main-thread time can include waits on the GPU (Chrome's GL calls block when the
//    GPU is behind), so it is only a hint: the step is taken at the next quiet moment instead, and if it didn't help
//    it is undone back to where it was and no step down is tried for 15 min. "Did it help" compares like with like: a
//    step a fight asked for is judged on the next whole fight against that fight (at the quiet moment after it), not on
//    freeze time 6 s on — freeze is light on the processor, so a CPU-bound laptop looked "helped" there and walked down
//    to the last step in 2–3 rounds; no step either way while the verdict is pending. Only a fight asks for such a step:
//    quiet frames that are slow while CPU-bound (freeze time on a laptop whose processor is the limit in every phase)
//    take no step of their own, as in v51 — judged on quiet frames whose cost swings with the machine's load from one
//    check to the next, a step read "helped" by chance and stayed for the match (review W-windows: 20–32 % of simulated
//    CPU-bound matches ended at .72–.5 with no fps gained; tests/frame-gate.mjs "load swings").
//  · the overload seen in the fight is measured (GPU ms over its budget, else the drawn interval over the slot) and the
//    quiet moment takes the step that fits it in one go — up to 3 steps with GPU times, 2 from frame times (coarse: a
//    60 Hz display quantises them), not one step per round (a weak GPU took several rounds of blur-and-stutter to settle).
//  · no oscillation: a step up (tried at a quiet moment, light) that the next fight takes back within a minute goes back
//    exactly one step and is not tried again for 15 minutes (the "did it help" undo of a down step stays as it was).
export function createScaler(opt = {}) {
  const W = opt.w !== false;   // (w: false — the v51-I2 decisions without the two GD changes above: the tests' reference)
  let slowChecks = 0, fastChecks = 0, lastUp = 0, upWait = 40, downAt = 0, lateBefore = 0, lateSum = 0, lateN = 0, noDownUntil = 0, wantDown = false, lastScale = 0, loadSum = 0, loadN = 0, badUp = 9, badUntil = 0, downFrom = 1, fLate = 0, fN = 0, byFight = false, qSlow = 0;   // qSlow: slow checks in a row that were not CPU-bound (GD: only these step down on their own — see below). fLate / fN: late frames per check in fights (hold) since the last change; byFight: the pending verdict compares fight with fight. upWait: checks (0.5 s) of clean frames before trying a step up without GPU times
  return {
    get wantDown() { return wantDown; },
    quiet() { slowChecks = qSlow = fastChecks = 0; },
    applied(now) { lastScale = now; slowChecks = qSlow = fastChecks = 0; lateSum = lateN = fLate = fN = 0; },
    decide(x) {
      const { now, gd, median, mean, late, th, interval, gpu, budget, cap, current, ceiling, steps, hold } = x;
      let i = steps.length - 1; for (let k = 0; k < steps.length; k++) if (steps[k] <= current + .01) { i = k; break; }
      const meanSlow = gd && mean > th.mean, cpuBound = W && gd && gpu === null && x.cpu > interval * .85;
      // Without GPU times the frames say it: a few late ones in every 40 for a second (a fanless laptop slowing down as it
      // heats: one frame in ten missed its refresh, the median still 16.7) is a step down; 20 s with none, a step up to try
      // — and if that brings late frames back soon, twice as long before the next try.
      const slow = (gpu === null ? (median > th.slow || late >= 4 || meanSlow) : (median > th.slow || meanSlow) && gpu > budget * 1.15), fast = !meanSlow && (gpu !== null ? gpu < budget * .6 && median < 20 : (cap > 60 ? median < 15.5 : late === 0));
      slowChecks = slow ? slowChecks + 1 : 0; qSlow = slow && !cpuBound ? qSlow + 1 : 0; fastChecks = fast ? fastChecks + 1 : 0; let next = current;
      lateSum += late; lateN++; if (hold) { fLate += late; fN++; }
      if (gd) { if (slow) { loadSum += gpu !== null ? gpu / budget : mean / interval; loadN++; } else if (fastChecks > 20) loadSum = loadN = 0; }
      // GD: a change waits for a quiet moment (freeze time, the round's end, loading, practice) unless the frame rate is
      // already bad (most frames a refresh late — and not CPU-bound): the fight's overload is remembered (wantDown).
      const severe = !cpuBound && Math.max(median, gd ? mean : 0) > interval * 1.45; if (hold && slowChecks >= 4) wantDown = true;   // (2 s of overload in a fight, not 1: a one-second burst — three smokes going up at once — remembered cost a step down at freeze and back up a round later: soak)
      // (and a step down that didn't help — the frames late as often 6 s on: the processor is what can't keep up, not the
      // pixels — goes back up, and no step down for 30 s: a smaller picture would only blur it)
      // (GD, a step down asked for by a fight: judged on the NEXT fight's frames against the fight that asked — whole fight
      // against whole fight, at the quiet moment after it. Freeze time is light on the processor (no gunfire, smokes, moving
      // bots): a CPU-bound laptop's frames there are on time at any resolution, so a verdict from them read "it helped" and
      // the next fight asked again — 1 → .72 → .5 in 2–3 rounds, no fps gained (review W-windows: v51 never stepped there).
      // No fight within 150 s (the match ended): no evidence, the step stays.)
      const fv = W && gd && byFight;
      if (gpu === null && downAt && !hold && (fv ? fN >= 12 || now - downAt > 150000 : now - downAt > 6000)) { if ((fv ? (fN ? fLate / fN : 0) : lateSum / lateN) >= lateBefore * .6 && current < ceiling - .01) { next = W && gd ? downFrom : steps[Math.max(0, i - 1)]; noDownUntil = now + (W && gd ? 900000 : 30000); } downAt = 0; byFight = false; }   // (GD: back to where it was, and no step down for 15 min — the processor is the limit: proven, not guessed)
      else if (now - lastScale > 4000) {
        if (((W && gd ? qSlow : slowChecks) >= 2 || wantDown && !hold) && (!hold || severe) && i < steps.length - 1 && now >= noDownUntil && !(W && gd && gpu === null && downAt)) {   // (GD: no second step before the first's "did it help" verdict)
          const undo = W && gd && lastUp > 0 && now - lastUp < 60000;   // (a step up the next fight takes back: back to where it was, and that ratio not tried again for 15 min — freeze time is light, fights are not: up at every freeze / down in every fight was a pair of 50–130 ms hitches a round)
          let j = i + 1; if (W && gd && loadN && !undo) { const load = loadSum / loadN; j = Math.max(j, stepFor(steps, i, load, gpu !== null ? 3 : load > 1.6 ? 2 : 1)); }
          if (undo) { badUp = current; badUntil = now + 900000; }
          downFrom = current; next = steps[j]; wantDown = false; loadSum = loadN = 0; if (gpu === null) { if (now - lastUp < 8000) upWait = Math.min(upWait * 2, 160); downAt = now; byFight = W && gd && fN >= 4; lateBefore = Math.max(1, byFight ? fLate / fN : lateSum / lateN); } }
        else if (!hold && fastChecks >= (gpu === null ? upWait : 10) && current < ceiling - .01 && !(W && gd && gpu === null && downAt) && !(W && gd && now < badUntil && steps[Math.max(0, i - 1)] >= badUp - .01)) { next = steps[Math.max(0, i - 1)]; lastUp = now; }
      }
      return next;
    }
  };
}
// The step (index into steps, largest ratio first) for a frame `load`× its budget: the pixels go with the ratio², so the
// ratio / √(load · 1.1) (10 % margin), at most `max` steps below step i.
export function stepFor(steps, i, load, max = 1) { const want = steps[i] / Math.sqrt(Math.max(1, load) * 1.1); let j = i; while (j < steps.length - 1 && j < i + max && steps[j] > want + 1e-3) j++; return j; }
// Global Defensive's first-run preset from the GPU bench (app.js gdBench: the median of 40 quiet frames, ms): with timer
// queries the GPU's own frame time, over 18 ms → Low — an approximation between the package-W emulations at freeze time
// (≈ 80 % of the fight): Iris Xe (M3 at 2× the pixels, Medium 1080p@150 %: 15.4–17.3 ms in the fight → ≈ 12–14 at freeze:
// Medium, as docs/GD-LAN-TONIGHT.md §9 says) and Intel UHD (≈ half of Iris Xe: ≈ 24–28 at freeze: Low); not calibrated on
// real timer queries (none on this Mac) — the dynamic resolution trims from either choice. Without them a readPixels wait,
// which on a GPU that keeps up is the wait for the display's refresh (≤ one refresh: 9.8–13.4 ms measured on the M3 at
// 1×–4× the pixels), so only a wait past a refresh and a third (22 ms) → Low. Else Medium. (Sources: app.js above gdBench.)
export const GD_BENCH = { timer: 18, wait: 22 };
export function gdPresetFromBench(ms, timer) { return ms > (timer ? GD_BENCH.timer : GD_BENCH.wait) ? 'Low' : 'Medium'; }
