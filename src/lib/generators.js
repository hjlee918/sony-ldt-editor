import { ENTRIES_PER_CHANNEL, MAX_VALUE } from './ldt';

// ─── PQ (ST.2084) Constants ───
const PQ_M1 = 0.1593017578125;
const PQ_M2 = 78.84375;
const PQ_C1 = 0.8359375;
const PQ_C2 = 18.8515625;
const PQ_C3 = 18.6875;

/**
 * PQ Electro-Optical Transfer Function
 * Converts a normalized PQ signal (0–1) to linear light in nits (0–10000)
 */
function pqEOTF(N) {
  const Np = Math.pow(N, 1 / PQ_M2);
  const num = Math.max(Np - PQ_C1, 0);
  const den = PQ_C2 - PQ_C3 * Np;
  return 10000 * Math.pow(num / den, 1 / PQ_M1);
}

/**
 * Generate a PQ tone-mapped curve for a given target display brightness.
 * Compresses HDR's 10,000 nit range to the display's capability with soft roll-off.
 * Output is gamma-encoded (1/2.2) since the projector applies its own gamma on top.
 *
 * @param {number} targetNits - Display peak brightness (e.g. 200 for VW385ES)
 * @returns {number[]} - 1024 output values
 */
export function generatePQ(targetNits) {
  const curve = new Array(ENTRIES_PER_CHANNEL);
  for (let i = 0; i < ENTRIES_PER_CHANNEL; i++) {
    const linearNits = pqEOTF(i / MAX_VALUE);
    let mapped;
    if (linearNits <= targetNits) {
      mapped = linearNits / targetNits;
    } else {
      // Soft roll-off for highlights above target
      const overshoot = (linearNits - targetNits) / (10000 - targetNits);
      mapped = Math.min(1.0 + 0.3 * Math.pow(overshoot, 0.5), 1.0);
    }
    // Gamma encode for display
    const encoded = Math.pow(Math.max(0, Math.min(1, mapped)), 1 / 2.2);
    curve[i] = Math.round(encoded * MAX_VALUE);
  }
  return curve;
}

/**
 * Generate an HLG (Hybrid Log-Gamma) curve.
 *
 * @param {number} systemGamma - System gamma (typically 1.2)
 * @returns {number[]} - 1024 output values
 */
export function generateHLG(systemGamma = 1.2) {
  const a = 0.17883277;
  const b = 1 - 4 * a;
  const c = 0.5 - a * Math.log(4 * a);
  const curve = new Array(ENTRIES_PER_CHANNEL);

  for (let i = 0; i < ENTRIES_PER_CHANNEL; i++) {
    const E = i / MAX_VALUE;
    let Eo;
    if (E <= 0.5) {
      Eo = (E * E) / 3;
    } else {
      Eo = (Math.exp((E - c) / a) + b) / 12;
    }
    const display = Math.pow(Eo, systemGamma);
    const encoded = Math.pow(Math.max(0, Math.min(1, display)), 1 / 2.2);
    curve[i] = Math.round(encoded * MAX_VALUE);
  }
  return curve;
}

/**
 * Generate a standard power-law gamma curve.
 * output = input^gamma
 *
 * @param {number} gamma - Gamma value (e.g. 2.2, 2.4)
 * @returns {number[]} - 1024 output values
 */
export function generateGamma(gamma) {
  const curve = new Array(ENTRIES_PER_CHANNEL);
  for (let i = 0; i < ENTRIES_PER_CHANNEL; i++) {
    curve[i] = Math.round(Math.pow(i / MAX_VALUE, gamma) * MAX_VALUE);
  }
  return curve;
}

/**
 * Generate a linear (identity) curve.
 * @returns {number[]} - 1024 output values where output = input
 */
export function generateLinear() {
  return Array.from({ length: ENTRIES_PER_CHANNEL }, (_, i) => i);
}

/**
 * Generate an S-curve for contrast enhancement.
 *
 * @param {number} contrast - Contrast strength (default 1.5)
 * @returns {number[]} - 1024 output values
 */
export function generateSCurve(contrast = 1.5) {
  const curve = new Array(ENTRIES_PER_CHANNEL);
  for (let i = 0; i < ENTRIES_PER_CHANNEL; i++) {
    const x = i / MAX_VALUE;
    const s = 1 / (1 + Math.exp(-contrast * 6 * (x - 0.5)));
    curve[i] = Math.round(s * MAX_VALUE);
  }
  return curve;
}
