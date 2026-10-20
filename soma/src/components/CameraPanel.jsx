import { useEffect, useRef, useState } from "react";

// Skeleton edges drawn on top of the video for quick visual feedback.
const CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

// Posture indicator state passed from parent: { FORWARD_LEAN: boolean, SLOUCHING: boolean, SHOULDER_TILT: boolean }
let globalPostureState = { FORWARD_LEAN: false, SLOUCHING: false, SHOULDER_TILT: false };

// Indicator colors (rgba for overlay on video)
const INDICATOR_COLORS = {
  FORWARD_LEAN: "rgba(239, 68, 68, 0.6)",
  SLOUCHING: "rgba(251, 191, 36, 0.6)",
  SHOULDER_TILT: "rgba(56, 189, 248, 0.6)",
  OFF: "rgba(107, 99, 117, 0.3)",
};

// Indicator thresholds (degrees) - must match settings in App.jsx
const INDICATOR_THRESHOLDS = {
  FORWARD_LEAN: 12,
  SLOUCHING: 12,
  SHOULDER_TILT: 10,
};

/**
 * Camera preview with a live pose overlay + posture indicator badges.
 *
 * Holds no business logic: the parent owns the webcam hook and the detection
 * loop, this component only renders the video plus the landmarks it is given.
 * Additional props: postureState from usePostureStateMachine.
 */
export default function CameraPanel({
  videoRef,
  landmarksRef,
  active,
  error,
  onStart,
  onStop,
  statusText,
  postureState, // { FORWARD_LEAN, SLOUCHING, SHOULDER_TILT } from parent
}) {
  const canvasRef = useRef(null);
  const [indicatorBadge, setIndicatorBadge] = useState(null);

  useEffect(() => {
    // Update badge text based on global posture state from parent
    if (postureState.FORWARD_LEAN) {
      setIndicatorBadge("FORWARD_LEAN");
    } else if (postureState.SLOUCHING) {
      setIndicatorBadge("SLOUCHING");
    } else if (postureState.SHOULDER_TILT) {
      setIndicatorBadge("SHOULDER_TILT");
    } else {
      setIndicatorBadge(null);
    }
  }, [postureState.FORWARD_LEAN, postureState.SLOUCHING, postureState.SHOULDER_TILT]);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    let frameId = 0;
    let stopped = false;

    const draw = () => {
      if (stopped) return;

      if (video.videoWidth > 0) {
        if (
          canvas.width !== video.videoWidth ||
          canvas.height !== video.videoHeight
        ) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const landmarks = landmarksRef.current;
        if (landmarks && landmarks.length) {
          const toPoint = (index) => ({
            x: landmarks[index].x * canvas.width,
            y: landmarks[index].y * canvas.height,
          });

          ctx.lineWidth = Math.max(2, canvas.width / 240);
          ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";
          ctx.beginPath();
          CONNECTIONS.forEach(([from, to]) => {
            if (!landmarks[from] || !landmarks[to]) return;
            const a = toPoint(from);
            const b = toPoint(to);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          });
          ctx.stroke();

          ctx.fillStyle = "rgba(244, 114, 182, 0.95)";
          landmarks.forEach((landmark) => {
            if (Number.isFinite(landmark.visibility) && landmark.visibility < 0.4) {
              return;
            }
            ctx.beginPath();
            ctx.arc(
              landmark.x * canvas.width,
              landmark.y * canvas.height,
              Math.max(2, canvas.width / 200),
              0,
              Math.PI * 2
            );
            ctx.fill();
          });
        }

        // Draw posture indicator overlays
        drawPostureIndicators(ctx, canvas.width, canvas.height);
      }

      frameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      stopped = true;
      cancelAnimationFrame(frameId);
    };
  }, [active, videoRef, landmarksRef, postureState.FORWARD_LEAN, postureState.SLOUCHING, postureState.SHOULDER_TILT]);

  // Draw colored indicator rectangles at the top-left of the video
  function drawPostureIndicators(ctx, canvasWidth, canvasHeight) {
    const badgeSize = Math.max(20, canvasWidth / 30);
    const badgePadding = 8;
    const showBadge = indicatorBadge !== null;

    // Draw indicator rectangles
    const indicators = [
      { key: "FORWARD_LEAN", label: "FL", color: INDICATOR_COLORS.FORWARD_LEAN },
      { key: "SLOUCHING", label: "SL", color: INDICATOR_COLORS.SLOUCHING },
      { key: "SHOULDER_TILT", label: "ST", color: INDICATOR_COLORS.SHOULDER_TILT },
    ];

    indicators.forEach((ind, i) => {
      const shouldShow = indicatorBadge === ind.key || (
        // Also show if the global state says it's active (for persistence during draw)
        globalPostureState[ind.key]
      );

      if (shouldShow) {
        const x = badgePadding + (i * (badgeSize + badgePadding));
        const y = badgePadding;

        // Semi-transparent background rect
        ctx.fillStyle = ind.color;
        ctx.fillRect(x, y, badgeSize, badgeSize);

        // Border
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, badgeSize, badgeSize);

        // Label text
        ctx.fillStyle = "#fff";
        ctx.font = `${Math.round(badgeSize * 0.4)}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ind.label, x + badgeSize / 2, y + badgeSize / 2);
      }
    });
  }

  return (
    <section className="camera-panel">
      <div className="camera-stage">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`camera-video${active ? "" : " is-hidden"}`}
        />
        {active && <canvas ref={canvasRef} className="camera-overlay" />}

        {!active && (
          <div className="camera-placeholder">
            <p>Camera is off</p>
            <span>Your video never leaves this browser.</span>
          </div>
        )}

        {active && statusText && (
          <div className="camera-badge">{statusText}</div>
        )}

        {/* Posture indicator badge - shown when an issue is detected */}
        {indicatorBadge && (
          <div className="posture-indicator-badge">
            <span>{indicatorBadge}</span>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="camera-error">
          {error}
        </p>
      )}

      <div className="camera-actions">
        {active ? (
          <button type="button" className="btn btn-secondary" onClick={onStop}>
            Stop camera
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onStart}>
            Start camera
          </button>
        )}
      </div>
    </section>
  );
}