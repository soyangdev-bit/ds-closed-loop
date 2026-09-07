import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import { drawGoodFrame, drawShiftedFrame } from "../src/fixture-png.js";
import { measureRegionDrift } from "../src/region-drift.js";

test("aligned frames stay within the default 8px drift budget", () => {
  const reference = drawGoodFrame();
  const candidate = drawGoodFrame();
  const header = measureRegionDrift({
    reference,
    candidate,
    region: "header",
    box: { x: 0, y: 0, width: 1440, height: 80 },
    maxDriftPx: 8,
  });
  assert.equal(header.passed, true);
  assert.ok(header.driftPx <= 8);
});

test("a 40px region shift fails Gate B (gap-drift)", () => {
  const reference = drawGoodFrame();
  const candidate = drawShiftedFrame(40);
  const header = measureRegionDrift({
    reference,
    candidate,
    region: "header",
    box: { x: 0, y: 40, width: 1440, height: 80 },
    maxDriftPx: 8,
  });
  assert.equal(header.passed, false);
  assert.ok(header.driftPx > 8);
});

test("PNG dimensions match frozen frameSize", () => {
  const png: PNG = drawGoodFrame();
  assert.equal(png.width, 1440);
  assert.equal(png.height, 900);
});
