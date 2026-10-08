// Arena characters from Counter-Strike 1.6 player models the player imports from their own computer
// (Settings → Arena characters). Files are kept in this browser / app's local storage (IndexedDB) and are never
// uploaded or shared. Each team (T, CT) gets the models imported for it; everyone in the arena is drawn with one.
// Without imported models the arena keeps the normal engineer avatars.
import { parseMdl, buildMdl } from './goldsrc-mdl.js';
import * as THREE from './three.module.js';
import { weaponModel } from './weapon-models.js';
import { weaponById } from './weapons-data.js';

const DB = 'infra-cs-models', STORE = 'files';
function db() { return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function tx(mode, fn) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(STORE, mode), out = fn(t.objectStore(STORE)); t.oncomplete = () => { d.close(); res(out?.result ?? out); }; t.onerror = () => { d.close(); rej(t.error); }; }); }

// Minimal .zip reader (stored or deflated entries) using the browser's own decompressor.
async function unzip(buf) {
  const dv = new DataView(buf), out = []; let e = buf.byteLength - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--; if (e < 0) throw Error('Not a zip file');
  let p = dv.getUint32(e + 16, true); const n = dv.getUint16(e + 10, true);
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nlen)); p += 46 + nlen + xlen + clen;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true), raw = new Uint8Array(buf, start, csize);
    if (!/\.mdl$/i.test(name)) continue;
    const data = method === 0 ? raw.slice().buffer : method === 8 ? await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer() : null;
    if (data) out.push({ name: name.split('/').pop(), data });
  }
  return out;
}

const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

export function createCharacters() {
  let built = { t: [], ct: [] }, loading = null, version = 0;
  async function load() {
    const rows = await tx('readonly', s => s.getAll()).catch(() => []), next = { t: [], ct: [] };
    for (const r of rows || []) { try { next[r.team]?.push(buildMdl(parseMdl(r.data))); } catch (e) { console.warn('Skipped model', r.name, e.message); } }
    built = next; version++; return counts();
  }
  const counts = () => ({ t: built.t.length, ct: built.ct.length });
  return {
    ready: () => (loading ??= load()),
    counts,
    get version() { return version; },
    get available() { return built.t.length + built.ct.length > 0; },
    // Import .mdl files (or .zip files with .mdl inside) for one team. Returns how many models were added.
    async import(team, files) {
      if (!['t', 'ct'].includes(team)) throw Error('Unknown team'); const found = [];
      for (const f of files) { const buf = await f.arrayBuffer(); if (/\.zip$/i.test(f.name)) found.push(...await unzip(buf)); else if (/\.mdl$/i.test(f.name)) found.push({ name: f.name, data: buf }); }
      const ok = found.filter(m => { try { parseMdl(m.data); return true; } catch { return false; } });   // skip texture-only / broken files
      if (!ok.length) throw Error('No usable CS 1.6 player models (.mdl) found');
      await tx('readwrite', s => { for (const m of ok) s.put({ team, name: m.name, data: m.data }, team + '/' + m.name); });
      loading = load(); await loading; return ok.length;
    },
    async clear() { await tx('readwrite', s => s.clear()); built = { t: [], ct: [] }; version++; },
    // Team for a name in deathmatch (stable), unless the match gives one. Falls back to the side that has models.
    teamOf(name, given) { const t = given || (hash(name) % 2 ? 'ct' : 't'); return built[t].length ? t : built.t.length ? 't' : 'ct'; },
    // A posed character for this player: { g, update(dt, state), setWeapon(id), dispose() }.
    make(name, team) {
      const list = built[this.teamOf(name, team)]; if (!list.length) return null;
      const inst = list[hash(name + '#') % list.length].instance(); let gun = null, gunId = null, kind = null;
      const r = new THREE.Vector3(), l = new THREE.Vector3(), m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3();
      return { g: inst.g, team: this.teamOf(name, team), model: list[hash(name + '#') % list.length].name,
        update(dt, s) {
          inst.update(dt, s); if (!gun) return; gun.visible = !s.dead; if (s.dead || !inst.hands(r, l)) return;
          // Hold it like CS: grip in the right hand, barrel through the left (support) hand; one-handed weapons point forward.
          if (kind === 'knife' || r.distanceTo(l) < .4) l.copy(r).add(fwd.set(0, 0, -1)); else l.add(fwd.copy(l).sub(r).normalize().multiplyScalar(.01));
          m.lookAt(r, l, up); gun.quaternion.setFromRotationMatrix(m); gun.position.copy(r);
        },
        // Our own gun model in the character's hands.
        setWeapon(id) { if (id === gunId) return; gunId = id; if (gun) { gun.removeFromParent(); gun = null; } if (!id) return;
          kind = weaponById(id)?.kind || null; gun = weaponModel(id, 1); inst.g.add(gun); },
        dispose: () => inst.dispose() };
    },
  };
}
