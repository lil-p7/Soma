/**
 * Calibration Module
 *
 * Builds a neutral baseline from a few seconds of reliable landmark features.
 * The baseline is what every deviation is measured against, so it only keeps
 * fields that are stable and comparable frame to frame.
 */

const SCALAR_FEATURES = [
  "shoulderWidth",
  "shoulderAngleDeg",
  "torsoLengthRatio",
  "torsoAngleDeg",
  "forwardHeadRatio",
  "headDropRatio",
];

function average(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

/**
 * Build a baseline from an array of feature objects (output of extractFeatures).
 *
 * @param {Array<Object>} landmarkSamples - feature objects, errors excluded
 * @param {Object} [options]
 * @param {number} [options.minSamples=10] - minimum usable samples required
 * @returns {{success:boolean, baseline?:Object, error?:string, sampleCount?:number}}
 */
export function calibrate(landmarkSamples, options = {}) {
  const { minSamples = 10 } = options;

  const samples = (landmarkSamples || []).filter(
    (sample) => sample && !sample.error
  );

  if (samples.length === 0) {
    return { success: false, error: "No usable landmark data was collected" };
  }

  if (samples.length < minSamples) {
    return {
      success: false,
      error: `Only ${samples.length} of ${minSamples} required samples were collected`,
    };
  }

  const baseline = {
    createdAt: new Date().toISOString(),
    sampleCount: samples.length,
  };

  SCALAR_FEATURES.forEach((feature) => {
    baseline[feature] = average(samples.map((sample) => sample[feature]));
  });

  baseline.shoulderMidpoint = {
    x: average(samples.map((sample) => sample.shoulderMidpoint?.x)),
    y: average(samples.map((sample) => sample.shoulderMidpoint?.y)),
  };

  if (!Number.isFinite(baseline.shoulderAngleDeg)) {
    return { success: false, error: "Shoulder angle could not be measured" };
  }

  return {
    success: true,
    baseline,
    sampleCount: samples.length,
    message: `Calibrated from ${samples.length} samples`,
  };
}

/**
 * Remove all stored baselines.
 */
export function clearBaselines() {
  return [];
}

/**
 * A baseline is usable when it contains the shoulder reference measurement.
 */
export function isValidBaseline(baseline) {
  return !!(
    baseline &&
    Number.isFinite(baseline.shoulderAngleDeg) &&
    baseline.shoulderMidpoint
  );
}
