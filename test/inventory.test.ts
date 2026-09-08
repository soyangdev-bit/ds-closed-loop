import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadInventory } from "../src/inventory.js";
import { preflight } from "../src/preflight.js";
import { DEFAULT_CATALOG_PATH } from "../src/types.js";

const require = createRequire(import.meta.url);
const Ajv = require("ajv") as new (opts: {
  allErrors: boolean;
  strict: boolean;
}) => { compile: (schema: object) => (data: unknown) => boolean };

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureInventories = [
  "fixtures/good/inventory.json",
  "fixtures/bad/inventory.json",
  "fixtures/drift/inventory.json",
];

const valid = {
  designSystem: "udx",
  screenId: "checkout-summary",
  referencePng: "refs/checkout-summary.png",
  frameSize: { w: 1440, h: 900 },
  components: [
    {
      id: "btn-pay",
      react: { name: "Button", variant: "primary", size: "md" },
      angular: { selector: "udx-button", inputs: { variant: "primary", size: "md" } },
      required: true,
      todo: true,
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

const validV2 = {
  designSystem: "udx",
  screenId: "checkout-summary",
  referencePng: "refs/checkout-summary.png",
  frameSize: { w: 1440, h: 900 },
  catalog: { path: DEFAULT_CATALOG_PATH },
  states: ["default"],
  viewports: [{ id: "desktop", w: 1440, h: 900 }],
  evidence: { react: "CheckoutSummary.tsx" },
  components: [
    {
      id: "btn-pay",
      source: { name: "Button", variant: "primary", size: "md" },
      intent: { intentConfidence: "inferred", component: "Button" },
      angularTarget: {
        selector: "udx-button",
        inputs: { variant: "primary", size: "md" },
        todo: false,
      },
      mapping: {
        transforms: ["Button → udx-button"],
        evidence: ["catalog/udx/components.json"],
      },
      required: true,
      tokens: ["color.action.primary"],
    },
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
  assert.equal(loaded.inventory.designSystem, "udx");
  assert.equal(loaded.inventory.components[0]?.angular?.selector, "udx-button");
  assert.equal(loaded.inventory.components[0]?.todo, true);
});

test("loadInventory accepts inventory v2 skill-matrix layers", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-inv-"));
  const file = path.join(dir, "inventory.json");
  writeFileSync(file, JSON.stringify(validV2));
  const loaded = loadInventory(file);
  const row = loaded.inventory.components[0];
  assert.equal(row?.source?.name, "Button");
  assert.equal(row?.intent?.intentConfidence, "inferred");
  assert.equal(row?.angularTarget?.selector, "udx-button");
  assert.equal(row?.angularTarget?.todo, false);
  assert.equal(row?.angularTargetSpecified, true);
  assert.equal(loaded.inventory.catalog?.path, DEFAULT_CATALOG_PATH);
  assert.deepEqual(loaded.inventory.states, ["default"]);
  assert.equal(loaded.inventory.viewports?.[0]?.w, 1440);
  assert.equal(loaded.inventory.evidence?.react, "CheckoutSummary.tsx");
  assert.equal(loaded.inventory.layoutChecks?.length, 0);
});

test("loadInventory rejects missing frozen fields", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-inv-"));
  const file = path.join(dir, "inventory.json");
  writeFileSync(file, JSON.stringify({ screenId: "x" }));
  assert.throws(() => loadInventory(file), /schema validation failed/);
});

test("loadInventory requires designSystem udx", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-inv-"));
  const file = path.join(dir, "inventory.json");
  const { designSystem: _omit, ...rest } = valid;
  void _omit;
  writeFileSync(file, JSON.stringify(rest));
  assert.throws(() => loadInventory(file), /schema validation failed/);
});

test("loadInventory rejects intentConfidence outside explicit|inferred|none", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-inv-"));
  const file = path.join(dir, "inventory.json");
  const bad = structuredClone(validV2);
  bad.components[0]!.intent = { intentConfidence: "maybe" as "inferred" };
  writeFileSync(file, JSON.stringify(bad));
  assert.throws(() => loadInventory(file), /schema validation failed/);
});

test("sample fixtures declare designSystem udx and udx-* placeholders", () => {
  for (const rel of fixtureInventories) {
    const loaded = loadInventory(path.join(root, rel));
    assert.equal(loaded.inventory.designSystem, "udx", rel);
    const row = loaded.inventory.components[0];
    assert.ok(row?.angular?.selector?.startsWith("udx-"), rel);
    assert.equal(row?.todo, true, rel);
    assert.equal(row?.angularTargetSpecified, false, rel);
  }
});

test("fixtures/v2 inventory validates skill-matrix layers", () => {
  const loaded = loadInventory(path.join(root, "fixtures/v2/inventory.json"));
  const row = loaded.inventory.components[0];
  assert.equal(loaded.inventory.designSystem, "udx");
  assert.equal(row?.source?.name, "Button");
  assert.equal(row?.intent?.intentConfidence, "inferred");
  assert.equal(row?.angularTarget?.selector, "udx-button");
  assert.equal(row?.angularTarget?.todo, false);
  assert.ok(Array.isArray(row?.mapping?.transforms));
  assert.equal(loaded.inventory.catalog?.path, "fixtures/udx-catalog.example.json");
});

test("example UDX catalog dump matches the catalog schema", () => {
  const schema = JSON.parse(
    readFileSync(path.join(root, "schemas/udx-catalog.schema.json"), "utf8"),
  ) as object;
  const dump = JSON.parse(
    readFileSync(path.join(root, "fixtures/udx-catalog.example.json"), "utf8"),
  ) as unknown;
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  assert.equal(validate(dump), true);
});

test("catalog stub is a valid empty dump", () => {
  const schema = JSON.parse(
    readFileSync(path.join(root, "schemas/udx-catalog.schema.json"), "utf8"),
  ) as object;
  const stub = JSON.parse(
    readFileSync(path.join(root, "catalog/udx/components.json"), "utf8"),
  ) as { components: unknown[] };
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  assert.equal(validate(stub), true);
  assert.equal(stub.components.length, 0);
});

test("preflight fails when reference PNG is missing", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-inv-"));
  const file = path.join(dir, "inventory.json");
  writeFileSync(file, JSON.stringify(valid));
  const result = preflight(file);
  assert.equal(result.result.passed, false);
  assert.match(result.result.findings[0]?.detail ?? "", /not found/);
});
