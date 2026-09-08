import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  componentAngular,
  componentAngularTarget,
  componentIntent,
  componentMapping,
  componentSource,
} from "./inventory.js";
import {
  catalogHasInputName,
  findCatalogRow,
  isEligibleAngularTarget,
  isSourceOnlyCatalogRow,
  loadCatalog,
  resolveCatalogPath,
  type LoadedCatalog,
} from "./catalog.js";
import { verifyAgainstCatalog } from "./gate-a.js";
import {
  DEFAULT_OUT_DIR,
  SKILL_ORCHESTRATION,
  type Finding,
  type GateResult,
  type Inventory,
} from "./types.js";

export interface MatrixComponent {
  id: string;
  required: boolean;
  tokens: string[];
  source: ReturnType<typeof componentSource>;
  intent: ReturnType<typeof componentIntent>;
  angularTarget: ReturnType<typeof componentAngularTarget>;
  mapping: ReturnType<typeof componentMapping>;
  catalog: {
    selectorKnown: boolean;
    inputsKnown: boolean;
    verified: boolean;
    todo: boolean;
    detail?: string;
  };
}

export interface InventoryMatrix {
  screenId: string;
  designSystem: "udx";
  catalog: {
    path: string;
    exists: boolean;
    populated: boolean;
    componentCount: number;
  };
  orchestration: typeof SKILL_ORCHESTRATION;
  gateB: {
    grade: "region-maxDriftPx";
    defaultMaxDriftPx: 8;
    note: string;
  };
  missingDataUdxWriter:
    "Magic Patterns skill that WRITES data-udx is not in this pack; Devin only consumes intent.";
  components: MatrixComponent[];
  states: Inventory["states"];
  viewports: Inventory["viewports"];
  layoutChecks: Inventory["layoutChecks"];
  evidence: Inventory["evidence"];
}

export interface MatrixResult {
  result: GateResult;
  matrix: InventoryMatrix;
  matrixDir: string;
  matrixPath: string;
}

export function buildMatrix(
  inventory: Inventory,
  catalog: LoadedCatalog,
): InventoryMatrix {
  const dump = catalog.catalog;
  const components: MatrixComponent[] = inventory.components.map((row) => {
    const source = componentSource(row);
    const intent = componentIntent(row, source);
    const angularTarget = componentAngularTarget(row);
    const mapping = componentMapping(row, source, angularTarget);
    const { selector, inputs } = componentAngular(row);
    const catalogRow =
      dump && selector ? findCatalogRow(dump, selector) : undefined;
    const eligible = Boolean(
      catalogRow && isEligibleAngularTarget(catalogRow),
    );
    const selectorKnown = eligible;
    let inputsKnown = selectorKnown;
    if (catalogRow && eligible) {
      for (const name of Object.keys(inputs ?? {})) {
        if (!catalogHasInputName(catalogRow, name)) {
          inputsKnown = false;
          break;
        }
      }
    }
    const todo = angularTarget.todo === true || !selector;
    const verified =
      catalog.populated && selectorKnown && inputsKnown && !todo;
    const sourceOnly = Boolean(
      catalogRow && isSourceOnlyCatalogRow(catalogRow),
    );
    return {
      id: row.id,
      required: row.required,
      tokens: row.tokens ?? [],
      source,
      intent,
      angularTarget,
      mapping,
      catalog: {
        selectorKnown,
        inputsKnown,
        verified,
        todo,
        detail: !catalog.populated
          ? "Catalog stub is empty; paste @udx/lib@0.0.82 api-inventory.json — never invent rows. Dropping the catalog is not a close; you still need refs/<screen>/."
          : !selector
            ? "angularTarget.selector is missing"
            : sourceOnly
              ? `selector <${selector}> is source-only / selector:null and cannot be angularTarget`
              : !selectorKnown
                ? `selector <${selector}> is not a verified + non-null catalog row`
                : !inputsKnown
                  ? "one or more inputs are not in the catalog"
                  : todo
                    ? "angularTarget.todo is still true"
                    : undefined,
      },
    };
  });

  return {
    screenId: inventory.screenId,
    designSystem: "udx",
    catalog: {
      path: catalog.path,
      exists: catalog.exists,
      populated: catalog.populated,
      componentCount: dump?.components.length ?? 0,
    },
    orchestration: SKILL_ORCHESTRATION,
    gateB: {
      grade: "region-maxDriftPx",
      defaultMaxDriftPx: 8,
      note: "Devin screenshot-verification may use ~1px internally. Harness Gate B stays ≤8px (layoutChecks.maxDriftPx) to avoid antialias false-fails. Pixel-exact is Devin’s region loop, not the CI screen grade.",
    },
    missingDataUdxWriter:
      "Magic Patterns skill that WRITES data-udx is not in this pack; Devin only consumes intent.",
    components,
    states: inventory.states,
    viewports: inventory.viewports,
    layoutChecks: inventory.layoutChecks,
    evidence: inventory.evidence,
  };
}

export function writeMatrix(opts: {
  inventory: Inventory;
  inventoryDir?: string;
  cwd?: string;
  catalogPath?: string;
  outDir?: string;
}): MatrixResult {
  const catalogPath =
    opts.catalogPath ??
    resolveCatalogPath(opts.inventory, {
      cwd: opts.cwd,
      inventoryDir: opts.inventoryDir,
    });
  const catalog = loadCatalog(catalogPath);
  const matrix = buildMatrix(opts.inventory, catalog);
  const outDir = path.resolve(opts.outDir ?? DEFAULT_OUT_DIR);
  const matrixDir = path.join(outDir, "matrix");
  mkdirSync(matrixDir, { recursive: true });
  const matrixPath = path.join(matrixDir, "inventory-matrix.json");
  writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`);
  writeFileSync(
    path.join(matrixDir, "catalog-verify.json"),
    `${JSON.stringify(
      {
        path: catalog.path,
        exists: catalog.exists,
        populated: catalog.populated,
        parseError: catalog.parseError,
        findings: verifyAgainstCatalog(opts.inventory, catalog),
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(matrixDir, "summary.md"),
    renderMatrixSummary(matrix),
  );

  const findings: Finding[] = [];
  if (catalog.parseError) {
    findings.push({ code: "wrong-component", detail: catalog.parseError });
  }
  findings.push(...verifyAgainstCatalog(opts.inventory, catalog));

  return {
    result: {
      name: "matrix",
      passed: findings.length === 0,
      findings,
    },
    matrix,
    matrixDir,
    matrixPath,
  };
}

function renderMatrixSummary(matrix: InventoryMatrix): string {
  const lines = [
    `# Inventory matrix — ${matrix.screenId}`,
    "",
    `Catalog: \`${matrix.catalog.path}\` (exists=${matrix.catalog.exists}, populated=${matrix.catalog.populated}, rows=${matrix.catalog.componentCount})`,
    "",
    matrix.gateB.note,
    "",
    `Missing piece: ${matrix.missingDataUdxWriter}`,
    "",
    "## Orchestration",
    "",
    ...matrix.orchestration.map((step, i) => `${i + 1}. ${step}`),
    "",
    "## Components",
    "",
  ];
  for (const row of matrix.components) {
    lines.push(
      `- **${row.id}** source=\`${row.source.name}\` intent=${row.intent.intentConfidence} target=\`${row.angularTarget.selector ?? ""}\` todo=${row.angularTarget.todo === true} verified=${row.catalog.verified}`,
    );
    if (row.catalog.detail) {
      lines.push(`  - ${row.catalog.detail}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
