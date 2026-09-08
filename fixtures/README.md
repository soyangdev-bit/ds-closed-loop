# Sample fixtures

These drops demonstrate Gate A/B. They are **not** a real UDX catalog.

## Placeholders until a UDX dump lands

- Inventory always sets `"designSystem": "udx"`.
- Sample Angular selectors use the `udx-*` prefix (`udx-button`) as the target DS.
- v1 rows map Magic Patterns **React → UDX** via `react` / `angular`. Magic Patterns never fills selectors.
- v1 rows are marked `"todo": true` because `udx-button` is a guessed placeholder. Gate A still scores those **v1** required selectors in source (so `fixtures/good` / `drift` keep passing) while the catalog stub is empty.
- Inventory **v2** (`fixtures/v2`) uses skill-matrix layers: `source`, `intent` (`intentConfidence`), `angularTarget` (`todo` until catalog-verified), `mapping`. Required v2 rows fail Gate A while `angularTarget.todo` is true or `selector` is missing.

Paste Jackson’s `@udx/lib@0.0.82` dump into `catalog/udx/api-inventory.json` (skills historically said `catalog/udx/components.json` — still a fallback). **Never invent** rows. See `catalog/udx/README.md`.

Dropping the catalog is not a screen close. You still need `refs/<screen>/`.

When the dump has rows, Gate A only accepts `status: verified` (or equivalent) **and** a non-null `selector` as `angularTarget`. `selector: null` / `source-only` (hotkeys, date, close-on-scroll, …) fail `wrong-component`. An empty stub does not enable catalog membership checks.

Gate B remains region `maxDriftPx` (default **8**), not Devin’s ~1px screenshot loop.
