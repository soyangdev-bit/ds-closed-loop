# Devin skills ↔ ds-loop

Jackson’s Devin skill pack drives Magic Patterns → UDX Angular conversion. This repo is the **harness** those skills call. Devin skills live with Devin; the CLI names here are the aliases.

## Orchestration order

```
conversion-preflight
  → conversion-inventory
  → udx-api-verify
  → angular-implementation
  → behavior-verification
  → screenshot-verification
  → conversion-evidence-audit
```

| Step | Devin skill | Harness command |
| --- | --- | --- |
| 1 | `conversion-preflight` | `npm run ds-loop:preflight -- --inventory refs/<screen-id>/inventory.json` |
| 2 | `conversion-inventory` | `npm run inventory:validate -- --inventory …` and `npm run ds-loop:matrix -- --inventory …` (writes `.ds-loop/matrix/`) |
| 3 | `udx-api-verify` | `npx ds-loop udx-api-verify -i …` — `angularTarget` vs `catalog/udx/api-inventory.json` (verified + non-null selector) |
| 4 | `angular-implementation` | `npm run ds-loop:run -- --inventory … --source … --preview-url …` |
| 5 | `behavior-verification` | `npx ds-loop gate-a` (alias `behavior-verification`) |
| 6 | `screenshot-verification` | `npx ds-loop gate-b` (alias `screenshot-verification`) |
| 7 | `conversion-evidence-audit` | `npx ds-loop evidence-audit -i …` |

`run` already executes preflight → A → B and writes `.ds-loop/report.json` + fail-only `.ds-loop/next-prompt.md`. Steps 5–6 are the same gates when you want them standalone.

## Inventory layers (conversion-inventory)

Each `components[]` row:

- **source** — React facts from the MP export
- **intent** — from Magic Patterns / `data-udx`, with `intentConfidence`: `explicit` | `inferred` | `none`
- **angularTarget** — catalog-verified selector/inputs; `todo: true` until verified
- **mapping** — transforms + evidence

Optional top-level: `states`, `viewports`, `layoutChecks`, `evidence`, `catalog.path` (default `catalog/udx/api-inventory.json`; legacy `catalog/udx/components.json` still works).

## Screenshot grade (do not conflate)

- **Devin `screenshot-verification`** may loop internally at **~1px** (pixel-exact *inside Devin*).
- **Harness Gate B** stays **≤8px** `layoutChecks.maxDriftPx` so antialias / font rasterization do not false-fail CI.

Pixel-exact is Devin’s region loop, not the CI screen grade. Do not change Gate B to 1px.

## Missing piece

A Magic Patterns skill that **writes** `data-udx` on the prototype is **not** in this pack. Devin only **consumes** `intent` / `data-udx`. Until that writer exists, most rows will be `intentConfidence: "inferred"` or `"none"`.

## Catalog

[`catalog/udx/api-inventory.json`](../catalog/udx/api-inventory.json) is the preferred empty stub (Jackson pastes `@udx/lib@0.0.82` here). Skills historically said [`catalog/udx/components.json`](../catalog/udx/components.json); that path is still a fallback. **Never invent** selectors.

Dropping the catalog is not a close — you still need `refs/<screen>/`.

When populated, Gate A only accepts `status: verified` + non-null `selector`. `source-only` / `selector: null` (hotkeys, date, close-on-scroll, …) cannot be `angularTarget`.

## Setup / export

- [`ds-closed-loop-setup/SKILL.md`](ds-closed-loop-setup/SKILL.md)
- [`ds-refs-export/SKILL.md`](ds-refs-export/SKILL.md)
