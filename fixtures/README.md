# Sample fixtures

These drops demonstrate Gate A/B. They are **not** a real UDX catalog.

## Placeholders until a UDX dump lands

- Inventory always sets `"designSystem": "udx"`.
- Sample Angular selectors use the `udx-*` prefix (`udx-button`) as the target DS.
- Each `components[]` row maps Magic Patterns **React → UDX**. Magic Patterns never fills `angular.selector` / `angular.inputs`.
- Rows are marked `"todo": true` because `udx-button` is a guessed placeholder, not a catalog-backed selector. Replace placeholders (and clear `todo`) when a real UDX dump is dropped (`components.json` or CSV — see `udx-catalog.example.json` / `udx-catalog.example.csv`).
- Gate A/B behavior is unchanged: `required` rows are still scored against the selector in the inventory (placeholder or catalog).

Expected dump shape: **one row per component** — `selector`, `inputs`/`variants`, optional `tokens`. A partial dump is enough to fill mapped rows for Gate A; anything not in the dump stays `todo` and Devin guesses.
