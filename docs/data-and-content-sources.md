# Data and Content Sources

## Purpose

This document explains where battle data comes from and how it is consumed by engine and UI layers.

## Engine Data Catalogs

Folder: `src/calc/data/`

Core files:

- `index.js`: generation registry and catalog access.
- `abilities.js`: ability definitions by generation scope.
- `items.js`: item definitions and item metadata.
- `moves.js`: move definitions and move metadata.
- `species.js`: species and forme data.
- `types.js`: type chart and type interaction data.
- `natures.js`: nature definitions and stat modifiers.
- `interface.js`: shared data shape helpers.
- `production.min.js`: bundled data artifact used by distribution paths.

Engine code accesses catalogs through `Generations.get(gen)` to avoid mixing data across generations.

## UI Data Assets

Folder: `src/js/data/`

This folder contains page side data sets used for:

- Team and set options.
- Tier and format lists.
- Mode specific candidate or preset pools.
- UI helper lookups for dropdowns and labels.

## Data Ownership Split

- `src/calc/data/` is the source for rule critical data used by mechanics.
- `src/js/data/` is the source for interface choices and page specific presets.

Keep these responsibilities separate so UI changes do not silently change core battle logic.

## Common Data Changes

- Add or edit battle mechanics data: update `src/calc/data/` and verify affected generation behavior.
- Add or edit selectable UI presets: update `src/js/data/` and validate the relevant page controls.
- Add a new forme or move edge case: update catalog data and then verify mechanics functions that consume the flag.

## Verification Checklist After Data Edits

- Confirm dropdowns still populate with expected labels.
- Run representative calculations across at least two generations.
- Check one special case that depends on the edited entry.
- Confirm output text still describes the result correctly.
