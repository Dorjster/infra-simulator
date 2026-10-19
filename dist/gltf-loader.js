// three.js's GLTFLoader that also reads meshopt-compressed files (EXT_meshopt_compression): the CS2 looks, first-person
// sets and agents imported on this computer are stored that way (about half the size; tools/import-cs2-models.mjs,
// ~/CS2-extract/build/compress_assets.sh — gltfpack -cc -noq: the same attributes, losslessly packed).
import { GLTFLoader } from './post/GLTFLoader.js';
import { MeshoptDecoder } from './post/meshopt_decoder.module.js';
export const gltfLoader = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
