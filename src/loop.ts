import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { preflight } from "./preflight.js";
import { runGateA } from "./gate-a.js";
import { runGateB } from "./gate-b.js";
import {
  buildNextPrompt,
  clearNextPrompt,
  writeNextPrompt,
} from "./next-prompt.js";
import {
  DEFAULT_OUT_DIR,
  DEFAULT_RETRIES,
  type Finding,
  type GateResult,
  type LoopReport,
} from "./types.js";

export interface LoopOptions {
  inventoryPath: string;
  sourceDir: string;
  preview?: string;
  generateCmd?: string;
  retries?: number;
  outDir?: string;
  storageState?: string;
}

export async function runLoop(opts: LoopOptions): Promise<LoopReport> {
  const retriesCap = opts.retries ?? DEFAULT_RETRIES;
  const outDir = path.resolve(opts.outDir ?? DEFAULT_OUT_DIR);
  mkdirSync(outDir, { recursive: true });

  const pf = preflight(opts.inventoryPath);
  if (!pf.result.passed || !pf.loaded) {
    const report = baseReport({
      screenId: pf.loaded?.inventory.screenId ?? path.basename(opts.inventoryPath),
      retriesCap,
      preflight: pf.result,
      gateA: skipped("A"),
      gateB: skipped("B"),
    });
    persistReport(outDir, report, pf.result.findings, false);
    return report;
  }

  const inventory = pf.loaded.inventory;
  let attempt = 0;

  while (true) {
    const gateA = await runGateA(inventory, opts.sourceDir);
    const gateB: GateResult =
      gateA.passed && opts.preview
        ? await runGateB({
            inventory,
            referencePng: pf.referencePng,
            preview: opts.preview,
            outDir,
            storageState: opts.storageState,
          })
        : gateA.passed && !opts.preview
          ? {
              name: "B",
              passed: false,
              skipped: true,
              findings: [
                {
                  code: "gap-drift",
                  detail: "Gate B skipped: pass --preview or --preview-url",
                },
              ],
            }
          : skipped("B");

    const checklist = [...gateA.findings, ...gateB.findings];
    const passed = gateA.passed && gateB.passed;
    const report: LoopReport = {
      screenId: inventory.screenId,
      passed,
      attempt,
      retriesCap,
      preflight: pf.result,
      gateA,
      gateB,
      checklist,
      candidatePng: path.join(outDir, "screenshots", "candidate.png"),
    };

    if (passed) {
      clearNextPrompt(outDir);
      persistReport(outDir, report, []);
      return report;
    }

    const body = buildNextPrompt({
      inventory,
      findings: checklist,
      attempt,
      retriesCap,
      gateAPassed: gateA.passed,
      gateBPassed: gateB.passed,
    });
    report.nextPromptPath = writeNextPrompt(outDir, body);
    persistReport(outDir, report, checklist);

    if (attempt >= retriesCap || !opts.generateCmd) {
      return report;
    }

    await runGenerateCmd(opts.generateCmd);
    attempt += 1;
  }
}

function skipped(name: "A" | "B"): GateResult {
  return { name, passed: false, skipped: true, findings: [] };
}

function baseReport(partial: {
  screenId: string;
  retriesCap: number;
  preflight: GateResult;
  gateA: GateResult;
  gateB: GateResult;
}): LoopReport {
  return {
    screenId: partial.screenId,
    passed: false,
    attempt: 0,
    retriesCap: partial.retriesCap,
    preflight: partial.preflight,
    gateA: partial.gateA,
    gateB: partial.gateB,
    checklist: [
      ...partial.preflight.findings,
      ...partial.gateA.findings,
      ...partial.gateB.findings,
    ],
  };
}

function persistReport(
  outDir: string,
  report: LoopReport,
  findings: Finding[],
  writePrompt = true,
): void {
  writeFileSync(
    path.join(outDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  if (!writePrompt) {
    const body = [
      `# DS loop checklist — ${report.screenId}`,
      "",
      "Preflight failed. Fix the inventory / reference PNG before Gate A/B.",
      "",
      ...findings.map((f) => `- [ ] ${f.detail}`),
      "",
    ].join("\n");
    writeNextPrompt(outDir, body);
  }
}

function runGenerateCmd(cmd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, {
      shell: true,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`generate-cmd exited ${code}: ${cmd}`));
    });
  });
}
