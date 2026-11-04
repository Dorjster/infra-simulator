// v53 LINEUPS · the Desktop picture GD-v53-lineups-bounce.jpg: top-down crops of CS2's radar pictures (the user's own
// install, user-assets/radar — local only) for six public CS2 lineups, each with CS2's landing point (and the 32-unit
// hit ring), our flight before package LINEUPS (HEAD's arena-nades.js / nade-mesh.js / bsp-map.js) and after it, with
// every touch marked (floor: filled dot, wall or ceiling: ring) and where each one comes to rest. No game is run here:
// the flights come from the fitting harness (scratchpad lineups/harness2.mjs → sheet6.json / the final pass's sheet-final.json, the game's own simThrow on
// the real nade meshes). Chrome runs muted (bt2.sh).
//   node tests/browser/gd-lineups-bounce-sheet.mjs <repo> <out> <sheet6.json> <picture.jpg>
import { chromium } from 'playwright-core'; import { readFileSync, existsSync } from 'node:fs';
const [repo, , dataFile, jpg] = process.argv.slice(2);
const L = JSON.parse(readFileSync(dataFile, 'utf8')), RJ = JSON.parse(readFileSync(repo + '/user-assets/radar/radar.json', 'utf8'));
const img = f => existsSync(f) ? 'data:image/png;base64,' + readFileSync(f).toString('base64') : '';
const radars = {}; for (const l of L) { const m = RJ.maps[l.map]; if (m && !radars[l.map]) radars[l.map] = { ...m, src: img(repo + '/user-assets/radar/' + m.img) }; }
const CSS = '<style>body{margin:0;padding:16px 20px;background:#14171b;color:#e8ecef;font:14px system-ui}h1{font-size:22px;margin:0 0 4px}p{margin:2px 0 10px;color:#b8c2cc;max-width:1500px}.g{display:grid;grid-template-columns:repeat(3,600px);gap:14px}figure{margin:0}figcaption{font-size:13px;line-height:1.35;margin-top:4px}canvas{display:block;border:1px solid #333}.k{display:inline-block;width:22px;height:4px;vertical-align:middle;margin:0 4px 0 10px}</style>';
let h = `<h1>Global Defensive v53 LINEUPS · six lineups that missed before, top-down on CS2's radar</h1>
<p>Yellow: CS2's landing point and the 32-unit ring of a hit. <span class="k" style="background:#ff6b5a"></span>before (v53 batch B)
<span class="k" style="background:#4fe08a"></span>after (Source's one bounce a tick, the box edge, CS2's windows breakable glass). Dots: floor touches; rings: walls or ceilings;
squares: where it rests. All 366 public lineups: 189 → 209 hits (21 gained, 1 lost). Only the Xbox smoke turns into a hit here: the other five still miss,
and the notes say why.</p><div class="g">`;
L.forEach((l, i) => { h += `<figure><canvas id="c${i}" width="1200" height="840" style="width:600px;height:420px"></canvas><figcaption><b>${l.title}</b> (${l.name}, ${l.type}) · before ${l.old.miss} units off${l.old.hit ? ' (hit)' : ''} → after <b>${l.new.miss}</b>${l.new.hit ? ' (hit)' : ''} · touches ${l.old.cl.length} → ${l.new.cl.length} · rests ${Math.abs(Math.round(l.new.end[2] - l.land[2]))} units ${l.new.end[2] >= l.land[2] ? 'above' : 'below'} CS2's point</figcaption></figure>`; });
h += '</div>';
const script = `<script>const L=${JSON.stringify(L)}, R=${JSON.stringify(radars)};
Promise.all(L.map((l,i)=>new Promise(ok=>{ const m=R[l.map], im=new Image(); im.onload=()=>{ draw(l,i,m,im); ok(); }; im.onerror=()=>{ draw(l,i,m,null); ok(); }; im.src=m?m.src:''; }))).then(()=>{ document.title='done'; });
function draw(l,i,m,im){ const c=document.getElementById('c'+i), g=c.getContext('2d'), W=c.width, H=c.height, k=im?im.naturalWidth/1024:1;
  const uv=p=>[(p[0]-m.pos_x)/m.scale*k,(m.pos_y-p[1])/m.scale*k];
  // the crop: CS2's point, both rest points, both paths' last 2.5 s and every touch
  const pts=[l.land,l.old.end,l.new.end]; for(const s of [l.old,l.new]){ for(const q of s.path.slice(-160)) pts.push(q); for(const q of s.cl) pts.push(q.at); }
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const p of pts){ const [u,v]=uv(p); x0=Math.min(x0,u);x1=Math.max(x1,u);y0=Math.min(y0,v);y1=Math.max(y1,v); }
  const pad=40*k/m.scale*5, cw=Math.max(x1-x0+2*pad,(y1-y0+2*pad)*W/H,60*k), ch=cw*H/W, cx=(x0+x1)/2, cy=(y0+y1)/2, sx=W/cw, ox=cx-cw/2, oy=cy-ch/2;
  g.fillStyle='#000'; g.fillRect(0,0,W,H); if(im){ g.imageSmoothingQuality='high'; g.drawImage(im,ox,oy,cw,ch,0,0,W,H); g.fillStyle='rgba(0,0,0,.35)'; g.fillRect(0,0,W,H); }
  const P=p=>{ const [u,v]=uv(p); return [(u-ox)*sx,(v-oy)*sx]; }, hu=sx*k/m.scale;
  const path=(s,col,dash)=>{ g.strokeStyle=col; g.lineWidth=4; g.setLineDash(dash); g.beginPath(); s.path.forEach((q,j)=>{ const [a,b]=P(q); j?g.lineTo(a,b):g.moveTo(a,b); }); g.stroke(); g.setLineDash([]);
    for(const t of s.cl){ const [a,b]=P(t.at); g.beginPath(); g.arc(a,b,9,0,7); if(t.nz>.7){ g.fillStyle=col; g.fill(); } else { g.lineWidth=4; g.strokeStyle=col; g.stroke(); } }
    const [a,b]=P(s.end); g.fillStyle=col; g.fillRect(a-12,b-12,24,24); g.strokeStyle='#000'; g.lineWidth=2; g.strokeRect(a-12,b-12,24,24); };
  path(l.new,'#4fe08a',[]); path(l.old,'#ff6b5a',[14,14]);   // (before on top, dashed: where the two flights are the same, both show)
  const [a,b]=P(l.land); g.strokeStyle='#ffd23f'; g.lineWidth=4; g.beginPath(); g.arc(a,b,32*hu,0,7); g.stroke(); g.beginPath(); g.moveTo(a-16,b); g.lineTo(a+16,b); g.moveTo(a,b-16); g.lineTo(a,b+16); g.stroke();
  // a 100-unit scale bar
  g.fillStyle='#fff'; g.fillRect(24,H-34,100*hu,6); g.font='24px system-ui'; g.fillText('100 units',24,H-44); }
</script>`;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--mute-audio'] });
const s = await b.newPage({ viewport: { width: 1890, height: 1000 } }); await s.setContent(CSS + h + script); await s.waitForFunction(() => document.title === 'done', null, { timeout: 30000 });
await s.screenshot({ path: jpg, type: 'jpeg', quality: 88, fullPage: true }); await b.close(); console.log('wrote ' + jpg);
