// Global Defensive (v53 PERF4X): the kill tally's world blur (its badge and its kill cards) drawn by the game's own output
// pass, not by the browser.
//
// CS2 (hudhealthammocenter.vcss .hud-HA-center: hud-blur-bg-color #000000a0 over world-blur hudWorldBlur = gaussian(2, 2,
// 2), csgostyles.vcss — see gd-kill-emblem.js) draws the badge's disc as the WORLD under it, blurred and dimmed. The HUD
// did that with a CSS backdrop-filter: blur(2px) brightness(.373). On a screen with a WebGL canvas under it, a backdrop
// filter makes the browser's compositor draw the whole page into a buffer of its own every frame before it can read the
// pixels back (about 3 fps on High at CPU ×4 at the user's 2940 × 1912 — open-after-C PERF; the badge is on screen the
// whole round). Here the same disc is drawn inside the composer's last pass (OutputPass, or GD's FXAA / sharpen output
// pass), which reads every pixel of the picture anyway: inside the badge's circle the pixel becomes the picture blurred
// (a 7 × 7 Gaussian, σ = CSS's 2 px times the badge's scale) in display values, times 0.373 — what the browser drew,
// on the world only (CS2's world blur samples the world, not the HUD). The badge's ring, logo and shadow stay in the page.
//
// The kill cards (v53 PERF4X review: their CSS backdrop filter cost about 1.1 fps at CPU ×4 with 3 cards — CS2's
// .kill-flag-bg-blur is the same world blur, cut to kill_mask: a 28 × 38 rect with 4.8-unit corners): up to 6 turned
// rounded rects, drawn with the disc in the same pass (one blur where any of them covers the pixel — the world only, as
// CS2's world blur; the page hides an older card's art where a newer card or the badge lies over it, gd-kill-emblem.js).
//
// The handshake (no per-frame style or layout work):
//   gd-kill-emblem.js → setBadgeBlur(on, x, y, r, s): the disc in window CSS pixels (centre, radius, σ) when its layout
//     or its shown state changes; setCardBlur(i, on, x, y, angle, hw, hh, rad) per card (only when a card moved: its
//     fan step, its pop, a new layout); it drops its own backdrop filters (class 'glb') while HUD_BLUR.ready is true.
//   graphics.js → hudBlurPatch(pass) on a GD composer's last pass (ready = true while that composer stands) and
//     hudBlurFrame(pass, canvas) each frame: the circle turned into drawing-buffer pixels (the canvas's box read only when
//     the disc or the buffer's size changes), uHBk 0 when the badge is hidden.
// Other modes: nothing calls these (graphics.js patches only a composer built for a GD match); the page's CSS blur stays
// the fallback (no composer: a software renderer, or a GD map without CS2's look on Medium).
import { Vector2, Vector4 } from './three.module.js';

export const HUD_CARDS = 6;   // (the 5 fan cards and the extra card)
export const HUD_BLUR = { want: false, x: 0, y: 0, r: 0, s: 0, k: .373, ready: false, ver: 0, q: new Float32Array(HUD_CARDS * 8) };   // q: per card x, y, cos, sin, hw, hh, rad, on (window CSS px)
export const HUD_BLUR_K = .373, HUD_BLUR_TAPS = 7;   // (CSS brightness(.373) = #000000a0 over the world; 7 × 7 taps at 0.75 σ apart: ±2.25 σ)
export function setBadgeBlur(want, x = 0, y = 0, r = 0, s = 0) {
  want = !!want; const H = HUD_BLUR; if (H.want === want && H.x === x && H.y === y && H.r === r && H.s === s) return;
  H.want = want; H.x = x; H.y = y; H.r = r; H.s = s; H.ver++; }
// One card's world blur: centre x, y and angle a (radians, clockwise on screen), half sizes hw × hh and corner radius rad,
// all in window CSS px. A new version only when something changed (no work while the fan rests).
export function setCardBlur(i, on, x = 0, y = 0, a = 0, hw = 0, hh = 0, rad = 0) {
  const q = HUD_BLUR.q, o = i * 8; if (!(i >= 0 && i < HUD_CARDS)) return;
  if (!on) { if (q[o + 7]) { q[o + 7] = 0; HUD_BLUR.ver++; } return; }
  const c = Math.cos(a), s = Math.sin(a);
  if (q[o + 7] && q[o] === Math.fround(x) && q[o + 1] === Math.fround(y) && q[o + 2] === Math.fround(c) && q[o + 3] === Math.fround(s) && q[o + 4] === Math.fround(hw) && q[o + 5] === Math.fround(hh) && q[o + 6] === Math.fround(rad)) return;
  q[o] = x; q[o + 1] = y; q[o + 2] = c; q[o + 3] = s; q[o + 4] = hw; q[o + 5] = hh; q[o + 6] = rad; q[o + 7] = 1; HUD_BLUR.ver++; }

const TONE_CHAIN = ['LINEAR', 'REINHARD', 'CINEON', 'ACES_FILMIC', 'AGX', 'NEUTRAL', 'CUSTOM'];
const TONE_FN = { LINEAR: 'LinearToneMapping', REINHARD: 'ReinhardToneMapping', CINEON: 'CineonToneMapping', ACES_FILMIC: 'ACESFilmicToneMapping', AGX: 'AgXToneMapping', NEUTRAL: 'NeutralToneMapping', CUSTOM: 'CustomToneMapping' };
// the output pass's own tone mapping and sRGB step, as a function of one colour (the same defines OutputPass sets)
const OUT_FN = 'vec3 gdHudOut( vec3 c ) {\n' + TONE_CHAIN.map((t, i) => `${i ? '#elif defined' : '#if defined'}( ${t}_TONE_MAPPING )\n  c = ${TONE_FN[t]}( c );\n`).join('') + '#endif\n#ifdef SRGB_TRANSFER\n  c = sRGBTransferOETF( vec4( c, 1.0 ) ).rgb;\n#endif\n  return c; }\n';
const H = (HUD_BLUR_TAPS - 1) / 2;
// The shapes are tested in the canvas's own CSS pixels (uHBo: CSS px per buffer px on x and y, the buffer's height), so a
// stretched picture's uneven buffer (4:3 stretched at 1280 × 960: 0.87 × 1.0 buffer px per CSS px — v53 PERF4X review)
// keeps them round / square on screen, as the page's badge and cards are; the taps are 0.75 σ apart in CSS px (uHBs: σ
// × 0.75 in texture units on each axis), weights exp(−½ (0.75 u)²). uHBc: the disc (centre, radius, on); uHBq: the cards
// (centre, cos, sin; half sizes, corner radius), uHBn of them, packed.
const BLUR_CODE = `
			if ( uHBk > 0.0 ) { vec2 hp = vec2( gl_FragCoord.x * uHBo.x, ( uHBo.z - gl_FragCoord.y ) * uHBo.y ), hd = hp - uHBc.xy; bool hin = uHBc.w > 0.0 && dot( hd, hd ) < uHBc.z * uHBc.z;
				for ( int q = 0; q < ${HUD_CARDS}; q ++ ) { if ( hin || float( q ) >= uHBn ) break; vec4 qa = uHBq[ q * 2 ], qb = uHBq[ q * 2 + 1 ]; vec2 ql = hp - qa.xy; ql = vec2( qa.z * ql.x + qa.w * ql.y, qa.z * ql.y - qa.w * ql.x );
					vec2 qe = abs( ql ) - qb.xy + qb.z; hin = length( max( qe, 0.0 ) ) + min( max( qe.x, qe.y ), 0.0 ) < qb.z; }
				if ( hin ) { vec3 ha = vec3( 0.0 ); float hw = 0.0;
				for ( int j = - ${H}; j <= ${H}; j ++ ) for ( int i = - ${H}; i <= ${H}; i ++ ) { vec2 u = vec2( float( i ), float( j ) ); float w = exp( - 0.28125 * dot( u, u ) );
					ha += w * gdHudOut( texture2D( tDiffuse, vUv + u * uHBs ).rgb ); hw += w; }
				gl_FragColor.rgb = ha / hw * uHBk; } }
		`;
// Patch the composer's last pass (once, as it is built): uniforms, the colour function, the shapes at the end of main().
export function hudBlurPatch(pass) {
  const m = pass?.material; if (!m || pass.gdHudBlur) return pass;
  const fs = m.fragmentShader, at = fs.lastIndexOf('}'), mi = fs.indexOf('void main()'); if (at < 0 || mi < 0 || !fs.includes('uniform sampler2D tDiffuse;')) return pass;
  const U = pass.uniforms || m.uniforms; U.uHBc = { value: new Vector4() }; U.uHBk = { value: 0 }; U.uHBo = { value: new Vector4(1, 1, 1, 0) }; U.uHBs = { value: new Vector2(0, 0) }; U.uHBq = { value: new Float32Array(HUD_CARDS * 8) }; U.uHBn = { value: 0 }; m.uniforms = U;
  m.fragmentShader = fs.slice(0, mi).replace('uniform sampler2D tDiffuse;', `uniform sampler2D tDiffuse;\nuniform vec4 uHBc;\nuniform float uHBk;\nuniform vec4 uHBo;\nuniform vec2 uHBs;\nuniform vec4 uHBq[ ${HUD_CARDS * 2} ];\nuniform float uHBn;`) + OUT_FN + fs.slice(mi, at) + BLUR_CODE + fs.slice(at);
  m.needsUpdate = true; pass.gdHudBlur = { ver: -1, bw: 0, bh: 0 }; return pass; }
// Each frame (graphics.js, a patched pass): the shapes into the canvas's CSS pixels (x / y from the window's, minus the
// canvas's corner — the picture's box with black bars), the scale to the drawing buffer (gl_FragCoord: origin bottom left).
// canvas: the renderer's canvas; bw × bh: the composer's buffer. No allocation; the canvas's box read only when a shape
// or the buffer's size changes (uHBq: a flat Float32Array, uploaded as it is).
export function hudBlurFrame(pass, canvas, bw, bh) {
  const S = pass?.gdHudBlur; if (!S) return; const U = pass.uniforms || pass.material.uniforms, B = HUD_BLUR, Q = B.q;
  let nc = 0; for (let i = 0; i < HUD_CARDS; i++) if (Q[i * 8 + 7]) nc++;
  if (!(B.want && B.r > 0) && !nc) { U.uHBk.value = 0; return; }
  if (S.ver !== B.ver || S.bw !== bw || S.bh !== bh) { S.ver = B.ver; S.bw = bw; S.bh = bh;
    const r = canvas?.getBoundingClientRect?.(), cw = r?.width || bw, ch = r?.height || bh, L = r?.left || 0, T = r?.top || 0;
    U.uHBo.value.set(cw / bw, ch / bh, bh, 0); U.uHBs.value.set(.75 * B.s / cw, .75 * B.s / ch);
    U.uHBc.value.set(B.x - L, B.y - T, B.r, B.want && B.r > 0 ? 1 : 0);
    const D = U.uHBq.value; let n = 0; for (let i = 0; i < HUD_CARDS; i++) { const o = i * 8; if (!Q[o + 7]) continue; const d = n * 8;
      D[d] = Q[o] - L; D[d + 1] = Q[o + 1] - T; D[d + 2] = Q[o + 2]; D[d + 3] = Q[o + 3]; D[d + 4] = Q[o + 4]; D[d + 5] = Q[o + 5]; D[d + 6] = Math.min(Q[o + 6], Q[o + 4], Q[o + 5]); D[d + 7] = 0; n++; }
    U.uHBn.value = n; }
  U.uHBk.value = B.k; }
