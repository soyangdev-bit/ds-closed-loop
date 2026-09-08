import { existsSync } from "node:fs";
import path from "node:path";
import {
  componentAngular,
  componentMapping,
  requiredTargetTodo,
} from "./inventory.js";
import { DEFAULT_OUT_DIR, type Finding, type GateResult, type Inventory } from "./types.js";

export interface EvidenceAuditOptions {
  inventory: Inventory;
  outDir?: string;
  requireMatrix?: boolean;
}

export function runEvidenceAudit(opts: EvidenceAuditOptions): GateResult {
  const outDir = path.resolve(opts.outDir ?? DEFAULT_OUT_DIR);
  const findings: Finding[] = [];

  const reportPath = path.join(outDir, "report.json");
  if (!existsSync(reportPath)) {
    findings.push({
      code: "preflight",
      detail: `missing ${reportPath}; run ds-loop run (angular-implementation) first`,
    });
  }

  const matrixPath = path.join(outDir, "matrix", "inventory-matrix.json");
  if (!existsSync(matrixPath)) {
    findings.push({
      code: "preflight",
      detail: `missing ${matrixPath}; run npm run ds-loop:matrix (conversion-inventory)`,
    });
  }

  for (const row of opts.inventory.components) {
    if (!row.required) continue;
    if (requiredTargetTodo(row)) {
      const { selector } = componentAngular(row);
      findings.push({
        code: "wrong-component",
        componentId: row.id,
        detail: selector
          ? `${row.id}: angularTarget.todo is still true (not catalog-verified)`
          : `${row.id}: angularTarget.selector missing in evidence audit`,
      });
    }
    const mapping = componentMapping(row);
    const evidence = mapping.evidence;
    const hasEvidence = Array.isArray(evidence)
      ? evidence.length > 0
      : Boolean(evidence && Object.keys(evidence).length > 0);
    const hasTransforms = (mapping.transforms ?? []).length > 0;
    if (!hasEvidence && !hasTransforms && !mapping.to) {
      findings.push({
        code: "missing-variant",
        componentId: row.id,
        detail: `${row.id}: mapping has no transforms or evidence`,
      });
    }
  }

  return {
    name: "audit",
    passed: findings.length === 0,
    findings,
  };
}
