---
name: ds-closed-loop-setup
description: >
  Clone and wire the Magic Patterns → Devin Angular/UDX fidelity harness (ds-loop).
  Use when starting a UDX conversion, installing Gate A/B, dropping refs/, or
  connecting --generate-cmd to Devin. Orchestration: conversion-preflight →
  conversion-inventory → udx-api-verify → angular-implementation →
  behavior-verification → screenshot-verification → conversion-evidence-audit.
  Magic Patterns never fills Angular selectors. Never call live Magic Patterns
  MCP once the loop is running.
---

# DS closed-loop setup

Set up this repo so Devin (or another agent) can convert a frozen Magic Patterns drop into **UDX** Angular code and iterate **only** on Gate A/B checklist failures.

Skill pack mapping: [`../README.md`](../README.md).

## Orchestration order

```
conversion-preflight → conversion-inventory → udx-api-verify
  → angular-implementation → behavior-verification
  → screenshot-verification → conversion-evidence-audit
```

```bash
npm run ds-loop:preflight -- --inventory refs/<screen-id>/inventory.json
npm run inventory:validate -- --inventory refs/<screen-id>/inventory.json
npm run ds-loop:matrix -- --inventory refs/<screen-id>/inventory.json
npx ds-loop udx-api-verify -i refs/<screen-id>/inventory.json
npm run ds-loop:run -- --inventory refs/<screen-id>/inventory.json --source <angular-src> --preview-url <url>
npx ds-loop evidence-audit -i refs/<screen-id>/inventory.json
```

**Missing piece:** a Magic Patterns skill that **writes** `data-udx`. This pack only consumes `intent` (`explicit` | `inferred` | `none`).

## Install

```bash
git clone https://github.com/soyangdev-bit/ds-closed-loop.git
cd ds-closed-loop
npm install
npx playwright install chromium
```

Gate B screenshots must use the same Playwright/Chromium as the lockfile. In CI or when local browsers drift, run inside the official image (tag must match `playwright` in `package.json`):

```bash
docker run --rm -it -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -lc 'npm ci && npx playwright install chromium && npm run samples'
```

## Drop package

Place the three-part export from `skills/ds-refs-export` on disk (do not fetch it live):

```
refs/<screenId>/
  <screenId>.png          # locked frame at inventory.frameSize
  inventory.json          # v2 schema; designSystem is always "udx"
  <Screen>.tsx            # Magic Patterns React export
```

Inventory `designSystem` is `"udx"`. Each `components[]` row has skill-matrix layers: **source** (React), **intent** (`data-udx` / inferred), **angularTarget** (catalog selector/inputs, `todo` until verified), **mapping** (transforms/evidence). Magic Patterns never fills `angularTarget`.

Optional top-level: `states`, `viewports`, `layoutChecks`, `evidence`, `catalog.path` (default `catalog/udx/components.json`).

Point `--inventory` at that JSON and `--source` at the Angular tree Devin will edit. Serve the Angular preview (`ng serve` or a static `preview.html`) and pass `--preview-url` or `--preview`.

Mark layout regions in the preview DOM:

```html
<header data-region="header">...</header>
<div data-region="cta-row"><udx-button variant="primary" size="md">Pay</udx-button></div>
```

Mask volatile pixels with `data-dynamic`, `data-ds-mask`, or `data-mask` (Gate B and `capture-preview` paint these out).

## UDX dump → Gate A (`udx-api-verify`)

Gate A scores **required** inventory selectors. Those selectors come from a UDX catalog dump, not from Magic Patterns. **Never invent** rows.

1. Populate `catalog/udx/components.json` from `@udx/lib` or https://udx.dev.bny.net/llms.txt. The committed file is an **empty stub**. Schema: `schemas/udx-catalog.schema.json`.
2. A **partial** dump is enough: map every React row that has a dump match into `angularTarget` and set `todo: false`. Those rows enable Gate A catalog membership.
3. Rows with no dump match stay `"angularTarget": { "todo": true }` with a guessed `udx-*` placeholder. **Gate A fails required v2 rows that are still `todo` or missing `selector`.**
4. When the catalog file exists **and has rows**, required `selector` / `inputs` must appear in it (`wrong-component` / `missing-variant`). An empty stub does not enable membership (so v1 sample fixtures still pass).
5. Forbidden remains `raw-button`, `inline-hex`, `inline-px-spacing`. Checklist codes remain `wrong-component`, `missing-variant`, `token-drift`.

## Screenshot grade (Gate B)

Harness Gate B is **region `maxDriftPx` (default 8)**. Do **not** switch this CI grade to pixel-exact.

Devin `screenshot-verification` may use **~1px** internally. That is Devin’s region loop, not the harness screen grade. Keep ≤8px here to avoid antialias false-fails.

## Wire Devin (`--generate-cmd`)

Devin must consume **fail-only** `.ds-loop/next-prompt.md`. That file is a checklist (`wrong-component`, `missing-variant`, `token-drift`, `gap-drift`). It never says "match the design".

```bash
npm run ds-loop:run -- \
  --inventory refs/checkout-summary/inventory.json \
  --source apps/checkout/src \
  --preview-url http://localhost:4200/checkout-summary \
  --generate-cmd 'devin run --file .ds-loop/next-prompt.md' \
  --retries 3
```

Without `--generate-cmd`, `ds-loop run` executes one pass, writes `.ds-loop/next-prompt.md` on failure, and exits `1`. That is the usual Devin step: implement → `ds-loop run` → read the prompt → repeat, cap **3** retries.

## Loop rules

1. Preflight inventory JSON + reference PNG (dimensions must equal `frameSize`).
2. Inventory matrix + UDX API verify before implement.
3. Gate A (structural UDX) before Gate B (visual).
4. Retry cap is 3. Kill metric = percent of screens that pass **A+B in ≤3 retries**.
5. **Never live MCP mid-loop.** Do not call Magic Patterns MCP, regenerate the prototype, or recapture the PNG after the drop is frozen. Refs are the contract.
6. Do not add whole-image pixel-perfect diffs. Gate B is region drift vs `layoutChecks.maxDriftPx` (default 8), not Devin’s ~1px loop.

## Sanity

```bash
npm run sample:gate-a-fail   # exits 1 — expected Gate A fail
npm run sample:good          # exits 0 — A+B pass
npm run sample:drift         # exits 1 — expected Gate B fail
npm run samples              # asserts those three outcomes
npm test
```
