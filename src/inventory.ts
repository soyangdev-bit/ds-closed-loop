import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CATALOG_PATH,
  DEFAULT_FORBIDDEN,
  type AngularMapping,
  type AngularTargetLayer,
  type IntentLayer,
  type Inventory,
  type InventoryComponent,
  type MappingLayer,
  type SourceLayer,
} from "./types.js";

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
    inventory: normalizeInventory(raw as Inventory),
    inventoryPath: abs,
    baseDir: path.dirname(abs),
  };
}

export function normalizeInventory(raw: Inventory): Inventory {
  return {
    ...raw,
    forbidden: raw.forbidden ?? [...DEFAULT_FORBIDDEN],
    layoutChecks: raw.layoutChecks ?? [],
    catalog: {
      path: raw.catalog?.path ?? DEFAULT_CATALOG_PATH,
      ...raw.catalog,
    },
    components: raw.components.map(normalizeComponent),
  };
}

export function normalizeComponent(row: InventoryComponent): InventoryComponent {
  const source = componentSource(row);
  const angularTargetSpecified = row.angularTarget != null;
  const target = componentAngularTarget(row);
  const angular = componentAngular(row);
  return {
    ...row,
    source,
    react: row.react ?? (source.name ? source : row.react),
    intent: componentIntent(row, source),
    angularTarget: target,
    angular: row.angular ?? (angular.selector ? angular : row.angular),
    mapping: componentMapping(row, source, target),
    tokens: row.tokens ?? [],
    angularTargetSpecified,
  };
}

export function componentSource(row: InventoryComponent): SourceLayer {
  if (row.source?.name) return row.source;
  if (row.react?.name) return row.react;
  return { name: "" };
}

export function componentIntent(
  row: InventoryComponent,
  source: SourceLayer = componentSource(row),
): IntentLayer {
  if (row.intent?.intentConfidence) return row.intent;
  if (row.intent?.dataUdx) {
    return {
      ...row.intent,
      intentConfidence: "explicit",
    };
  }
  if (source.name) {
    return {
      component: source.name,
      variant: typeof source.variant === "string" ? source.variant : undefined,
      notes: "Inferred from React source; no data-udx. Magic Patterns skill that WRITES data-udx is not in this pack.",
      ...row.intent,
      intentConfidence: "inferred",
    };
  }
  return {
    ...row.intent,
    intentConfidence: "none",
  };
}

export function componentAngularTarget(row: InventoryComponent): AngularTargetLayer {
  if (row.angularTarget) {
    const { selector, inputs, todo, ...rest } = row.angularTarget;
    return {
      ...rest,
      selector: selector ?? row.angular?.selector,
      inputs: inputs ?? row.angular?.inputs ?? {},
      todo: todo ?? true,
    };
  }
  return {
    selector: row.angular?.selector,
    inputs: row.angular?.inputs ?? {},
    todo: row.todo ?? true,
  };
}

export function componentAngular(row: InventoryComponent): AngularMapping {
  const target = row.angularTarget;
  const selector = target?.selector ?? row.angular?.selector ?? "";
  const inputs = target?.inputs ?? row.angular?.inputs ?? {};
  return { selector, inputs };
}

export function componentMapping(
  row: InventoryComponent,
  source: SourceLayer = componentSource(row),
  target: AngularTargetLayer = componentAngularTarget(row),
): MappingLayer {
  if (row.mapping) return row.mapping;
  const transforms: string[] = [];
  if (source.name && target.selector) {
    transforms.push(`${source.name} → ${target.selector}`);
  }
  if (source.variant && target.inputs?.variant != null) {
    transforms.push(`variant ${String(source.variant)} → ${String(target.inputs.variant)}`);
  }
  if (source.size && target.inputs?.size != null) {
    transforms.push(`size ${String(source.size)} → ${String(target.inputs.size)}`);
  }
  return {
    from: source.name || undefined,
    to: target.selector,
    transforms,
  };
}

export function requiredTargetTodo(row: InventoryComponent): boolean {
  if (!row.required) return false;
  if (!row.angularTargetSpecified) return false;
  const target = componentAngularTarget(row);
  const selector = (target.selector ?? "").trim();
  return !selector || target.todo === true;
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
  return (inventory.forbidden ?? DEFAULT_FORBIDDEN).includes(code);
}

export function schemaPath(): string {
  return fileURLToPath(schemaUrl);
}
