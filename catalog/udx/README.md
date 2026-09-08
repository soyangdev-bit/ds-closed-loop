# UDX catalog dump

**Preferred path:** `catalog/udx/api-inventory.json` — this is the real hose from `@udx/lib@0.0.82`.

Skills historically said `catalog/udx/components.json`. The harness still loads that file when the preferred dump is missing, or when `inventory.catalog.path` overrides.

Override per drop with `inventory.catalog.path`.

This file is a **stub**. Do not invent UDX selectors, inputs, or tokens. Jackson pastes the full JSON into `api-inventory.json`.

Populate from `@udx/lib@0.0.82`. Schema: [`schemas/udx-catalog.schema.json`](../../schemas/udx-catalog.schema.json). Shape examples (not a live dump): [`fixtures/udx-catalog.example.json`](../../fixtures/udx-catalog.example.json).

Dropping the catalog is **not** a screen close. You still need `refs/<screen>/` (PNG + inventory.json + React) for a real close.

## Membership (Gate A)

When the dump **has rows**:

- Only rows with `status: verified` (or equivalent) **and** a non-null `selector` may be `angularTarget`.
- Rows with `selector: null` / `status: source-only` (hotkeys, date, close-on-scroll, …) must **not** be used as `angularTarget` — `wrong-component` if inventory points at them.
- Fail if required `angularTarget.selector` is missing, `todo: true`, or not found as verified + non-null.

When the dump is **missing** or **empty** (this stub), membership is skipped so v1 sample fixtures still pass.

Gate B stays region `maxDriftPx` **≤8px**.
