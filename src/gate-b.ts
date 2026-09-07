import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import { openSession, preparePreview, screenshotPreview } from "./playwright-session.js";
import { measureRegionDrift } from "./region-drift.js";
import { rubricIncludes } from "./inventory.js";
import {
  DEFAULT_MAX_DRIFT_PX,
  DEFAULT_OUT_DIR,
  REGION_ATTR,
  type Finding,
  type GateResult,
  type Inventory,
} from "./types.js";

export interface GateBOptions {
  inventory: Inventory;
  referencePng: string;
  preview: string;
  outDir?: string;
  storageState?: string;
}

export async function runGateB(opts: GateBOptions): Promise<GateResult> {
  if (!rubricIncludes(opts.inventory, "gap-drift")) {
    return { name: "B", passed: true, skipped: true, findings: [] };
  }

  const { w, h } = opts.inventory.frameSize;
  const outDir = path.resolve(opts.outDir ?? DEFAULT_OUT_DIR);
  mkdirSync(path.join(outDir, "screenshots"), { recursive: true });
  const candidatePath = path.join(outDir, "screenshots", "candidate.png");
  const target = resolvePreviewTarget(opts.preview);

  const session = await openSession({
    width: w,
    height: h,
    storageState: opts.storageState,
  });

  const findings: Finding[] = [];
  try {
    await session.page.goto(target, { waitUntil: "load", timeout: 30_000 });
    await preparePreview(session.page);
    const buf = await screenshotPreview(session.page, candidatePath);
    const candidate = PNG.sync.read(buf);
    const reference = PNG.sync.read(readFileSync(opts.referencePng));

    if (candidate.width !== w || candidate.height !== h) {
      findings.push({
        code: "gap-drift",
        detail: `candidate screenshot is ${candidate.width}x${candidate.height}, frameSize is ${w}x${h}`,
      });
      return { name: "B", passed: false, findings };
    }

    for (const check of opts.inventory.layoutChecks) {
      const maxDriftPx = check.maxDriftPx ?? DEFAULT_MAX_DRIFT_PX;
      const locator = session.page.locator(`[${REGION_ATTR}="${check.region}"]`);
      const count = await locator.count();
      if (count === 0) {
        findings.push({
          code: "gap-drift",
          region: check.region,
          detail: `region "${check.region}" not found; mark it with [${REGION_ATTR}="${check.region}"] in the preview`,
        });
        continue;
      }
      const box = await locator.first().boundingBox();
      if (!box) {
        findings.push({
          code: "gap-drift",
          region: check.region,
          detail: `region "${check.region}" has no bounding box (hidden or not rendered)`,
        });
        continue;
      }
      const drift = measureRegionDrift({
        reference,
        candidate,
        region: check.region,
        box,
        maxDriftPx,
      });
      writeFileSync(
        path.join(outDir, "screenshots", `region-${check.region}.json`),
        `${JSON.stringify(drift, null, 2)}\n`,
      );
      if (!drift.passed) {
        findings.push({
          code: "gap-drift",
          region: check.region,
          detail: drift.reason ?? `region "${check.region}" exceeded maxDriftPx ${maxDriftPx}`,
        });
      }
    }
  } finally {
    await session.close();
  }

  return { name: "B", passed: findings.length === 0, findings };
}

export function resolvePreviewTarget(preview: string): string {
  if (/^https?:\/\//i.test(preview) || preview.startsWith("file:")) {
    return preview;
  }
  return pathToFileURL(path.resolve(preview)).href;
}
