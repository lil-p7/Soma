import { useState, useRef, useEffect } from "react";
import CameraPanel from "./components/CameraPanel";
import { usePoseLandmarker } from "./hooks/usePoseLandmarker";
import { usePostureStateMachine } from "./hooks/usePostureStateMachine";
import "./index.css";

function App() {
  const { landmarks, confidence, error, detectFromVideo } = usePoseLandmarker();
  
  // Initialize posture state machine with custom settings
  const posture = usePostureStateMachine({
    alertDelay: 5,           // 5 seconds before alert triggers
    cooldown: 10,           // 10 seconds cooldown between alerts
    forwardLeanThreshold: 12,    // 12 degrees forward lean threshold
    torsoInclinationThreshold: 12, // 12 degrees slouching threshold
    shoulderTiltThreshold: 10,   // 10 degrees shoulder tilt threshold
    recoveryThreshold: 2,     // 2 degrees to recover from warning
  });

  // Process landmarks from MediaPipe
  useEffect(() => {
    const processLandmarks = (videoElement) => {
      if (!videoElement || !landmarks) return;
      
      // Detect pose from video element
      detectFromVideo(videoElement);
      
      // If we have landmarks, process them through the state machine
      if (landmarks && landmarks.length > 0) {
        posture.processLandmarks(landmarks);
      }
    };

    // We'll handle frame processing in the CameraPanel
  }, [landmarks, detectFromVideo, posture]);

  const toggleMonitoring = () => {
    // Toggle monitoring - this will reset calibration state if needed
    // The posture state machine handles its own state
  };

  return (
    <div className="app">
      <header>
        <h1>Soma - Posture Correction Tool</h1>
        <div className="controls">
          <button onClick={toggleMonitoring} disabled={posture.state === "NO_POSE"}>
            {posture.state === "CALIBRATING" ? "Calibrating..." : 
              posture.state === "GOOD" || posture.state === "WARNING"
                ? (posture.shouldAlert ? "Alert Active!" : "Monitoring")
                : "Pause"}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      </header>

      <main>
        <CameraPanel onFrame={detectFromVideo} />
        
        {landmarks && landmarks.length > 0 && (
          <div className="landmark-overlay">
            <p>Landmarks detected: {landmarks.length}</p>
            <p>Average confidence: {confidence.toFixed(2)}</p>
          </div>
        )}
        
        {/* Posture Status Display */}
        <section className="posture-status">
          <h2>Current Posture</h2>
          <div className={`status-indicator ${posture.state}`}>
            <span>{posture.message}</span>
          </div>
          
          {posture.issue && (
            <p className="issue-detail">{posture.message}</p>
          )}
        </section>
        
        {/* Session stats (basic) */}
        <section className="session-stats">
          <h3>Session</h3>
          <p>Monitoring time: {posture.formatElapsed}</p>
          <p>State: {posture.state}</p>
        </section>
      </main>
    </div>
  );
}

export default App;