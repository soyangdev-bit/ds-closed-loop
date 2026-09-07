import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { MASK_SELECTORS } from "./types.js";

const DISABLE_ANIMATION_CSS = `
*, *::before, *::after {
  animation: none !important;
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  transition: none !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}
`;

export interface SessionOptions {
  width: number;
  height: number;
  storageState?: string;
}

export interface PlaywrightSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

export async function openSession(
  opts: SessionOptions,
): Promise<PlaywrightSession> {
  const browser = await chromium.launch({
    args: ["--disable-font-subpixel-positioning"],
  });
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    storageState: opts.storageState,
  });
  const page = await context.newPage();
  return {
    browser,
    context,
    page,
    async close() {
      await context.close();
      await browser.close();
    },
  };
}

export async function preparePreview(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.addStyleTag({ content: DISABLE_ANIMATION_CSS });
  await page.emulateMedia({ reducedMotion: "reduce" });
}

export function maskLocators(page: Page) {
  return MASK_SELECTORS.map((sel) => page.locator(sel));
}

export async function screenshotPreview(
  page: Page,
  outPath?: string,
): Promise<Buffer> {
  return page.screenshot({
    path: outPath,
    animations: "disabled",
    caret: "hide",
    mask: maskLocators(page),
    maskColor: "#FF00FF",
    scale: "css",
  });
}
