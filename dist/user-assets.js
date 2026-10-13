// Models from files (Counter-Strike 2 agents, guns, knives, bomb and defuse kit) on the client: converted on the host's
// computer by tools/import-cs2-models.mjs into user-assets/ (never shipped), listed by the room (GET /api/user-assets,
// the import's manifest) and served by it (GET /user-assets/<path>). Everyone in the room draws the host's models;
// without any, the built-in models stay. The manifest is read once per page.
let manifest = null;
const EMPTY = { hash: '', models: {} };
export function userAssets() {
  if (!manifest) { const web = typeof fetch === 'function' && typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
    manifest = !web ? Promise.resolve(EMPTY) : fetch('/api/user-assets').then(r => r.ok ? r.json() : EMPTY).then(m => m?.models ? m : EMPTY).catch(() => EMPTY); }
  return manifest;
}
// A file of the import (path inside user-assets/), versioned by the import so browsers cache it for good.
export const userAssetURL = (m, rel) => new URL('/user-assets/' + rel + '?h=' + encodeURIComponent(m.hash || ''), location.href).href;
