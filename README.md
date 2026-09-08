# ds-closed-loop

Magic Patterns → Devin Angular fidelity harness.

Freeze a published Magic Patterns screen (PNG + inventory JSON + React), generate Angular against **UDX**, then iterate **only** on Gate A/B checklist failures. Retry cap is 3. The kill metric is the percent of screens that pass **both** gates in ≤3 retries.

This is not a pixel-perfect whole-image matcher. Gate B measures **region drift** against `layoutChecks.maxDriftPx` (default **8px**).

Magic Patterns never fills Angular selectors. Each inventory row maps **React → UDX**. The catalog drop is **`catalog/udx/api-inventory.json`** (Jackson’s hose from `@udx/lib@0.0.82`). Skills historically said `catalog/udx/components.json`; the harness still loads that file or `inventory.catalog.path`. An empty stub does not enable Gate A membership. Dropping the catalog is not a screen close — you still need `refs/<screen>/`.

## Devin skill pack (orchestration)

Align this harness with Jackson’s Devin skills. Run in this order:

1. **conversion-preflight** — `npm run ds-loop:preflight -- --inventory refs/<screen-id>/inventory.json`
2. **conversion-inventory** — `npm run inventory:validate -- --inventory …` then `npm run ds-loop:matrix -- --inventory …` (writes `.ds-loop/matrix/`)
3. **udx-api-verify** — `npm run ds-loop:udx-api-verify -- --inventory …` (selector/inputs vs catalog)
4. **angular-implementation** — `npm run ds-loop:run -- --inventory … --source … --preview-url …`
5. **behavior-verification** — Gate A (`npx ds-loop behavior-verification` / `gate-a`)
6. **screenshot-verification** — Gate B (`npx ds-loop screenshot-verification` / `gate-b`)
7. **conversion-evidence-audit** — `npx ds-loop evidence-audit -i …`

See [`skills/README.md`](skills/README.md).

**Missing piece:** a Magic Patterns skill that **writes** `data-udx` on the prototype. This Devin pack only **consumes** intent (`intent.intentConfidence`: `explicit` | `inferred` | `none`).

### Gate B vs Devin screenshot skill

| Layer | Tolerance | Role |
| --- | --- | --- |
| Devin `screenshot-verification` | ~1px internally | Devin’s own region loop (pixel-exact *inside Devin*, not CI) |
| Harness Gate B | **≤8px** `maxDriftPx` (default) | CI / `ds-loop` screen grade |

Do **not** switch the harness to pixel-exact. Keep region `maxDriftPx` (default 8) so antialias and font rasterization do not false-fail. Pixel-exact is Devin’s region loop, not this grade.

## Install

```bash
git clone https://github.com/soyangdev-bit/ds-closed-loop.git
cd ds-closed-loop
npm install
npx playwright install chromium
```

CLI entry points (after `npm install` / `npm run build`):

| Command | Skill alias | Purpose |
| --- | --- | --- |
| `npx ds-loop preflight` | `conversion-preflight` | Validate inventory JSON + reference PNG |
| `npx ds-loop inventory` | `conversion-inventory` | Schema-validate inventory v2 |
| `npx ds-loop matrix` | (writes matrix) | Skill-matrix layers → `.ds-loop/matrix/` |
| `npx ds-loop udx-api-verify` | `udx-api-verify` | Catalog selector/input check |
| `npx ds-loop gate-a` | `behavior-verification` | Structural UDX checks |
| `npx ds-loop gate-b` | `screenshot-verification` | Playwright region-drift checks |
| `npx ds-loop run` | `angular-implementation` | Preflight → A → B, fail-only `next-prompt.md` |
| `npx ds-loop evidence-audit` | `conversion-evidence-audit` | Artifact + mapping/evidence audit |
| `npx capture-preview` | — | One-shot screenshot of a **locked published** preview URL |

Equivalent: `npx ds-loop capture-preview`.

npm scripts:

```bash
npm run ds-loop:preflight -- --inventory refs/<screen-id>/inventory.json
npm run ds-loop:run -- --inventory refs/<screen-id>/inventory.json --source apps/… --preview-url http://localhost:4200/…
npm run ds-loop:matrix -- --inventory refs/<screen-id>/inventory.json
npm run inventory:validate -- --inventory refs/<screen-id>/inventory.json
```

Artifacts: `.ds-loop/report.json`, `.ds-loop/next-prompt.md`, `.ds-loop/matrix/`, `.ds-loop/screenshots/candidate.png`.

## Drop package

Each screen is a three-part export. Produce it with [`skills/ds-refs-export/SKILL.md`](skills/ds-refs-export/SKILL.md) **before** the loop. Do not fetch Magic Patterns live once this exists.

```
refs/<screenId>/
  <screenId>.png      # locked PNG at inventory.frameSize
  inventory.json      # inventory v2 (field names below)
  <Screen>.tsx        # Magic Patterns React export
```

`referencePng` in the JSON is resolved relative to the inventory file.

Mark regions in the Angular preview so Gate B can measure them:

```html
<header data-region="header">...</header>
<div data-region="cta-row"><udx-button variant="primary" size="md">Pay</udx-button></div>
```

Mask clocks, avatars, and other volatile pixels with `data-dynamic`, `data-ds-mask`, or `data-mask`. `capture-preview` and Gate B paint those nodes out the same way.

## Inventory schema (v2)

`designSystem` is always `"udx"`. Each `components[]` row supports the skill-matrix layers:

| Layer | Fills | Notes |
| --- | --- | --- |
| `source` | React facts (Magic Patterns export) | v1 alias: `react` |
| `intent` | Magic Patterns / `data-udx` | **Must** include `intentConfidence`: `explicit` \| `inferred` \| `none` |
| `angularTarget` | UDX selector + inputs | Verified against the catalog. `todo: true` until verified |
| `mapping` | Transforms + evidence | How source became the Angular target |

Optional top-level: `states`, `viewports`, `layoutChecks`, `evidence`, `catalog.path` (default `catalog/udx/api-inventory.json`; legacy `catalog/udx/components.json` still works).

Inventory v1 (`react` / `angular` / row-level `todo`) still validates.

```json
{
  "designSystem": "udx",
  "screenId": "checkout-summary",
  "referencePng": "refs/checkout-summary.png",
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

JSON Schema: [`schemas/inventory.schema.json`](schemas/inventory.schema.json). Worked example: [`fixtures/v2/inventory.json`](fixtures/v2/inventory.json).

Do not rename frozen keys. Extra keys are allowed. `designSystem` is always `"udx"`.

### React → UDX (Magic Patterns never fills Angular)

| Source | Fills |
| --- | --- |
| Magic Patterns export | `source` / `react` (name, variant, size) plus the React `.tsx` |
| `data-udx` on the MP prototype | `intent` with `intentConfidence: "explicit"` |
| UDX dump (`catalog/udx/api-inventory.json`) | `angularTarget.selector`, `inputs`; clear `todo` after verify |
| Neither (row not in the dump) | `"angularTarget": { "todo": true }`; Devin guesses |

### UDX dump format

**Never invent catalog rows.** The real dump is Jackson’s `@udx/lib@0.0.82` **api-inventory** JSON. This repo ships [`catalog/udx/api-inventory.json`](catalog/udx/api-inventory.json) as an **empty stub** (`$comment` in the file). Skills historically named [`catalog/udx/components.json`](catalog/udx/components.json); that path remains a fallback.

Dropping the catalog is **not** a close. You still need `refs/<screen>/` (PNG + inventory.json + React).

Schema: [`schemas/udx-catalog.schema.json`](schemas/udx-catalog.schema.json). Shape examples only: [`fixtures/udx-catalog.example.json`](fixtures/udx-catalog.example.json).

When the dump **has rows**, Gate A membership is:

- Only `status: verified` (or equivalent) **and** a non-null `selector` may be `angularTarget`.
- `selector: null` / `source-only` rows (hotkeys, date, close-on-scroll, …) must **not** be used as `angularTarget` (`wrong-component`).
- Fail if required `angularTarget.selector` is missing, `todo: true`, or not found as verified + non-null.

An empty stub does not enable membership; v1 samples still pass.

```json
{
  "designSystem": "udx",
  "source": { "package": "@udx/lib", "version": "0.0.82" },
  "components": [
    {
      "selector": "udx-button",
      "status": "verified",
      "react": "Button",
      "inputs": {
        "variant": ["primary", "secondary", "ghost"],
        "size": ["sm", "md", "lg"]
      },
      "tokens": ["color.action.primary", "space.200", "radius.md"]
    },
    {
      "name": "hotkeys",
      "selector": null,
      "status": "source-only"
    }
  ]
}
```

Match `source.name` (and variant/size) to a **verified + non-null** dump row, copy selector + inputs into `angularTarget`, set `todo: false`. Never map to `source-only` / `selector: null` APIs.

## Gates

### Preflight (`conversion-preflight`)

- Inventory parses and matches the schema (v1 or v2).
- `referencePng` exists and is a PNG whose pixel size equals `frameSize`.

### Gate A — structural (`behavior-verification` + `udx-api-verify`)

Scans `--source` (`.html`, `.ts`, `.scss`, `.css`, …; skips `node_modules` / `dist`).

| Check | Checklist code |
| --- | --- |
| `raw-button` (native `<button>`) | `wrong-component` |
| required `angularTarget.selector` missing | `wrong-component` |
| required `angularTarget.todo: true` (v2 rows) | `wrong-component` |
| selector / inputs not a **verified + non-null** row in a populated `catalog/udx/api-inventory.json` | `wrong-component` / `missing-variant` |
| inventory points at `source-only` / `selector: null` (hotkeys, date, close-on-scroll, …) | `wrong-component` |
| required selector missing in source | `wrong-component` |
| required inputs missing on the selector | `missing-variant` |
| `inline-hex` / `inline-px-spacing` (and unused tokens) | `token-drift` |

Forbidden list stays `raw-button`, `inline-hex`, `inline-px-spacing`.

Inventory v1 samples keep row-level `"todo": true` placeholders and still score required selectors in source. v2 rows that include `angularTarget` must be catalog-verified (`todo: false` + selector present) before Gate A can pass.

Gate A must pass before Gate B runs.

### Gate B — visual (region drift, not whole-image, not 1px)

Playwright loads `--preview` or `--preview-url` at **exact** `frameSize`, waits for `document.fonts.ready`, disables animations/transitions, masks `[data-dynamic]` / `[data-ds-mask]` / `[data-mask]`, then screenshots the viewport.

For each `layoutChecks` entry it locates `[data-region="<region>"]` and measures how far that region's pixels sit from the reference PNG. Fail if drift exceeds `maxDriftPx` (default **8**). Code: `gap-drift`.

This is **not** a pixel-perfect full-frame compare and **not** Devin’s ~1px screenshot loop. Anti-aliasing and font rasterization are ignored unless they move a region more than the 8px budget.

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
npm run ds-loop:run -- \
  --inventory refs/checkout-summary/inventory.json \
  --source apps/checkout/src \
  --preview-url http://localhost:4200/checkout-summary \
  --retries 3
```

On failure, writes **only** `.ds-loop/next-prompt.md` (and `.ds-loop/report.json`). The prompt is a checklist of failed codes. It never says "match the design". On success the prompt file is removed. `run` also writes `.ds-loop/matrix/`.

`--retries 3` is the cap after failures. The kill metric counts a screen as a win if it reaches A+B pass with **≤3 retries**.

`--generate-cmd` is optional. When set, `ds-loop` re-invokes that command (Devin) with the new prompt until pass or cap.

Without `--generate-cmd`, run `ds-loop run` after each Devin turn (the usual wiring).

### Never live MCP mid-loop

Once the drop package is frozen:

- Do not call Magic Patterns MCP.
- Do not recapture or replace `referencePng`.
- Do not regenerate the prototype from a new prompt.

Live MCP mid-loop moves the target while Devin is scored against the old PNG.

## Devin / agent wiring

Agent skills (check these in on `main`):

1. [`skills/README.md`](skills/README.md) — orchestration order vs Devin skill names.
2. [`skills/ds-closed-loop-setup/SKILL.md`](skills/ds-closed-loop-setup/SKILL.md) — clone, `npm install`, Playwright, drop `refs/`, wire `--generate-cmd`.
3. [`skills/ds-refs-export/SKILL.md`](skills/ds-refs-export/SKILL.md) — lock MP frame, capture PNG, map React → UDX, export React.

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
| `fixtures/v2` | Inventory v2 skill-matrix layers | schema tests |

`udx-button` in the v1 drops is a **placeholder** (`"todo": true`) until a real UDX catalog is pasted into `catalog/udx/api-inventory.json`. See [`fixtures/README.md`](fixtures/README.md) and [`catalog/udx/README.md`](catalog/udx/README.md).

```bash
npm install
npx playwright install chromium
npm run samples    # asserts the three expected outcomes, exits 0
npm test
```

`sample:gate-a-fail` and `sample:drift` are supposed to exit non-zero when run alone. `npm run samples` is the green sanity target.

## CLI reference

```text
ds-loop preflight|conversion-preflight     -i inventory.json
ds-loop inventory|conversion-inventory     -i inventory.json
ds-loop matrix                             -i inventory.json [--out-dir .ds-loop]
ds-loop udx-api-verify                     -i inventory.json [--catalog path]
ds-loop gate-a|behavior-verification       -i inventory.json -s <angular-src>
ds-loop gate-b|screenshot-verification     -i inventory.json (-p preview.html | --preview-url URL)
ds-loop run|angular-implementation         -i inventory.json -s <angular-src> (-p | --preview-url)
                                           [--generate-cmd CMD] [--retries 3] [--out-dir .ds-loop]
ds-loop evidence-audit|conversion-evidence-audit  -i inventory.json [--out-dir .ds-loop]
capture-preview                            -u PREVIEW_URL [-o out.png] [--frame-size 1440x900]
                                           [-i inventory.json] [--storage-state cookies.json]
```

Artifacts: `.ds-loop/report.json`, `.ds-loop/next-prompt.md`, `.ds-loop/matrix/`, `.ds-loop/screenshots/candidate.png`.
