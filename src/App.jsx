import { useEffect, useRef, useState } from "react";
import CameraPanel from "./components/CameraPanel";
import { useWebcam } from "./hooks/useWebcam";
import { usePoseLandmarker } from "./hooks/usePoseLandmarker";
import { usePostureStateMachine } from "./hooks/usePostureStateMachine";
import "./index.css";

/* CSS custom properties and animation classes are loaded from index.css */

const SETTINGS = {
  alertDelay: 5, // seconds before a sustained issue raises an alert
  cooldown: 10, // seconds between alerts
  forwardLeanThreshold: 12, // degrees from baseline
  torsoInclinationThreshold: 12, // degrees from baseline
  shoulderTiltThreshold: 10, // degrees from baseline
  recoveryThreshold: 2, // degrees to return to "good"
  calibrationSeconds: 3, // neutral baseline capture time
};

const STATE_LABELS = {
  CALIBRATING: "Calibrating",
  GOOD: "Good posture",
  WARNING: "Check your posture",
  NO_POSE: "No pose detected",
  PAUSED: "Paused",
};

function App() {
  const webcam = useWebcam();
  const pose = usePoseLandmarker();
  const posture = usePostureStateMachine(SETTINGS);

  const {
    active,
    videoRef,
    startCamera,
    stopCamera, 
    error: cameraError,
  } = webcam;
  const { status: poseStatus, error: poseError, detect, landmarksRef } = pose;
  const {
    startCalibration,
    pauseMonitoring,
    resetCalibration,
    processLandmarks,
    state: postureState,
    message,
    issue,
    shouldAlert,
    formatElapsed,
    progress,
    baselineCount,
  } = posture;

  // Calibration starts with the camera, and monitoring stops with it.
  useEffect(() => {
    if (active) {
      startCalibration();
    } else {
      pauseMonitoring();
    }
  }, [active, startCalibration, pauseMonitoring]);

  // Single detection loop: runs only while the camera and the model are ready.
  useEffect(() => {
    if (!active || poseStatus !== "ready") return;

    let frameId = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;

      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        // Passing null marks the pose as unavailable for this frame.
        processLandmarks(detect(video) || null);
      }

      frameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      stopped = true;
      cancelAnimationFrame(frameId);
    };
  }, [active, poseStatus, detect, processLandmarks, videoRef]);

  // Keep an alert visible for a few seconds instead of one frame.
  const [alertMessage, setAlertMessage] = useState(null);
  const alertTimerRef = useRef(0);

  useEffect(() => {
    if (!shouldAlert) return;
    setAlertMessage(message);
    clearTimeout(alertTimerRef.current);
    alertTimerRef.current = setTimeout(() => setAlertMessage(null), 6000);
  }, [shouldAlert, message]);

  useEffect(() => () => clearTimeout(alertTimerRef.current), []);

  const statusText = STATE_LABELS[postureState] || postureState;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Soma</h1>
          <p className="tagline">
            Posture awareness from your webcam. Everything runs locally in your
            browser.
          </p>
        </div>
        <div className={`state-badge state-${postureState.toLowerCase()} ${postureState === 'CALIBRATING' ? 'animate-pulse' : postureState === 'WARNING' ? 'animate-bounce' : ''}`}>
          {statusText}
        </div>
      </header>

      {alertMessage && (
        <div role="alert" className="alert-banner animate-alert">
          <strong>Posture alert</strong>
          <span>{alertMessage}</span>
        </div>
      )}

      <main className="app-main animate-bounce-in">
        <CameraPanel
          videoRef={videoRef}
          landmarksRef={landmarksRef}
          active={active}
          error={cameraError}
          onStart={startCamera}
          onStop={stopCamera}
          statusText={
            poseStatus === "ready"
              ? pose.visible
                ? "Pose detected"
                : "Move into frame"
              : poseStatus === "loading"
                ? "Loading pose model..."
                : "Pose model failed"
          }
        />

        <aside className="side-panel animate-fade-in">
          <section className="card">
            <h2>Current posture</h2>
            <p className={`posture-message posture-${postureState.toLowerCase()}`}>
              {message}
            </p>
            {issue && (
              <p className="issue-tag">
                Indicator: {issue.replaceAll("_", " ").toLowerCase()}
              </p>
            )}

            {postureState === "CALIBRATING" && (
              <div className="progress animate-pulse-glow">
                <div
                  className="progress-bar"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}

            <dl className="stats">
              <div>
                <dt>Monitoring time</dt>
                <dd>{formatElapsed}</dd>
              </div>
              <div>
                <dt>Baselines recorded</dt>
                <dd>{baselineCount}</dd>
              </div>
              <div>
                <dt>Pose model</dt>
                <dd>{poseStatus === "ready" ? "Ready" : poseStatus}</dd>
              </div>
            </dl>

            <div className="card-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={resetCalibration}
                disabled={!active}
              >
                Recalibrate
              </button>
            </div>
          </section>

          {poseError && (
            <section className="card card-error">
              <h2>Pose engine</h2>
              <p>{poseError}</p>
            </section>
          )}

          <section className="card card-muted">
            <h2>How it works</h2>
            <ol className="hint-list">
              <li>Start the camera and hold your normal sitting position for 3 seconds.</li>
              <li>
                Soma stores that as your neutral baseline and compares every frame
                against it.
              </li>
              <li>
                Forward lean, slouching and uneven shoulders are flagged after 5
                seconds of sustained deviation.
              </li>
            </ol>
          </section>
        </aside>
      </main>

      <footer className="app-footer">
        Posture feedback only - not a medical device.
      </footer>
    </div>
  );
}

export default App;
