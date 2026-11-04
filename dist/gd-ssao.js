// Global Defensive · screen-space ambient occlusion on the High and Ultra presets only (v53 LOOK, spec 4.1: "ambient
// occlusion baked into the maps; screen-space AO only on High/Ultra"). Off on Medium, Low and Very Low (gd-preset.js
// `ssao`), and on any map without CS2's baked light (the composer pass is only added there).
//
// CS2 NOTE (notCS2, reported): CS2's own video setting is "Ambient Occlusion" = AO proxies (csgo_english.txt
// SFUI_Settings_AOProxy: "Calculate lighting using Ambient Occlusion") — soft occluder shapes on characters and props,
// not a screen-space pass; its maps' AO is baked. Ours approximates that contact darkening (players and moving props
// on the baked floor, where our baked light has no shadow of them) with a small, weak screen-space pass, as the spec asks.
//
// THE PASS (a composer pass right after the scene, before the smoke, needsSwap FALSE — v53 LOOK review fix: it used to
// composite into the other buffer and swap, and that buffer's depth had just been cleared, so the smoke after it
// (arena-smoke-pass.js reads readBuffer.depthTexture) marched to the far plane through walls and players. Now the AO is
// multiplied into the scene's own buffer in place — no clear, no swap — so the smoke reads the scene's depth as before):
//   1. AO at HALF resolution from the composer's depth texture (arena-smoke-pass.js wires one onto both buffers in a
//      match): each pixel's view-space point (perspective depth → view z, the camera's inverse projection), its normal
//      from the point's screen derivatives, 8 taps on a rotated spiral of RADIUS game units (16 Hammer units ≈ 2.5 u,
//      ours) around it; a tap occludes when it lies above the surface and within RADIUS (range check: no halos round
//      far edges). Interleaved-gradient noise turns the spiral per pixel.
//   2. The composite at full size, drawn over the scene's buffer with a multiply blend (dst × src: blendSrc Zero,
//      blendDst SrcColor; alpha kept), autoClear off, no depth test or write: src = mix(1, ao, STRENGTH), the AO read
//      with 4 bilinear taps (a cheap blur of the half-size result). The sky (depth 1, ao 1) is left alone. It samples
//      only the AO target, never the buffer it draws into (no feedback loop); with MSAA (Ultra) three resolves colour
//      and depth again after it — the depth unchanged, since nothing here writes depth.
//   With no depth texture yet (before the match arms the smoke's buffers) the pass does nothing.
//   Both programs are compiled by warm() when the composer is built (behind the loading card); nothing made per frame.
import * as THREE from './three.module.js';
import { Pass, FullScreenQuad } from './post/Pass.js';

export const SSAO = Object.freeze({ radius: 2.5, strength: .55, samples: 8, scale: .5 });   // (ours: subtle; see the top)
const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
const AO_FS = `#include <packing>
uniform sampler2D tDepth; uniform mat4 uInvProj; uniform mat4 uProj; uniform float uNear, uFar, uRadius; uniform vec2 uTexel; varying vec2 vUv;
vec3 viewPos( vec2 uv ) { float d = texture2D( tDepth, uv ).x; vec4 c = vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 ); vec4 v = uInvProj * c; return v.xyz / v.w; }
void main() { float d = texture2D( tDepth, vUv ).x; vec3 p = viewPos( vUv ), cr = cross( dFdx( p ), dFdy( p ) ), n = dot( cr, cr ) > 1e-12 ? normalize( cr ) : vec3( 0.0, 0.0, 1.0 );   // (derivatives before any branch; a flat 2 × 2 quad has no normal: normalize(0) is NaN, which the bloom spread into a white square on Ancient's water)
  if ( d >= 1.0 ) { gl_FragColor = vec4( 1.0 ); return; }
  float a = 6.2831853 * fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ), occ = 0.0;
  for ( int i = 0; i < ${SSAO.samples}; i ++ ) { float f = ( float( i ) + 0.5 ) / ${SSAO.samples}.0, ang = a + float( i ) * 2.39996;
    vec3 s = p + uRadius * f * ( vec3( cos( ang ), sin( ang ), 0.0 ) * 0.9 + n * 0.45 );
    vec4 q = uProj * vec4( s, 1.0 ); vec2 uv = q.xy / q.w * 0.5 + 0.5; if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) continue;
    vec3 t = viewPos( uv ); float dz = t.z - s.z; occ += step( 0.06, dz ) * ( 1.0 - smoothstep( 0.0, uRadius, abs( p.z - t.z ) ) ); }
  float ao = 1.0 - occ / ${SSAO.samples}.0; gl_FragColor = vec4( vec3( ao == ao ? clamp( ao, 0.0, 1.0 ) : 1.0 ), 1.0 ); }`;   // (ao == ao: never a NaN out)
const COMP_FS = `uniform sampler2D tAO; uniform vec2 uAOTexel; uniform float uStrength; varying vec2 vUv;
void main() { vec2 o = 0.5 * uAOTexel;
  float ao = 0.25 * ( texture2D( tAO, vUv + vec2( o.x, o.y ) ).r + texture2D( tAO, vUv + vec2( - o.x, o.y ) ).r + texture2D( tAO, vUv + vec2( o.x, - o.y ) ).r + texture2D( tAO, vUv - o ).r );
  gl_FragColor = vec4( vec3( mix( 1.0, ao, uStrength ) ), 1.0 ); }`;   // (multiplied into the frame by the blend: see the top)

export class SSAOPass extends Pass {
  constructor(camera) {
    super(); this.camera = camera; this.needsSwap = false; this.isGdSsao = true;   // (never swaps: the scene's buffer and its depth stay readBuffer for the smoke)
   
    this.ao = new THREE.WebGLRenderTarget(2, 2, { type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.aoM = new THREE.ShaderMaterial({ uniforms: { tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uNear: { value: .1 }, uFar: { value: 180 }, uRadius: { value: SSAO.radius }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: VS, fragmentShader: AO_FS, depthTest: false, depthWrite: false }); this.aoM.name = 'GDSsao';
    this.compM = new THREE.ShaderMaterial({ uniforms: { tAO: { value: this.ao.texture }, uAOTexel: { value: new THREE.Vector2() }, uStrength: { value: SSAO.strength } },
      vertexShader: VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }); this.compM.name = 'GDSsaoComposite';   // (dst × src, alpha kept)
    this.quad = new FullScreenQuad(this.aoM); this.dummy = new THREE.DepthTexture(1, 1);
  }
  setSize(w, h) { const W = Math.max(1, Math.round(w * SSAO.scale)), H = Math.max(1, Math.round(h * SSAO.scale)); this.ao.setSize(W, H); this.aoM.uniforms.uTexel.value.set(1 / W, 1 / H); this.compM.uniforms.uAOTexel.value.set(1 / W, 1 / H); }
  warm(renderer, target) { const was = renderer.getRenderTarget(), ac = renderer.autoClear; try { this.aoM.uniforms.tDepth.value = this.dummy; this.quad.material = this.aoM; renderer.setRenderTarget(this.ao); this.quad.render(renderer);
    this.quad.material = this.compM; renderer.setRenderTarget(target || null); renderer.autoClear = false; this.quad.render(renderer); } finally { renderer.autoClear = ac; renderer.setRenderTarget(was); } }
  render(renderer, writeBuffer, readBuffer) {
    if (!readBuffer.depthTexture) return;   // (before the match arms the buffers' depth textures: nothing to do)
    const cam = this.camera, U = this.aoM.uniforms; U.tDepth.value = readBuffer.depthTexture; U.uProj.value.copy(cam.projectionMatrix); U.uInvProj.value.copy(cam.projectionMatrixInverse); U.uNear.value = cam.near; U.uFar.value = cam.far;
    const ac = renderer.autoClear; try { this.quad.material = this.aoM; renderer.setRenderTarget(this.ao); this.quad.render(renderer);
      this.quad.material = this.compM; renderer.setRenderTarget(readBuffer); renderer.autoClear = false; this.quad.render(renderer);   // (into the scene's buffer, not cleared: its depth stays for the smoke)
    } finally { renderer.autoClear = ac; }
  }
  dispose() { this.ao.dispose(); this.aoM.dispose(); this.compM.dispose(); this.quad.dispose(); this.dummy.dispose(); }
}
