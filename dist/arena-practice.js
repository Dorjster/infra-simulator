// Practice (Global Defensive, arena.practice): what the session's settings show, on this screen only —
//  · impacts: a small red box where each of your bullets stopped, and where it went through a wall, for 4 s (CS2's
//    sv_showimpacts);
//  · recoil: your spray, shot by shot, as dots in a small panel beside the crosshair (cleared after a pause);
//  · paths: the flight of each grenade you throw, drawn for 8 s (sv_grenade_trajectory);
//  · collision shapes (Practice menu, this screen only): what bodies, bullets and grenades meet round you, drawn over the
//    map (gd-collision-view.js; switched off with the session).
// Everything is made once and reused (no garbage in play); the marks and lines are drawn from the first frame, parked
// out of sight, so their shaders are built behind the loading card, never on the first shot.
import * as THREE from './three.module.js';
import { predictThrow } from './arena-nades.js';
import { COLLISION_VIEW } from './gd-collision-view.js';

const MARKS = 192, MARK_MS = 4000, PATHS = 6, PATH_MS = 8000, PTS = 82;
export function createPractice({ scene, pistol, boxes, settings }) {
  const marks = new THREE.InstancedMesh(new THREE.BoxGeometry(.45, .45, .45), new THREE.MeshBasicMaterial({ color: 0xff3a30 }), MARKS);
  const M = new THREE.Matrix4(), born = new Float64Array(MARKS), FAR = new THREE.Matrix4().makeTranslation(0, -5000, 0);
  for (let i = 0; i < MARKS; i++) marks.setMatrixAt(i, FAR); marks.count = MARKS; marks.frustumCulled = false; marks.userData.gd = true; marks.userData.noShadow = true; scene.add(marks);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x62d4ff }), paths = [];
  for (let i = 0; i < PATHS; i++) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PTS * 3).fill(-5000), 3)); g.setDrawRange(0, 2); const l = new THREE.Line(g, lineMat); l.frustumCulled = false; l.userData.gd = true; l.userData.noShadow = true; scene.add(l); paths.push({ l, until: 0 }); }
  const cv = document.createElement('canvas'); cv.id = 'gd-recoil'; cv.width = cv.height = 150; Object.assign(cv.style, { position: 'fixed', left: 'calc(50% + 110px)', top: 'calc(50% - 75px)', width: '150px', height: '150px', pointerEvents: 'none', zIndex: 30, display: 'none', background: '#0006', borderRadius: '8px' }); document.body.append(cv);
  const ctx = cv.getContext('2d'), spray = []; let head = 0, pathHead = 0, lastShots = pistol.shots, lastShotAt = 0, first = null;
  const onThrow = e => { const s = settings(); if (!s?.paths) return; const pts = predictThrow(e.detail.kind, e.detail.a, boxes(), null), P = paths[pathHead++ % PATHS], arr = P.l.geometry.attributes.position.array, n = Math.min(PTS, pts.length);
    for (let i = 0; i < n; i++) { arr[i * 3] = pts[i][0]; arr[i * 3 + 1] = pts[i][1]; arr[i * 3 + 2] = pts[i][2]; } P.l.geometry.setDrawRange(0, n); P.l.geometry.attributes.position.needsUpdate = true; P.until = performance.now() + PATH_MS; };
  addEventListener('gd-throw', onThrow);
  const drawSpray = () => { ctx.clearRect(0, 0, 150, 150); ctx.strokeStyle = '#ffffff30'; ctx.beginPath(); ctx.moveTo(75, 0); ctx.lineTo(75, 150); ctx.moveTo(0, 130); ctx.lineTo(150, 130); ctx.stroke();
    spray.forEach(([x, y], i) => { ctx.fillStyle = i ? '#ffd23a' : '#ff5a4a'; ctx.beginPath(); ctx.arc(75 + x, 130 + y, i ? 2.4 : 3.2, 0, Math.PI * 2); ctx.fill(); }); };
  return {
    update(now = performance.now()) {
      const s = settings() || {};
      // A new shot: its impacts, and its place in the spray.
      if (pistol.shots !== lastShots) { lastShots = pistol.shots; const L = pistol.lastShot;
        if (L && s.impacts) for (const e of L.ends) { if (!e.mark && e.flesh === undefined || e.point.distanceTo(L.origin) > 399) continue;   /* (not a shot into the sky) */ const i = head++ % MARKS; marks.setMatrixAt(i, M.makeTranslation(e.point.x, e.point.y, e.point.z)); born[i] = now; marks.instanceMatrix.needsUpdate = true; }
        if (L && s.recoil) { const yaw = Math.atan2(-L.dir.x, -L.dir.z), pitch = Math.asin(Math.max(-1, Math.min(1, L.dir.y)));
          if (!first || now - lastShotAt > 600) { first = [yaw, pitch]; spray.length = 0; }
          let dy = yaw - first[0]; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); spray.push([-dy * 180 / Math.PI * 9, -(pitch - first[1]) * 180 / Math.PI * 9]); if (spray.length > 40) spray.shift(); drawSpray(); }
        lastShotAt = now; }
      cv.style.display = s.recoil && spray.length && now - lastShotAt < 3000 ? 'block' : 'none';
      // Old marks and paths out of sight.
      for (let i = 0; i < MARKS; i++) if (born[i] && now - born[i] > MARK_MS) { born[i] = 0; marks.setMatrixAt(i, FAR); marks.instanceMatrix.needsUpdate = true; }
      for (const P of paths) if (P.until && now > P.until) { P.until = 0; P.l.geometry.setDrawRange(0, 2); P.l.geometry.attributes.position.array.fill(-5000, 0, 6); P.l.geometry.attributes.position.needsUpdate = true; }
    },
    dispose() { if (!COLLISION_VIEW.dev) COLLISION_VIEW.on = false;   // (the practice menu's collision view ends with the session: never in a match)
      removeEventListener('gd-throw', onThrow); scene.remove(marks); marks.geometry.dispose(); marks.material.dispose(); for (const P of paths) { scene.remove(P.l); P.l.geometry.dispose(); } lineMat.dispose(); cv.remove(); },
  };
}
