# Calc Engine Deep Dive

## Purpose

This document explains where calculations happen, how generation routing works, and how model objects move through the engine.

## Public Surface

Main entry point: `src/calc/index.js`

Key exports:

- `calculate(gen, attacker, defender, move, field)`
- `Pokemon`, `Move`, `Field`, `Side`, `Result`
- `Generations` and static data exports
- stat helpers from `src/calc/stats.js`

The `calculate` wrapper accepts either a generation number or a generation object and normalizes it before delegating.

## Generation Router

Core router: `src/calc/calc.js`

`MECHANICS[gen.num]` dispatches to a generation specific calculator:

- `calculateRBYGSC` in `src/calc/mechanics/gen12.js`
- `calculateADV` in `src/calc/mechanics/gen3.js`
- `calculateDPP` in `src/calc/mechanics/gen4.js`
- `calculateBWXY` in `src/calc/mechanics/gen56.js`
- `calculateSMSSSV` in `src/calc/mechanics/gen789.js`

Before dispatch, attacker, defender, move, and field are cloned. This keeps calculation calls side effect safe for repeated UI runs.

## Domain Models

### `Pokemon` (`src/calc/pokemon.js`)

- Holds species, level, stats, EVs, IVs, boosts, status, item, ability, and move list.
- Provides clone behavior so caller mutations do not leak into mechanics runs.

### `Move` (`src/calc/move.js`)

- Holds move metadata such as base power, category, priority, hits, type, and special flags.
- Carries generation specific move interpretation during calculation.

### `Field` and `Side` (`src/calc/field.js`)

- Represent weather, terrain, and side conditions such as screens, hazards, and support effects.
- Give mechanics files a normalized battle context.

### `Result` (`src/calc/result.js`)

- Stores computed damage rolls and generated descriptions.
- Bridges raw roll output and readable UI text.

## Mechanics Pipeline

Most generation files follow this sequence:

1. Validate edge cases and immunity rules.
2. Resolve move base power with conditional effects.
3. Resolve attack and defense effective stats.
4. Compute base damage.
5. Apply final modifiers and random roll distribution.
6. Return a `Result` object with descriptive metadata.

`src/calc/mechanics/util.js` contains shared helpers used across generations for modifier logic and repeated formulas.

## KO and Description Model

`src/calc/desc.js` is not only formatting glue. It also computes KO chance text and applies hazard and end of turn assumptions used in output summaries.

## Data Interface

The engine reads generation scoped catalogs from `src/calc/data/` through `Generations.get(gen)`.

Core catalogs include:

- `abilities.js`
- `items.js`
- `moves.js`
- `species.js`
- `types.js`
- `natures.js`

## Common Change Paths

- Modify one generation only: update the matching `gen*.js` mechanics file and keep utility calls consistent.
- Modify multi generation rules: update `src/calc/mechanics/util.js` and check each generation caller path.
- Change model shape: update model classes and validate all constructors and clone logic.
- Change KO wording or KO assumptions: update `src/calc/desc.js` and verify page outputs in all modes.
