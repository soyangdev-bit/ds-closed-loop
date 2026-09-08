import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  findCatalogRow,
  isEligibleAngularTarget,
  isSourceOnlyCatalogRow,
  loadCatalog,
  normalizeCatalogDump,
  resolveCatalogPath,
} from "../src/catalog.js";
import {
  DEFAULT_CATALOG_PATH,
  LEGACY_CATALOG_PATH,
  type Inventory,
} from "../src/types.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const emptyInventory = {
  catalog: { path: DEFAULT_CATALOG_PATH },
} as Inventory;

test("default catalog.path is api-inventory.json and that stub is empty", () => {
  assert.equal(DEFAULT_CATALOG_PATH, "catalog/udx/api-inventory.json");
  assert.equal(LEGACY_CATALOG_PATH, "catalog/udx/components.json");
  const loaded = loadCatalog(path.join(root, DEFAULT_CATALOG_PATH));
  assert.equal(loaded.exists, true);
  assert.equal(loaded.populated, false);
  assert.equal(loaded.catalog?.components.length, 0);
});

test("resolveCatalogPath prefers api-inventory.json over components.json", () => {
  const resolved = resolveCatalogPath(emptyInventory, { cwd: root });
  assert.equal(resolved, path.join(root, DEFAULT_CATALOG_PATH));
});

test("resolveCatalogPath falls back to components.json when api-inventory.json is missing", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-cat-path-"));
  mkdirSync(path.join(dir, "catalog", "udx"), { recursive: true });
  writeFileSync(
    path.join(dir, "catalog", "udx", "components.json"),
    JSON.stringify({ designSystem: "udx", components: [] }),
  );
  const resolved = resolveCatalogPath(emptyInventory, { cwd: dir });
  assert.equal(resolved, path.join(dir, LEGACY_CATALOG_PATH));
});

test("resolveCatalogPath honors inventory.catalog.path override", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ds-cat-path-"));
  const override = path.join(dir, "custom.json");
  writeFileSync(override, JSON.stringify({ designSystem: "udx", components: [] }));
  const resolved = resolveCatalogPath(
    { catalog: { path: override } } as Inventory,
    { cwd: root },
  );
  assert.equal(resolved, override);
});

test("normalizeCatalogDump lifts apis[] and treats null selector as source-only", () => {
  const catalog = normalizeCatalogDump({
    source: { package: "@udx/lib", version: "0.0.82" },
    apis: [
      { selector: "udx-button", status: "verified" },
      { name: "hotkeys", selector: null, status: "source-only" },
      { name: "date", selector: "", status: "source-only" },
    ],
  });
  assert.equal(catalog.designSystem, "udx");
  assert.equal(catalog.components.length, 3);
  assert.equal(isEligibleAngularTarget(catalog.components[0]!), true);
  assert.equal(isSourceOnlyCatalogRow(catalog.components[1]!), true);
  assert.equal(isEligibleAngularTarget(catalog.components[1]!), false);
  assert.equal(isSourceOnlyCatalogRow(catalog.components[2]!), true);
  const hotkeys = findCatalogRow(catalog, "hotkeys");
  assert.ok(hotkeys);
  assert.equal(isEligibleAngularTarget(hotkeys!), false);
});

test("legacy components.json rows with a selector and no status stay eligible", () => {
  const catalog = normalizeCatalogDump({
    designSystem: "udx",
    components: [{ selector: "udx-button", inputs: { variant: ["primary"] } }],
  });
  assert.equal(isEligibleAngularTarget(catalog.components[0]!), true);
  assert.equal(isSourceOnlyCatalogRow(catalog.components[0]!), false);
});
