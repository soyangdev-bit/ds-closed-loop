---
name: ds-refs-export
description: >
  Lock a Magic Patterns frame and export the three-part drop package
  (PNG + inventory JSON + React) into refs/. Map React → UDX from a catalog
  dump; Magic Patterns never fills Angular selectors. Use before ds-loop, when
  capturing a published preview at frameSize, or when filling inventory.json.
---

# DS refs export (Magic Patterns drop package)

Freeze one screen before any Angular work. The drop package is the only reference the closed loop may use. Do **not** keep Magic Patterns MCP live after this export.

## Three-part drop

```
refs/<screenId>/
  <screenId>.png       # part 1 — PNG at exact frameSize
  inventory.json       # part 2 — frozen field names (see schema); designSystem: "udx"
  <Screen>.tsx         # part 3 — exported React from Magic Patterns
```

Example: `refs/checkout-summary/checkout-summary.png`, `inventory.json`, `CheckoutSummary.tsx`.

## 1. Lock the Magic Patterns frame

1. Open the **published** preview (not the editor, not a WIP share).
2. Set the canvas/frame to the size you will record as `frameSize` (e.g. 1440×900).
3. Confirm there is no login wall, password interstitial, or "unpublished / work in progress" banner.
4. If the published URL needs cookies, export a Playwright `storageState` JSON. Do not paste secrets into inventory.

## 2. Capture the PNG at `frameSize`

Prefer the harness so Gate B uses the same viewport, `document.fonts.ready`, disabled animations, and masks:

```bash
npx capture-preview \
  --url 'https://www.magicpatterns.com/c/<published-id>' \
  --out refs/checkout-summary/checkout-summary.png \
  --frame-size 1440x900 \
  --storage-state .mp-storage-state.json   # optional cookies
```

Equivalent:

```bash
npx ds-loop capture-preview --url '…' --out refs/checkout-summary/checkout-summary.png --frame-size 1440x900
```

`capture-preview` **rejects** WIP/login walls. Fix publishing (or pass `--storage-state`) and retry. Do not screenshot the editor chrome.

Manual fallback: browser screenshot at exactly `frameSize` (device scale 1). Name the file to match `inventory.referencePng`.

Masks (same selectors Gate B uses): `[data-dynamic]`, `[data-ds-mask]`, `[data-mask]`.

## 3. Fill `inventory.json`

Field names are frozen. `designSystem` is always `"udx"`. Copy this shape:

```json
{
  "designSystem": "udx",
  "screenId": "checkout-summary",
  "referencePng": "checkout-summary.png",
  "frameSize": { "w": 1440, "h": 900 },
  "components": [{
    "id": "btn-pay",
    "react": { "name": "Button", "variant": "primary", "size": "md" },
    "angular": { "selector": "udx-button", "inputs": { "variant": "primary", "size": "md" } },
    "required": true,
    "todo": true,
    "tokens": ["color.action.primary", "space.200", "radius.md"]
  }],
  "forbidden": ["raw-button", "inline-hex", "inline-px-spacing"],
  "layoutChecks": [
    { "region": "header", "maxDriftPx": 8 },
    { "region": "cta-row", "maxDriftPx": 8 }
  ],
  "rubric": ["wrong-component", "missing-variant", "token-drift", "gap-drift"]
}
```

### Magic Patterns never fills Angular selectors

Each inventory row maps **React → UDX**:

1. From Magic Patterns / the React export, fill `react.name` (and variant/size). Leave `angular.*` empty of MP data.
2. Load the UDX dump if present (`components.json` or CSV). **One row per component:** `selector`, `inputs`/`variants`, optional `tokens`. Schema: `schemas/udx-catalog.schema.json`. Examples: `fixtures/udx-catalog.example.json`, `fixtures/udx-catalog.example.csv`.
3. Match `react.name` to a dump row. Copy `selector` + inputs/variants (and tokens when listed) into `angular` / `tokens`. Clear `todo`.
4. A **partial** dump enables Gate A for the rows it covers. Unmapped rows stay `"todo": true` with a guessed `udx-*` placeholder; Devin guesses.
5. With **no** dump, every row stays `todo` and Devin guesses. Sample fixtures are in this state (`udx-button` is a placeholder until a real catalog lands).

Gate A still scores `required` rows against the selector in the inventory (placeholder or catalog). Do not change Gate A/B codes, forbidden lists, or region-drift rules when filling mappings.

Other rules:

- `referencePng` is relative to the inventory file (or absolute).
- `layoutChecks.region` must exist on the preview as `[data-region="<region>"]`.
- `maxDriftPx` defaults to 8 when omitted.
- `forbidden` and `rubric` codes are the closed-loop vocabulary. Do not invent parallel names.

JSON Schema: `schemas/inventory.schema.json`.

## 4. Export React into `refs/`

From Magic Patterns, export the screen's React source into the drop folder (e.g. `CheckoutSummary.tsx`). This is context for Devin — Gate A still scores **UDX Angular** selectors, not the React tree.

Do not "clean up" the export to look like the final Angular app. The React file is a frozen artifact.

## 5. Hand off

Give Devin the drop path and `skills/ds-closed-loop-setup`. After this point: **no live MCP**, no recapture, no prompt that says "match the design". `ds-loop` will write fail-only checklist items into `.ds-loop/next-prompt.md`.
