/**
 * Calibration Module
 * 
 * Handles user calibration to establish baseline posture measurements.
 * Uses a simple approach: collect several seconds of reliable landmark
 * measurements and use them as the reference baseline.
 */

/**
 * Calibrate by collecting landmarks over a period of time
 * 
 * @param {Array} landmarkSamples - Array of feature objects from extractFeatures
 * @param {number} sampleCount - Number of samples to collect (default: 30 = ~1 second at 30fps)
 * @returns {Object} Calibrated baseline with average measurements
 */
export function calibrate(landmarkSamples, sampleCount = 30) {
  if (!landmarkSamples || landmarkSamples.length === 0) {
    return { error: "No landmark data provided" };
  }

  // Collect the specified number of samples (or all if less than sampleCount)
  const samples = landmarkSamples.slice(0, sampleCount);
  
  // Calculate averages for each feature
  const features = Object.keys(samples[0]);
  
  const baseline = {
    createdAt: new Date().toISOString(),
    sampleCount: samples.length,
  };

  features.forEach((feature) => {
    const values = samples.map((s) => s[feature]).filter((v) => v !== undefined && v !== null);
    if (values.length > 0) {
      baseline[feature] = values.reduce((sum, val) => sum + val, 0) / values.length;
    }
  });

  return {
    success: true,
    baseline,
    message: `Calibrated with ${baseline.sampleCount} samples`,
  };
}

/**
 * Reset/clear calibration baselines
 */
export function clearBaselines(baselines) {
  return [];
}

/**
 * Check if calibration is valid (has required features)
 */
export function isValidBaseline(baseline) {
  if (!baseline) return false;
  // A valid baseline should have at least shoulder midpoint and angle data
  return !!(baseline.shoulderMidpoint && baseline.shoulderAngleDeg !== undefined);
}