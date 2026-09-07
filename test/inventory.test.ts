import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadInventory } from "../src/inventory.js";
import { preflight } from "../src/preflight.js";

const valid = {
  screenId: "checkout-summary",
  referencePng: "refs/checkout-summary.png",
  frameSize: { w: 1440, h: 900 },
  components: [
    {
      id: "btn-pay",
      react: { name: "Button", variant: "primary", size: "md" },
      angular: { selector: "ds-button", inputs: { variant: "primary", size: "md" } },
      required: true,
      tokens: ["color.action.primary", "space.200", "radius.md"],
    },
  ],
  forbidden: ["raw-button", "inline-hex", "inline-px-spacing"],
  layoutChecks: [
    { region: "header", maxDriftPx: 8 },
    { region: "cta-row", maxDriftPx: 8 },
  ],
  rubric: ["wrong-component", "missing-variant", "token-drift", "gap-drift"],
};

test("loadInventory accepts frozen field names", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-inv-"));
  const file = path.join(dir, "inventory.json");
  writeFileSync(file, JSON.stringify(valid));
  const loaded = loadInventory(file);
  assert.equal(loaded.inventory.screenId, "checkout-summary");
  assert.equal(loaded.inventory.frameSize.w, 1440);
  assert.equal(loaded.inventory.components[0]?.angular.selector, "ds-button");
});

test("loadInventory rejects missing frozen fields", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-inv-"));
  const file = path.join(dir, "inventory.json");
  writeFileSync(file, JSON.stringify({ screenId: "x" }));
  assert.throws(() => loadInventory(file), /schema validation failed/);
});

test("preflight fails when reference PNG is missing", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-inv-"));
  const file = path.join(dir, "inventory.json");
  writeFileSync(file, JSON.stringify(valid));
  const result = preflight(file);
  assert.equal(result.result.passed, false);
  assert.match(result.result.findings[0]?.detail ?? "", /not found/);
});
