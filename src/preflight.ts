import { readFileSync, existsSync } from "node:fs";
import { PNG } from "pngjs";
import { loadInventory, resolveReferencePng, type LoadedInventory } from "./inventory.js";
import type { Finding, GateResult } from "./types.js";

export interface PreflightResult {
  loaded?: LoadedInventory;
  referencePng: string;
  result: GateResult;
}

export function preflight(inventoryPath: string): PreflightResult {
  const findings: Finding[] = [];
  let loaded: LoadedInventory;
  try {
    loaded = loadInventory(inventoryPath);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      referencePng: "",
      result: {
        name: "preflight",
        passed: false,
        findings: [{ code: "preflight", detail }],
      },
    };
  }

  const referencePng = resolveReferencePng(loaded);
  if (!existsSync(referencePng)) {
    findings.push({
      code: "preflight",
      detail: `referencePng not found: ${referencePng}`,
    });
  } else {
    try {
      const png = PNG.sync.read(readFileSync(referencePng));
      const { w, h } = loaded.inventory.frameSize;
      if (png.width !== w || png.height !== h) {
        findings.push({
          code: "preflight",
          detail: `reference PNG is ${png.width}x${png.height}, frameSize is ${w}x${h}`,
        });
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      findings.push({
        code: "preflight",
        detail: `referencePng is not a readable PNG (${referencePng}): ${reason}`,
      });
    }
  }

  return {
    loaded,
    referencePng,
    result: {
      name: "preflight",
      passed: findings.length === 0,
      findings,
    },
  };
}
