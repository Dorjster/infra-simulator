// RAID models shared by the server storage controller (PERC / Smart Array + BOSS / NS204i boot
// device) and the storage-array disk groups / pools.
//
// Server controller state machine per virtual disk (VD):
//   optimal ──disk fails──▶ degraded ──hot spare or replaced disk──▶ rebuilding (progress each tick)
//   rebuilding ──100 %──▶ optimal        degraded/rebuilding ──one failure too many──▶ failed (data lost)
//   failed ──replace disks + recreate VD──▶ optimal (empty: OS / datastore must be reinstalled)
// Tolerance: RAID 0 → 0 disks, RAID 1 → 1, RAID 5 → 1, RAID 6 → 2, RAID 10 → 1 per mirror pair.
// Array pools use the same rules with drive counts derived from the raw size (1 TB training drives)
// and a dedicated spare (distributed spare capacity on ADAPT).
export const DRIVE_GIB = 1000;
export const REBUILD_PER_TICK = 10; // percent per logic second → a rebuild takes ~10 s of play time
const BAYS = { r660: 10, r760: 16, r760xs: 12, dl380g11: 12, xe8640: 8, xe9680: 8, fazvm: 4, fsiemvm: 8, server: 8, gpu: 8 };
const DISK_GB = { xe8640: 3840, xe9680: 3840, gpu: 3840 };
export const LEVELS = { 'RAID 0': { min: 1, parity: 0 }, 'RAID 1': { min: 2, max: 2, parity: 0.5 }, 'RAID 5': { min: 3, parity: 1 }, 'RAID 6': { min: 4, parity: 2 }, 'RAID 10': { min: 4, even: true, parity: 0.5 } };
export const tolerance = (level, disks, failed) => {
  if (level === 'RAID 0') return failed.length === 0;
  if (level === 'RAID 1') return failed.length < disks.length;
  if (level === 'RAID 5') return failed.length <= 1;
  if (level === 'RAID 6') return failed.length <= 2;
  if (level === 'RAID 10') { for (let i = 0; i < disks.length; i += 2) if (failed.includes(disks[i]) && failed.includes(disks[i + 1])) return false; return true; }
  return false;
};
export function vdUsableGB(level, count, size) { if (level === 'RAID 0') return count * size; if (level === 'RAID 1' || level === 'RAID 10') return count * size / 2; if (level === 'RAID 5') return (count - 1) * size; if (level === 'RAID 6') return (count - 2) * size; return 0; }

// Creates the controller record the first time it is read. Factory PowerEdge / ProLiant ship with the
// boot device mirrored (BOSS-N1 / NS204i); pre-installed Free Play servers also have VD0 (RAID 1).
export function controller(n, r) {
  if (r.ctrl) return r.ctrl;
  const sku = n.spec?.sku || n.type, bays = BAYS[sku] || 8, size = DISK_GB[sku] || 1920, hpe = sku === 'dl380g11';
  const disks = Array.from({ length: bays }, (_, i) => ({ slot: i, sizeGB: size, state: 'ready' }));
  r.ctrl = { model: hpe ? 'HPE MR416i-o Gen11' : 'PERC H965i Front', disks, vds: [], boss: { model: hpe ? 'HPE NS204i-u Boot Device' : 'BOSS-N1 Monolithic', disks: [{ slot: 'M.2-0', state: 'online', sizeGB: 480 }, { slot: 'M.2-1', state: 'online', sizeGB: 480 }], state: 'optimal', rebuild: null } };
  if (!n.spec) { r.ctrl.vds.push({ id: 'VD0', name: 'OS', level: 'RAID 1', disks: [0, 1], state: 'optimal', rebuild: null }); disks[0].state = disks[1].state = 'online'; }
  return r.ctrl;
}
export function vdState(ctrl, vd) {
  const failed = vd.disks.filter(s => ctrl.disks[s]?.state === 'failed' || ctrl.disks[s]?.state === 'missing');
  if (vd.state === 'failed') return { state: 'failed', failed, missing: vd.disks.filter(s => ['failed', 'missing', 'rebuilding'].includes(ctrl.disks[s]?.state)) };
  if (!failed.length && !vd.rebuild) return { state: 'optimal', failed };
  // A disk that is still rebuilding holds no complete copy yet: it counts as missing for tolerance.
  const missing = vd.disks.filter(s => ['failed', 'missing', 'rebuilding'].includes(ctrl.disks[s]?.state));
  if (!tolerance(vd.level, vd.disks, missing)) return { state: 'failed', failed, missing };
  return { state: vd.rebuild ? 'rebuilding' : 'degraded', failed, progress: vd.rebuild?.progress || 0 };
}
export function bootDevice(ctrl) {
  const f = ctrl.boss.disks.filter(d => d.state === 'failed').length;
  return f >= 2 ? 'failed' : ctrl.boss.rebuild ? 'rebuilding' : f ? 'degraded' : 'optimal';
}
// Fail one disk (fault injection or wear-out). A second failure while rebuilding RAID 5 kills the VD.
export function failDisk(ctrl, slot) {
  const d = ctrl.disks[slot]; if (!d) return;
  d.state = 'failed';
  for (const vd of ctrl.vds) if (vd.disks.includes(slot)) {
    if (vd.rebuild?.slot === slot) vd.rebuild = null;
    const st = vdState(ctrl, vd); if (st.state === 'failed') { vd.state = 'failed'; vd.rebuild = null; continue; }
    const spare = ctrl.disks.find(x => x.state === 'hotspare');
    if (spare && !vd.rebuild) { spare.state = 'rebuilding'; vd.disks = vd.disks.map(s => s === slot ? spare.slot : s); vd.rebuild = { slot: spare.slot, progress: 0, replaced: slot }; }
  }
}
// A replacement disk in the failed slot rebuilds automatically (PERC / Smart Array default).
export function replaceDisk(ctrl, slot) {
  const d = ctrl.disks[slot]; if (!d || d.state !== 'failed') return false;
  const vd = ctrl.vds.find(v => v.disks.includes(slot) && v.state !== 'failed');
  if (vd && !vd.rebuild) { d.state = 'rebuilding'; vd.rebuild = { slot, progress: 0 }; } else d.state = 'ready';
  return true;
}
export function advance(ctrl, pct = REBUILD_PER_TICK) {
  let changed = false;
  for (const vd of ctrl.vds) if (vd.rebuild) {
    if (vd.state === 'failed') { vd.rebuild = null; changed = true; continue; }
    vd.rebuild.progress = Math.min(100, vd.rebuild.progress + pct); changed = true;
    if (vd.rebuild.progress >= 100) { ctrl.disks[vd.rebuild.slot].state = 'online'; vd.rebuild = null; }
  }
  if (ctrl.boss.rebuild) { ctrl.boss.rebuild.progress = Math.min(100, ctrl.boss.rebuild.progress + pct); changed = true; if (ctrl.boss.rebuild.progress >= 100) { ctrl.boss.disks.forEach(d => { if (d.state === 'rebuilding') d.state = 'online'; }); ctrl.boss.rebuild = null; } }
  return changed;
}

// Array pools: drives = raw / 1 TB (at least the level minimum); usable = data drives × drive size.
const POOL = { 'RAID 1': { min: 2, data: d => d / 2, tol: 1 }, 'RAID 10': { min: 4, data: d => d / 2, tol: 1 }, 'RAID 5': { min: 3, data: d => d - 1, tol: 1 }, 'RAID 6': { min: 4, data: d => d - 2, tol: 2 }, 'ADAPT': { min: 12, data: d => (d - 2) * 0.8, tol: 2, distributedSpare: true }, 'Single drive': { min: 5, data: d => d - 1, tol: 1 }, 'Double drive': { min: 6, data: d => d - 2, tol: 2 }, 'Triple+ parity': { min: 8, data: d => d - 3, tol: 3 } };
export function poolDrives(pool) { const k = POOL[pool?.protection] || POOL['RAID 6']; return Math.max(k.min, Math.round((pool?.sizeGiB || 0) / DRIVE_GIB)); }
export function poolUsableReal(pool) { if (!pool) return 0; const k = POOL[pool.protection] || POOL['RAID 6'], d = poolDrives(pool); return Math.floor((pool.sizeGiB || 0) * k.data(d) / d); }
export function poolTolerance(pool) { return (POOL[pool?.protection] || POOL['RAID 6']).tol; }
export function poolHealth(pool) {
  const failed = pool?.failedDrives || 0, tol = poolTolerance(pool);
  if (pool?.lost || failed > tol) return { state: 'failed', failed };
  if (pool?.rebuild) return { state: 'rebuilding', failed, progress: pool.rebuild.progress };
  return { state: failed ? 'degraded' : 'optimal', failed };
}
export function failPoolDrive(pool) {
  pool.failedDrives = (pool.failedDrives || 0) + 1;
  if (pool.failedDrives > poolTolerance(pool)) { pool.lost = true; pool.rebuild = null; return; }
  const k = POOL[pool.protection] || POOL['RAID 6'];
  if (!pool.rebuild && (k.distributedSpare || (pool.spares ?? 1) > 0)) { if (!k.distributedSpare) pool.spares = (pool.spares ?? 1) - 1; pool.rebuild = { progress: 0 }; }
}
export function advancePool(pool, pct = REBUILD_PER_TICK) {
  if (!pool.rebuild || pool.lost) return false;
  pool.rebuild.progress = Math.min(100, pool.rebuild.progress + pct);
  if (pool.rebuild.progress >= 100) { pool.failedDrives = Math.max(0, (pool.failedDrives || 0) - 1); pool.rebuild = null; const k = POOL[pool.protection] || POOL['RAID 6']; if (pool.failedDrives && (k.distributedSpare || (pool.spares ?? 0) > 0)) { if (!k.distributedSpare) pool.spares--; pool.rebuild = { progress: 0 }; } }
  return true;
}
export function replacePoolDrive(pool) { if (pool.lost) return false; pool.spares = (pool.spares ?? 0) + 1; if (pool.failedDrives && !pool.rebuild) { pool.spares--; pool.rebuild = { progress: 0 }; } return true; }
