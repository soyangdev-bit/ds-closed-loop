import assert from "node:assert/strict";
import test from "node:test";
import { BANNED_PHRASES, buildNextPrompt } from "../src/next-prompt.js";
import type { Inventory } from "../src/types.js";

const inventory: Inventory = {
  designSystem: "udx",
  screenId: "checkout-summary",
  referencePng: "refs/checkout-summary.png",
  frameSize: { w: 1440, h: 900 },
  components: [
    {
      id: "btn-pay",
      react: { name: "Button", variant: "primary", size: "md" },
      angular: { selector: "udx-button", inputs: { variant: "primary", size: "md" } },
      required: true,
      todo: true,
      tokens: ["color.action.primary"],
    },
  ],
  forbidden: ["raw-button", "inline-hex", "inline-px-spacing"],
  layoutChecks: [{ region: "header", maxDriftPx: 8 }],
  rubric: ["wrong-component", "missing-variant", "token-drift", "gap-drift"],
};

test("next-prompt.md is fail-only checklist and never says match the design", () => {
  const body = buildNextPrompt({
    inventory,
    findings: [
      {
        code: "wrong-component",
        componentId: "btn-pay",
        detail: "btn-pay: expected <udx-button>, found native <button> (raw-button)",
      },
      {
        code: "gap-drift",
        region: "header",
        detail: 'region "header" drifted 24px (max 8px)',
      },
    ],
    attempt: 1,
    retriesCap: 3,
    gateAPassed: false,
    gateBPassed: false,
  });
  assert.match(body, /`wrong-component`/);
  assert.match(body, /`gap-drift`/);
  assert.doesNotMatch(body, /match the design/i);
  for (const phrase of BANNED_PHRASES) {
    assert.equal(body.toLowerCase().includes(phrase), false, phrase);
  }
});
