# UDX catalog dump

Path: `catalog/udx/components.json` (override per drop with `inventory.catalog.path`).

This file is a **stub**. Do not invent UDX selectors, inputs, or tokens.

Populate it from:

- `@udx/lib` (the Angular UDX package)
- [https://udx.dev.bny.net/llms.txt](https://udx.dev.bny.net/llms.txt)

Schema: [`schemas/udx-catalog.schema.json`](../../schemas/udx-catalog.schema.json). Shape examples (not a live dump): [`fixtures/udx-catalog.example.json`](../../fixtures/udx-catalog.example.json).

Gate A:

- If this file is **missing**, catalog membership is skipped (legacy).
- If this file **exists but `components` is empty** (this stub), membership is skipped until a real dump lands.
- If this file **exists and has rows**, required `angularTarget.selector` / `inputs` must be present in the dump (`wrong-component` / `missing-variant`).
