import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CATALOG_PATH,
  LEGACY_CATALOG_PATH,
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
  const primary = resolveExisting(rel, opts) ?? resolveRelative(rel, opts);
  if (existsSync(primary)) return primary;

  const usingDefault =
    !inventory.catalog?.path ||
    inventory.catalog.path === DEFAULT_CATALOG_PATH;
  if (usingDefault) {
    const legacy = resolveExisting(LEGACY_CATALOG_PATH, opts);
    if (legacy) return legacy;
  }
  return primary;
}

function resolveRelative(
  rel: string,
  opts?: { cwd?: string; inventoryDir?: string },
): string {
  if (path.isAbsolute(rel)) return rel;
  return path.resolve(opts?.cwd ?? process.cwd(), rel);
}

function resolveExisting(
  rel: string,
  opts?: { cwd?: string; inventoryDir?: string },
): string | undefined {
  if (path.isAbsolute(rel)) return existsSync(rel) ? rel : undefined;
  const cwd = opts?.cwd ?? process.cwd();
  const fromCwd = path.resolve(cwd, rel);
  if (existsSync(fromCwd)) return fromCwd;
  if (opts?.inventoryDir) {
    const fromInv = path.resolve(opts.inventoryDir, rel);
    if (existsSync(fromInv)) return fromInv;
  }
  return undefined;
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

  const catalog = normalizeCatalogDump(raw);
  if (!validate(catalog)) {
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

  return {
    catalog,
    path: abs,
    exists: true,
    populated: catalog.components.length > 0,
  };
}

const ROW_COLLECTION_KEYS = [
  "components",
  "apis",
  "inventory",
  "items",
  "exports",
  "entries",
] as const;

export function normalizeCatalogDump(raw: unknown): UdxCatalog {
  const rows = extractCatalogRows(raw);
  const meta =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const { components: _ignored, apis: _apis, ...rest } = meta;
  void _ignored;
  void _apis;
  return {
    ...rest,
    designSystem: "udx",
    components: rows.map(normalizeCatalogRow),
  };
}

function extractCatalogRows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const found: unknown[][] = [];
  for (const key of ROW_COLLECTION_KEYS) {
    const value = obj[key];
    if (Array.isArray(value)) found.push(value);
  }
  const nonempty = found.find((rows) => rows.length > 0);
  return nonempty ?? found[0] ?? [];
}

function normalizeCatalogRow(row: unknown): UdxCatalogComponent {
  if (!row || typeof row !== "object") {
    return { selector: null };
  }
  const rec = row as Record<string, unknown>;
  const selector = coerceSelector(
    rec.selector ?? rec.angularSelector ?? rec.tag,
  );
  const status = coerceStatus(
    rec.status ?? rec.verificationStatus ?? rec.verification ?? rec.state,
  );
  return {
    ...rec,
    selector,
    ...(status ? { status } : {}),
  };
}

function coerceSelector(value: unknown): string | null {
  if (value == null || value === false) return null;
  const text = String(value).trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower === "null" || lower === "undefined" || lower === "none") return null;
  return text;
}

function coerceStatus(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "object") return undefined;
  const text = String(value).trim();
  return text || undefined;
}

export function catalogRowSelector(row: UdxCatalogComponent): string | null {
  return coerceSelector(row.selector);
}

export function catalogRowStatus(row: UdxCatalogComponent): string {
  return (coerceStatus(row.status) ?? "").toLowerCase().replace(/[_ ]+/g, "-");
}

/** Null selector or `source-only` (hotkeys, date, close-on-scroll, …). */
export function isSourceOnlyCatalogRow(row: UdxCatalogComponent): boolean {
  if (catalogRowSelector(row) == null) return true;
  const status = catalogRowStatus(row);
  return (
    status === "source-only" ||
    status === "sourceonly" ||
    status === "null-selector" ||
    status === "no-selector"
  );
}

/**
 * Eligible angularTarget: `status: verified` (or equivalent) AND non-null selector.
 * Legacy dumps with a real selector and no status count as verified.
 */
export function isEligibleAngularTarget(row: UdxCatalogComponent): boolean {
  if (isSourceOnlyCatalogRow(row)) return false;
  const status = catalogRowStatus(row);
  if (!status) return catalogRowSelector(row) != null;
  return (
    status === "verified" ||
    status === "ok" ||
    status === "ready" ||
    status === "public" ||
    status === "published" ||
    status === "pass" ||
    status === "passed"
  );
}

export function findCatalogComponent(
  catalog: UdxCatalog,
  selector: string,
): UdxCatalogComponent | undefined {
  const row = findCatalogRow(catalog, selector);
  if (!row || !isEligibleAngularTarget(row)) return undefined;
  return row;
}

/** Match by selector, then by name/id, including ineligible source-only rows. */
export function findCatalogRow(
  catalog: UdxCatalog,
  selector: string,
): UdxCatalogComponent | undefined {
  const needle = selector.trim().toLowerCase();
  if (!needle) return undefined;
  const bySelector = catalog.components.find((row) => {
    const sel = catalogRowSelector(row);
    return sel != null && sel.toLowerCase() === needle;
  });
  if (bySelector) return bySelector;
  return catalog.components.find((row) => {
    const names = [row.name, row.id, row.react, recString(row, "api")];
    return names.some((name) => name != null && name.toLowerCase() === needle);
  });
}

function recString(row: UdxCatalogComponent, key: string): string | undefined {
  const value = row[key];
  if (typeof value === "string" && value.trim()) return value;
  return undefined;
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
  const nameI = idx("name");
  const statusI = idx("status");
  const inputsI = idx("inputs");
  const variantsI = idx("variants");
  const tokensI = idx("tokens");
  if (selectorI < 0 && statusI < 0 && nameI < 0) {
    throw new Error("CSV catalog must have a selector, status, or name column");
  }
  const components: UdxCatalogComponent[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const selector = coerceSelector(
      selectorI >= 0 ? cols[selectorI] : undefined,
    );
    const status = coerceStatus(statusI >= 0 ? cols[statusI] : undefined);
    const name = (nameI >= 0 ? cols[nameI] ?? "" : "").trim() || undefined;
    const react = (reactI >= 0 ? cols[reactI] ?? "" : "").trim() || undefined;
    if (!selector && !status && !name && !react) continue;
    const inputNamesCol = (cols[inputsI] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const variants = parseVariantsCol(cols[variantsI] ?? "");
    const inputs: Record<string, Array<string | number | boolean>> = {};
    for (const inputName of inputNamesCol) {
      inputs[inputName] = variants[inputName] ?? [];
    }
    for (const [inputName, values] of Object.entries(variants)) {
      if (!inputs[inputName]) inputs[inputName] = values;
    }
    const tokens = (cols[tokensI] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    components.push({
      selector,
      status,
      name,
      react,
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
