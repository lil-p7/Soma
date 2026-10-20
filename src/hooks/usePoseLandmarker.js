import { useCallback, useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// Assets are vendored into /public so the app works without CDN access.
const WASM_BASE = "/mediapipe/wasm";
const MODEL_URL = "/models/pose_landmarker_lite.task";

const VIDEO_MODE_OPTIONS = {
  runningMode: "VIDEO",
  numPoses: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

/**
 * Loads the MediaPipe Pose Landmarker in VIDEO mode.
 *
 * Returns a `detect(videoElement)` function that synchronously produces the
 * landmarks of the first pose (33 landmarks) or null when no pose is visible.
 * The latest landmarks are also kept in `landmarksRef` for canvas drawing so
 * the render loop does not have to feed React state every frame.
 */
export function usePoseLandmarker() {
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");
  const [detection, setDetection] = useState({ visible: false, confidence: 0 });

  const detectorRef = useRef(null);
  const landmarksRef = useRef(null);
  const lastTimestampRef = useRef(0);
  const lastStatsRef = useRef(0);
  const detectionRef = useRef(detection);
  detectionRef.current = detection;

  useEffect(() => {
    let cancelled = false;
    let detector = null;

    async function init() {
      try {
        const resolver = await FilesetResolver.forVisionTasks(WASM_BASE);
        detector = await PoseLandmarker.createFromOptions(resolver, {
          baseOptions: { modelAssetPath: MODEL_URL },
          ...VIDEO_MODE_OPTIONS,
        });

        if (cancelled) {
          detector.close();
          return;
        }

        detectorRef.current = detector;
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(
          `Could not load the pose model: ${err?.message || String(err)}`
        );
      }
    }

    init();

    return () => {
      cancelled = true;
      detectorRef.current?.close?.();
      detectorRef.current = null;
    };
  }, []);

  const detect = useCallback((videoElement) => {
    const detector = detectorRef.current;

    if (!detector || !videoElement || videoElement.readyState < 2) {
      return null;
    }

    // Timestamps passed to detectForVideo must be strictly increasing.
    const timestamp = performance.now();
    if (timestamp <= lastTimestampRef.current) {
      return landmarksRef.current;
    }
    lastTimestampRef.current = timestamp;

    try {
      const result = detector.detectForVideo(videoElement, timestamp);
      const pose = result?.landmarks?.[0] || null;
      landmarksRef.current = pose;

      // Throttle React updates: the drawing loop uses landmarksRef instead.
      if (timestamp - lastStatsRef.current > 200) {
        lastStatsRef.current = timestamp;
        const scores = pose
          ? pose.map((landmark) =>
              Number.isFinite(landmark.visibility) ? landmark.visibility : 0
            )
          : [];
        const confidence =
          scores.length > 0
            ? scores.reduce((sum, score) => sum + score, 0) / scores.length
            : 0;

        const next = { visible: !!pose, confidence };
        const prev = detectionRef.current;
        if (
          prev.visible !== next.visible ||
          Math.abs(prev.confidence - next.confidence) > 0.02
        ) {
          setDetection(next);
        }
      }

      return pose;
    } catch (err) {
      landmarksRef.current = null;
      setError(`Pose detection failed: ${err?.message || String(err)}`);
      return null;
    }
  }, []);

  return {
    status,
    error,
    detect,
    landmarksRef,
    visible: detection.visible,
    confidence: detection.confidence,
  };
}
