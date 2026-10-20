import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Webcam access: permission, preview and teardown.
 * `videoRef` must be attached to a <video autoPlay playsInline muted> element.
 */
export function useWebcam() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "This browser does not expose a camera API. Use a modern browser over http://localhost or https://."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });

      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      videoRef.current.srcObject = stream;

      await videoRef.current.play().catch(() => {
        // Autoplay can be blocked until the element is in the document; the
        // muted+playsInline attributes make this rare.
      });

      setActive(true);
    } catch (err) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError(
          "Camera permission was denied. Allow camera access in your browser and try again."
        );
      } else if (name === "NotFoundError") {
        setError("No camera was found on this device.");
      } else if (name === "NotReadableError") {
        setError(
          "The camera is already in use by another application. Close it and try again."
        );
      } else {
        setError(`Camera access failed: ${err?.message || String(err)}`);
      }
    }
  }, []);

  // Always release the camera when the component using this hook unmounts.
  useEffect(() => stopCamera, [stopCamera]);

  return {
    videoRef,
    streamRef,
    error,
    active,
    startCamera,
    stopCamera,
  };
}
