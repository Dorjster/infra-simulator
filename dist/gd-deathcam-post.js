// Global Defensive · the death cam's local contrast (v53 DETAILS, open-B#22): the one block of CS2's
// lighting/postprocessing/effects/death_cam_phase1.vpost the death cam (gd-deathcam.js) did not draw.
//
// FROM THE FILE (Source2Viewer-CLI -b DATA on death_cam_phase1.vpost_c, the user's install): m_bHasLocalContrastParams
// true, m_localConstrastParams { m_flLocalContrastStrength 2.0, m_flLocalContrastEdgeStrength 2.0,
// m_flLocalContrastVignetteStart −0.3092, m_flLocalContrastVignetteEnd 0.9408, m_flLocalContrastVignetteBlur 0.9455 }.
// NOT IN THE FILES: the shader that applies them (the install has no post-processing shader sources). OUR READING, one
// full-screen pass:
//   r      = the pixel's distance from the screen centre, 0 at the centre, 1 at a corner;
//   v      = smoothstep(VignetteStart, VignetteEnd, r) — how far into the vignette it is;
//   detail = in the perceptual (square-root) domain, the luma's difference from a WIDE blur (local contrast, × Strength)
//            plus its difference from a 1-pixel blur (edges, × EdgeStrength), both faded out by (1 − v): the centre
//            gets the punch, the edges don't;
//   then the colour is pulled toward the wide blur by v × VignetteBlur — the soft, blurred rim of CS2's death cam;
//   the whole pass mixed in by `amount` (the death cam's own tint fade, gd-deathcam.js paint → DEATH_POST.amount).
// The wide blur's radius (WIDE_PX at 1080 lines, a 12-tap disc) and the detail's ±50 % limit are ours.
//
// STATE: DEATH_POST.amount, 0…1, written by the death cam; graphics.js adds this ONE pass to a Global Defensive
// composer (before its output pass), warms its program when the composer is built (behind the loading card — never a
// compile in a round), and each frame turns it on only while amount > 0 (a disabled pass costs nothing: the composer
// skips it). No composer (the software renderer, a preset with no post-processing): not drawn — said in UPDATE-v53.0.md.
// Frame cost while dead: one full-screen pass of 17 taps. Nothing allocated per frame.
import * as THREE from './three.module.js';
import { Pass, FullScreenQuad } from './post/Pass.js';

export const LOCAL_CONTRAST = { strength: 2.0, edge: 2.0, vStart: -0.3092, vEnd: 0.9408, vBlur: 0.9455, from: 'lighting/postprocessing/effects/death_cam_phase1.vpost (m_localConstrastParams)' };
export const WIDE_PX = 16, DETAIL_MAX = .5;   // (ours: the wide blur's radius at 1080 lines; the detail's limit, a share of the luma)
export const DEATH_POST = { amount: 0 };

const VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;
const FS = `uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uWide; uniform float uAspect; uniform float uAmt;
uniform float uS; uniform float uE; uniform float uV0; uniform float uV1; uniform float uVB; varying vec2 vUv;
const vec3 LW = vec3( 0.2126, 0.7152, 0.0722 );
vec3 P( vec2 uv ) { return sqrt( max( texture2D( tDiffuse, uv ).rgb, vec3( 0.0 ) ) ); }
void main() {
  vec4 c4 = texture2D( tDiffuse, vUv ); vec3 c = sqrt( max( c4.rgb, vec3( 0.0 ) ) );
  vec2 w = uTexel * uWide; vec3 wide = vec3( 0.0 );
  wide += P( vUv + w * vec2( 1.0, 0.0 ) ); wide += P( vUv + w * vec2( -1.0, 0.0 ) ); wide += P( vUv + w * vec2( 0.0, 1.0 ) ); wide += P( vUv + w * vec2( 0.0, -1.0 ) );
  wide += P( vUv + w * vec2( 0.707, 0.707 ) ); wide += P( vUv + w * vec2( -0.707, 0.707 ) ); wide += P( vUv + w * vec2( 0.707, -0.707 ) ); wide += P( vUv + w * vec2( -0.707, -0.707 ) );
  wide += P( vUv + w * vec2( 0.5, 0.0 ) ); wide += P( vUv + w * vec2( -0.5, 0.0 ) ); wide += P( vUv + w * vec2( 0.0, 0.5 ) ); wide += P( vUv + w * vec2( 0.0, -0.5 ) );
  wide /= 12.0;
  vec3 near = 0.25 * ( P( vUv + vec2( uTexel.x, 0.0 ) ) + P( vUv - vec2( uTexel.x, 0.0 ) ) + P( vUv + vec2( 0.0, uTexel.y ) ) + P( vUv - vec2( 0.0, uTexel.y ) ) );
  vec2 q = ( vUv - 0.5 ) * vec2( uAspect, 1.0 ); float r = length( q ) / length( vec2( 0.5 * uAspect, 0.5 ) );
  float v = smoothstep( uV0, uV1, r );
  float L = dot( c, LW ), d = ( uS * ( L - dot( wide, LW ) ) + uE * ( L - dot( near, LW ) ) ) * ( 1.0 - v );
  d = clamp( d, -${DETAIL_MAX.toFixed(2)} * L, ${DETAIL_MAX.toFixed(2)} * L );
  vec3 o = c * ( L > 1e-4 ? ( L + d ) / L : 1.0 );
  o = mix( o, wide, v * uVB );
  gl_FragColor = vec4( mix( c4.rgb, o * o, uAmt ), c4.a ); }`;

export class DeathContrastPass extends Pass {
  constructor() {
    super(); this.isGdDeathPost = true; this.enabled = false; this.needsSwap = true;
    const L = LOCAL_CONTRAST;
    this.mat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) }, uWide: { value: WIDE_PX }, uAspect: { value: 16 / 9 }, uAmt: { value: 0 },
      uS: { value: L.strength }, uE: { value: L.edge }, uV0: { value: L.vStart }, uV1: { value: L.vEnd }, uVB: { value: L.vBlur } }, vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false });
    this.mat.name = 'GDDeathContrast'; this.quad = new FullScreenQuad(this.mat);
  }
  setSize(w, h) { const U = this.mat.uniforms; U.uTexel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h)); U.uWide.value = WIDE_PX * Math.max(1, h) / 1080; U.uAspect.value = Math.max(1, w) / Math.max(1, h); }
  // Per frame (graphics.js): on only while the death cam shows it. No allocation.
  sync(gd = true) { const a = gd ? DEATH_POST.amount : 0; this.mat.uniforms.uAmt.value = a > 0 ? (a < 1 ? a : 1) : 0; this.enabled = a > 0; }   // (gd: a Global Defensive match is drawn — elsewhere never on)
  // Its program now (the composer was just built: behind the loading card), into the composer's own buffer type.
  warm(renderer, target) { const was = renderer.getRenderTarget(); try { this.mat.uniforms.tDiffuse.value = null; renderer.setRenderTarget(target || null); this.quad.render(renderer); } finally { renderer.setRenderTarget(was); } }
  render(renderer, writeBuffer, readBuffer) {
    this.mat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); if (this.clear) renderer.clear(); this.quad.render(renderer);
  }
  dispose() { this.mat.dispose(); this.quad.dispose(); }
}
