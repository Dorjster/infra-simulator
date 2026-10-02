// Classic slot-machine symbols (cherry, lemon, plum, bell, BAR, red 7), drawn the same way on the 3D reels
// and in the casino panel, so the reel you see stop is the symbol the panel shows.
export const SLOT_NAMES = ['Cherry', 'Lemon', 'Plum', 'Bell', 'BAR', 'Seven'];
// Draws symbol i centred at (0, 0) with the given size on a 2D context.
export function drawSymbol(g, i, size) {
  const s = size / 100; g.save(); g.scale(s, s); g.lineJoin = 'round';
  const shade = (x, y, r, c0, c1) => { const gr = g.createRadialGradient?.(x - r * .35, y - r * .35, r * .1, x, y, r); if (!gr?.addColorStop) return c1; gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; };
  if (i === 0) {                              // cherries on a stem
    g.strokeStyle = '#2e7d32'; g.lineWidth = 5; g.beginPath(); g.moveTo(-18, 10); g.quadraticCurveTo(-6, -30, 14, -38); g.moveTo(18, 14); g.quadraticCurveTo(14, -20, 14, -38); g.stroke();
    g.fillStyle = '#43a047'; g.beginPath(); g.ellipse(22, -36, 14, 7, -.5, 0, 7); g.fill();
    for (const [x, y] of [[-20, 20], [18, 24]]) { g.fillStyle = shade(x, y, 20, '#ff6b6b', '#a4001b'); g.beginPath(); g.arc(x, y, 20, 0, 7); g.fill(); g.strokeStyle = '#5c0010'; g.lineWidth = 2; g.stroke(); }
  } else if (i === 1) {                       // lemon
    g.fillStyle = shade(0, 0, 38, '#fff59d', '#f9a825'); g.beginPath(); g.ellipse(0, 0, 38, 27, -.2, 0, 7); g.fill(); g.strokeStyle = '#c17900'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#f9a825'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * 38, sx * 8, 7, 5, -.2, 0, 7); g.fill(); }
  } else if (i === 2) {                       // plum
    g.fillStyle = shade(0, 6, 34, '#b388ff', '#4a148c'); g.beginPath(); g.arc(0, 6, 34, 0, 7); g.fill(); g.strokeStyle = '#2a0a52'; g.lineWidth = 2; g.stroke();
    g.strokeStyle = '#4a148c'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -26); g.quadraticCurveTo(-10, 6, 0, 38); g.stroke();
    g.strokeStyle = '#5d4037'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, -26); g.lineTo(4, -40); g.stroke(); g.fillStyle = '#43a047'; g.beginPath(); g.ellipse(16, -36, 13, 6, -.3, 0, 7); g.fill();
  } else if (i === 3) {                       // golden bell
    g.fillStyle = shade(0, -4, 44, '#fff8c4', '#c79100'); g.beginPath(); g.moveTo(-34, 26); g.quadraticCurveTo(-30, -40, 0, -40); g.quadraticCurveTo(30, -40, 34, 26); g.lineTo(40, 32); g.lineTo(-40, 32); g.closePath(); g.fill(); g.strokeStyle = '#7a5600'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#7a5600'; g.beginPath(); g.arc(0, 38, 8, 0, 7); g.fill(); g.beginPath(); g.arc(0, -44, 6, 0, 7); g.fill();
  } else if (i === 4) {                       // BAR
    g.fillStyle = '#111'; g.fillRect(-44, -20, 88, 40); g.strokeStyle = '#d8a945'; g.lineWidth = 4; g.strokeRect(-44, -20, 88, 40);
    g.fillStyle = '#fff'; g.font = 'bold 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BAR', 0, 2);
  } else {                                    // red seven with gold outline
    g.font = 'bold 96px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#d8a945'; g.strokeText('7', 0, 4); g.fillStyle = shade(0, 0, 50, '#ff5252', '#9a0010'); g.fillText('7', 0, 4);
  }
  g.restore();
}
// <img> markup for the panel (cached data URLs).
const urls = new Map();
export function symbolImg(i, px = 44) {
  if (!urls.has(i)) { try { const c = document.createElement('canvas'); c.width = c.height = 120; const g = c.getContext('2d'); g.translate(60, 60); drawSymbol(g, i, 110); urls.set(i, c.toDataURL()); } catch { urls.set(i, ''); } }
  return `<img src="${urls.get(i)}" alt="${SLOT_NAMES[i]}" width="${px}" height="${px}" style="vertical-align:middle">`;
}
