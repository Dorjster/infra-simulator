// A rim of light round a character's outline (brightest where the surface turns away from the eye: the model's own
// smooth surface, not its normal map's detail), so a player in a dark corner still reads against the wall behind.
// Its strength is the character's own: material.userData.rim ({ value }), one object shared by all of a character's
// materials, set from how dark it stands (cs2-agents.js).
// Every material with it shares one shader (compiled on the loading screen with the rest).
import * as THREE from './three.module.js';

const COLOR = { value: new THREE.Color(0xd2e2ff) }, NONE = { value: 0 };
function rimShader(shader) {
  shader.uniforms.uRim = this.userData.rim || NONE; shader.uniforms.uRimColor = COLOR;
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uRim;\nuniform vec3 uRimColor;')
    .replace('#include <opaque_fragment>', '{ float rimF = 1.0 - saturate( dot( nonPerturbedNormal, normalize( vViewPosition ) ) ); rimF *= rimF; outgoingLight += uRimColor * ( uRim * rimF * rimF ); }\n#include <opaque_fragment>');
}
const rimKey = () => 'rim-1';
export function addRim(material) { material.onBeforeCompile = rimShader; material.customProgramCacheKey = rimKey; return material; }
// How strong for a character lit at `shade` (its tint: .3 in the dark … 1.1 in full sun): faint in the sun, clear in the dark.
export const rimFor = shade => .05 + .3 * Math.max(0, Math.min(1, (1.1 - shade) / .8));
