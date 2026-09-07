import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

export const FIXTURE_FRAME = { w: 1440, h: 900 } as const;

export const FIXTURE_LAYOUT = {
  header: { x: 0, y: 0, width: 1440, height: 80 },
  headerAccent: { x: 0, y: 72, width: 1440, height: 8 },
  cta: { x: 0, y: 800, width: 1440, height: 100 },
  button: { x: 24, y: 820, width: 160, height: 48 },
} as const;

export const FIXTURE_COLORS = {
  bg: [246, 248, 250] as const,
  header: [255, 255, 255] as const,
  accent: [26, 115, 232] as const,
  cta: [255, 255, 255] as const,
  button: [26, 115, 232] as const,
};

export function drawGoodFrame(
  w = FIXTURE_FRAME.w,
  h = FIXTURE_FRAME.h,
): PNG {
  const png = new PNG({ width: w, height: h });
  fill(png, 0, 0, w, h, FIXTURE_COLORS.bg);
  fill(png, 0, 0, w, 80, FIXTURE_COLORS.header);
  fill(png, 0, 72, w, 8, FIXTURE_COLORS.accent);
  fill(png, 0, 800, w, 100, FIXTURE_COLORS.cta);
  fill(png, 24, 820, 160, 48, FIXTURE_COLORS.button);
  return png;
}

export function drawShiftedFrame(shiftY: number): PNG {
  const png = new PNG({ width: FIXTURE_FRAME.w, height: FIXTURE_FRAME.h });
  fill(png, 0, 0, FIXTURE_FRAME.w, FIXTURE_FRAME.h, FIXTURE_COLORS.bg);
  fill(png, 0, shiftY, FIXTURE_FRAME.w, 80, FIXTURE_COLORS.header);
  fill(png, 0, shiftY + 72, FIXTURE_FRAME.w, 8, FIXTURE_COLORS.accent);
  fill(png, 0, 800 + shiftY, FIXTURE_FRAME.w, 100, FIXTURE_COLORS.cta);
  fill(png, 24, 820 + shiftY, 160, 48, FIXTURE_COLORS.button);
  return png;
}

export function pngToBuffer(png: PNG): Buffer {
  return PNG.sync.write(png);
}

export function writeFixturePngs(repoRoot: string): string[] {
  const buf = pngToBuffer(drawGoodFrame());
  const targets = [
    "fixtures/good/refs/checkout-summary.png",
    "fixtures/bad/refs/checkout-summary.png",
    "fixtures/drift/refs/checkout-summary.png",
  ];
  const written: string[] = [];
  for (const rel of targets) {
    const abs = path.join(repoRoot, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, buf);
    written.push(abs);
  }
  return written;
}

function fill(
  png: PNG,
  x: number,
  y: number,
  w: number,
  h: number,
  rgb: readonly [number, number, number],
): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(png.width, x + w);
  const y1 = Math.min(png.height, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * png.width + xx) * 4;
      png.data[i] = rgb[0];
      png.data[i + 1] = rgb[1];
      png.data[i + 2] = rgb[2];
      png.data[i + 3] = 255;
    }
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  for (const file of writeFixturePngs(root)) {
    process.stdout.write(`wrote ${file}\n`);
  }
}
