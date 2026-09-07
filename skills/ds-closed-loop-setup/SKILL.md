---
name: ds-closed-loop-setup
description: >
  Clone and wire the Magic Patterns → Devin Angular fidelity harness (ds-loop).
  Use when starting a DS-to-Angular conversion, installing Gate A/B, dropping
  refs/, or connecting --generate-cmd to Devin. Never call live Magic Patterns
  MCP once the loop is running.
---

# DS closed-loop setup

Set up this repo so Devin (or another agent) can convert a frozen Magic Patterns drop into Angular DS code and iterate **only** on Gate A/B checklist failures.

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
  inventory.json          # frozen schema field names
  <Screen>.tsx            # Magic Patterns React export
```

Point `--inventory` at that JSON and `--source` at the Angular tree Devin will edit. Serve the Angular preview (`ng serve` or a static `preview.html`) and pass `--preview-url` or `--preview`.

Mark layout regions in the preview DOM:

```html
<header data-region="header">...</header>
<div data-region="cta-row">...</div>
```

Mask volatile pixels with `data-dynamic`, `data-ds-mask`, or `data-mask` (Gate B and `capture-preview` paint these out).

## Wire Devin (`--generate-cmd`)

Devin must consume **fail-only** `.ds-loop/next-prompt.md`. That file is a checklist (`wrong-component`, `missing-variant`, `token-drift`, `gap-drift`). It never says "match the design".

```bash
npx ds-loop run \
  --inventory refs/checkout-summary/inventory.json \
  --source apps/checkout/src \
  --preview-url http://localhost:4200/checkout-summary \
  --generate-cmd 'devin run --file .ds-loop/next-prompt.md' \
  --retries 3
```

Without `--generate-cmd`, `ds-loop run` executes one pass, writes `.ds-loop/next-prompt.md` on failure, and exits `1`. That is the usual Devin step: implement → `ds-loop run` → read the prompt → repeat, cap **3** retries.

## Loop rules

1. Preflight inventory JSON + reference PNG (dimensions must equal `frameSize`).
2. Gate A (structural) before Gate B (visual).
3. Retry cap is 3. Kill metric = percent of screens that pass **A+B in ≤3 retries**.
4. **Never live MCP mid-loop.** Do not call Magic Patterns MCP, regenerate the prototype, or recapture the PNG after the drop is frozen. Refs are the contract.
5. Do not add whole-image pixel-perfect diffs. Gate B is region drift vs `layoutChecks.maxDriftPx` (default 8).

## Sanity

```bash
npm run sample:gate-a-fail   # exits 1 — expected Gate A fail
npm run sample:good          # exits 0 — A+B pass
npm run sample:drift         # exits 1 — expected Gate B fail
npm run samples              # asserts those three outcomes
```
