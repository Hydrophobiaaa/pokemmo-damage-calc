# Testing and Validation

## Purpose

This document describes available tests and a practical manual validation flow for this repository.

## Automated Test Files

Test folder: `src/calc/test/`

Current files:

- `calc.test.js`
- `data.test.js`
- `move.test.js`
- `pokemon.test.js`
- `stats.test.js`
- `utils.test.js`
- `gen.js`
- `helper.js`

These tests focus on engine behavior, model correctness, data integrity, and utility behavior.

## Build and Script Reality

No root `package.json` scripts are present in this snapshot, so there is no standard one command test runner exposed from the repository root.

Use this as a code navigation and regression reference:

- Keep test files in sync with engine changes.
- Run project specific local workflow if your environment includes external runner wiring.

## Manual Validation Checklist

Use this list after engine, UI, or data changes:

1. Open `src/index.html` and verify left vs right move calculations update on input changes.
2. Open `src/randoms.html` and verify random set interactions still render valid move results.
3. Open `src/oms.html` and verify mode specific output updates without UI errors.
4. Open `src/honkalculate.html` and verify table outputs and comparisons populate correctly.
5. Open `src/raidalculate.html` and verify candidate generation and ranking output logic.
6. Spot check at least one matchup in Gen 3 and one in Gen 9 to confirm generation router behavior.

## High Risk Areas

- Generation specific mechanics files in `src/calc/mechanics/`.
- Shared helper logic in `src/calc/mechanics/util.js`.
- Form to model conversion in `src/js/shared_controls.js`.
- Bulk calculation loops in `src/js/raidalculate_controls.js` and `src/js/honkalculate_controls.js`.

## Recommended Change Discipline

- Keep one behavior change per commit when possible.
- Pair mechanics edits with focused tests or manual proof cases.
- Verify output descriptions, not only raw numbers, because users consume both.
