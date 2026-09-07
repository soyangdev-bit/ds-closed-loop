import assert from "node:assert/strict";
import test from "node:test";
import { detectPreviewWallFromHtml } from "../src/capture-preview.js";

test("rejects Magic Patterns login walls", () => {
  const hit = detectPreviewWallFromHtml({
    url: "https://www.magicpatterns.com/login?next=/p/abc",
    title: "Sign in",
    text: "Sign in to Magic Patterns",
    hasPasswordInput: true,
  });
  assert.ok(hit);
  assert.match(hit ?? "", /login-wall/i);
});

test("rejects unpublished WIP previews", () => {
  const hit = detectPreviewWallFromHtml({
    url: "https://www.magicpatterns.com/c/abc",
    title: "Prototype",
    text: "This preview is unpublished. Work in progress.",
    hasPasswordInput: false,
  });
  assert.ok(hit);
  assert.match(hit ?? "", /WIP|unpublished|wall/i);
});

test("allows a published preview URL", () => {
  const hit = detectPreviewWallFromHtml({
    url: "https://www.magicpatterns.com/c/locked-preview",
    title: "Checkout summary",
    text: "Pay now  Total $42.00",
    hasPasswordInput: false,
  });
  assert.equal(hit, null);
});
