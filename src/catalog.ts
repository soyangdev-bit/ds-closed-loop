import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CATALOG_PATH,
  type Inventory,
  type UdxCatalog,
  type UdxCatalogComponent,
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

const schemaUrl = new URL("../schemas/udx-catalog.schema.json", import.meta.url);
const schema = JSON.parse(readFileSync(schemaUrl, "utf8")) as object;
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

export interface LoadedCatalog {
  catalog: UdxCatalog | null;
  path: string;
  exists: boolean;
  /** True when the file exists and components[] has at least one row. */
  populated: boolean;
  parseError?: string;
}

export function catalogSchemaPath(): string {
  return fileURLToPath(schemaUrl);
}

export function resolveCatalogPath(
  inventory: Inventory,
  opts?: { cwd?: string; inventoryDir?: string },
): string {
  const rel = inventory.catalog?.path ?? DEFAULT_CATALOG_PATH;
  if (path.isAbsolute(rel)) return rel;
  const cwd = opts?.cwd ?? process.cwd();
  const fromCwd = path.resolve(cwd, rel);
  if (existsSync(fromCwd)) return fromCwd;
  if (opts?.inventoryDir) {
    const fromInv = path.resolve(opts.inventoryDir, rel);
    if (existsSync(fromInv)) return fromInv;
  }
  return fromCwd;
}

export function loadCatalog(catalogPath: string): LoadedCatalog {
  const abs = path.resolve(catalogPath);
  if (!existsSync(abs)) {
    return {
      catalog: null,
      path: abs,
      exists: false,
      populated: false,
    };
  }

  if (abs.toLowerCase().endsWith(".csv")) {
    try {
      const catalog = parseCatalogCsv(readFileSync(abs, "utf8"));
      return {
        catalog,
        path: abs,
        exists: true,
        populated: catalog.components.length > 0,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        catalog: null,
        path: abs,
        exists: true,
        populated: false,
        parseError: `UDX catalog CSV is not readable (${abs}): ${reason}`,
      };
    }
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      catalog: null,
      path: abs,
      exists: true,
      populated: false,
      parseError: `UDX catalog is not valid JSON (${abs}): ${reason}`,
    };
  }

  if (!validate(raw)) {
    const details = (validate.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message}`)
      .join("; ");
    return {
      catalog: null,
      path: abs,
      exists: true,
      populated: false,
      parseError: `UDX catalog schema validation failed (${abs}): ${details}`,
    };
  }

  const catalog = raw as UdxCatalog;
  return {
    catalog,
    path: abs,
    exists: true,
    populated: Array.isArray(catalog.components) && catalog.components.length > 0,
  };
}

export function findCatalogComponent(
  catalog: UdxCatalog,
  selector: string,
): UdxCatalogComponent | undefined {
  const needle = selector.trim().toLowerCase();
  return catalog.components.find((row) => row.selector.trim().toLowerCase() === needle);
}

export function allowedInputValues(
  row: UdxCatalogComponent,
  inputName: string,
): Array<string | number | boolean> | undefined {
  const fromInputs = valuesFor(row.inputs, inputName);
  if (fromInputs) return fromInputs;
  return valuesFor(row.variants, inputName);
}

function valuesFor(
  bag: UdxCatalogComponent["inputs"] | UdxCatalogComponent["variants"],
  inputName: string,
): Array<string | number | boolean> | undefined {
  if (!bag) return undefined;
  if (Array.isArray(bag)) {
    return bag.some((name) => name.toLowerCase() === inputName.toLowerCase())
      ? undefined
      : [];
  }
  for (const [key, values] of Object.entries(bag)) {
    if (key.toLowerCase() === inputName.toLowerCase()) return values;
  }
  return undefined;
}

export function catalogHasInputName(
  row: UdxCatalogComponent,
  inputName: string,
): boolean {
  const names = inputNames(row);
  return names.some((n) => n.toLowerCase() === inputName.toLowerCase());
}

export function inputNames(row: UdxCatalogComponent): string[] {
  const names = new Set<string>();
  if (Array.isArray(row.inputs)) {
    for (const n of row.inputs) names.add(n);
  } else if (row.inputs && typeof row.inputs === "object") {
    for (const n of Object.keys(row.inputs)) names.add(n);
  }
  if (row.variants) {
    for (const n of Object.keys(row.variants)) names.add(n);
  }
  return [...names];
}

function parseCatalogCsv(text: string): UdxCatalog {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { designSystem: "udx", components: [] };
  }
  const header = splitCsvLine(lines[0] ?? "");
  const idx = (name: string) =>
    header.findIndex((h) => h.trim().toLowerCase() === name);
  const selectorI = idx("selector");
  const reactI = idx("react");
  const inputsI = idx("inputs");
  const variantsI = idx("variants");
  const tokensI = idx("tokens");
  if (selectorI < 0) {
    throw new Error("CSV catalog must have a selector column");
  }
  const components: UdxCatalogComponent[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const selector = (cols[selectorI] ?? "").trim();
    if (!selector) continue;
    const inputNamesCol = (cols[inputsI] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const variants = parseVariantsCol(cols[variantsI] ?? "");
    const inputs: Record<string, Array<string | number | boolean>> = {};
    for (const name of inputNamesCol) {
      inputs[name] = variants[name] ?? [];
    }
    for (const [name, values] of Object.entries(variants)) {
      if (!inputs[name]) inputs[name] = values;
    }
    const tokens = (cols[tokensI] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    components.push({
      selector,
      react: (cols[reactI] ?? "").trim() || undefined,
      inputs,
      tokens: tokens.length > 0 ? tokens : undefined,
    });
  }
  return { designSystem: "udx", components };
}

function parseVariantsCol(
  raw: string,
): Record<string, Array<string | number | boolean>> {
  const out: Record<string, Array<string | number | boolean>> = {};
  const chunks = raw.split(";").map((s) => s.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const eq = chunk.indexOf("=");
    if (eq < 0) continue;
    const name = chunk.slice(0, eq).trim();
    const values = chunk
      .slice(eq + 1)
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    if (name) out[name] = values;
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cols.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}
