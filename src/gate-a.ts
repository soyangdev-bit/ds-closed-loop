import {
  collectSourceFiles,
  extractTags,
  findHexHits,
  findPxSpacingHits,
  hasInput,
  hasNativeButton,
  hasSelector,
  joinedSource,
  tokenReferenced,
} from "./source-scan.js";
import {
  componentAngular,
  forbiddenIncludes,
  requiredTargetTodo,
  rubricIncludes,
} from "./inventory.js";
import {
  allowedInputValues,
  catalogHasInputName,
  findCatalogRow,
  isEligibleAngularTarget,
  isSourceOnlyCatalogRow,
  loadCatalog,
  resolveCatalogPath,
  type LoadedCatalog,
} from "./catalog.js";
import type { Finding, GateResult, Inventory, InventoryComponent } from "./types.js";

export interface GateAOptions {
  catalogPath?: string;
  catalog?: LoadedCatalog | null;
  cwd?: string;
  inventoryDir?: string;
}

export async function runGateA(
  inventory: Inventory,
  sourceDir: string,
  opts?: GateAOptions,
): Promise<GateResult> {
  const files = await collectSourceFiles(sourceDir);
  if (files.length === 0) {
    return {
      name: "A",
      passed: false,
      findings: [
        {
          code: "wrong-component",
          detail: `No Angular source files found under ${sourceDir}`,
        },
      ],
    };
  }
  const source = joinedSource(files);
  const findings: Finding[] = [];

  const catalog = resolveGateACatalog(inventory, opts);
  if (catalog.parseError) {
    findings.push({
      code: "wrong-component",
      detail: catalog.parseError,
    });
  }

  for (const component of inventory.components) {
    if (!component.required) continue;
    pushTargetAndCatalogFindings(inventory, component, catalog, findings);
  }

  for (const component of inventory.components) {
    if (!component.required) continue;
    const { selector, inputs } = componentAngular(component);
    const tags = extractTags(source, selector);
    const present = selector.length > 0 && tags.length > 0;

    if (!present) {
      if (rubricIncludes(inventory, "wrong-component")) {
        const raw =
          forbiddenIncludes(inventory, "raw-button") && hasNativeButton(source);
        findings.push({
          code: "wrong-component",
          componentId: component.id,
          forbidden: raw ? "raw-button" : undefined,
          detail: raw
            ? `${component.id}: expected <${selector || "udx-*"}>, found native <button> (raw-button)`
            : `${component.id}: required selector <${selector || "(missing)"}> is missing`,
        });
      }
      if (rubricIncludes(inventory, "missing-variant")) {
        const listed = Object.entries(inputs ?? {});
        if (listed.length > 0) {
          const desc = listed
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(", ");
          findings.push({
            code: "missing-variant",
            componentId: component.id,
            detail: `${component.id}: <${selector || "(missing)"}> missing; cannot apply required input(s) ${desc}`,
          });
        }
      }
    } else if (rubricIncludes(inventory, "missing-variant")) {
      const missing = Object.entries(inputs ?? {}).filter(([name, value]) => {
        return !tags.some((attrs) => hasInput(attrs, name, String(value)));
      });
      if (missing.length > 0) {
        const desc = missing
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(", ");
        findings.push({
          code: "missing-variant",
          componentId: component.id,
          detail: `${component.id}: <${selector}> missing required input(s) ${desc}`,
        });
      }
    }
  }

  if (
    forbiddenIncludes(inventory, "raw-button") &&
    hasNativeButton(source) &&
    rubricIncludes(inventory, "wrong-component")
  ) {
    const already = findings.some(
      (f) => f.code === "wrong-component" && f.forbidden === "raw-button",
    );
    if (!already) {
      const coveredByRequired = inventory.components.some((c) => {
        const { selector } = componentAngular(c);
        return c.required && selector && hasSelector(source, selector);
      });
      if (!coveredByRequired) {
        findings.push({
          code: "wrong-component",
          forbidden: "raw-button",
          detail: "native <button> is forbidden (raw-button); use the DS selector",
        });
      } else if (
        inventory.components.some(
          (c) =>
            c.required &&
            !hasSelector(source, componentAngular(c).selector) &&
            !findings.some(
              (f) => f.componentId === c.id && f.code === "wrong-component",
            ),
        )
      ) {
        // already reported per-component
      } else if (
        inventory.components.every((c) => {
          const { selector } = componentAngular(c);
          return !c.required || (selector && hasSelector(source, selector));
        })
      ) {
        findings.push({
          code: "wrong-component",
          forbidden: "raw-button",
          detail: "native <button> is forbidden (raw-button) even when DS selectors are present",
        });
      }
    }
  }

  if (rubricIncludes(inventory, "token-drift")) {
    const hexHits = forbiddenIncludes(inventory, "inline-hex")
      ? findHexHits(source)
      : [];
    const pxHits = forbiddenIncludes(inventory, "inline-px-spacing")
      ? findPxSpacingHits(source)
      : [];

    if (hexHits.length > 0) {
      findings.push({
        code: "token-drift",
        forbidden: "inline-hex",
        detail: `inline hex color(s) forbidden: ${hexHits.slice(0, 8).join(", ")}`,
      });
    }
    if (pxHits.length > 0) {
      findings.push({
        code: "token-drift",
        forbidden: "inline-px-spacing",
        detail: `inline px spacing forbidden: ${pxHits.slice(0, 8).join(", ")}`,
      });
    }

    for (const component of inventory.components) {
      const tokens = component.tokens ?? [];
      if (!component.required || tokens.length === 0) continue;
      const missingTokens = tokens.filter(
        (token) => !tokenReferenced(source, token),
      );
      if (missingTokens.length > 0 && (hexHits.length > 0 || pxHits.length > 0)) {
        findings.push({
          code: "token-drift",
          componentId: component.id,
          detail: `${component.id}: tokens not referenced (${missingTokens.join(", ")}); replace raw values with DS tokens`,
        });
      }
    }
  }

  return {
    name: "A",
    passed: findings.length === 0,
    findings,
  };
}

export function verifyAgainstCatalog(
  inventory: Inventory,
  catalog: LoadedCatalog,
): Finding[] {
  const findings: Finding[] = [];
  if (catalog.parseError) {
    findings.push({
      code: "wrong-component",
      detail: catalog.parseError,
    });
    return findings;
  }
  for (const component of inventory.components) {
    if (!component.required) continue;
    pushTargetAndCatalogFindings(inventory, component, catalog, findings);
  }
  return findings;
}

function resolveGateACatalog(
  inventory: Inventory,
  opts?: GateAOptions,
): LoadedCatalog {
  if (opts?.catalog !== undefined) {
    return (
      opts.catalog ?? {
        catalog: null,
        path: "",
        exists: false,
        populated: false,
      }
    );
  }
  const catalogPath =
    opts?.catalogPath ??
    resolveCatalogPath(inventory, {
      cwd: opts?.cwd,
      inventoryDir: opts?.inventoryDir,
    });
  return loadCatalog(catalogPath);
}

function pushTargetAndCatalogFindings(
  inventory: Inventory,
  component: InventoryComponent,
  catalog: LoadedCatalog,
  findings: Finding[],
): void {
  const { selector, inputs } = componentAngular(component);
  const selectorMissing = !selector.trim();

  if (requiredTargetTodo(component)) {
    if (rubricIncludes(inventory, "wrong-component")) {
      findings.push({
        code: "wrong-component",
        componentId: component.id,
        detail: selectorMissing
          ? `${component.id}: angularTarget.selector is missing (required row)`
          : `${component.id}: angularTarget.todo is true; verify selector/inputs against the UDX catalog before Gate A`,
      });
    }
  }

  // Empty stub (exists but no rows) does not enable membership checks.
  // Once catalog/udx/api-inventory.json is populated from @udx/lib@0.0.82,
  // required selector/inputs MUST be verified + non-null in that dump.
  if (!catalog.populated || !catalog.catalog) return;

  if (selectorMissing) {
    if (
      rubricIncludes(inventory, "wrong-component") &&
      !findings.some(
        (f) => f.componentId === component.id && f.code === "wrong-component",
      )
    ) {
      findings.push({
        code: "wrong-component",
        componentId: component.id,
        detail: `${component.id}: angularTarget.selector is missing; cannot verify against ${catalog.path}`,
      });
    }
    return;
  }

  const row = findCatalogRow(catalog.catalog, selector);
  if (!row || !isEligibleAngularTarget(row)) {
    if (rubricIncludes(inventory, "wrong-component")) {
      const sourceOnly = row && isSourceOnlyCatalogRow(row);
      findings.push({
        code: "wrong-component",
        componentId: component.id,
        detail: sourceOnly
          ? `${component.id}: <${selector}> is source-only / selector:null in ${catalog.path} and cannot be used as angularTarget`
          : `${component.id}: selector <${selector}> is not a verified + non-null catalog row in ${catalog.path}`,
      });
    }
    return;
  }

  if (!rubricIncludes(inventory, "missing-variant")) return;
  const missing: string[] = [];
  for (const [name, value] of Object.entries(inputs ?? {})) {
    if (!catalogHasInputName(row, name)) {
      missing.push(`${name} (not in catalog)`);
      continue;
    }
    const allowed = allowedInputValues(row, name);
    if (
      allowed &&
      allowed.length > 0 &&
      !allowed.some((candidate) => String(candidate) === String(value))
    ) {
      missing.push(`${name}=${String(value)}`);
    }
  }
  if (missing.length > 0) {
    findings.push({
      code: "missing-variant",
      componentId: component.id,
      detail: `${component.id}: input(s) not present in catalog for <${selector}>: ${missing.join(", ")}`,
    });
  }
}
