/**
 * Logic checks for the posture engine (node, no browser needed).
 *
 * Run with: npm test
 */
import assert from "node:assert/strict";
import {
  extractFeatures,
  computeDeviations,
  updatePostureState,
  PostureState,
} from "../src/logic/postureAnalyzer.js";
import { calibrate, isValidBaseline } from "../src/logic/calibration.js";
import { formatSeconds } from "../src/utils/time.js";

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`ok - ${name}`);
}

/** Build a 33-landmark pose with overridable key points. */
function makePose(overrides = {}) {
  const points = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.99,
  }));

  points[0] = { x: 0.5, y: 0.28, z: 0, visibility: 0.99 }; // nose
  points[7] = { x: 0.46, y: 0.3, z: 0, visibility: 0.99 }; // left ear
  points[8] = { x: 0.54, y: 0.3, z: 0, visibility: 0.99 }; // right ear
  points[11] = { x: 0.4, y: 0.4, z: 0, visibility: 0.99 }; // left shoulder
  points[12] = { x: 0.6, y: 0.4, z: 0, visibility: 0.99 }; // right shoulder
  points[13] = { x: 0.36, y: 0.55, z: 0, visibility: 0.99 }; // left elbow
  points[14] = { x: 0.64, y: 0.55, z: 0, visibility: 0.99 }; // right elbow
  points[23] = { x: 0.43, y: 0.75, z: 0, visibility: 0.99 }; // left hip
  points[24] = { x: 0.57, y: 0.75, z: 0, visibility: 0.99 }; // right hip

  Object.entries(overrides).forEach(([index, value]) => {
    points[Number(index)] = { ...points[Number(index)], ...value };
  });

  return points;
}

const baselinePose = makePose();
const baselineFeatures = extractFeatures(baselinePose);
const calibration = calibrate(
  Array.from({ length: 30 }, () => baselineFeatures)
);

check("features are extracted from a valid pose", () => {
  assert.equal(baselineFeatures.error, undefined);
  assert.ok(Math.abs(baselineFeatures.shoulderAngleDeg) < 1e-6);
  assert.ok(baselineFeatures.torsoLengthRatio > 0);
  assert.equal(baselineFeatures.forwardHeadRatio, 0);
});

check("unusable poses return an error instead of throwing", () => {
  assert.match(extractFeatures(null).error, /Insufficient/);
  assert.match(extractFeatures([{ x: 0, y: 0 }]).error, /Insufficient/);

  const hidden = extractFeatures(makePose({ 11: { visibility: 0.1 } }));
  assert.match(hidden.error, /visible/);

  const broken = makePose();
  broken[12] = { x: undefined, y: 0.4, z: 0, visibility: 0.99 };
  assert.match(extractFeatures(broken).error, /Invalid/);
});

check("calibration averages the neutral samples", () => {
  assert.equal(calibration.success, true);
  assert.equal(calibration.baseline.sampleCount, 30);
  assert.ok(Math.abs(calibration.baseline.shoulderAngleDeg) < 1e-6);
  assert.ok(
    Math.abs(
      calibration.baseline.torsoLengthRatio - baselineFeatures.torsoLengthRatio
    ) < 1e-9
  );
  assert.equal(isValidBaseline(calibration.baseline), true);
});

check("calibration rejects insufficient or empty samples", () => {
  assert.equal(calibrate([]).success, false);
  assert.equal(calibrate([baselineFeatures]).success, false);
  assert.equal(isValidBaseline(null), false);
});

check("identical posture is GOOD", () => {
  const features = extractFeatures(makePose());
  const deviations = computeDeviations(features, calibration.baseline);
  const result = updatePostureState(deviations, {});
  assert.equal(result.state, PostureState.GOOD);
  assert.equal(result.issue, null);
});

check("no baseline yet yields NO_POSE rather than a false alert", () => {
  const deviations = computeDeviations(extractFeatures(makePose()), null);
  assert.equal(deviations, null);
  assert.equal(updatePostureState(null, {}).state, PostureState.NO_POSE);
});

check("uneven shoulders are WARNING / SHOULDER_TILT", () => {
  const features = extractFeatures(makePose({ 12: { y: 0.5 } }));
  const deviations = computeDeviations(features, calibration.baseline);
  const result = updatePostureState(deviations, {});
  assert.equal(result.state, PostureState.WARNING);
  assert.equal(result.issue, "SHOULDER_TILT");
  assert.ok(deviations.shoulderTiltDeg > 10);
});

check("forward head posture is WARNING / FORWARD_LEAN", () => {
  const features = extractFeatures(makePose({ 0: { z: -0.06 } }));
  const deviations = computeDeviations(features, calibration.baseline);
  const result = updatePostureState(deviations, {});
  assert.equal(result.state, PostureState.WARNING);
  assert.equal(result.issue, "FORWARD_LEAN");
  assert.ok(deviations.forwardLeanDeg > 12);
});

check("collapsed torso is WARNING / SLOUCHING", () => {
  const features = extractFeatures(makePose({ 11: { y: 0.46 }, 12: { y: 0.46 } }));
  const deviations = computeDeviations(features, calibration.baseline);
  const result = updatePostureState(deviations, {});
  assert.equal(result.state, PostureState.WARNING);
  assert.equal(result.issue, "SLOUCHING");
  assert.ok(Math.abs(deviations.torsoInclinationDeg) > 12);
});

check("recovering to the baseline clears the warning", () => {
  const warning = extractFeatures(makePose({ 12: { y: 0.5 } }));
  assert.equal(
    updatePostureState(computeDeviations(warning, calibration.baseline), {})
      .state,
    PostureState.WARNING
  );

  const recovered = extractFeatures(makePose({ 12: { y: 0.405 } }));
  assert.equal(
    updatePostureState(computeDeviations(recovered, calibration.baseline), {})
      .state,
    PostureState.GOOD
  );
});

check("custom thresholds are honoured", () => {
  const features = extractFeatures(makePose({ 12: { y: 0.46 } }));
  const deviations = computeDeviations(features, calibration.baseline);
  assert.equal(updatePostureState(deviations, {}).state, PostureState.WARNING);
  assert.equal(
    updatePostureState(deviations, { shoulderTiltThreshold: 45 }).state,
    PostureState.GOOD
  );
});

check("session time formatting", () => {
  assert.equal(formatSeconds(0), "0:00");
  assert.equal(formatSeconds(9), "0:09");
  assert.equal(formatSeconds(75), "1:15");
});

console.log(`\n${checks} logic checks passed`);
