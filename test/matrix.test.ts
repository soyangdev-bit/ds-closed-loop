import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadInventory } from "../src/inventory.js";
import { writeMatrix } from "../src/matrix.js";
import { runEvidenceAudit } from "../src/evidence-audit.js";
import { DEFAULT_CATALOG_PATH } from "../src/types.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

test("ds-loop:matrix writes skill-matrix layers under .ds-loop/matrix/", () => {
  const loaded = loadInventory(path.join(root, "fixtures/v2/inventory.json"));
  const outDir = mkdtempSync(path.join(os.tmpdir(), "ds-matrix-"));
  const written = writeMatrix({
    inventory: loaded.inventory,
    inventoryDir: loaded.baseDir,
    cwd: root,
    catalogPath: path.join(root, "fixtures/udx-catalog.example.json"),
    outDir,
  });
  assert.equal(written.matrixPath, path.join(outDir, "matrix", "inventory-matrix.json"));
  const matrix = JSON.parse(readFileSync(written.matrixPath, "utf8")) as {
    components: Array<{
      id: string;
      source: { name: string };
      intent: { intentConfidence: string };
      angularTarget: { selector: string };
      mapping: { to?: string };
      catalog: { verified: boolean };
    }>;
    gateB: { defaultMaxDriftPx: number };
    catalog: { populated: boolean };
  };
  assert.equal(matrix.components[0]?.source.name, "Button");
  assert.equal(matrix.components[0]?.intent.intentConfidence, "inferred");
  assert.equal(matrix.components[0]?.angularTarget.selector, "udx-button");
  assert.equal(matrix.components[0]?.mapping.to, "udx-button");
  assert.equal(matrix.components[0]?.catalog.verified, true);
  assert.equal(matrix.gateB.defaultMaxDriftPx, 8);
  assert.equal(matrix.catalog.populated, true);
  assert.ok(
    readFileSync(path.join(outDir, "matrix", "summary.md"), "utf8").includes(
      "conversion-preflight",
    ),
  );
});

test("empty catalog stub does not mark rows catalog-verified", () => {
  const loaded = loadInventory(path.join(root, "fixtures/good/inventory.json"));
  const outDir = mkdtempSync(path.join(os.tmpdir(), "ds-matrix-"));
  const written = writeMatrix({
    inventory: loaded.inventory,
    cwd: root,
    catalogPath: path.join(root, DEFAULT_CATALOG_PATH),
    outDir,
  });
  assert.equal(written.matrix.catalog.populated, false);
  assert.equal(written.matrix.components[0]?.catalog.verified, false);
});

test("evidence-audit fails when loop artifacts are missing", () => {
  const loaded = loadInventory(path.join(root, "fixtures/v2/inventory.json"));
  const outDir = mkdtempSync(path.join(os.tmpdir(), "ds-audit-"));
  const result = runEvidenceAudit({ inventory: loaded.inventory, outDir });
  assert.equal(result.passed, false);
  assert.ok(result.findings.some((f) => f.code === "preflight"));
});
