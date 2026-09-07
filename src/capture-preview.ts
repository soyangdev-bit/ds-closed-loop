import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { openSession, preparePreview, screenshotPreview } from "./playwright-session.js";

const WALL_COPY = [
  /sign\s*in to (view|continue|see)/i,
  /log\s*in to (view|continue|see)/i,
  /enter (your )?password to (view|continue|unlock)/i,
  /this preview is (private|locked|unpublished)/i,
  /unpublished prototype/i,
  /work\s*in\s*progress/i,
  /unlock this (prototype|preview)/i,
  /password protected preview/i,
  /sign in to magic patterns/i,
  /edit in magic patterns/i,
];

const LOGIN_URL = /\/(login|signin|sign-in|auth|wip)\b/i;

export interface CapturePreviewOptions {
  url: string;
  out: string;
  width: number;
  height: number;
  storageState?: string;
}

export interface CapturePreviewResult {
  out: string;
  width: number;
  height: number;
  finalUrl: string;
}

export async function capturePreview(
  opts: CapturePreviewOptions,
): Promise<CapturePreviewResult> {
  if (!/^https?:\/\//i.test(opts.url) && !opts.url.startsWith("file:")) {
    throw new Error(`capture-preview expected http(s) or file URL, got ${opts.url}`);
  }

  const session = await openSession({
    width: opts.width,
    height: opts.height,
    storageState: opts.storageState,
  });

  try {
    const response = await session.page.goto(opts.url, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    const status = response?.status() ?? 0;
    if (status === 401 || status === 403) {
      throw new Error(`Rejected login wall (HTTP ${status}) at ${opts.url}`);
    }

    await preparePreview(session.page);
    const verdict = await detectPreviewWallOnPage(session.page);
    if (verdict) {
      throw new Error(`Rejected ${verdict}`);
    }

    mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    const buf = await screenshotPreview(session.page, opts.out);
    const png = PNG.sync.read(buf);
    if (png.width !== opts.width || png.height !== opts.height) {
      throw new Error(
        `Captured ${png.width}x${png.height}, expected frameSize ${opts.width}x${opts.height}`,
      );
    }
    writeFileSync(
      `${opts.out}.meta.json`,
      `${JSON.stringify(
        {
          url: opts.url,
          finalUrl: session.page.url(),
          width: png.width,
          height: png.height,
          capturedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );
    return {
      out: path.resolve(opts.out),
      width: png.width,
      height: png.height,
      finalUrl: session.page.url(),
    };
  } finally {
    await session.close();
  }
}

export async function detectPreviewWallOnPage(page: {
  url(): string;
  title(): Promise<string>;
  locator(selector: string): { count(): Promise<number>; innerText(): Promise<string> };
}): Promise<string | null> {
  const title = await page.title();
  const text = await page.locator("body").innerText().catch(() => "");
  const hasPasswordInput = (await page.locator('input[type="password"]').count()) > 0;
  return detectPreviewWallFromHtml({
    url: page.url(),
    title,
    text: text.slice(0, 4000),
    hasPasswordInput,
  });
}

export function detectPreviewWallFromHtml(opts: {
  url: string;
  title: string;
  text: string;
  hasPasswordInput: boolean;
}): string | null {
  if (LOGIN_URL.test(opts.url)) return `login-wall: URL ${opts.url}`;
  const blob = `${opts.title}\n${opts.text}`;
  for (const re of WALL_COPY) {
    if (re.test(blob)) return `WIP/login wall: matched /${re.source}/`;
  }
  if (opts.hasPasswordInput && /magic patterns|prototype|preview/i.test(blob)) {
    return "login-wall: password field on Magic Patterns preview";
  }
  if (/\bWIP\b/.test(blob) && /magic patterns/i.test(blob)) {
    return "WIP wall: unpublished Magic Patterns preview";
  }
  return null;
}
