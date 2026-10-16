// What a match's loading card says while the big files come in (a CS2 map's collision file, its look and light, from
// the host over the network): which file and how far, so a slow download never looks like a frozen game.
export const loadProgress = { label: '', got: 0, total: 0, at: 0 };
export function noteProgress(label, got, total) { loadProgress.label = label; loadProgress.got = got; loadProgress.total = total; loadProgress.at = performance.now(); }
// fetch → ArrayBuffer, noting progress as it arrives (Content-Length known: a percentage; else the megabytes so far).
export async function fetchBuffer(url, label) {
  const r = await fetch(url); if (!r.ok) throw Error(label + ': ' + r.status);
  const total = +r.headers.get('content-length') || 0; if (!r.body?.getReader) return r.arrayBuffer();
  const rd = r.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; noteProgress(label, got, total); }
  const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out.buffer;
}
export function progressText() {
  const p = loadProgress; if (!p.label || performance.now() - p.at > 4000) return 'Loading…';
  return p.label + ' · ' + (p.total ? Math.min(100, Math.round(p.got / p.total * 100)) + '%' : (p.got / 1048576).toFixed(0) + ' MB');
}
