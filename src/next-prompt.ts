import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import type { Finding, Inventory } from "./types.js";

const BANNED_PHRASES = [
  "match the design",
  "match the screenshot",
  "pixel-perfect",
  "pixel perfect",
  "looks like the mock",
];

export function buildNextPrompt(opts: {
  inventory: Inventory;
  findings: Finding[];
  attempt: number;
  retriesCap: number;
  gateAPassed: boolean;
  gateBPassed: boolean;
}): string {
  const lines: string[] = [
    `# DS loop checklist — ${opts.inventory.screenId}`,
    "",
    `Retry ${opts.attempt}/${opts.retriesCap}. Fix ONLY the failed checks below.`,
    "",
    "Use UDX components, variants, and tokens.",
    "Do not treat the reference PNG as a pixel target for the whole frame.",
    "",
  ];

  const a = opts.findings.filter((f) => f.code !== "gap-drift");
  const b = opts.findings.filter((f) => f.code === "gap-drift");

  if (!opts.gateAPassed && a.length > 0) {
    lines.push("## Gate A — structural");
    lines.push("");
    for (const finding of a) {
      lines.push(formatItem(finding));
    }
    lines.push("");
  }

  if (!opts.gateBPassed && b.length > 0) {
    lines.push("## Gate B — region drift");
    lines.push("");
    lines.push(
      "Harness grade is layoutChecks.maxDriftPx (default 8). Do not tighten this CI grade to 1px.",
    );
    lines.push("");
    for (const finding of b) {
      lines.push(formatItem(finding));
    }
    lines.push("");
  }

  if (opts.findings.length === 0) {
    lines.push("- [ ] (no checklist items; re-run ds-loop)");
    lines.push("");
  }

  lines.push("## Out of scope");
  lines.push("");
  lines.push("- Do not add screenshot-matching or whole-image visual diffs.");
  lines.push("- Do not call live Magic Patterns MCP; the drop package is frozen.");
  lines.push("");

  const body = lines.join("\n");
  for (const banned of BANNED_PHRASES) {
    if (body.toLowerCase().includes(banned)) {
      throw new Error(`next-prompt.md would contain banned phrase: ${banned}`);
    }
  }
  return body;
}

function formatItem(finding: Finding): string {
  const where = finding.componentId
    ? finding.componentId
    : finding.region
      ? `region ${finding.region}`
      : "screen";
  return `- [ ] \`${finding.code}\` (${where}): ${finding.detail}`;
}

export function writeNextPrompt(outDir: string, body: string): string {
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, "next-prompt.md");
  writeFileSync(file, body.endsWith("\n") ? body : `${body}\n`);
  return file;
}

export function clearNextPrompt(outDir: string): void {
  const file = path.join(outDir, "next-prompt.md");
  if (existsSync(file)) rmSync(file);
}

export { BANNED_PHRASES };
