// Maps from files (Counter-Strike 1.6 .bsp) on the client: the room lists the map files it has (GET /api/user-maps)
// and serves them (GET /user-maps/<id>.bsp); before entering a match on one, the client downloads it and puts it in
// place of the built-in map (arena-maps.js useMapFile), so the host and every player build the same map. Files are
// fetched once per version (their hash).
import { useMapFile, mapFileOf } from './arena-maps.js';

let list = null, listing = null; const loading = new Map();
export function refreshUserMaps() { listing = fetch('/api/user-maps').then(r => r.ok ? r.json() : { maps: [] }).then(d => { list = new Map((d.maps || []).map(m => [m.id, m])); return list; }).catch(() => { list = new Map(); return list; }); return listing; }
export const userMapList = () => [...(list?.values() || [])];
// A promise (with .done) when the map `id` still has to be loaded from the room; null when there is nothing to do.
export function ensureMapFile(id) {
  if (!id) return null; if (!list) { const p = (listing || refreshUserMaps()).then(() => ensureMapFile(id)?.then?.(() => {})); p.done = false; p.then(() => { p.done = true; }, () => { p.done = true; }); return p; }
  const info = list.get(id); if (!info || mapFileOf(id)?.hash === info.hash) return null;
  const key = id + ':' + info.hash; if (loading.has(key)) return loading.get(key);
  const p = fetch('/user-maps/' + encodeURIComponent(id) + '.bsp?h=' + info.hash).then(r => { if (!r.ok) throw Error('Map file ' + id + ': ' + r.status); return r.arrayBuffer(); }).then(buf => useMapFile(id, buf, { hash: info.hash, name: info.name }));
  p.done = false; p.then(() => { p.done = true; }, e => { console.warn(e); p.done = true; loading.delete(key); }); loading.set(key, p); return p;
}
