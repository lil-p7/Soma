/**
 * Time utility functions for session tracking
 */

/**
 * Format seconds into MM:SS format
 */
export function formatSeconds(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

/**
 * Format milliseconds into HH:MM:SS format
 */
export function formatMilliseconds(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${hours > 0 ? hours : ""}${hours > 0 ? ":" : ""}${
    minutes < 10 ? "0" : ""
  }${minutes}:${secs < 10 ? "0" : ""}${secs}.${millis
    .toString()
    .padStart(3, "0")}`;
}

/**
 * Debounce a function - wait for delay ms after last call
 */
export function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Calculate percentage
 */
export function calculatePercentage(part, total) {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}