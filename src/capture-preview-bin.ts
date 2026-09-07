#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const cli = fileURLToPath(new URL("./cli.js", import.meta.url));
const child = spawn(process.execPath, [cli, "capture-preview", ...process.argv.slice(2)], {
  stdio: "inherit",
});
child.on("exit", (code) => {
  process.exit(code ?? 1);
});
