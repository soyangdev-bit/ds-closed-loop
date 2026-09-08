# Sample fixtures

These drops demonstrate Gate A/B. They are **not** a real UDX catalog.

## Placeholders until a UDX dump lands

- Inventory always sets `"designSystem": "udx"`.
- Sample Angular selectors use the `udx-*` prefix (`udx-button`) as the target DS.
- v1 rows map Magic Patterns **React → UDX** via `react` / `angular`. Magic Patterns never fills selectors.
- v1 rows are marked `"todo": true` because `udx-button` is a guessed placeholder. Gate A still scores those **v1** required selectors in source (so `fixtures/good` / `drift` keep passing).
- Inventory **v2** (`fixtures/v2`) uses skill-matrix layers: `source`, `intent` (`intentConfidence`), `angularTarget` (`todo` until catalog-verified), `mapping`. Required v2 rows fail Gate A while `angularTarget.todo` is true or `selector` is missing.

Replace placeholders (and set `angularTarget.todo: false`) when a real UDX dump is dropped into `catalog/udx/components.json` from `@udx/lib` or https://udx.dev.bny.net/llms.txt — **never invent** rows. See `catalog/udx/README.md`.

Expected dump shape: **one row per component** — `selector`, `inputs`/`variants`, optional `tokens`. A partial dump is enough to verify mapped rows for Gate A; anything not in the dump stays `todo`. An empty stub does not enable catalog membership checks.

Gate B remains region `maxDriftPx` (default **8**), not Devin’s ~1px screenshot loop.
