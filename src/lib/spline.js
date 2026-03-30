import { ENTRIES_PER_CHANNEL, MAX_VALUE } from './ldt';

/**
 * Natural cubic spline interpolation through control points.
 * Produces a smooth 1024-entry curve with C² continuity (no sudden jumps).
 *
 * @param {Array<{x: number, y: number}>} pts - Control points sorted by x
 * @returns {number[]} - 1024 output values (clamped 0–1023)
 */
export function cubicSpline(pts) {
  const n = pts.length;
  const N = ENTRIES_PER_CHANNEL;

  if (n < 2) {
    return new Array(N).fill(pts[0]?.y || 0);
  }

  // Linear interpolation for 2 points
  if (n === 2) {
    const out = new Array(N);
    for (let i = 0; i < N; i++) {
      const t = (i - pts[0].x) / (pts[1].x - pts[0].x);
      out[i] = Math.round(Math.max(0, Math.min(MAX_VALUE, pts[0].y + t * (pts[1].y - pts[0].y))));
    }
    return out;
  }

  // Natural cubic spline algorithm
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const h = [];
  const alpha = [];
  const l = [];
  const mu = [];
  const z = [];

  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
  }

  for (let i = 1; i < n - 1; i++) {
    alpha[i] = (3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1]);
  }

  // Forward sweep
  l[0] = 1;
  mu[0] = 0;
  z[0] = 0;
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }
  l[n - 1] = 1;
  z[n - 1] = 0;

  // Back substitution
  const b = new Array(n);
  const c = new Array(n);
  const d = new Array(n);
  c[n - 1] = 0;

  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }

  // Evaluate spline at every integer input
  const out = new Array(N);
  for (let i = 0; i < N; i++) {
    // Find the segment
    let seg = n - 2;
    for (let s = 0; s < n - 1; s++) {
      if (i <= xs[s + 1]) {
        seg = s;
        break;
      }
    }
    const dx = i - xs[seg];
    const val = ys[seg] + b[seg] * dx + c[seg] * dx * dx + d[seg] * dx * dx * dx;
    out[i] = Math.round(Math.max(0, Math.min(MAX_VALUE, val)));
  }

  return out;
}

/**
 * Get evenly-spaced control point X positions for a given mode
 * @param {number} mode - Number of control points (4, 10, or 21)
 * @returns {number[]} - Array of X positions
 */
export function getControlPointPositions(mode) {
  if (mode === 4) {
    return [0, Math.round(MAX_VALUE / 3), Math.round(2 * MAX_VALUE / 3), MAX_VALUE];
  }
  if (mode === 10) {
    const pts = [0];
    for (let i = 1; i <= 8; i++) pts.push(Math.round(i * MAX_VALUE / 9));
    pts.push(MAX_VALUE);
    return pts;
  }
  // 21 points
  const pts = [];
  for (let i = 0; i <= 20; i++) pts.push(Math.round(i * MAX_VALUE / 20));
  return pts;
}

/**
 * Sample a curve at given X positions to create control points
 * @param {number[]} curve - 1024-entry curve
 * @param {number[]} positions - X positions to sample
 * @returns {Array<{x: number, y: number}>}
 */
export function curveToControlPoints(curve, positions) {
  return positions.map(x => ({
    x,
    y: curve[Math.min(x, MAX_VALUE)],
  }));
}
