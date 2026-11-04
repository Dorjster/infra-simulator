// Global Defensive · post-process anti-aliasing on the Medium preset's output pass (v53 LOOK, review fix).
// Before v53 LOOK, GD Medium drew straight to the canvas, which has the browser's 4× MSAA. CS2's bloom and auto exposure
// (gd-exposure.js) need a post-processing buffer on Medium, and that buffer has no MSAA: a 4× MSAA half-float buffer
// halved Medium's frame rate at the user's real size (2940 × 1912, the A/B in UPDATE-v53.0.md: 25.5 / 27.3 fps against
// 53.6 without it). So Medium's edges are smoothed in the output pass instead — like CS2's own post-process choice in
// its "Multisampling Anti-Aliasing Mode" list (csgo_english.txt SFUI_Settings_CMAA "CMAA2", beside None / 2x / 4x / 8x
// MSAA). notCS2: ours is the simple FXAA form (Lottes' FXAA 3.11 "console" variant: 5 reads for the edge direction, 4
// more along it), not CMAA2.
// The pass is the composer's LAST pass in OutputPass's place (graphics.js builds it only for a GD composer that exists for
// the map's look alone: no glow, no sharpen, no MSAA asked — GD Medium), with OutputPass's own tone mapping and sRGB
// output (its defines) after the anti-aliasing. Luma for the edge test is sqrt of the linear luminance (close to the
// display's). No allocation per frame; its program is built with the composer (behind the loading card).
import { OutputPass } from './post/OutputPass.js';
import { Vector2 } from './three.module.js';

export const FXAA = Object.freeze({ reduceMin: 1 / 128, reduceMul: 1 / 8, span: 8 });   // (FXAA 3.11 console defaults)
export class FxaaOutputPass extends OutputPass {
  constructor() {
    super();
    this.uniforms.uTexel = { value: new Vector2(1, 1) };
    this.material.uniforms = this.uniforms; this.material.name = 'GDFxaaOutput';
    this.material.fragmentShader = this.material.fragmentShader
      .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\nuniform vec2 uTexel;\nfloat gdLuma( vec3 c ) { return sqrt( max( dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.0 ) ); }')
      .replace('gl_FragColor = texture2D( tDiffuse, vUv );', `vec4 cM = texture2D( tDiffuse, vUv );
			vec3 nw = texture2D( tDiffuse, vUv + vec2( - 1.0, - 1.0 ) * uTexel ).rgb, ne = texture2D( tDiffuse, vUv + vec2( 1.0, - 1.0 ) * uTexel ).rgb;
			vec3 sw = texture2D( tDiffuse, vUv + vec2( - 1.0, 1.0 ) * uTexel ).rgb, se = texture2D( tDiffuse, vUv + vec2( 1.0, 1.0 ) * uTexel ).rgb;
			float lNW = gdLuma( nw ), lNE = gdLuma( ne ), lSW = gdLuma( sw ), lSE = gdLuma( se ), lM = gdLuma( cM.rgb );
			float lMin = min( lM, min( min( lNW, lNE ), min( lSW, lSE ) ) ), lMax = max( lM, max( max( lNW, lNE ), max( lSW, lSE ) ) );
			vec2 dir = vec2( - ( ( lNW + lNE ) - ( lSW + lSE ) ), ( lNW + lSW ) - ( lNE + lSE ) );
			float red = max( ( lNW + lNE + lSW + lSE ) * ( 0.25 * ${FXAA.reduceMul} ), ${FXAA.reduceMin} ), rcp = 1.0 / ( min( abs( dir.x ), abs( dir.y ) ) + red );
			dir = clamp( dir * rcp, vec2( - ${FXAA.span}.0 ), vec2( ${FXAA.span}.0 ) ) * uTexel;
			vec3 a = 0.5 * ( texture2D( tDiffuse, vUv + dir * ( 1.0 / 3.0 - 0.5 ) ).rgb + texture2D( tDiffuse, vUv + dir * ( 2.0 / 3.0 - 0.5 ) ).rgb );
			vec3 b = a * 0.5 + 0.25 * ( texture2D( tDiffuse, vUv - dir * 0.5 ).rgb + texture2D( tDiffuse, vUv + dir * 0.5 ).rgb );
			float lB = gdLuma( b );
			gl_FragColor = vec4( ( lB < lMin || lB > lMax ) ? a : b, cM.a );`);
    this.isFxaa = true;
  }
  render(renderer, writeBuffer, readBuffer, dt, mask) {
    const w = readBuffer?.width || 1, h = readBuffer?.height || 1; this.uniforms.uTexel.value.set(1 / w, 1 / h);
    return super.render(renderer, writeBuffer, readBuffer, dt, mask);
  }
}
