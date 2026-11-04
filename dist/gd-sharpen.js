// Global Defensive's sharpen pass (v53 stage 6, spec §5.2): on the Low / Very Low presets the scene is drawn at 60–80 % of
// the screen's pixels (gd-preset.js) and the browser stretches the canvas to the window, which softens every edge. This
// pass is the composer's LAST pass in their place of three.js's OutputPass (graphics.js builds it only for a GD preset
// with `sharpen`, never on a software renderer — there no post-processing runs at all): the same tone mapping and sRGB
// output as OutputPass (its own defines), with a contrast-adaptive sharpen first — the picture's pixel plus `amount` ×
// (it minus the average of its 4 neighbours), the result clamped to the 3×3 cross's min / max so an edge never rings
// (the idea of AMD's FidelityFX CAS, much simplified: 5 taps, one pass, no extra render target).
// Cost: 5 texture reads a pixel at the reduced resolution, folded into the output pass the composer draws anyway — the
// only extra is the composer's own buffer (needed for it), so the scene costs one more full-screen copy than drawing
// straight to the canvas. No allocation per frame; its program is built with the composer (behind the loading card:
// the preset is applied before the match's first frame).
import { OutputPass } from './post/OutputPass.js';
import { Vector2 } from './three.module.js';

export const SHARPEN = { amount: .55 };   // (ours: by eye on Dust II at 0.8 and 0.6 scale — crisp edges, no halo)
export class SharpenOutputPass extends OutputPass {
  constructor(amount = SHARPEN.amount) {
    super();
    this.uniforms.uTexel = { value: new Vector2(1, 1) }; this.uniforms.uAmount = { value: amount };
    this.material.uniforms = this.uniforms; this.material.name = 'GDSharpenOutput';
    this.material.fragmentShader = this.material.fragmentShader
      .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\nuniform vec2 uTexel;\nuniform float uAmount;')
      .replace('gl_FragColor = texture2D( tDiffuse, vUv );', `vec4 c0 = texture2D( tDiffuse, vUv );
			vec3 n = texture2D( tDiffuse, vUv + vec2( 0.0, uTexel.y ) ).rgb, s = texture2D( tDiffuse, vUv - vec2( 0.0, uTexel.y ) ).rgb;
			vec3 e = texture2D( tDiffuse, vUv + vec2( uTexel.x, 0.0 ) ).rgb, w = texture2D( tDiffuse, vUv - vec2( uTexel.x, 0.0 ) ).rgb;
			vec3 lo = min( c0.rgb, min( min( n, s ), min( e, w ) ) ), hi = max( c0.rgb, max( max( n, s ), max( e, w ) ) );
			gl_FragColor = vec4( clamp( c0.rgb + uAmount * ( c0.rgb - 0.25 * ( n + s + e + w ) ), lo, hi ), c0.a );`);
    this.isSharpen = true;
  }
  render(renderer, writeBuffer, readBuffer, dt, mask) {
    const w = readBuffer?.width || 1, h = readBuffer?.height || 1; this.uniforms.uTexel.value.set(1 / w, 1 / h);
    return super.render(renderer, writeBuffer, readBuffer, dt, mask);
  }
}
