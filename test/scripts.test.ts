import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

test("npm scripts match Devin skill aliases", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(pkg.scripts["ds-loop:preflight"], "tsx src/cli.ts preflight");
  assert.equal(pkg.scripts["ds-loop:run"], "tsx src/cli.ts run");
  assert.equal(pkg.scripts["ds-loop:matrix"], "tsx src/cli.ts matrix");
  assert.equal(pkg.scripts["inventory:validate"], "tsx src/cli.ts inventory");
});
