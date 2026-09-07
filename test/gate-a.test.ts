import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadInventory } from "../src/inventory.js";
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
