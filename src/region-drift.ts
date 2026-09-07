import { PNG } from "pngjs";
import { DEFAULT_MAX_DRIFT_PX, type Rect, type RegionDrift } from "./types.js";

const SEARCH_PAD = 48;

export function measureRegionDrift(opts: {
  reference: PNG;
  candidate: PNG;
  region: string;
  box: Rect;
  maxDriftPx?: number;
}): RegionDrift {
  const maxDriftPx = opts.maxDriftPx ?? DEFAULT_MAX_DRIFT_PX;
  const box = clampBox(opts.box, opts.candidate.width, opts.candidate.height);
  if (!box) {
    return {
      region: opts.region,
      dx: 0,
      dy: 0,
      driftPx: Number.POSITIVE_INFINITY,
      maxDriftPx,
      passed: false,
      reason: `region "${opts.region}" bounding box is empty or outside the screenshot`,
    };
  }

  const radius = Math.max(Math.ceil(maxDriftPx) * 4, SEARCH_PAD);
  let best = { dx: 0, dy: 0, error: Number.POSITIVE_INFINITY };

  for (let dy = -radius; dy <= radius; dy += 2) {
    for (let dx = -radius; dx <= radius; dx += 2) {
      const error = meanAbsError(opts.reference, opts.candidate, box, dx, dy);
      if (error < best.error) best = { dx, dy, error };
    }
  }

  const refine = 2;
  const cx = best.dx;
  const cy = best.dy;
  for (let dy = cy - refine; dy <= cy + refine; dy++) {
    for (let dx = cx - refine; dx <= cx + refine; dx++) {
      const error = meanAbsError(opts.reference, opts.candidate, box, dx, dy);
      if (error < best.error) best = { dx, dy, error };
    }
  }

  const driftPx = Math.max(Math.abs(best.dx), Math.abs(best.dy));
  const passed = driftPx <= maxDriftPx;

  return {
    region: opts.region,
    dx: best.dx,
    dy: best.dy,
    driftPx,
    maxDriftPx,
    passed,
    box,
    reason: passed
      ? undefined
      : `region "${opts.region}" drifted ${driftPx}px (max ${maxDriftPx}px) at offset (${best.dx},${best.dy}); MAE ${best.error.toFixed(1)}`,
  };
}

function clampBox(box: Rect, imgW: number, imgH: number): Rect | null {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const width = Math.min(imgW - x, Math.round(box.width));
  const height = Math.min(imgH - y, Math.round(box.height));
  if (width < 2 || height < 2) return null;
  return { x, y, width, height };
}

function meanAbsError(
  ref: PNG,
  cand: PNG,
  box: Rect,
  dx: number,
  dy: number,
): number {
  let sum = 0;
  let n = 0;
  const stride = 2;
  for (let j = 0; j < box.height; j += stride) {
    for (let i = 0; i < box.width; i += stride) {
      const cx = box.x + i;
      const cy = box.y + j;
      const rx = cx + dx;
      const ry = cy + dy;
      const ci = (cy * cand.width + cx) * 4;
      const cr = cand.data[ci] ?? 0;
      const cg = cand.data[ci + 1] ?? 0;
      const cb = cand.data[ci + 2] ?? 0;
      if (rx < 0 || ry < 0 || rx >= ref.width || ry >= ref.height) {
        sum += 255 * 3;
        n++;
        continue;
      }
      const ri = (ry * ref.width + rx) * 4;
      sum += Math.abs(cr - (ref.data[ri] ?? 0));
      sum += Math.abs(cg - (ref.data[ri + 1] ?? 0));
      sum += Math.abs(cb - (ref.data[ri + 2] ?? 0));
      n++;
    }
  }
  return n === 0 ? Number.POSITIVE_INFINITY : sum / n;
}

export function pngFromBuffer(buf: Buffer): PNG {
  return PNG.sync.read(buf);
}
