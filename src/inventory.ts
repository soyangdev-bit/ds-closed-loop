import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Inventory } from "./types.js";

type AjvError = { instancePath?: string; message?: string };
type AjvInstance = {
  compile: (schema: object) => ((data: unknown) => boolean) & {
    errors?: AjvError[] | null;
  };
};
type AjvConstructor = new (opts: { allErrors: boolean; strict: boolean }) => AjvInstance;

const require = createRequire(import.meta.url);
const Ajv = require("ajv") as AjvConstructor;

const schemaUrl = new URL("../schemas/inventory.schema.json", import.meta.url);
const schema = JSON.parse(readFileSync(schemaUrl, "utf8")) as object;

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

export interface LoadedInventory {
  inventory: Inventory;
  inventoryPath: string;
  baseDir: string;
}

export function loadInventory(inventoryPath: string): LoadedInventory {
  const abs = path.resolve(inventoryPath);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Inventory is not valid JSON (${abs}): ${reason}`);
  }
  if (!validate(raw)) {
    const details = (validate.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message}`)
      .join("; ");
    throw new Error(`Inventory schema validation failed (${abs}): ${details}`);
  }
  return {
    inventory: raw as Inventory,
    inventoryPath: abs,
    baseDir: path.dirname(abs),
  };
}

export function resolveReferencePng(loaded: LoadedInventory): string {
  const ref = loaded.inventory.referencePng;
  if (path.isAbsolute(ref)) return ref;
  return path.resolve(loaded.baseDir, ref);
}

export function rubricIncludes(inventory: Inventory, code: string): boolean {
  return inventory.rubric.includes(code);
}

export function forbiddenIncludes(inventory: Inventory, code: string): boolean {
  return inventory.forbidden.includes(code);
}

export function schemaPath(): string {
  return fileURLToPath(schemaUrl);
}
