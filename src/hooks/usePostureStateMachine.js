import { useRef, useState, useEffect } from "react";
import {
  extractFeatures,
  PostureState,
  updatePostureState,
  calculateDeviation,
  addBaseline,
  getLatestBaseline,
} from "../logic/postureAnalyzer";
import { calibrate, isValidBaseline } from "../logic/calibration";
import { formatSeconds, calculatePercentage } from "../utils/time";

/**
 * usePostureStateMachine - React hook for managing posture state
 * 
 * Integrates the posture analysis engine with React components.
 * Handles state persistence, alert timing, and calibration.
 * 
 * @param {Object} options - Configuration options
 * @param {number} options.alertDelay - Seconds before alert triggers (default: 5)
 * @param {number} options.cooldown - Seconds cooldown between alerts (default: 10)
 * @param {number} options.forwardLeanThreshold - Degrees threshold for forward lean (default: 12)
 * @param {number} options.torsoInclinationThreshold - Degrees threshold for slouching (default: 12)
 * @param {number} options.shoulderTiltThreshold - Degrees threshold for shoulder tilt (default: 10)
 * @param {number} options.recoveryThreshold - Degrees to recover from warning (default: 2)
 * @returns {Object} State and handlers
 */
export function usePostureStateMachine(options = {}) {
  const {
    alertDelay = 5,
    cooldown = 10,
    forwardLeanThreshold = 12,
    torsoInclinationThreshold = 12,
    shoulderTiltThreshold = 10,
    recoveryThreshold = 2,
  } = options;

  // State management
  const [postureState, setPostureState] = useState({
    state: PostureState.CALIBRATING,
    issue: null,
    message: "Starting calibration...",
    shouldAlert: false,
  });

  const [baselines, setBaselines] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [alertCooldownElapsed, setAlertCooldownElapsed] = useState(0);

  // Ref to track last alert time
  const lastAlertRef = useRef(Date.now());
  const frameRef = useRef(0);

  // Initialize calibration when component mounts
  useEffect(() => {
    // Start in CALIBRATING state
    setPostureState({
      state: PostureState.CALIBRATING,
      issue: null,
      message: "Calibrating... please sit in your neutral position",
      shouldAlert: false,
    });
  }, []);

  // Process landmarks and update posture state
  const processLandmarks = useRef((landmarks) => {
    // Extract features from landmarks
    const features = extractFeatures(landmarks);

    if (features.error) {
      // Landmark error - no pose detected
      setPostureState({
        state: PostureState.NO_POSE,
        issue: null,
        message: "Adjust your position or camera - required landmarks not reliably visible",
        shouldAlert: false,
      });
      return;
    }

    // Get latest baseline
    const baseline = getLatestBaseline(baselines);

    // If no baseline yet, we're still calibrating
    if (!baseline) {
      setPostureState({
        state: PostureState.CALIBRATING,
        issue: null,
        message: "Calibrating... please sit in your neutral position",
        shouldAlert: false,
      });
      return;
    }

    // Calculate elapsed time (approx based on frame rate)
    const frameRate = 30; // fps approximation
    const frameSeconds = 1 / frameRate;
    setElapsedTime((prev) => prev + frameSeconds);

    // Update posture state using the state machine
    const result = updatePostureState(
      postureState.state,
      features,
      elapsedTime,
      {
        alertDelay,
        cooldown,
        forwardLeanThreshold,
        torsoInclinationThreshold,
        shoulderTiltThreshold,
        recoveryThreshold,
      }
    );

    setPostureState(result);
  });

  // Handle calibration - collect samples and create baseline
  const startCalibration = useRef(() => {
    // This would be called from the UI to start collecting samples
    // In a full implementation, we'd collect samples over time
    setPostureState({
      state: PostureState.CALIBRATING,
      issue: null,
      message: "Calibrating... please sit in your neutral position",
      shouldAlert: false,
    });
  });

  const completeCalibration = useRef((samples) => {
    const calibrationResult = calibrate(samples, 30); // 30 samples = ~1 second
    if (calibrationResult.success && calibrationResult.baseline) {
      const newBaselines = addBaseline(baselines, calibrationResult.baseline);
      setBaselines(newBaselines);
      setPostureState({
        state: PostureState.GOOD,
        issue: null,
        message: "Calibration complete - baseline established",
        shouldAlert: false,
      });
    }
  });

  const resetCalibration = useRef(() => {
    setBaselines([]);
    setPostureState({
      state: PostureState.CALIBRATING,
      issue: null,
      message: "Calibration reset",
      shouldAlert: false,
    });
  });

  // Alert cooldown management
  useEffect(() => {
    if (postureState.shouldAlert && postureState.state === "WARNING") {
      const now = Date.now();
      const timeSinceLastAlert = now - lastAlertRef.current;
      const cooldownMs = cooldown * 1000;

      if (timeSinceLastAlert < cooldownMs) {
        // Still in cooldown, suppress alert
        setPostureState({
          ...postureState,
          shouldAlert: false,
        });
      }
    }
  }, [postureState.shouldAlert, postureState.state, cooldown]);

  return {
    // State
    state: postureState.state,
    issue: postureState.issue,
    message: postureState.message,
    shouldAlert: postureState.shouldAlert,

    // Time
    elapsedTime,
    formatElapsed: formatSeconds(elapsedTime),
    alertCooldownElapsed,

    // Baselines
    baselines,
    baselineCount: baselines.length,

    // Actions
    startCalibration,
    completeCalibration,
    resetCalibration,

    // Configuration
    settings: {
      alertDelay,
      cooldown,
      forwardLeanThreshold,
      torsoInclinationThreshold,
      shoulderTiltThreshold,
      recoveryThreshold,
    },

    // Helpers
    processLandmarks,
    PostureState,
  };
}