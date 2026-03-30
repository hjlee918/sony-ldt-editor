import { MAX_VALUE } from './ldt';

/**
 * Format a 10-bit value for display in the selected format.
 * @param {number} value - Internal 10-bit value (0–1023)
 * @param {string} format - "8bit" | "10bit" | "pct"
 * @returns {string|number}
 */
export function formatValue(value, format) {
  switch (format) {
    case '8bit':
      return Math.round(value / MAX_VALUE * 255);
    case 'pct':
      return (value / MAX_VALUE * 100).toFixed(1) + '%';
    case '10bit':
    default:
      return value;
  }
}

/**
 * Parse a user-entered value from the selected format back to 10-bit.
 * @param {string} input - User-entered value
 * @param {string} format - "8bit" | "10bit" | "pct"
 * @returns {number} - 10-bit value (0–1023)
 */
export function parseValue(input, format) {
  const num = parseFloat(input);
  if (isNaN(num)) return 0;

  switch (format) {
    case '8bit':
      return Math.round(Math.max(0, Math.min(255, num)) / 255 * MAX_VALUE);
    case 'pct':
      return Math.round(Math.max(0, Math.min(100, num)) / 100 * MAX_VALUE);
    case '10bit':
    default:
      return Math.round(Math.max(0, Math.min(MAX_VALUE, num)));
  }
}

/**
 * Get the max input value for the selected format (used for input[max]).
 */
export function formatMax(format) {
  switch (format) {
    case '8bit': return 255;
    case 'pct': return 100;
    default: return 1023;
  }
}

/**
 * Get the step size for the selected format (used for input[step]).
 */
export function formatStep(format) {
  return format === 'pct' ? 0.1 : 1;
}
