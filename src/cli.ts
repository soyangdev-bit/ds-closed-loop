#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import { preflight } from "./preflight.js";
import { loadInventory, resolveReferencePng } from "./inventory.js";
import { runGateA } from "./gate-a.js";
import { runGateB } from "./gate-b.js";
import { runLoop } from "./loop.js";
import { capturePreview } from "./capture-preview.js";
import { DEFAULT_OUT_DIR, DEFAULT_RETRIES } from "./types.js";

const program = new Command();

program
  .name("ds-loop")
  .description(
    "Magic Patterns → Devin Angular fidelity harness (preflight, Gate A/B, fail-only retries)",
  )
  .showHelpAfterError();

program
  .command("preflight")
  .description("Validate inventory JSON (frozen schema) and reference PNG path/size")
  .requiredOption("-i, --inventory <path>", "inventory JSON path")
  .action((opts: { inventory: string }) => {
    const result = preflight(opts.inventory);
    printJson({
      passed: result.result.passed,
      referencePng: result.referencePng,
      findings: result.result.findings,
      screenId: result.loaded?.inventory.screenId,
    });
    process.exitCode = result.result.passed ? 0 : 1;
  });

program
  .command("gate-a")
  .description("Structural DS checks: selectors, variants, forbidden raw-button / inline-hex / inline-px-spacing")
  .requiredOption("-i, --inventory <path>", "inventory JSON path")
  .requiredOption("-s, --source <dir>", "Angular source directory")
  .action(async (opts: { inventory: string; source: string }) => {
    const loaded = loadInventory(opts.inventory);
    const result = await runGateA(loaded.inventory, opts.source);
    printJson({
      passed: result.passed,
      screenId: loaded.inventory.screenId,
      findings: result.findings,
    });
    process.exitCode = result.passed ? 0 : 1;
  });

program
  .command("gate-b")
  .description(
    "Visual region-drift vs layoutChecks.maxDriftPx (default 8). Not pixel-perfect whole-image.",
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
      screenId: loaded.inventory.screenId,
      findings: result.findings,
    });
    process.exitCode = result.passed ? 0 : 1;
  });

program
  .command("run")
  .description(
    "Preflight → Gate A → Gate B. Writes fail-only next-prompt.md. Optional --generate-cmd loop, retry cap 3.",
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
