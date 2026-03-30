import { ENTRIES_PER_CHANNEL, MAX_VALUE } from './ldt';

const CHANNEL_COLORS = ['#c43030', '#1a7a42', '#2060b0'];
const CHANNEL_FILLS = ['rgba(196,48,48,0.12)', 'rgba(26,122,66,0.12)', 'rgba(32,96,176,0.12)'];

const PADDING = { top: 18, right: 18, bottom: 38, left: 50 };

/**
 * Draw the gamma curve canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number[][]} channels - 3 channel arrays (1024 entries each)
 * @param {number} activeCh - Active channel index (0=R, 1=G, 2=B)
 * @param {number} zoom - Zoom level (1 = fit all)
 * @param {{x: number, y: number}} pan - Pan offset in value space
 * @param {Array<{x: number, y: number}>|null} controlPts - Control points (null for free mode)
 * @param {number} activePointIdx - Highlighted control point index (-1 = none)
 * @param {string|number} mode - Edit mode ("free", 4, 10, 21)
 * @param {function} fmtFn - Value formatter (10-bit value → display string)
 */
export function drawCanvas(canvas, channels, activeCh, zoom, pan, controlPts, activePointIdx, mode, fmtFn) {
  if (!fmtFn) fmtFn = v => v;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width, H = canvas.height;
  const w = W / dpr, h = H / dpr;

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.scale(dpr, dpr);

  const p = PADDING;
  const gw = w - p.left - p.right;
  const gh = h - p.top - p.bottom;

  const vx0 = pan.x;
  const vx1 = pan.x + MAX_VALUE / zoom;
  const vy0 = pan.y;
  const vy1 = pan.y + MAX_VALUE / zoom;

  const toX = v => p.left + ((v - vx0) / (vx1 - vx0)) * gw;
  const toY = v => p.top + gh - ((v - vy0) / (vy1 - vy0)) * gh;

  // Background
  ctx.fillStyle = '#fafaf8';
  ctx.fillRect(0, 0, w, h);

  // Grid
  const gridStep = zoom > 3 ? 64 : zoom > 1.5 ? 128 : 256;

  ctx.strokeStyle = 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 0.5;
  for (let v = 0; v <= MAX_VALUE; v += gridStep) {
    const x = toX(v), y = toY(v);
    if (x >= p.left && x <= w - p.right) {
      ctx.beginPath(); ctx.moveTo(x, p.top); ctx.lineTo(x, p.top + gh); ctx.stroke();
    }
    if (y >= p.top && y <= p.top + gh) {
      ctx.beginPath(); ctx.moveTo(p.left, y); ctx.lineTo(p.left + gw, y); ctx.stroke();
    }
  }

  // Heavier grid at 256 intervals
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  for (let v = 0; v <= MAX_VALUE; v += 256) {
    const x = toX(v), y = toY(v);
    if (x >= p.left && x <= w - p.right) {
      ctx.beginPath(); ctx.moveTo(x, p.top); ctx.lineTo(x, p.top + gh); ctx.stroke();
    }
    if (y >= p.top && y <= p.top + gh) {
      ctx.beginPath(); ctx.moveTo(p.left, y); ctx.lineTo(p.left + gw, y); ctx.stroke();
    }
  }

  // Axis labels
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.textAlign = 'center';
  for (let v = 0; v <= MAX_VALUE; v += gridStep) {
    const x = toX(v);
    if (x >= p.left && x <= w - p.right) ctx.fillText(fmtFn(v), x, p.top + gh + 16);
  }
  ctx.textAlign = 'right';
  for (let v = 0; v <= MAX_VALUE; v += gridStep) {
    const y = toY(v);
    if (y >= p.top && y <= p.top + gh) ctx.fillText(fmtFn(v), p.left - 7, y + 3);
  }

  // Linear reference diagonal
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(0));
  ctx.lineTo(toX(MAX_VALUE), toY(MAX_VALUE));
  ctx.stroke();
  ctx.setLineDash([]);

  // Clip to graph area
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.left, p.top, gw, gh);
  ctx.clip();

  // Draw curves
  const drawOrder = [0, 1, 2].sort((a, b) => (a === activeCh ? 1 : -1));
  const step = Math.max(1, Math.floor(1 / zoom));

  for (const ch of drawOrder) {
    const data = channels[ch];
    const isActive = ch === activeCh;

    // Fill under active curve
    if (isActive) {
      ctx.beginPath();
      ctx.moveTo(toX(0), toY(0));
      for (let i = 0; i < ENTRIES_PER_CHANNEL; i += step) {
        ctx.lineTo(toX(i), toY(data[i]));
      }
      ctx.lineTo(toX(MAX_VALUE), toY(0));
      ctx.closePath();
      ctx.fillStyle = CHANNEL_FILLS[ch];
      ctx.fill();
    }

    // Curve line
    ctx.strokeStyle = CHANNEL_COLORS[ch];
    ctx.globalAlpha = isActive ? 1 : 0.25;
    ctx.lineWidth = isActive ? 2.5 : 1;
    ctx.beginPath();
    for (let i = 0; i < ENTRIES_PER_CHANNEL; i += step) {
      if (i === 0) ctx.moveTo(toX(i), toY(data[i]));
      else ctx.lineTo(toX(i), toY(data[i]));
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Control points
  if (controlPts && mode !== 'free') {
    const col = CHANNEL_COLORS[activeCh];

    for (let i = 0; i < controlPts.length; i++) {
      const px = toX(controlPts[i].x);
      const py = toY(controlPts[i].y);
      const isActive = i === activePointIdx;
      const r = isActive ? 8 : 5;

      // Glow on active point
      if (isActive) {
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(px, py, 3, px, py, 14);
        grad.addColorStop(0, col + '30');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Point circle
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? col : '#fafaf8';
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = isActive ? 2.5 : 1.5;
      ctx.stroke();

      // Value label
      if (zoom >= 1.5 || controlPts.length <= 10) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.font = "9px 'JetBrains Mono', monospace";
        ctx.textAlign = 'center';
        ctx.fillText(fmtFn(controlPts[i].y), px, py - r - 5);
      }
    }
  }

  ctx.restore(); // clip
  ctx.restore(); // scale
}

export { CHANNEL_COLORS, PADDING };
