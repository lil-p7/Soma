import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  computeDeviations,
  extractFeatures,
  updatePostureState,
  PostureState,
  DEFAULT_SETTINGS,
} from "../logic/postureAnalyzer";
import { calibrate } from "../logic/calibration";
import { formatSeconds } from "../utils/time";

const MIN_CALIBRATION_SAMPLES = 10;
const WAITING_MESSAGE = "Start the camera to begin monitoring.";

/**
 * usePostureStateMachine - React hook wrapping the posture analysis engine.
 *
 * Runs a small state machine:
 *   PAUSED -> CALIBRATING -> GOOD <-> WARNING
 *   (NO_POSE when landmarks are unusable)
 *
 * Alerts are raised only after an issue has been sustained for `alertDelay`
 * seconds and never more often than once every `cooldown` seconds.
 *
 * @param {Object} options - see DEFAULT_SETTINGS in logic/postureAnalyzer.js
 */
export function usePostureStateMachine(options = {}) {
  const optionsKey = JSON.stringify(options);
  // Depend on the serialised options so callers can pass an inline object.
  const settings = useMemo(
    () => ({ ...DEFAULT_SETTINGS, ...options }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [optionsKey]
  );
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const initialStatus = {
    state: PostureState.PAUSED,
    issue: null,
    message: WAITING_MESSAGE,
    shouldAlert: false,
  };

  const [status, setStatus] = useState(initialStatus);
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [baselines, setBaselines] = useState([]);
  const [paused, setPaused] = useState(true);

  const statusRef = useRef(initialStatus);
  const stateRef = useRef(initialStatus.state);
  const pausedRef = useRef(true);
  const baselinesRef = useRef([]);
  const baselineRef = useRef(null);
  const samplesRef = useRef([]);
  const calibrationStartRef = useRef(null);
  const issueRef = useRef({ issue: null, since: 0 });
  const lastAlertRef = useRef(-Infinity);
  const elapsedRef = useRef(0);
  const lastFrameRef = useRef(0);
  const progressRef = useRef(0);

  // Publishes only when something meaningful changed, so a 30fps detection
  // loop does not trigger a re-render on every frame.
  const publish = useCallback((next) => {
    stateRef.current = next.state;
    const prev = statusRef.current;
    if (
      prev.state === next.state &&
      prev.issue === next.issue &&
      prev.message === next.message &&
      prev.shouldAlert === next.shouldAlert
    ) {
      return;
    }
    statusRef.current = next;
    setStatus(next);
  }, []);

  const publishProgress = useCallback((value) => {
    if (Math.abs(value - progressRef.current) < 0.01) return;
    progressRef.current = value;
    setProgress(value);
  }, []);

  /**
   * Feed one frame of MediaPipe landmarks (33 landmarks for a single pose).
   */
  const processLandmarks = useCallback(
    (landmarks) => {
      const config = settingsRef.current;
      const now = performance.now();
      const frameSeconds = lastFrameRef.current
        ? Math.min((now - lastFrameRef.current) / 1000, 0.5)
        : 0;
      lastFrameRef.current = now;

      if (pausedRef.current) return;

      const features = extractFeatures(landmarks);

      if (features.error) {
        issueRef.current = { issue: null, since: 0 };

        // MediaPipe drops landmarks for a frame now and then. If that happens
        // mid-calibration we must stay in CALIBRATING: publishing NO_POSE here
        // would move stateRef to NO_POSE and the next good frame would skip
        // straight to monitoring with no baseline, stranding the machine in
        // NO_POSE until a manual recalibration.
        if (stateRef.current === PostureState.CALIBRATING) {
          return;
        }

        publish({
          state: PostureState.NO_POSE,
          issue: null,
          message:
            "Move into frame so your head and shoulders are clearly visible.",
          shouldAlert: false,
        });
        return;
      }

      // --- Calibration phase -------------------------------------------------
      if (stateRef.current === PostureState.CALIBRATING) {
        if (calibrationStartRef.current === null) {
          calibrationStartRef.current = now;
        }
        samplesRef.current.push(features);

        const calibrationSeconds = Math.max(config.calibrationSeconds, 0.5);
        const elapsed = (now - calibrationStartRef.current) / 1000;
        const ratio = Math.min(1, elapsed / calibrationSeconds);
        publishProgress(ratio);

        if (ratio < 1) {
          publish({
            state: PostureState.CALIBRATING,
            issue: null,
            message: `Hold still while we measure your neutral posture (${Math.max(
              1,
              Math.ceil(calibrationSeconds - elapsed)
            )}s)`,
            shouldAlert: false,
          });
          return;
        }

        const result = calibrate(samplesRef.current, {
          minSamples: MIN_CALIBRATION_SAMPLES,
        });

        if (result.success) {
          baselineRef.current = result.baseline;
          baselinesRef.current = [...baselinesRef.current, result.baseline];
          setBaselines(baselinesRef.current);
          publishProgress(1);
          publish({
            state: PostureState.GOOD,
            issue: null,
            message: "Calibration complete - baseline recorded.",
            shouldAlert: false,
          });
        } else {
          // Not enough usable samples: restart the window cleanly.
          samplesRef.current = [];
          calibrationStartRef.current = now;
          publishProgress(0);
        }
        return;
      }

      // --- Monitoring phase --------------------------------------------------
      const deviations = computeDeviations(features, baselineRef.current);
      // issueRef still holds the previous frame's issue here (it is updated
      // below, after evaluation), which keeps the primary issue sticky.
      const evaluation = updatePostureState(
        deviations,
        config,
        issueRef.current.issue
      );

      elapsedRef.current += frameSeconds;
      const wholeSeconds = Math.floor(elapsedRef.current);
      setElapsedTime((prev) => (prev === wholeSeconds ? prev : wholeSeconds));

      let shouldAlert = false;

      if (evaluation.state === PostureState.WARNING) {
        if (issueRef.current.issue !== evaluation.issue) {
          issueRef.current = { issue: evaluation.issue, since: now };
        }
        const heldFor = (now - issueRef.current.since) / 1000;
        if (heldFor >= config.alertDelay) {
          const sinceLastAlert = (now - lastAlertRef.current) / 1000;
          if (sinceLastAlert >= config.cooldown) {
            shouldAlert = true;
            lastAlertRef.current = now;
          }
        }
      } else {
        issueRef.current = { issue: null, since: 0 };
      }

      publish({
        state: evaluation.state,
        issue: evaluation.issue,
        message: evaluation.message,
        shouldAlert,
      });
    },
    [publish, publishProgress]
  );

  /** Begin (or restart) a calibration run. */
  const startCalibration = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
    samplesRef.current = [];
    calibrationStartRef.current = null;
    issueRef.current = { issue: null, since: 0 };
    lastAlertRef.current = -Infinity;
    lastFrameRef.current = 0;
    setProgress(0);
    progressRef.current = 0;
    publish({
      state: PostureState.CALIBRATING,
      issue: null,
      message: "Hold still while we measure your neutral posture.",
      shouldAlert: false,
    });
  }, [publish]);

  /** Forget the current baseline and session time. */
  const resetCalibration = useCallback(() => {
    baselineRef.current = null;
    baselinesRef.current = [];
    samplesRef.current = [];
    calibrationStartRef.current = null;
    issueRef.current = { issue: null, since: 0 };
    lastAlertRef.current = -Infinity;
    elapsedRef.current = 0;
    setBaselines([]);
    setElapsedTime(0);
    startCalibration();
  }, [startCalibration]);

  const pauseMonitoring = useCallback(() => {
    pausedRef.current = true;
    setPaused(true);
    issueRef.current = { issue: null, since: 0 };
    publish({
      state: PostureState.PAUSED,
      issue: null,
      message: WAITING_MESSAGE,
      shouldAlert: false,
    });
  }, [publish]);

  const resumeMonitoring = useCallback(() => {
    if (!baselineRef.current) {
      startCalibration();
      return;
    }
    pausedRef.current = false;
    setPaused(false);
    publish({
      state: PostureState.GOOD,
      issue: null,
      message: "Monitoring resumed.",
      shouldAlert: false,
    });
  }, [publish, startCalibration]);

  /** Manually record a baseline from collected features (advanced use). */
  const completeCalibration = useCallback(
    (samples) => {
      const result = calibrate(samples || samplesRef.current, {
        minSamples: MIN_CALIBRATION_SAMPLES,
      });
      if (!result.success) return result;
      baselineRef.current = result.baseline;
      baselinesRef.current = [...baselinesRef.current, result.baseline];
      setBaselines(baselinesRef.current);
      publish({
        state: PostureState.GOOD,
        issue: null,
        message: "Calibration complete - baseline recorded.",
        shouldAlert: false,
      });
      return result;
    },
    [publish]
  );

  return useMemo(
    () => ({
      state: status.state,
      issue: status.issue,
      message: status.message,
      shouldAlert: status.shouldAlert,

      elapsedTime,
      formatElapsed: formatSeconds(elapsedTime),
      paused,
      progress,

      baselines,
      baselineCount: baselines.length,
      baseline: baselines.length ? baselines[baselines.length - 1] : null,

      startCalibration,
      completeCalibration,
      resetCalibration,
      pauseMonitoring,
      resumeMonitoring,

      settings,
      processLandmarks,
      PostureState,
    }),
    [
      status,
      elapsedTime,
      paused,
      progress,
      baselines,
      settings,
      startCalibration,
      completeCalibration,
      resetCalibration,
      pauseMonitoring,
      resumeMonitoring,
      processLandmarks,
    ]
  );
}