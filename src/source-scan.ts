import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_EXT = new Set([
  ".html",
  ".htm",
  ".ts",
  ".tsx",
  ".css",
  ".scss",
  ".less",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".ds-loop",
  "coverage",
]);

export interface SourceFile {
  path: string;
  content: string;
}

export async function collectSourceFiles(root: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Cannot read source directory ${dir}: ${reason}`);
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full);
      } else if (
        SOURCE_EXT.has(path.extname(entry.name)) &&
        !entry.name.endsWith(".d.ts")
      ) {
        files.push({ path: full, content: await readFile(full, "utf8") });
      }
    }
  }

  await walk(path.resolve(root));
  return files;
}

export function joinedSource(files: SourceFile[]): string {
  return files.map((f) => f.content).join("\n");
}

export function extractTags(source: string, selector: string): string[] {
  const re = new RegExp(`<${escapeRegExp(selector)}\\b([^>]*?)(\\/?>)`, "gi");
  const attrs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    attrs.push(match[1] ?? "");
  }
  return attrs;
}

export function hasNativeButton(source: string): boolean {
  return /<button\b/i.test(source);
}

export function hasSelector(source: string, selector: string): boolean {
  return extractTags(source, selector).length > 0;
}

export function hasInput(
  attrBlob: string,
  name: string,
  value: string,
): boolean {
  const v = escapeRegExp(value);
  const n = escapeRegExp(name);
  const patterns = [
    new RegExp(`\\b${n}\\s*=\\s*(["'])${v}\\1`, "i"),
    new RegExp(`\\[${n}\\]\\s*=\\s*(["'])'${v}'\\1`, "i"),
    new RegExp(`\\[${n}\\]\\s*=\\s*(["'])${v}\\1`, "i"),
  ];
  return patterns.some((p) => p.test(attrBlob));
}

export const HEX_RE =
  /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;

export const PX_SPACING_RE =
  /\b(?:margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left)(?:-(?:top|right|bottom|left|inline|block|start|end|x|y))?\s*:\s*-?\d+(?:\.\d+)?px\b/i;

export function findHexHits(source: string): string[] {
  return uniqueMatches(source, HEX_RE);
}

export function findPxSpacingHits(source: string): string[] {
  return uniqueMatches(source, PX_SPACING_RE);
}

export function tokenReferenced(source: string, token: string): boolean {
  const dotted = token;
  const dashed = token.replace(/\./g, "-");
  const cssVar = `--${dashed}`;
  return (
    source.includes(dotted) ||
    source.includes(cssVar) ||
    source.includes(`var(${cssVar})`)
  );
}

function uniqueMatches(source: string, re: RegExp): string[] {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  const hits = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = global.exec(source))) {
    hits.add(match[0]);
  }
  return [...hits];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
