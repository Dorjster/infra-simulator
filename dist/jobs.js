// Background jobs, one at a time. Periodic heavy work (whole-scene scans, culling updates) registers here
// instead of running on fixed frame numbers. Each frame runs at most one due job — the most overdue — and only
// if the frame still has time left (it waits for a quieter frame otherwise), so heavy work never piles up in the
// same frame and the game keeps a steady frame time, like background refresh on a phone.
export function createJobs() {
  const jobs = [];
  return {
    // every: how often (ms); start staggered so jobs don't line up.
    add(name, fn, every) { if (jobs.some(j => j.name === name)) return; jobs.push({ name, fn, every, last: performance.now() - Math.random() * every }); },
    // frameStart: when this frame's work began; budget: ms of frame time after which jobs wait.
    run(frameStart, budget = 10) {
      const now = performance.now(); if (now - frameStart > budget) return null;
      let pick = null, most = 1; for (const j of jobs) { const over = (now - j.last) / j.every; if (over >= most) { most = over; pick = j; } }
      if (!pick) return null; pick.last = now; try { pick.fn(); } catch (e) { console.warn('job ' + pick.name + ':', e.message); } return pick.name;
    },
    get list() { return jobs.map(j => j.name); },
  };
}
