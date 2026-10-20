/**
 * Posture Analysis Engine
 *
 * Receives MediaPipe pose landmarks and turns them into three posture
 * indicators (forward lean, slouching/compression, shoulder tilt).
 * Pure functions only - no React, no DOM.
 */

export const PostureState = {
  CALIBRATING: "CALIBRATING",
  GOOD: "GOOD",
  WARNING: "WARNING",
  NO_POSE: "NO_POSE",
  PAUSED: "PAUSED",
};

export const DEFAULT_SETTINGS = {
  alertDelay: 5, // seconds an issue must persist before alerting
  cooldown: 10, // seconds between alerts
  forwardLeanThreshold: 12, // degrees away from baseline
  torsoInclinationThreshold: 12, // degrees (torso compression) away from baseline
  shoulderTiltThreshold: 10, // degrees away from baseline
  recoveryThreshold: 2, // degrees back towards baseline needed to clear a warning
  calibrationSeconds: 3, // how long the neutral baseline is sampled
};

// MediaPipe Pose landmark indices
const NOSE = 0;
const LEFT_EAR = 7;
const RIGHT_EAR = 8;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

const RAD_TO_DEG = 180 / Math.PI;

function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function midPoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (num(a.z) + num(b.z)) / 2 };
}

function visibility(landmark) {
  return landmark && Number.isFinite(landmark.visibility)
    ? landmark.visibility
    : 1;
}

/**
 * Extract normalised geometric features from a single pose.
 *
 * @param {Array<{x:number,y:number,z?:number,visibility?:number}>} landmarks
 *   The 33 landmarks of one pose (NOT the nested array MediaPipe returns).
 * @returns {Object} features, or { error: string } when the pose is unusable
 */
export function extractFeatures(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < RIGHT_HIP + 1) {
    return { error: "Insufficient landmarks" };
  }

  const leftShoulder = landmarks[LEFT_SHOULDER];
  const rightShoulder = landmarks[RIGHT_SHOULDER];

  if (!leftShoulder || !rightShoulder) {
    return { error: "Missing shoulder landmarks" };
  }

  if (
    !Number.isFinite(leftShoulder.x) ||
    !Number.isFinite(rightShoulder.x)
  ) {
    return { error: "Invalid shoulder landmarks" };
  }

  if (visibility(leftShoulder) < 0.5 || visibility(rightShoulder) < 0.5) {
    return { error: "Shoulders are not clearly visible" };
  }

  const hasShoulderDepth =
    Number.isFinite(leftShoulder.z) && Number.isFinite(rightShoulder.z);

  const shoulderMidpoint = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
    z: hasShoulderDepth
      ? (num(leftShoulder.z) + num(rightShoulder.z)) / 2
      : null,
  };

  // Shoulder width is the scale reference so measurements are resolution and
  // distance independent. Guard against divide-by-zero when shoulders overlap.
  const shoulderWidth = Math.max(
    Math.hypot(
      rightShoulder.x - leftShoulder.x,
      rightShoulder.y - leftShoulder.y
    ),
    1e-3
  );

  // How the shoulder line is rotated relative to horizontal (degrees).
  // Positive = right shoulder is lower in the image.
  const shoulderAngleDeg =
    Math.atan2(
      rightShoulder.y - leftShoulder.y,
      rightShoulder.x - leftShoulder.x
    ) * RAD_TO_DEG;

  const features = {
    shoulderMidpoint,
    shoulderWidth,
    shoulderAngleDeg,
    torsoLengthRatio: null,
    torsoAngleDeg: null,
    forwardHeadRatio: null,
    headDropRatio: null,
    shoulderVisibility: Math.min(
      visibility(leftShoulder),
      visibility(rightShoulder)
    ),
  };

  const leftHip = landmarks[LEFT_HIP];
  const rightHip = landmarks[RIGHT_HIP];

  if (
    leftHip &&
    rightHip &&
    Number.isFinite(leftHip.x) &&
    Number.isFinite(rightHip.x) &&
    visibility(leftHip) >= 0.5 &&
    visibility(rightHip) >= 0.5
  ) {
    const hipMidpoint = midPoint(leftHip, rightHip);
    const dx = shoulderMidpoint.x - hipMidpoint.x;
    const dy = hipMidpoint.y - shoulderMidpoint.y; // positive when shoulders above hips

    // Torso compression: shorter torso for the same shoulder width indicates
    // slouching / sinking into the seat.
    features.torsoLengthRatio =
      Math.hypot(dx, dy) / shoulderWidth;

    // Lateral torso lean in the image plane.
    features.torsoAngleDeg = Math.atan2(dx, dy) * RAD_TO_DEG;
  }

  const leftEar = landmarks[LEFT_EAR];
  const rightEar = landmarks[RIGHT_EAR];
  const nose = landmarks[NOSE];

  const headAnchor =
    nose && Number.isFinite(nose.x) ? nose : leftEar && rightEar ? midPoint(leftEar, rightEar) : null;

  if (headAnchor) {
    // Depth of the head relative to the shoulders (z is in shoulder-width
    // units, negative = closer to the camera). Rising z distance = head moving
    // forward, which the front camera can only see through depth.
    if (Number.isFinite(headAnchor.z) && shoulderMidpoint.z !== null) {
      features.forwardHeadRatio =
        (num(headAnchor.z) - shoulderMidpoint.z) / shoulderWidth;
    }

    // Head sitting lower and wider than usual is a slouch cue.
    features.headDropRatio =
      (headAnchor.y - shoulderMidpoint.y) / shoulderWidth;
  }

  return features;
}

/**
 * Add a new calibrated baseline to the list of baselines.
 */
export function addBaseline(baselines, newBaseline) {
  const baseline = {
    id: `baseline-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...newBaseline,
  };
  return [...(baselines || []), baseline];
}

/**
 * Return the most recent baseline, or null.
 */
export function getLatestBaseline(baselines) {
  if (!Array.isArray(baselines) || baselines.length === 0) return null;
  return baselines[baselines.length - 1];
}

/**
 * Convert raw features into signed angular deviations from the baseline.
 * Every value is in degrees; null means "could not be measured this frame".
 */
export function computeDeviations(features, baseline) {
  if (!features || features.error || !baseline) return null;

  const deviations = {
    forwardLeanDeg: null,
    torsoInclinationDeg: null,
    shoulderTiltDeg: null,
  };

  if (
    features.forwardHeadRatio !== null &&
    Number.isFinite(baseline.forwardHeadRatio)
  ) {
    const delta = features.forwardHeadRatio - baseline.forwardHeadRatio;
    deviations.forwardLeanDeg = Math.atan(delta) * RAD_TO_DEG;
  }

  if (
    features.torsoLengthRatio !== null &&
    Number.isFinite(baseline.torsoLengthRatio)
  ) {
    // Compression of the torso expressed in degrees (0.1 shoulder-width of
    // compression ~= 5.7 degrees).
    const delta = baseline.torsoLengthRatio - features.torsoLengthRatio;
    deviations.torsoInclinationDeg = Math.atan(delta) * RAD_TO_DEG;
  }

  if (Number.isFinite(baseline.shoulderAngleDeg)) {
    deviations.shoulderTiltDeg =
      features.shoulderAngleDeg - baseline.shoulderAngleDeg;
  }

  return deviations;
}

const ISSUE_MESSAGES = {
  FORWARD_LEAN:
    "Your head and upper body look further forward than your neutral position.",
  SLOUCHING:
    "You look like you are sinking into your seat. Try sitting tall again.",
  SHOULDER_TILT:
    "Your shoulders look uneven. Check your camera angle and sitting position.",
};

export { ISSUE_MESSAGES };

/**
 * Classify deviations into a posture state.
 *
 * @param {Object} deviations - result of computeDeviations
 * @param {Object} settings - thresholds
 * @param {?string} previousIssue - issue reported on the previous frame; kept
 *   as the primary issue while it stays active so the message does not flap
 *   between two similar deviations frame to frame
 * @returns {{state:string, issue:?string, message:string}}
 */
export function updatePostureState(
  deviations,
  settings = {},
  previousIssue = null
) {
  const config = { ...DEFAULT_SETTINGS, ...settings };

  if (!deviations) {
    return {
      state: PostureState.NO_POSE,
      issue: null,
      message:
        "Move into frame so your head and shoulders are clearly visible.",
    };
  }

  const forwardLean = Math.abs(deviations.forwardLeanDeg ?? 0);
  const slouch = Math.abs(deviations.torsoInclinationDeg ?? 0);
  const shoulderTilt = Math.abs(deviations.shoulderTiltDeg ?? 0);

  const forward = forwardLean > config.forwardLeanThreshold;
  const slouched = slouch > config.torsoInclinationThreshold;
  const tilted = shoulderTilt > config.shoulderTiltThreshold;

  if (!forward && !slouched && !tilted) {
    return {
      state: PostureState.GOOD,
      issue: null,
      message: "Good posture - you are close to your calibrated baseline.",
    };
  }

  // Report the largest deviation first; it is the most actionable one.
  const ranked = [
    { issue: "SHOULDER_TILT", value: shoulderTilt, active: tilted },
    { issue: "SLOUCHING", value: slouch, active: slouched },
    { issue: "FORWARD_LEAN", value: forwardLean, active: forward },
  ]
    .filter((entry) => entry.active)
    .sort((a, b) => b.value - a.value);

  const primary =
    ranked.find((entry) => entry.issue === previousIssue) || ranked[0];

  return {
    state: PostureState.WARNING,
    issue: primary.issue,
    message: ISSUE_MESSAGES[primary.issue],
  };
}
