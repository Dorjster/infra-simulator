// Converts the CC0 "Guns & Explosives" pack (3dmodelscc0, itch.io, public domain) into the game's compact model
// files: dist/models/weapons/<id>.bin (geometry) + <id>-base.jpg / -normal.jpg / -orm.jpg (textures).
// Runs three.js' FBXLoader in Chrome.  node tools/pack-weapons.mjs "<pack folder>/Guns&Explosives" [id,id…]
// The karambit is a separate download ("Karambit" by Diamonddogkz, Sketchfab, CC BY 4.0): put its .fbx and
// textures together in <folder>/Karambit; its metal parts are repainted in an original ruby finish.
import { chromium } from 'playwright-core'; import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const src = process.argv[2], out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'models', 'weapons'); mkdirSync(out, { recursive: true });
// game id → pack folder, texture prefix, texture size
const JOBS = {
  ak: ['AK-47', 'AK47', 1024], m4: ['M4A1', 'M4A1', 1024], sniper: ['Sniper', 'Sniper', 1024], shotgun: ['Shotgun', 'Shotgun', 1024], pistol: ['Pistol_MK', null, 1024], karambit: ['Karambit', 'Karambit', 1024],
  greasegun: ['GreaseGun', 'Grease_Gun', 1024], luger: ['Luger', 'Luger', 1024], suomi: ['Suomi_KP', 'Suomi_KP', 1024],
  he: ['FragGrenade', 'FragGrenade', 512], flash: ['Flashbang', 'Flashbang', 512], smoke: ['Smoke_Grenade', 'Smoke_Grenade', 512], molotov: ['Molotv_Cocktail', null, 512], c4: ['C4', 'C4', 1024],
};
// Loose parts left out (spare magazines lying next to the gun).
const DROP = { sniper: ['Magazine'], pistol: ['Magazine'], luger: ['Clip'] };
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const p = await b.newPage(); p.on('pageerror', e => console.error(e.message));
await p.route('http://assets.local/**', r => { try { r.fulfill({ body: readFileSync(path.join(src, decodeURIComponent(new URL(r.request().url()).pathname))) }); } catch { r.fulfill({ status: 404 }); } });
await p.setContent(`<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/"}}</script>`);
const only = process.argv[3]?.split(',');
for (const [id, [dir, prefix, size]] of Object.entries(JOBS)) {
  if (only && !only.includes(id)) continue;
  const files = readdirSync(path.join(src, dir)), fbx = files.find(f => /\.fbx$/i.test(f));
  // texture sets: by prefix (one set) or by material name (molotov: Bottle / Fabric / Liquid)
  const sets = {}; for (const f of files.filter(f => /\.png$/i.test(f))) { const m = /^(.*)_(Base_?Colou?r?|Normal(?:_DirectX)?|Roughness|Metallic|Opacity|Emissive|Height)\.png$/i.exec(f); if (!m) continue; const key = prefix ? '*' : m[1].replace(/_Base$/, ''); (sets[key] ??= {})[m[2].toLowerCase().split('_')[0].replace('base', 'base')] = { file: f, dx: /DirectX/i.test(f) }; }
  const res = await p.evaluate(async ({ id, dir, fbx, sets, size, DROP }) => {
    const THREE = await import('three'), { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
    const obj = new FBXLoader().parse(await (await fetch(`http://assets.local/${dir}/${fbx}`)).arrayBuffer(), ''); obj.updateMatrixWorld(true);
    // Merge every mesh (world transform baked) into one part per texture set.
    const parts = new Map();
    obj.traverse(o => { if (!o.isMesh || (DROP[id] || []).includes(o.name)) return; const g = o.geometry.clone().applyMatrix4(o.matrixWorld), mats = [].concat(o.material);
      const groups = g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : g.attributes.position.count, materialIndex: 0 }];
      const ng = g.index ? g.toNonIndexed() : g;
      for (const gr of groups) { const mname = mats[gr.materialIndex || 0]?.name || '', key = sets['*'] ? '*' : Object.keys(sets).find(k => mname.toLowerCase().includes(k.toLowerCase())) || Object.keys(sets)[0];
        const P = ng.attributes.position.array.slice(gr.start * 3, (gr.start + gr.count) * 3), N = ng.attributes.normal?.array.slice(gr.start * 3, (gr.start + gr.count) * 3), U = ng.attributes.uv?.array.slice(gr.start * 2, (gr.start + gr.count) * 2);
        const pt = parts.get(key) || parts.set(key, { P: [], N: [], U: [] }).get(key); pt.P.push(P); pt.N.push(N || new Float32Array(P.length)); pt.U.push(U || new Float32Array(P.length / 3 * 2)); } });
    const cat = arrs => { const n = arrs.reduce((a, x) => a + x.length, 0), o = new Float32Array(n); let k = 0; for (const a of arrs) { o.set(a, k); k += a.length; } return o; };
    // Textures: base colour, normal (DirectX → OpenGL: flip green), packed ORM (R = 1, G = roughness, B = metalness).
    const img = async f => { if (!f) return null; const i = await createImageBitmap(await (await fetch(`http://assets.local/${dir}/${f.file}`)).blob()); const c = new OffscreenCanvas(size, size), x = c.getContext('2d'); x.drawImage(i, 0, 0, size, size); return x.getImageData(0, 0, size, size); };
    const jpg = async (data, q = .86) => { const c = new OffscreenCanvas(size, size); c.getContext('2d').putImageData(data, 0, 0); const bl = await c.convertToBlob({ type: 'image/jpeg', quality: q }); const u8 = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode(...u8.subarray(i, i + 32768)); return btoa(s); };
    const outParts = [], tex = {};
    for (const [key, pt] of parts) {
      const t = sets[key] || {}, base = await img(t.base || t['base_color'] || t.basecolor || Object.entries(t).find(([k]) => k.startsWith('base'))?.[1]), nor = await img(t.normal), rou = await img(t.roughness), met = await img(t.metallic);
      const name = key === '*' ? 'main' : key.toLowerCase(); const tx = {};
      // Ruby: metal (metallic > 50%) gets an original marbled ruby, keeping the authored light/dark detail; glossier.
      if (id === 'karambit' && base && met) { const n = (x, y) => Math.sin(x * .021 + Math.sin(y * .013) * 3) + Math.sin(y * .017 + Math.sin(x * .009) * 4) * .8 + Math.sin((x + y) * .031) * .4;
        for (let i = 0; i < base.data.length; i += 4) { if (met.data[i] < 128) continue; const px = i / 4 % size, py = i / 4 / size | 0, v = (n(px, py) + 2.2) / 4.4, l = (base.data[i] + base.data[i + 1] + base.data[i + 2]) / 765, k = .55 + l * .9;
          base.data[i] = Math.min(255, (150 + 105 * v) * k); base.data[i + 1] = Math.min(255, (10 + 70 * v * v) * k); base.data[i + 2] = Math.min(255, (40 + 80 * v * v) * k); if (rou) rou.data[i] = Math.min(rou.data[i], 70); } }
      if (base) tx.base = await jpg(base);
      if (nor) { if (t.normal.dx) for (let i = 1; i < nor.data.length; i += 4) nor.data[i] = 255 - nor.data[i]; tx.normal = await jpg(nor, .9); }
      if (rou || met) { const o = new ImageData(size, size); for (let i = 0; i < o.data.length; i += 4) { o.data[i] = 255; o.data[i + 1] = rou ? rou.data[i] : 160; o.data[i + 2] = met ? met.data[i] : 0; o.data[i + 3] = 255; } tx.orm = await jpg(o, .9); }
      tex[name] = tx; outParts.push({ name, P: cat(pt.P), N: cat(pt.N), U: cat(pt.U), opacity: !!t.opacity });
    }
    const box = new THREE.Box3(); for (const pt of outParts) for (let i = 0; i < pt.P.length; i += 3) box.expandByPoint(new THREE.Vector3(pt.P[i], pt.P[i + 1], pt.P[i + 2]));
    return { tex, box: [box.min.toArray(), box.max.toArray()], parts: outParts.map(pt => ({ name: pt.name, opacity: pt.opacity, P: Array.from(pt.P), N: Array.from(pt.N), U: Array.from(pt.U) })) };
  }, { id, dir, fbx, sets, size, DROP });
  // Binary: JSON header (part names, counts) + float32 position / normal / uv per part (centimetres, as authored).
  const header = { id, box: res.box, parts: res.parts.map(pt => ({ name: pt.name, count: pt.P.length / 3, opacity: pt.opacity })) };
  const hj = Buffer.from(JSON.stringify(header)), pad = (4 - (hj.length + 4) % 4) % 4, chunks = [Buffer.alloc(4), hj, Buffer.alloc(pad, 32)]; chunks[0].writeUInt32LE(hj.length + pad);
  for (const pt of res.parts) for (const a of [pt.P, pt.N, pt.U]) chunks.push(Buffer.from(new Float32Array(a).buffer));
  writeFileSync(path.join(out, id + '.bin'), Buffer.concat(chunks));
  for (const [name, tx] of Object.entries(res.tex)) for (const [kind, b64] of Object.entries(tx)) writeFileSync(path.join(out, `${id}-${name}-${kind}.jpg`), Buffer.from(b64, 'base64'));
  console.log(id, header.parts.map(p => p.name + ':' + p.count).join(' '), 'box', res.box.map(v => v.map(n => n.toFixed(1)).join(',')).join(' → '));
}
await b.close();
