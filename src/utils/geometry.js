/**
 * Geometry utilities for posture analysis
 */

/**
 * Calculate the angle between two points in degrees
 * atan2(y2-y1, x2-x1)
 */
export function calculateAngle(p1, p2) {
  const dy = p2.y - p1.y;
  const dx = p2.x - p1.x;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

/**
 * Calculate the angle of the shoulder line (left shoulder to right shoulder)
 * Positive angle means right shoulder is lower than left
 */
export function shoulderAngle(leftShoulder, rightShoulder) {
  return calculateAngle(leftShoulder, rightShoulder);
}

/**
 * Calculate the torso inclination angle
 * Angle of the line from shoulder midpoint to hip midpoint
 * Positive means torso is leaning forward (head ahead of hips)
 */
export function torsoInclination(shoulderMidpoint, hipMidpoint) {
  return calculateAngle(shoulderMidpoint, hipMidpoint);
}

/**
 * Calculate horizontal displacement (ear relative to shoulder)
 * Positive means head is forward of shoulders
 */
export function headForwardDisplacement(earMidpoint, shoulderMidpoint) {
  return earMidpoint.x - shoulderMidpoint.x;
}

/**
 * Calculate vertical shoulder difference (right - left)
 * Positive means right shoulder is lower
 */
export function shoulderVerticalDiff(leftShoulder, rightShoulder) {
  return rightShoulder.y - leftShoulder.y;
}

/**
 * Check if landmark visibility is reliable enough for analysis
 * @param {number} visibility - MediaPipe visibility score (0-1)
 * @param {number} threshold - Minimum visibility (default: 0.5)
 * @returns {boolean}
 */
export function isVisible(visibility, threshold = 0.5) {
  return visibility >= threshold;
}