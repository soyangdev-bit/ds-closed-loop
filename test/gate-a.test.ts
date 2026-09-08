import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadInventory } from "../src/inventory.js";
import { loadCatalog } from "../src/catalog.js";
import { runGateA } from "../src/gate-a.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

test("Gate A passes on the good fixture", async () => {
  const loaded = loadInventory(path.join(root, "fixtures/good/inventory.json"));
  const result = await runGateA(
    loaded.inventory,
    path.join(root, "fixtures/good/src"),
  );
  assert.equal(result.passed, true, JSON.stringify(result.findings, null, 2));
});

test("Gate A fails the bad fixture with the structural checklist codes", async () => {
  const loaded = loadInventory(path.join(root, "fixtures/bad/inventory.json"));
  const result = await runGateA(
    loaded.inventory,
    path.join(root, "fixtures/bad/src"),
  );
  assert.equal(result.passed, false);
  const codes = new Set(result.findings.map((f) => f.code));
  assert.ok(codes.has("wrong-component"), "wrong-component");
  assert.ok(codes.has("missing-variant"), "missing-variant");
  assert.ok(codes.has("token-drift"), "token-drift");
});

test("Gate A passes inventory v2 when angularTarget is catalog-verified", async () => {
  const loaded = loadInventory(path.join(root, "fixtures/v2/inventory.json"));
  const catalog = loadCatalog(path.join(root, "fixtures/udx-catalog.example.json"));
  const result = await runGateA(
    loaded.inventory,
    path.join(root, "fixtures/good/src"),
    { catalog },
  );
  assert.equal(result.passed, true, JSON.stringify(result.findings, null, 2));
});

test("Gate A fails required v2 rows with angularTarget.todo true", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-gate-a-"));
  const file = path.join(dir, "inventory.json");
  writeFileSync(
    file,
    JSON.stringify({
      designSystem: "udx",
      screenId: "todo-row",
      referencePng: "x.png",
      frameSize: { w: 10, h: 10 },
      components: [
        {
          id: "btn-pay",
          source: { name: "Button" },
          angularTarget: {
            selector: "udx-button",
            inputs: { variant: "primary" },
            todo: true,
          },
          required: true,
          tokens: [],
        },
      ],
      forbidden: ["raw-button", "inline-hex", "inline-px-spacing"],
      rubric: ["wrong-component", "missing-variant", "token-drift", "gap-drift"],
    }),
  );
  const loaded = loadInventory(file);
  const result = await runGateA(
    loaded.inventory,
    path.join(root, "fixtures/good/src"),
    { catalog: { catalog: null, path: "", exists: false, populated: false } },
  );
  assert.equal(result.passed, false);
  assert.ok(
    result.findings.some(
      (f) => f.code === "wrong-component" && /todo is true/.test(f.detail),
    ),
    JSON.stringify(result.findings, null, 2),
  );
});

test("Gate A fails required v2 rows with missing angularTarget.selector", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-gate-a-"));
  const file = path.join(dir, "inventory.json");
  writeFileSync(
    file,
    JSON.stringify({
      designSystem: "udx",
      screenId: "missing-sel",
      referencePng: "x.png",
      frameSize: { w: 10, h: 10 },
      components: [
        {
          id: "btn-pay",
          source: { name: "Button" },
          angularTarget: { inputs: { variant: "primary" }, todo: false },
          required: true,
        },
      ],
      forbidden: ["raw-button", "inline-hex", "inline-px-spacing"],
      rubric: ["wrong-component", "missing-variant", "token-drift", "gap-drift"],
    }),
  );
  const loaded = loadInventory(file);
  const result = await runGateA(
    loaded.inventory,
    path.join(root, "fixtures/good/src"),
    { catalog: { catalog: null, path: "", exists: false, populated: false } },
  );
  assert.equal(result.passed, false);
  assert.ok(
    result.findings.some(
      (f) => f.code === "wrong-component" && /selector is missing/.test(f.detail),
    ),
    JSON.stringify(result.findings, null, 2),
  );
});

test("Gate A fails when selector is not in a populated catalog", async () => {
  const loaded = loadInventory(path.join(root, "fixtures/good/inventory.json"));
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-cat-"));
  const catalogPath = path.join(dir, "components.json");
  writeFileSync(
    catalogPath,
    JSON.stringify({
      designSystem: "udx",
      components: [{ selector: "udx-card", inputs: { variant: ["elevated"] } }],
    }),
  );
  const result = await runGateA(
    loaded.inventory,
    path.join(root, "fixtures/good/src"),
    { catalog: loadCatalog(catalogPath) },
  );
  assert.equal(result.passed, false);
  assert.ok(
    result.findings.some(
      (f) => f.code === "wrong-component" && /not a verified \+ non-null/.test(f.detail),
    ),
    JSON.stringify(result.findings, null, 2),
  );
});

test("Gate A fails when inputs are not in a populated catalog", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-gate-a-"));
  const file = path.join(dir, "inventory.json");
  writeFileSync(
    file,
    JSON.stringify({
      designSystem: "udx",
      screenId: "bad-input",
      referencePng: "x.png",
      frameSize: { w: 10, h: 10 },
      components: [
        {
          id: "btn-pay",
          source: { name: "Button" },
          angularTarget: {
            selector: "udx-button",
            inputs: { variant: "neon", size: "md" },
            todo: false,
          },
          required: true,
        },
      ],
      forbidden: ["raw-button", "inline-hex", "inline-px-spacing"],
      rubric: ["wrong-component", "missing-variant", "token-drift", "gap-drift"],
    }),
  );
  const loaded = loadInventory(file);
  const catalog = loadCatalog(path.join(root, "fixtures/udx-catalog.example.json"));
  const result = await runGateA(
    loaded.inventory,
    path.join(root, "fixtures/good/src"),
    { catalog },
  );
  assert.equal(result.passed, false);
  assert.ok(
    result.findings.some(
      (f) => f.code === "missing-variant" && /not present in catalog/.test(f.detail),
    ),
    JSON.stringify(result.findings, null, 2),
  );
});

test("Gate A fails when inventory points at a source-only / null-selector catalog row", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-gate-a-"));
  const invFile = path.join(dir, "inventory.json");
  writeFileSync(
    invFile,
    JSON.stringify({
      designSystem: "udx",
      screenId: "source-only",
      referencePng: "x.png",
      frameSize: { w: 10, h: 10 },
      components: [
        {
          id: "hk",
          source: { name: "Hotkeys" },
          angularTarget: { selector: "hotkeys", inputs: {}, todo: false },
          required: true,
        },
      ],
      forbidden: ["raw-button", "inline-hex", "inline-px-spacing"],
      rubric: ["wrong-component", "missing-variant", "token-drift", "gap-drift"],
    }),
  );
  const catalogPath = path.join(dir, "api-inventory.json");
  writeFileSync(
    catalogPath,
    JSON.stringify({
      source: { package: "@udx/lib", version: "0.0.82" },
      components: [
        {
          selector: "udx-button",
          status: "verified",
          inputs: { variant: ["primary"] },
        },
        { name: "hotkeys", selector: null, status: "source-only" },
        { name: "date", selector: null, status: "source-only" },
        { name: "close-on-scroll", selector: null, status: "source-only" },
      ],
    }),
  );
  const loaded = loadInventory(invFile);
  const result = await runGateA(
    loaded.inventory,
    path.join(root, "fixtures/good/src"),
    { catalog: loadCatalog(catalogPath) },
  );
  assert.equal(result.passed, false);
  assert.ok(
    result.findings.some(
      (f) => f.code === "wrong-component" && /source-only/.test(f.detail),
    ),
    JSON.stringify(result.findings, null, 2),
  );
});

test("Gate A accepts verified + non-null selector rows from an apis[] inventory hose", async () => {
  const loaded = loadInventory(path.join(root, "fixtures/v2/inventory.json"));
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-gate-a-"));
  const catalogPath = path.join(dir, "api-inventory.json");
  writeFileSync(
    catalogPath,
    JSON.stringify({
      source: { package: "@udx/lib", version: "0.0.82" },
      apis: [
        {
          selector: "udx-button",
          status: "verified",
          inputs: {
            variant: ["primary", "secondary", "ghost"],
            size: ["sm", "md", "lg"],
          },
        },
        { name: "hotkeys", selector: null, status: "source-only" },
      ],
    }),
  );
  const result = await runGateA(
    loaded.inventory,
    path.join(root, "fixtures/good/src"),
    { catalog: loadCatalog(catalogPath) },
  );
  assert.equal(result.passed, true, JSON.stringify(result.findings, null, 2));
});
