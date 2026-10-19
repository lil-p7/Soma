/**
 * Posture Analysis Engine
 * 
 * Receives landmark data and returns posture state information.
 * Keeps the posture rules configurable and independent of React.
 */

/**
 * Extract geometric features from MediaPipe pose landmarks.
 * Landmarks are in normalized image coordinates (x, y) where 0-1.
 * 
 * @param {Array} landmarks - Array of landmark objects from MediaPipe
 * @param {number} landmarks[].x - x coordinate (normalized)
 * @param {number} landmarks[].y - y coordinate (normalized) 
 * @param {number} landmarks[].z - z coordinate (normalized, optional)
 * @param {number} landmarks[].visibility - visibility score (0-1, optional)
 * @returns {Object} Extracted features
 */
export function extractFeatures(landmarks) {
  if (!landmarks || landmarks.length < 23) {
    return { error: "Insufficient landmarks" };
  }

  // MediaPipe Pose Landmarker landmark indices (COCO format):
  // 0: nose, 11: left shoulder, 12: right shoulder, 23: right hip,
  // 24: left hip, 13: left elbow, 15: left wrist, 14: right elbow, 16: right wrist
  // 23-32 are hips/legs, but for sitting posture we focus on upper body

  // Get key landmarks
  const nose = landmarks[0];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftEar = landmarks[7];  // MediaPipe ear landmark
  const rightEar = landmarks[8]; // MediaPipe ear landmark

  if (!leftShoulder || !rightShoulder) {
    return { error: "Missing shoulder landmarks" };
  }

  // A. Shoulder midpoint
  const shoulderMidpoint = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
  };

  // B. Shoulder tilt - angle of the shoulder line
  const shoulderAngleRad = Math.atan2(
    rightShoulder.y - leftShoulder.y,
    rightShoulder.x - leftShoulder.x
  );
  const shoulderAngleDeg = (shoulderAngleRad * 180) / Math.PI;

  // C. Torso inclination - angle of shoulder-to-hip line
  // Using shoulder midpoint to hip midpoint
  if (leftHip && rightHip) {
    const hipMidpoint = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2,
    };

    const torsoAngleRad = Math.atan2(
      shoulderMidpoint.x - hipMidpoint.x,
      hipMidpoint.y - shoulderMidpoint.y
    );
    const torsoAngleDeg = (torsoAngleRad * 180) / Math.PI;
    
    return {
      shoulderMidpoint,
      shoulderAngleDeg,
      torsoAngleDeg,
      // D. Forward head - horizontal displacement between ear midpoint and shoulder midpoint
      // For front-facing camera, this is limited
      headForwardDisplacement: leftEar && rightEar
        ? ((leftEar.x + rightEar.x) / 2 - shoulderMidpoint.x)
        : null,
      // Ear midpoint
      earMidpoint: {
        x: (leftEar.x + rightEar.x) / 2,
        y: (leftEar.y + rightEar.y) / 2,
      },
      // Visibility scores
      shoulderVisibility: Math.min(leftShoulder.visibility || 1, rightShoulder.visibility || 1),
      hipVisibility: leftHip && rightHip
        ? Math.min(leftHip.visibility || 1, rightHip.visibility || 1)
        : null,
    };
  }

  // Return without hip data for basic analysis
  return {
    shoulderMidpoint,
    shoulderAngleDeg,
    headForwardDisplacement: leftEar && rightEar
      ? ((leftEar.x + rightEar.x) / 2 - shoulderMidpoint.x)
      : null,
    earMidpoint: {
      x: (leftEar.x + rightEar.x) / 2,
      y: (leftEar.y + rightEar.y) / 2,
    },
    shoulderVisibility: Math.min(leftShoulder.visibility || 1, rightShoulder.visibility || 1),
  };
}

/**
 * Calibration - store the user's baseline measurements
 * 
 * @param {Array} baselines - Array of previous baseline objects
 * @param {Object} newBaseline - New baseline measurements from calibration
 * @returns {Array} Updated baselines array
 */
export function addBaseline(baselines, newBaseline) {
  const timestamp = Date.now();
  const baseline = {
    id: `baseline-${timestamp}`,
    createdAt: new Date().toISOString(),
    ...newBaseline,
  };
  return [...baselines, baseline];
}

/**
 * Get the most recent baseline
 */
export function getLatestBaseline(baselines) {
  if (!baselines || baselines.length === 0) return null;
  return baselines[baselines.length - 1];
}

/**
 * Calculate deviation from baseline for a given feature
 */
export function calculateDeviation(current, baseline, feature) {
  if (!baseline || !current[feature] || baseline[feature] === undefined) {
    return null;
  }
  
  return current[feature] - baseline[feature];
}

/**
 * Posture state classification based on features and baseline
 */
export const PostureState = {
  CALIBRATING: "CALIBRATING",
  GOOD: "GOOD",
  WARNING: "WARNING", 
  NO_POSE: "NO_POSE",
  PAUSED: "PAUSED",
};

/**
 * Update posture state based on current result and elapsed time
 * Simple state machine implementation
 * 
 * @param {string} previousState - Previous posture state
 * @param {Object} result - Current analysis result
 * @param {number} elapsedTime - Time in current state (seconds)
 * @param {Object} settings - Configuration settings
 * @returns {Object} { state, issue, message, shouldAlert }
 */
export function updatePostureState(previousState, result, elapsedTime, settings = {}) {
  const {
    alertDelay = 5,          // seconds before alert triggers
    cooldown = 10,           // seconds cooldown between alerts
    recoveryThreshold = 2,  // degrees to recover from warning
    ...otherSettings
  } = settings;

  // No pose detected
  if (result.error || !result.shoulderMidpoint) {
    return {
      state: previousState === "NO_POSE" || previousState === "PAUSED"
        ? previousState
        : "NO_POSE",
      issue: null,
      message: "Adjust your position or camera - required landmarks not reliably visible",
      shouldAlert: false,
    };
  }

  // During calibration phase
  if (previousState === "CALIBRATING") {
    return {
      state: "CALIBRATING",
      issue: null,
      message: "Calibrating... please sit in your neutral position",
      shouldAlert: false,
    };
  }

  // Check for sustained deviation
  const forwardLean = result.forwardLeanDeg !== undefined 
    ? Math.abs(result.forwardLeanDeg) 
    : 0;
  const shoulderTilt = result.shoulderTiltDeg !== undefined
    ? Math.abs(result.shoulderTiltDeg) 
    : 0;
  const torsoInclination = result.torsoInclinationDeg !== undefined
    ? Math.abs(result.torsoInclinationDeg) 
    : 0;

  // Default: GOOD state
  let newState = "GOOD";
  let issue = null;
  let message = "Good posture";
  let shouldAlert = false;

  // Check Forward Head/Upper-Body Lean (Indicator A)
  if (result.forwardLeanDeg !== undefined && result.forwardLeanDeg !== null) {
    const threshold = settings.forwardLeanThreshold || 12; // degrees from baseline
    if (forwardLean > threshold) {
      if (elapsedTime >= alertDelay) {
        newState = "WARNING";
        issue = "FORWARD_LEAN";
        message = "You may be leaning forward. Try returning to your comfortable neutral position.";
        shouldAlert = true;
      } else {
        // Still tracking but not alerting yet
        if (newState !== "WARNING") {
          newState = "WARNING";
          issue = "FORWARD_LEAN";
          message = "Adjusting... leaning detected";
          shouldAlert = false;
        }
      }
    }
  }

  // Check Possible Slouching (Indicator B - torso inclination)
  if (result.torsoInclinationDeg !== undefined && result.torsoInclinationDeg !== null) {
    const threshold = settings.torsoInclinationThreshold || 12; // degrees from baseline
    if (torsoInclination > threshold) {
      if (elapsedTime >= alertDelay) {
        if (newState !== "WARNING" || issue !== "SLouching") {
          newState = "WARNING";
          issue = "SLouching";
          message = "Check your sitting position and adjust if needed.";
          shouldAlert = true;
        }
      }
    }
  }

  // Check Shoulder Tilt (Indicator C)
  if (result.shoulderTiltDeg !== undefined && result.shoulderTiltDeg !== null) {
    const threshold = settings.shoulderTiltThreshold || 10; // degrees from baseline
    if (shoulderTilt > threshold) {
      if (elapsedTime >= alertDelay) {
        if (newState !== "WARNING" || issue !== "SHOULDER_TILT") {
          newState = "WARNING";
          issue = "SHOULDER_TILT";
          message = "Your shoulders appear uneven. Check your camera position and sitting posture.";
          shouldAlert = true;
        }
      }
    }
  }

  // Recovery: if measurement returns to acceptable range
  if (newState === "WARNING" && elapsedTime > 0) {
    // Check if any indicator has recovered
    const hasRecovered = 
      (result.forwardLeanDeg === null || Math.abs(result.forwardLeanDeg) <= recoveryThreshold) &&
      (result.torsoInclinationDeg === null || Math.abs(result.torsoInclinationDeg) <= recoveryThreshold) &&
      (result.shoulderTiltDeg === null || Math.abs(result.shoulderTiltDeg) <= recoveryThreshold);
    
    if (hasRecovered) {
      newState = "GOOD";
      issue = null;
      message = "Good posture";
      shouldAlert = false;
    }
  }

  return {
    state: newState,
    issue,
    message,
    shouldAlert,
    elapsedTime: shouldAlert || hasRecovered ? 0 : (elapsedTime || 0) + 1/30, // approx frame interval
  };
}