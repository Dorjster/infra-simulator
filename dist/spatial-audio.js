// One shared sound engine with 3D positions: sounds made by other players and bots (shots, reloads, knife swings,
// running footsteps) come from where they happen — louder close, quieter far, left / right by direction.
// The listener follows the camera every frame (setListener).
let ctx = null;
export function audioCtx() { ctx ??= new AudioContext(); if (ctx.state === 'suspended') ctx.resume(); return ctx; }
// Where to connect a sound: the speakers directly (your own sounds) or a panner at `at` ({x, y, z}).
export function outAt(c, at) {
  if (!at) return c.destination;
  const p = c.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 10; p.rolloffFactor = 1.3; p.maxDistance = 700;
  p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z; p.connect(c.destination); return p;
}
const fwd = { x: 0, y: 0, z: -1 };
export function setListener(camera) {
  if (!ctx) return; const L = ctx.listener, e = camera.matrixWorld.elements, x = e[12], y = e[13], z = e[14];
  fwd.x = -e[8]; fwd.y = -e[9]; fwd.z = -e[10];
  if (L.positionX) { L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z; L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = e[4]; L.upY.value = e[5]; L.upZ.value = e[6]; }
  else { L.setPosition?.(x, y, z); L.setOrientation?.(fwd.x, fwd.y, fwd.z, e[4], e[5], e[6]); }
}
// Recorded footsteps: the game sets a hook that picks the surface and plays a sample (sound-bank.js); without it
// (or before the samples load) a footstep is a short filtered noise thud (concrete-ish), different every step.
let stepHook = null; export const setStepHook = f => { stepHook = f; };
export function footstep(at, volume = .5) {
  if (stepHook?.(at, volume)) return;
  try {
    const c = audioCtx(), t = c.currentTime, len = .09, buf = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
    const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = .85 + Math.random() * .3;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520 + Math.random() * 260; bp.Q.value = 1.1;
    const g = c.createGain(); g.gain.value = volume; src.connect(bp).connect(g).connect(outAt(c, at)); src.start(t);
  } catch {}
}
