/**
 * Sony ImageDirector .ldt file format handler
 *
 * File structure:
 *   512-byte header + 3 channels × 1024 entries × 2 bytes (16-bit LE)
 *   Total: 6,656 bytes
 *   Values: 10-bit (0–1023)
 *   Storage order: descending (input 1023 first, input 0 last)
 */

export const HEADER_SIZE = 512;
export const ENTRIES_PER_CHANNEL = 1024;
export const NUM_CHANNELS = 3;
export const MAX_VALUE = 1023;

// Build the fixed header template
const HEADER_TEMPLATE = new Uint8Array(HEADER_SIZE);
(() => {
  const encoder = new TextEncoder();
  const write = (offset, str) => HEADER_TEMPLATE.set(encoder.encode(str), offset);
  write(0, 'LDT');       // Magic
  write(8, '0200');       // Version
  write(16, 'VPL-xWxxxxES'); // Model wildcard
  write(32, '0');
  write(48, 'NETWORK');   // Transport
  write(56, '0');
  write(64, '1');
  write(72, 'ALL');       // Scope
  write(80, '0');
})();

/**
 * Parse an .ldt file buffer into 3 ascending channel arrays
 * @param {ArrayBuffer} buffer - Raw file contents
 * @returns {number[][]} - [redCurve, greenCurve, blueCurve], each 1024 entries ascending
 */
export function parseLDT(buffer) {
  if (buffer.byteLength !== HEADER_SIZE + NUM_CHANNELS * ENTRIES_PER_CHANNEL * 2) {
    throw new Error(`Invalid LDT file size: ${buffer.byteLength} bytes (expected ${HEADER_SIZE + NUM_CHANNELS * ENTRIES_PER_CHANNEL * 2})`);
  }

  const view = new DataView(buffer);
  const channels = [[], [], []];

  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const descending = [];
    for (let i = 0; i < ENTRIES_PER_CHANNEL; i++) {
      const offset = HEADER_SIZE + (ch * ENTRIES_PER_CHANNEL + i) * 2;
      descending.push(view.getUint16(offset, true)); // little-endian
    }
    // Reverse from descending storage to ascending input order
    channels[ch] = descending.reverse();
  }

  return channels;
}

/**
 * Build an .ldt file buffer from 3 ascending channel arrays
 * @param {number[][]} channels - [redCurve, greenCurve, blueCurve], each 1024 entries ascending
 * @returns {ArrayBuffer} - Complete .ldt file ready for ImageDirector
 */
export function buildLDT(channels) {
  const totalSize = HEADER_SIZE + NUM_CHANNELS * ENTRIES_PER_CHANNEL * 2;
  const buffer = new ArrayBuffer(totalSize);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Write header
  bytes.set(HEADER_TEMPLATE, 0);

  // Write channel data in descending order
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const descending = [...channels[ch]].reverse();
    for (let i = 0; i < ENTRIES_PER_CHANNEL; i++) {
      const offset = HEADER_SIZE + (ch * ENTRIES_PER_CHANNEL + i) * 2;
      const value = Math.max(0, Math.min(MAX_VALUE, descending[i]));
      view.setUint16(offset, value, true); // little-endian
    }
  }

  return buffer;
}
