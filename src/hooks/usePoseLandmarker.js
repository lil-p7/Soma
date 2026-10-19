import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
// @ts-ignore - PoseLandmarkerOptions and VisionRunningMode are TypeScript type definitions

export function usePoseLandmarker() {
  const [landmarks, setLandmarks] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState("");
  const animationFrameRef = useRef(null);

  const resolveRef = useRef(null);
  const detectorRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!resolveRef.current) {
      // Initialize FilesetResolver
      FilesetResolver.fromUrl(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10/wasm/pose_landmarker.wasm"
      ).then((resolver) => {
        resolveRef.current = resolver;

        // Initialize PoseLandmarker
        const options = {
          // @ts-ignore - TypeScript types for PoseLandmarkerOptions
          baseOptions: {
            modelAssetPath: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10/wasm/pose_landmarker_lite.task",
            runningMode: "VIDEO",
            numPoses: 1,
          },
          runningMode: "VIDEO",
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        };

        detectorRef.current = PoseLandmarker.createFromOptions(resolver, options);
      });
    }
  }, []);

  // Function to detect pose from video element
  const detectFromVideo = (videoElement) => {
    if (!detectorRef.current || !videoElement) return;

    try {
      // PoseLandmarker expects VIDEO mode, detectForVideo takes the video and timestamp
      const timestamp = performance.now();
      const detection = detectorRef.current.detectForVideo(videoElement, timestamp);

      if (detection.landmarks) {
        setLandmarks(detection.landmarks);
        // Calculate average confidence from landmarks
        const scores = detection.landmarks
          .flat()
          .map((l) => l.score || 0);
        const avgConfidence =
          scores.length > 0
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : 0;
        setConfidence(avgConfidence);
      } else {
        setLandmarks(null);
        setConfidence(0);
      }
    } catch (err) {
      setError("Pose detection error: " + err);
      setLandmarks(null);
      setConfidence(0);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return { landmarks, confidence, error, detectFromVideo };
}