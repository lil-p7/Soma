import { useEffect, useRef } from "react";
import { useWebcam } from "../hooks/useWebcam";

export default function CameraPanel({ onFrame }) {
  const webcam = useWebcam();
  const { videoRef, active, startCamera, stopCamera, error } = webcam;

  // Call onFrame when video plays
  useEffect(() => {
    if (!onFrame || !videoRef.current) return;

    const videoElement = videoRef.current;

    // Set up canvas for pose landmark drawing
    const canvasRef = useRef(null);
    let isRunning = true;

    useEffect(() => {
      const canvas = document.createElement("canvas");
      canvasRef.current = canvas;
      canvas.style.position = "absolute";
      canvas.style.top = 0;
      canvas.style.left = 0;
      canvas.style.zIndex = "10";
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      videoElement.parentNode.appendChild(canvas);

      const updateFrame = () => {
        if (!isRunning) return;

        // Resize canvas to match video
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        // Draw video frame on canvas
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        }

        // Call onFrame with video element for pose processing
        onFrame(videoElement);
        requestAnimationFrame(updateFrame);
      };

      updateFrame();

      return () => {
        isRunning = false;
        if (canvasRef.current && canvasRef.current.parentNode) {
          canvasRef.current.parentNode.removeChild(canvasRef.current);
        }
      };
    }, [videoElement, onFrame]);

    return () => {
      stopCamera();
    };
  }, [onFrame, startCamera, stopCamera]);

  return (
    <section>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", borderRadius: 12, background: "#000" }}
      />
      {error && <p role="alert" style={{ marginTop: 8, color: "red" }}>
        {error}
      </p>}
      {!active ? (
        <button onClick={startCamera}
          style={{ marginTop: 8, padding: "8px 16px" }}>
          Start camera
        </button>
      ) : (
        <button onClick={stopCamera}
          style={{ marginTop: 8, padding: "8px 16px", marginLeft: 8 }}>
          Stop camera
        </button>
      )}
    </section>
  );
}