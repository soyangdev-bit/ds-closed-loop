#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import { preflight } from "./preflight.js";
import { loadInventory, resolveReferencePng } from "./inventory.js";
import { runGateA, verifyAgainstCatalog } from "./gate-a.js";
import { runGateB } from "./gate-b.js";
import { runLoop } from "./loop.js";
import { capturePreview } from "./capture-preview.js";
import { writeMatrix } from "./matrix.js";
import { runEvidenceAudit } from "./evidence-audit.js";
import { loadCatalog, resolveCatalogPath } from "./catalog.js";
import {
  DEFAULT_OUT_DIR,
  DEFAULT_RETRIES,
  DEFAULT_MAX_DRIFT_PX,
} from "./types.js";

const program = new Command();

program
  .name("ds-loop")
  .description(
    "Magic Patterns → Devin Angular fidelity harness. Skills: conversion-preflight → conversion-inventory → udx-api-verify → angular-implementation → behavior-verification → screenshot-verification → conversion-evidence-audit. Gate B is region maxDriftPx (default 8), not Devin's ~1px internal screenshot loop.",
  )
  .showHelpAfterError();

program
  .command("preflight")
  .aliases(["conversion-preflight"])
  .description(
    "conversion-preflight: validate inventory JSON (v2 schema) and reference PNG path/size",
  )
  .requiredOption("-i, --inventory <path>", "inventory JSON path")
  .action((opts: { inventory: string }) => {
    const result = preflight(opts.inventory);
    printJson({
      passed: result.result.passed,
      skill: "conversion-preflight",
      referencePng: result.referencePng,
      findings: result.result.findings,
      screenId: result.loaded?.inventory.screenId,
    });
    process.exitCode = result.result.passed ? 0 : 1;
  });

program
  .command("inventory")
  .aliases(["conversion-inventory", "validate-inventory"])
  .description(
    "conversion-inventory: schema-validate inventory v2 (source/intent/angularTarget/mapping)",
  )
  .requiredOption("-i, --inventory <path>", "inventory JSON path")
  .action((opts: { inventory: string }) => {
    try {
      const loaded = loadInventory(opts.inventory);
      printJson({
        passed: true,
        skill: "conversion-inventory",
        screenId: loaded.inventory.screenId,
        designSystem: loaded.inventory.designSystem,
        catalogPath: loaded.inventory.catalog?.path,
        components: loaded.inventory.components.length,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      printJson({
        passed: false,
        skill: "conversion-inventory",
        findings: [{ code: "preflight", detail }],
      });
      process.exitCode = 1;
    }
  });

program
  .command("udx-api-verify")
  .description(
    "udx-api-verify: check angularTarget selector/inputs against catalog/udx/api-inventory.json (verified + non-null selector)",
  )
  .requiredOption("-i, --inventory <path>", "inventory JSON path")
  .option("--catalog <path>", "override catalog path")
  .action((opts: { inventory: string; catalog?: string }) => {
    const loaded = loadInventory(opts.inventory);
    const catalogPath =
      opts.catalog ??
      resolveCatalogPath(loaded.inventory, { inventoryDir: loaded.baseDir });
    const catalog = loadCatalog(catalogPath);
    const findings = verifyAgainstCatalog(loaded.inventory, catalog);
    const passed = findings.length === 0 && !catalog.parseError;
    printJson({
      passed,
      skill: "udx-api-verify",
      screenId: loaded.inventory.screenId,
      catalog: {
        path: catalog.path,
        exists: catalog.exists,
        populated: catalog.populated,
        parseError: catalog.parseError,
      },
      findings,
    });
    process.exitCode = passed ? 0 : 1;
  });

program
  .command("gate-a")
  .aliases(["behavior-verification"])
  .description(
    "behavior-verification / Gate A: selectors, variants, forbidden raw-button / inline-hex / inline-px-spacing; catalog + angularTarget.todo",
  )
  .requiredOption("-i, --inventory <path>", "inventory JSON path")
  .requiredOption("-s, --source <dir>", "Angular source directory")
  .option("--catalog <path>", "override catalog path")
  .action(async (opts: { inventory: string; source: string; catalog?: string }) => {
    const loaded = loadInventory(opts.inventory);
    const result = await runGateA(loaded.inventory, opts.source, {
      inventoryDir: loaded.baseDir,
      catalogPath: opts.catalog,
    });
    printJson({
      passed: result.passed,
      skill: "behavior-verification",
      screenId: loaded.inventory.screenId,
      findings: result.findings,
    });
    process.exitCode = result.passed ? 0 : 1;
  });

program
  .command("gate-b")
  .aliases(["screenshot-verification"])
  .description(
    `screenshot-verification / Gate B: region drift vs layoutChecks.maxDriftPx (default ${DEFAULT_MAX_DRIFT_PX}). Not pixel-exact. Devin screenshot skill may use ~1px internally; harness CI grade stays ≤${DEFAULT_MAX_DRIFT_PX}px to avoid antialias false-fails.`,
  )
  .requiredOption("-i, --inventory <path>", "inventory JSON path")
  .option("-p, --preview <path>", "local preview HTML file")
  .option("--preview-url <url>", "running preview URL")
  .option("--out-dir <dir>", "artifact directory", DEFAULT_OUT_DIR)
  .option("--storage-state <path>", "Playwright storageState JSON (cookies)")
  .action(async (opts: {
    inventory: string;
    preview?: string;
    previewUrl?: string;
    outDir: string;
    storageState?: string;
  }) => {
    const preview = opts.previewUrl ?? opts.preview;
    if (!preview) {
      console.error("gate-b requires --preview or --preview-url");
      process.exitCode = 2;
      return;
    }
    const loaded = loadInventory(opts.inventory);
    const result = await runGateB({
      inventory: loaded.inventory,
      referencePng: resolveReferencePng(loaded),
      preview,
      outDir: opts.outDir,
      storageState: opts.storageState,
    });
    printJson({
      passed: result.passed,
      skipped: result.skipped,
      skill: "screenshot-verification",
      screenId: loaded.inventory.screenId,
      findings: result.findings,
      grade: {
        type: "region-maxDriftPx",
        defaultMaxDriftPx: DEFAULT_MAX_DRIFT_PX,
        note: "Pixel-exact (~1px) is Devin’s region loop, not this CI screen grade.",
      },
    });
    process.exitCode = result.passed ? 0 : 1;
  });

program
  .command("run")
  .aliases(["angular-implementation"])
  .description(
    "angular-implementation: Preflight → Gate A → Gate B. Writes fail-only next-prompt.md. Optional --generate-cmd loop, retry cap 3.",
  )
  .requiredOption("-i, --inventory <path>", "inventory JSON path")
  .requiredOption("-s, --source <dir>", "Angular source directory")
  .option("-p, --preview <path>", "local preview HTML file")
  .option("--preview-url <url>", "running preview URL")
  .option("--generate-cmd <cmd>", "command to invoke Devin/agent with next-prompt.md")
  .option("--retries <n>", "retry cap after failures", String(DEFAULT_RETRIES))
  .option("--out-dir <dir>", "artifact directory", DEFAULT_OUT_DIR)
  .option("--storage-state <path>", "Playwright storageState JSON (cookies)")
  .action(async (opts: {
    inventory: string;
    source: string;
    preview?: string;
    previewUrl?: string;
    generateCmd?: string;
    retries: string;
    outDir: string;
    storageState?: string;
  }) => {
    const report = await runLoop({
      inventoryPath: opts.inventory,
      sourceDir: opts.source,
      preview: opts.previewUrl ?? opts.preview,
      generateCmd: opts.generateCmd,
      retries: Number(opts.retries),
      outDir: opts.outDir,
      storageState: opts.storageState,
    });
    printJson({
      passed: report.passed,
      skill: "angular-implementation",
      screenId: report.screenId,
      attempt: report.attempt,
      retriesCap: report.retriesCap,
      checklist: report.checklist,
      nextPromptPath: report.nextPromptPath,
      gateA: { passed: report.gateA.passed, findings: report.gateA.findings },
      gateB: {
        passed: report.gateB.passed,
        skipped: report.gateB.skipped,
        findings: report.gateB.findings,
      },
    });
    process.exitCode = report.passed ? 0 : 1;
  });

program
  .command("matrix")
  .description(
    "Write skill-matrix layers to .ds-loop/matrix/ (source, intent, angularTarget, mapping)",
  )
  .requiredOption("-i, --inventory <path>", "inventory JSON path")
  .option("--catalog <path>", "override catalog path")
  .option("--out-dir <dir>", "artifact directory", DEFAULT_OUT_DIR)
  .action((opts: { inventory: string; catalog?: string; outDir: string }) => {
    const loaded = loadInventory(opts.inventory);
    const written = writeMatrix({
      inventory: loaded.inventory,
      inventoryDir: loaded.baseDir,
      catalogPath: opts.catalog,
      outDir: opts.outDir,
    });
    printJson({
      passed: written.result.passed,
      skill: "conversion-inventory",
      screenId: loaded.inventory.screenId,
      matrixDir: written.matrixDir,
      matrixPath: written.matrixPath,
      findings: written.result.findings,
    });
    process.exitCode = written.result.passed ? 0 : 1;
  });

program
  .command("evidence-audit")
  .aliases(["conversion-evidence-audit"])
  .description(
    "conversion-evidence-audit: check .ds-loop artifacts and mapping/evidence layers",
  )
  .requiredOption("-i, --inventory <path>", "inventory JSON path")
  .option("--out-dir <dir>", "artifact directory", DEFAULT_OUT_DIR)
  .action((opts: { inventory: string; outDir: string }) => {
    const loaded = loadInventory(opts.inventory);
    const result = runEvidenceAudit({
      inventory: loaded.inventory,
      outDir: opts.outDir,
    });
    printJson({
      passed: result.passed,
      skill: "conversion-evidence-audit",
      screenId: loaded.inventory.screenId,
      findings: result.findings,
    });
    process.exitCode = result.passed ? 0 : 1;
  });

program
  .command("capture-preview")
  .description(
    "One-shot Playwright screenshot of a locked published Magic Patterns previewUrl → refs PNG",
  )
  .requiredOption("-u, --url <previewUrl>", "published Magic Patterns preview URL")
  .option("-o, --out <png>", "output PNG path")
  .option("-i, --inventory <path>", "inventory JSON (supplies frameSize + default --out)")
  .option("--frame-size <WxH>", "viewport, e.g. 1440x900")
  .option("--storage-state <path>", "Playwright storageState JSON for preview cookies")
  .action(async (opts: {
    url: string;
    out?: string;
    inventory?: string;
    frameSize?: string;
    storageState?: string;
  }) => {
    let width = 1440;
    let height = 900;
    let out = opts.out;
    if (opts.inventory) {
      const loaded = loadInventory(opts.inventory);
      width = loaded.inventory.frameSize.w;
      height = loaded.inventory.frameSize.h;
      out = out ?? resolveReferencePng(loaded);
    }
    if (opts.frameSize) {
      const parsed = parseFrameSize(opts.frameSize);
      width = parsed.w;
      height = parsed.h;
    }
    if (!out) {
      console.error("capture-preview requires --out or --inventory with referencePng");
      process.exitCode = 2;
      return;
    }
    const result = await capturePreview({
      url: opts.url,
      out,
      width,
      height,
      storageState: opts.storageState,
    });
    printJson(result);
  });

const invoked = path.basename(process.argv[1] ?? "");
const argv =
  invoked === "capture-preview" && process.argv[2] !== "capture-preview"
    ? ["capture-preview", ...process.argv.slice(2)]
    : process.argv.slice(2);

try {
  if (argv.length === 0) {
    program.outputHelp();
  } else {
    await program.parseAsync(argv, { from: "user" });
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exitCode = process.exitCode || 1;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseFrameSize(value: string): { w: number; h: number } {
  const match = /^(\d+)\s*x\s*(\d+)$/i.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid --frame-size ${value}; expected e.g. 1440x900`);
  }
  return { w: Number(match[1]), h: Number(match[2]) };
}
