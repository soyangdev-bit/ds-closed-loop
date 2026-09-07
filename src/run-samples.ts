import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFixturePngs } from "./fixture-png.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

interface Case {
  name: string;
  args: string[];
  expectPass: boolean;
  expectCodes?: string[];
  expectGateAPass?: boolean;
}

const cases: Case[] = [
  {
    name: "sample:gate-a-fail (bad fixture)",
    args: [
      "gate-a",
      "--inventory",
      "fixtures/bad/inventory.json",
      "--source",
      "fixtures/bad/src",
    ],
    expectPass: false,
    expectCodes: ["wrong-component", "missing-variant", "token-drift"],
  },
  {
    name: "sample:good (passes A+B)",
    args: [
      "run",
      "--inventory",
      "fixtures/good/inventory.json",
      "--source",
      "fixtures/good/src",
      "--preview",
      "fixtures/good/preview.html",
      "--retries",
      "0",
    ],
    expectPass: true,
  },
  {
    name: "sample:drift (fails Gate B)",
    args: [
      "run",
      "--inventory",
      "fixtures/drift/inventory.json",
      "--source",
      "fixtures/drift/src",
      "--preview",
      "fixtures/drift/preview.html",
      "--retries",
      "0",
    ],
    expectPass: false,
    expectGateAPass: true,
    expectCodes: ["gap-drift"],
  },
];

async function main(): Promise<void> {
  writeFixturePngs(root);
  const cli = path.join(root, "src", "cli.ts");
  let failed = 0;

  for (const testCase of cases) {
    const result = await runCli(cli, testCase.args);
    const errors: string[] = [];
    if (testCase.expectPass && result.exitCode !== 0) {
      errors.push(`expected pass (exit 0), got ${result.exitCode}`);
    }
    if (!testCase.expectPass && result.exitCode === 0) {
      errors.push("expected fail (non-zero), got 0");
    }
    let parsed: { passed?: boolean; findings?: { code: string }[]; gateA?: { passed: boolean }; checklist?: { code: string }[] } = {};
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      errors.push(`stdout was not JSON: ${result.stdout.slice(0, 400)}`);
    }
    const codes = [
      ...(parsed.findings ?? []),
      ...(parsed.checklist ?? []),
    ].map((f) => f.code);
    for (const code of testCase.expectCodes ?? []) {
      if (!codes.includes(code)) {
        errors.push(`missing checklist code ${code} (got ${codes.join(", ") || "none"})`);
      }
    }
    if (testCase.expectGateAPass && parsed.gateA && parsed.gateA.passed !== true) {
      errors.push("expected Gate A to pass");
    }
    if (errors.length > 0) {
      failed += 1;
      console.error(`FAIL ${testCase.name}`);
      for (const err of errors) console.error(`  ${err}`);
      if (result.stderr) console.error(result.stderr);
    } else {
      console.log(`PASS ${testCase.name}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed}/${cases.length} sample cases failed`);
    process.exit(1);
  }
  console.log(`\n${cases.length}/${cases.length} sample cases passed`);
}

function runCli(
  cli: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", cli, ...args], {
      cwd: root,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

await main();
