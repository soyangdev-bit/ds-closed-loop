# ds-closed-loop

Magic Patterns → Devin Angular fidelity harness.

Freeze a published Magic Patterns screen (PNG + inventory JSON + React), generate Angular against **UDX**, then iterate **only** on Gate A/B checklist failures. Retry cap is 3. The kill metric is the percent of screens that pass **both** gates in ≤3 retries.

This is not a pixel-perfect whole-image matcher. Gate B measures **region drift** against `layoutChecks.maxDriftPx` (default **8px**).

Magic Patterns never fills Angular selectors. Each inventory row maps **React → UDX**. A partial UDX dump (`components.json` or CSV) is what enables Gate A; without it, rows stay `todo` and Devin guesses.

## Install

```bash
git clone https://github.com/soyangdev-bit/ds-closed-loop.git
cd ds-closed-loop
npm install
npx playwright install chromium
```

CLI entry points (after `npm install` / `npm run build`):

| Command | Purpose |
| --- | --- |
| `npx ds-loop preflight` | Validate inventory JSON + reference PNG |
| `npx ds-loop gate-a` | Structural UDX checks |
| `npx ds-loop gate-b` | Playwright region-drift checks |
| `npx ds-loop run` | Preflight → A → B, fail-only `next-prompt.md`, optional retry loop |
| `npx capture-preview` | One-shot screenshot of a **locked published** preview URL |

Equivalent: `npx ds-loop capture-preview`.

## Drop package

Each screen is a three-part export. Produce it with [`skills/ds-refs-export/SKILL.md`](skills/ds-refs-export/SKILL.md) **before** the loop. Do not fetch Magic Patterns live once this exists.

```
refs/<screenId>/
  <screenId>.png      # locked PNG at inventory.frameSize
  inventory.json      # frozen schema (field names below)
  <Screen>.tsx        # Magic Patterns React export
```

`referencePng` in the JSON is resolved relative to the inventory file.

Mark regions in the Angular preview so Gate B can measure them:

```html
<header data-region="header">...</header>
<div data-region="cta-row"><udx-button variant="primary" size="md">Pay</udx-button></div>
```

Mask clocks, avatars, and other volatile pixels with `data-dynamic`, `data-ds-mask`, or `data-mask`. `capture-preview` and Gate B paint those nodes out the same way.

## Inventory schema (frozen field names)

```json
{
  "designSystem": "udx",
  "screenId": "checkout-summary",
  "referencePng": "refs/checkout-summary.png",
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

JSON Schema: [`schemas/inventory.schema.json`](schemas/inventory.schema.json).

Do not rename these keys. Extra keys are allowed; required keys are not optional. `designSystem` is always `"udx"`.

`todo: true` means `angular.selector` is a guessed `udx-*` placeholder, not a row from the UDX catalog. Sample fixtures are placeholders until a real dump lands. Gate A still scores `required` rows against whatever selector is in the inventory.

### React → UDX (Magic Patterns never fills Angular)

| Source | Fills |
| --- | --- |
| Magic Patterns export | `react.name` / variant / size, plus the React `.tsx` |
| UDX dump (`components.json` or CSV) | `angular.selector`, `angular.inputs`, optional `tokens` |
| Neither (row not in the dump) | leave `"todo": true`; Devin guesses |

A **partial** UDX list is enough to enable Gate A for the rows it covers. Unmapped rows stay `todo`.

### UDX dump format

One row per component: **selector**, **inputs/variants**, optional **tokens**. JSON or CSV.

[`schemas/udx-catalog.schema.json`](schemas/udx-catalog.schema.json) · examples: [`fixtures/udx-catalog.example.json`](fixtures/udx-catalog.example.json), [`fixtures/udx-catalog.example.csv`](fixtures/udx-catalog.example.csv).

```json
{
  "designSystem": "udx",
  "components": [
    {
      "selector": "udx-button",
      "react": "Button",
      "inputs": {
        "variant": ["primary", "secondary", "ghost"],
        "size": ["sm", "md", "lg"]
      },
      "tokens": ["color.action.primary", "space.200", "radius.md"]
    }
  ]
}
```

```csv
selector,react,inputs,variants,tokens
udx-button,Button,"variant,size","variant=primary|secondary|ghost;size=sm|md|lg","color.action.primary,space.200,radius.md"
```

Match `react.name` (and variant/size) to a dump row, copy selector + inputs into the inventory, and clear `todo`. Gate A/B scoring rules are otherwise unchanged.

## Gates

### Preflight

- Inventory parses and matches the schema.
- `referencePng` exists and is a PNG whose pixel size equals `frameSize`.

### Gate A — structural

Scans `--source` (`.html`, `.ts`, `.scss`, `.css`, …; skips `node_modules` / `dist`).

| Forbidden | Checklist code |
| --- | --- |
| `raw-button` (native `<button>`) | `wrong-component` |
| required `angular.selector` missing | `wrong-component` |
| required `angular.inputs` missing on the selector | `missing-variant` |
| `inline-hex` / `inline-px-spacing` (and unused tokens) | `token-drift` |

Gate A must pass before Gate B runs.

### Gate B — visual (region drift, not whole-image)

Playwright loads `--preview` or `--preview-url` at **exact** `frameSize`, waits for `document.fonts.ready`, disables animations/transitions, masks `[data-dynamic]` / `[data-ds-mask]` / `[data-mask]`, then screenshots the viewport.

For each `layoutChecks` entry it locates `[data-region="<region>"]` and measures how far that region's pixels sit from the reference PNG. Fail if drift exceeds `maxDriftPx` (default **8**). Code: `gap-drift`.

This is **not** a pixel-perfect full-frame compare. Anti-aliasing and font rasterization are ignored unless they move a region more than the budget.

#### Gate B in Docker

Use the Microsoft Playwright image so Chromium matches the `playwright` package. **Pin the image tag to the same version as `playwright` in `package.json` / `package-lock.json`.**

```bash
docker run --rm -it \
  -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -lc 'npm ci && npx playwright install chromium && npm run samples'
```

Image: [`mcr.microsoft.com/playwright`](https://hub.docker.com/_/microsoft-playwright). Tags look like `v1.63.0-noble` or `v1.63.0-jammy`. This repo pins `playwright@1.63.0`; bump the image tag when you bump the npm package.

## Loop (fail-only, retry cap 3)

```bash
npx ds-loop run \
  --inventory refs/checkout-summary/inventory.json \
  --source apps/checkout/src \
  --preview-url http://localhost:4200/checkout-summary \
  --retries 3
```

On failure, writes **only** `.ds-loop/next-prompt.md` (and `.ds-loop/report.json`). The prompt is a checklist of failed codes. It never says "match the design". On success the prompt file is removed.

`--retries 3` is the cap after failures. The kill metric counts a screen as a win if it reaches A+B pass with **≤3 retries**.

`--generate-cmd` is optional. When set, `ds-loop` re-invokes that command (Devin) with the new prompt until pass or cap:

```bash
npx ds-loop run \
  --inventory refs/checkout-summary/inventory.json \
  --source apps/checkout/src \
  --preview-url http://localhost:4200/checkout-summary \
  --generate-cmd 'devin run --file .ds-loop/next-prompt.md' \
  --retries 3
```

Without `--generate-cmd`, run `ds-loop run` after each Devin turn (the usual wiring).

### Never live MCP mid-loop

Once the drop package is frozen:

- Do not call Magic Patterns MCP.
- Do not recapture or replace `referencePng`.
- Do not regenerate the prototype from a new prompt.

Live MCP mid-loop moves the target while Devin is scored against the old PNG.

## Devin / agent wiring

Agent skills (check these in on `main`):

1. [`skills/ds-closed-loop-setup/SKILL.md`](skills/ds-closed-loop-setup/SKILL.md) — clone, `npm install`, Playwright, drop `refs/`, wire `--generate-cmd`.
2. [`skills/ds-refs-export/SKILL.md`](skills/ds-refs-export/SKILL.md) — lock MP frame, capture PNG, map React → UDX, export React.

Point Devin at those skills plus the drop path. After each implementation pass, run `ds-loop run`. Feed `.ds-loop/next-prompt.md` back as the next instruction.

## Kill metric

```
kill = (# screens that pass Gate A AND Gate B with retries ≤ 3)
     / (# screens in the drop)
```

Track it per drop, not per retry. A screen that still fails after 3 retries is a miss even if Gate A later goes green.

## capture-preview

One-shot Playwright of a **locked published** Magic Patterns `previewUrl` → refs PNG.

```bash
npx capture-preview \
  --url 'https://www.magicpatterns.com/c/<published-id>' \
  --out refs/checkout-summary/checkout-summary.png \
  --frame-size 1440x900 \
  --storage-state .mp-storage-state.json
```

`--inventory` can supply `frameSize` and default `--out` from `referencePng`.

Rejects WIP / login walls (HTTP 401/403, `/login` URLs, password interstitials, unpublished / "work in progress" copy). Use `--storage-state` for cookie-gated **published** previews — not as a way to snapshot the editor. Sample walls live in `fixtures/walls/`.

## Sample fixtures

Under `fixtures/`:

| Fixture | What it demonstrates | npm script |
| --- | --- | --- |
| `fixtures/bad` | Gate A fail (`wrong-component`, `missing-variant`, `token-drift`) | `npm run sample:gate-a-fail` (exits 1) |
| `fixtures/good` | Good Angular UDX usage; A+B pass | `npm run sample:good` (exits 0) |
| `fixtures/drift` | Structure OK, header/CTA shifted >8px; Gate B fail | `npm run sample:drift` (exits 1) |

`udx-button` in these drops is a **placeholder** (`"todo": true`) until a real UDX catalog is dropped. See [`fixtures/README.md`](fixtures/README.md).

```bash
npm install
npx playwright install chromium
npm run samples    # asserts the three expected outcomes, exits 0
npm test
```

`sample:gate-a-fail` and `sample:drift` are supposed to exit non-zero when run alone. `npm run samples` is the green sanity target.

## CLI reference

```text
ds-loop preflight  -i inventory.json
ds-loop gate-a     -i inventory.json -s <angular-src>
ds-loop gate-b     -i inventory.json (-p preview.html | --preview-url URL)
ds-loop run        -i inventory.json -s <angular-src> (-p | --preview-url)
                   [--generate-cmd CMD] [--retries 3] [--out-dir .ds-loop]
                   [--storage-state cookies.json]
capture-preview    -u PREVIEW_URL [-o out.png] [--frame-size 1440x900]
                   [-i inventory.json] [--storage-state cookies.json]
```

Artifacts: `.ds-loop/report.json`, `.ds-loop/next-prompt.md`, `.ds-loop/screenshots/candidate.png`.
