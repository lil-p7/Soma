import { useEffect, useRef } from "react";

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

/*
 * Animation constants for pose landmarks
 */
const LANDMARK_COLOR_VISIBLE = "rgba(56, 189, 248, 0.9)";
const LANDMARK_COLOR_LOW_VIS = "rgba(244, 114, 182, 0.95)";


/**
 * Camera preview with a live pose overlay.
 *
 * Holds no business logic: the parent owns the webcam hook and the detection
 * loop, this component only renders the video plus the landmarks it is given.
 */
export default function CameraPanel({
  videoRef,
  landmarksRef,
  active,
  error,
  onStart,
  onStop,
  statusText,
}) {
  const canvasRef = useRef(null);

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
          ctx.strokeStyle = LANDMARK_COLOR_VISIBLE;
          ctx.beginPath();
          CONNECTIONS.forEach(([from, to]) => {
            if (!landmarks[from] || !landmarks[to]) return;
            const a = toPoint(from);
            const b = toPoint(to);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          });
          ctx.stroke();

          ctx.fillStyle = LANDMARK_COLOR_LOW_VIS;
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
      }

      frameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      stopped = true;
      cancelAnimationFrame(frameId);
    };
  }, [active, videoRef, landmarksRef]);

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
