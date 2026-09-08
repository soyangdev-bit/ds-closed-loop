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

Field names are frozen. `designSystem` is always `"udx"`. Prefer inventory **v2** skill-matrix layers (`source`, `intent`, `angularTarget`, `mapping`). v1 `react` / `angular` still validate.

Copy this shape:

```json
{
  "designSystem": "udx",
  "screenId": "checkout-summary",
  "referencePng": "checkout-summary.png",
  "frameSize": { "w": 1440, "h": 900 },
  "catalog": { "path": "catalog/udx/api-inventory.json" },
  "components": [{
    "id": "btn-pay",
    "source": { "name": "Button", "variant": "primary", "size": "md" },
    "intent": { "intentConfidence": "inferred", "component": "Button" },
    "angularTarget": { "selector": "udx-button", "inputs": { "variant": "primary", "size": "md" }, "todo": true },
    "mapping": { "transforms": ["Button → udx-button"], "evidence": [] },
    "required": true,
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

Optional top-level: `states`, `viewports`, `layoutChecks`, `evidence`, `catalog.path` (default `catalog/udx/api-inventory.json`; legacy `catalog/udx/components.json` still works).

`intent.intentConfidence` is `explicit` when `data-udx` is present, `inferred` from React, or `none`. This pack **consumes** `data-udx`; it does not write it (Magic Patterns writer skill is missing).

### Magic Patterns never fills Angular selectors

Each inventory row maps **React → UDX**:

1. From Magic Patterns / the React export, fill `source` (name, variant, size). Leave `angularTarget` empty of MP data (`todo: true`).
2. If the prototype has `data-udx`, set `intent.intentConfidence` to `"explicit"` and copy the attribute into `intent.dataUdx`. Otherwise `"inferred"` or `"none"`.
3. Load the UDX dump if present (`catalog/udx/api-inventory.json`; skills historically said `components.json` — still accepted, or CSV / `catalog.path`). **Row shape:** `selector` (string or null), `status` (`verified` | `source-only`), `inputs`/`variants`, optional `tokens`. Schema: `schemas/udx-catalog.schema.json`. The committed catalog is an **empty stub** — paste from `@udx/lib@0.0.82`. **Never invent rows.** Shape examples: `fixtures/udx-catalog.example.json`. Dropping the catalog is not a close; you still need `refs/<screen>/`.
4. Match `source.name` to a **verified + non-null selector** dump row. Copy `selector` + inputs/variants (and tokens when listed) into `angularTarget` / `tokens`. Set `todo: false`. Record the transform in `mapping`. Do **not** map to `source-only` / `selector: null` APIs (hotkeys, date, close-on-scroll, …).
5. A **partial** dump enables Gate A for the rows it covers. Unmapped rows stay `"angularTarget": { "todo": true }` with a guessed `udx-*` placeholder; Devin guesses. Gate A **fails** required v2 rows that are still `todo` or missing `selector`.
6. When the catalog file exists **and has rows**, required selector/inputs must be present as verified + non-null (`wrong-component` / `missing-variant`).

Do not change Gate A/B codes, forbidden lists (`raw-button`, `inline-hex`, `inline-px-spacing`), or region-drift rules when filling mappings.

Other rules:

- `referencePng` is relative to the inventory file (or absolute).
- `layoutChecks.region` must exist on the preview as `[data-region="<region>"]`.
- `maxDriftPx` defaults to **8** when omitted. Do not use Devin’s ~1px screenshot loop as the harness grade.
- `forbidden` and `rubric` codes are the closed-loop vocabulary. Do not invent parallel names.

JSON Schema: `schemas/inventory.schema.json`. Example: `fixtures/v2/inventory.json`.

## 4. Export React into `refs/`

From Magic Patterns, export the screen's React source into the drop folder (e.g. `CheckoutSummary.tsx`). This is context for Devin — Gate A still scores **UDX Angular** selectors, not the React tree.

Do not "clean up" the export to look like the final Angular app. The React file is a frozen artifact.

## 5. Hand off

Give Devin the drop path and `skills/ds-closed-loop-setup`. After this point: **no live MCP**, no recapture, no prompt that says "match the design". `ds-loop` will write fail-only checklist items into `.ds-loop/next-prompt.md`.
