# Raidalculate Page Deep Dive

This document explains how the **Pokemon Raid Finder** page works end to end. In the repo it is implemented as `src/raidalculate.html` plus `src/js/raidalculate_controls.js`, on top of the same damage engine and shared UI helpers as the main calculator.

## Purpose

Raidalculate helps you answer raid style questions in bulk:

- **Attack mode (`findAttacker`)**: Given a raid boss you configure in panel **p1**, which species can hit it super effectively with strong moves, and how hard?
- **Defend mode (`findDefender`)**: Which species can tank that boss's moves reasonably well?

The page does **not** use imported Smogon sets for candidate species. It builds a candidate pool from **PokeMMO monster data** (`monsters.json`) plus the main calc **pokedex** for real battle stats.

## Files and Dependencies

| Piece | Role |
| ----- | ---- |
| `src/raidalculate.html` | Page shell: same general layout as the calc (p1 Pokemon panel, field controls, results table `#holder-2`). Loads calc scripts, `shared_controls.js`, then `raidalculate_controls.js`. |
| `src/js/raidalculate_controls.js` | All Raidalculate specific logic: data load, candidate generation, `performCalculations`, DataTable, filters, debug UI. |
| `src/js/shared_controls.js` | Form bindings, `createPokemon`, `createField`, stat recalculation, raid boss toggle visibility, etc. |
| `src/js/data/monsters.json` | Fetched at runtime (see below). Learnsets, typings, rough offensive stats, obtainability, evolutions. |
| `src/calc/*` | Engine: `calc.calculate`, `Pokemon`, `Move`, `Field`, generation mechanics. |

Script order in `raidalculate.html` ends with `shared_controls.js` then `raidalculate_controls.js`, so the global `performCalculations` defined in `raidalculate_controls.js` is the one this page uses.

## High Level User Flow

1. Configure the **raid boss** in **p1** (species, set or custom stats, moves, item, ability, field, weather, etc.), same as the main calculator’s left side.
2. Optionally set **Attack** vs **Defend** mode, nature profiles, boss damage toggle, defender items, then click **Raidalculate**.
3. The tool computes weaknesses of the boss, derives a **move pool**, loads `monsters.json`, scores species that learn those moves, fills the results table.
4. Use **ColVis**, **Filter Move**, **Speed** (faster or slower than boss), and column sort to narrow results.
5. Hover a name for a Pokepaste style summary; click to copy it.

## Initialization (`$(document).ready` in `raidalculate_controls.js`)

On load the script:

1. Parses `?mode=` from the URL. If present and not `one-vs-all` or `all-vs-one`, it **redirects** to `index.html` with the same query (this page only supports those two mode strings for compatibility with shared code paths).
2. Sets `window.mode` default to `one-vs-all` when absent.
3. Checks `#raid-format` and `#tookDamageL` to align with expected raid defaults.
4. Renames the first results column header to **Attacker** or **Defender** depending on `mode` (mostly legacy from the shared table layout; Raidalculate rows are attacker species or defender tanks depending on **Raid mode**, not this `window.mode` flag).
5. Calls `calcDTDimensions()` which briefly constructs a throwaway DataTable to measure layout, then computes `dtHeight` and `dtWidth` for the real table.
6. Calls `constructDataTable()` then `placeBsBtn()` (injects controls above the table).
7. Binds raid mode UI (`raidBindModeToggleUI`, `raidSyncModeUI`).
8. Hooks boss side inputs so **Speed** total mod in p1 stays updated (`raidUpdateP1SpeedTotalMod`).
9. **Injects** `RAID_CUSTOM_SETS` entries into `window.setdex` so named raid sets appear in the set dropdown.
10. Binds **custom raid set** application when a raid set is chosen: overwrites base stats, IVs, EVs in the form and triggers normal stat recalculation.

## Global State (Raidalculate)

Important module level variables in `raidalculate_controls.js`:

| Symbol | Meaning |
| ------ | ------- |
| `RAID_MONSTERS_RAW` | Parsed `monsters.json` array (after first successful fetch). |
| `RAID_MON_INDEX` | `name ->` entry from raw monsters (types, atk or spa stats from JSON, learnset `Set`, abilities, evolutions, obtainable). |
| `RAID_MON_INDEX_RESOLVED` | `pokedex` resolved name `->` merged entry: combined learnsets across duplicate names, learnsets propagated from base forms to evolutions using `evolutions` edges in JSON. |
| `RAID_LAST` | Last successful **Raidalculate** click output: `targetName`, `targetTypes`, `weaknesses`, `pickedByWeakType`, `pickedMoves`, `setOptions`, optional `targetSpeed`. Drives `performCalculations` and debug popover. |
| `RAID_SETTINGS` | UI backed settings: `mode` (`findAttacker` or `findDefender`), `attackerNatureProfile`, `defenderProfile`, `calcBossDamage`, `useDefItems`. |
| `RAID_ROW_META` | Map from row key to hover or copy metadata (IVs, EVs, nature, move, final stats, etc.). |
| `RAID_FORCE_PRESET` | During a calc loop, `{ item: 'Choice Band' \| 'Choice Specs' }` or `null` to force item and nature branch. |
| `RAID_SPEED_FILTER` | `''`, `'faster'`, or `'slower'` for client side DataTables filtering vs boss speed. |

## Data: `monsters.json`

`raidEnsureMonstersLoaded()` fetches `js/data/monsters.json` with `cache: 'no-store'`, then:

- Builds `RAID_MON_INDEX`, skipping entries with `obtainable === false`.
- Maps each monster name through `raidResolveSpeciesName` to align with `pokedex` keys (gender symbols, Nidoran, case, etc.).
- Merges duplicate resolved keys (max attack or special attack stats, union learnsets and abilities).
- **Propagates learnsets** from pre evolution to evolution using the JSON `evolutions` lists so egg moves on bases count for fully evolved raid candidates.

`raidGetLearnableMovesForMon` filters a move list to moves that appear in the resolved mon’s learnset, with **form extras** from `raidExtraFormMoves` (Rotom appliances) and fallback from `Species-Form` to `Species` when the index has no form key.

## Step 1: Weaknesses of the Boss

When you click **Raidalculate**, the handler builds `createField()` and `createPokemon($('#p1'))` as `selected`.

- Collects defender types, then for every attacking type in `typeChart` computes the **type effectiveness product** against those types.
- Respects **inverse battle** if the field says so (`field.isInverseTypes`): multipliers are inverted per cell.
- Keeps types with combined multiplier **strictly greater than 1**, sorted by multiplier descending.

If there are no weaknesses, the user sees a popover and the run stops.

## Step 2: Move Pool (Super Effective Coverage)

For each weakness type `wType`, the code scans the global `moves` catalog:

- Skips `RAID_MOVE_EXCLUSIONS` (legendary signature style moves that are not practical for this workflow).
- Skips **Dream Eater** unless the boss is asleep (uses `selected.status`).
- Requires move type to equal `wType`, non status, base power after heuristics `> 0`.
- **BP adjustments for ranking only** (not necessarily identical to every in battle case): Fling 130, Assurance 120, Brine double under half HP, Hex double on status, Acrobatics double with item, multihit 2 to 5 moves scaled by `3.1` average factor.

Within each weakness type it keeps the **top 4 physical** and **top 4 special** moves by that adjusted BP, stored in `pickedByWeakType`. All picks are concatenated and **deduplicated by move name** into `pickedMoves`.

Then `raidAugmentPickedMoves` runs: if any picked move is Fighting type, **Sacred Sword** is added to the pool if missing (so Fighting weak bosses consider it even if it was not in the top BP slice).

## Step 3: Candidate Species List

Still inside the click handler, after `monsters.json` is loaded:

- Iterates every resolved monster in `RAID_MON_INDEX_RESOLVED` that is obtainable, not in `RAID_MON_EXCLUSIONS`, and learns **at least one** move from the augmented `pickedMoves` list.
- **Scores** each mon by the maximum over its learnable picks of `(move.bp or 0) * stab * (atk or spa from JSON stats)` where stab is 1.5 if the move type matches a mon type from the index.
- **Attack mode**: sort by score descending, **keep top 300**, drop `_score` from objects. Each option is `{ id: monName }` where `id` is the resolved species string.
- **Defend mode**: sort options **alphabetically by id** (full pool for scoring branch), then append any resolved index key that was missing from that list (still respecting exclusions and obtainability) so tanks that learn none of the offensive pool still appear.

The result is stored as `RAID_LAST.setOptions`.

## Step 4: `performCalculations()` (Matrix Build)

This function is also what runs when the table recalculates after some UI actions, but it **requires** `RAID_LAST.setOptions` from a prior Raidalculate click. Otherwise it shows a popover asking you to click **Raidalculate** first.

### Mode and form expansion

- Reads `RAID_SETTINGS.mode`.
- **Defend mode**: expands each `setOptions` id with `raidExpandPokedexForms` (base plus all `pokedex` keys that are `Base-` prefixed forms), skips exclusions, dedupes.
- **Attack mode**: always includes the resolved base id; if the species has alternate **typing** forms in the dex, adds those form ids too (so type changing forms appear as separate rows when relevant).

### Boss damage columns

- Reads `#raid-setting-bossdmg`. Boss to attacker damage columns (indexes 4 to 7) are **always on in Defend mode**; in Attack mode they follow the checkbox.
- Updates header text for boss moves via `raidUpdateBossMoveHeaders`.

### Defend mode row generation

For each candidate tank species:

- Boss is fresh `createPokemon($('#p1'))` per row iteration; field `createField()`.
- Classifies boss moves into physical or special to decide defender EV profiles: if the boss mixes both, **two rows** are emitted per species: **Def Tank** and **SpD Tank**.
- **Ability**: collects abilities from pokedex and monsters index, then `raidPickBestDefenderAbility` scores immunities and common damage reducers against boss move types.
- **Profile**: `raidApplyDefProfile` with `RAID_SETTINGS.defenderProfile` (`def_slow`, `def_neutral`, `def_speed`) setting nature, EVs, and Speed IV 0 for minus Speed natures.
- **Items**: if `useDefItems`, `raidApplyDefItems` sets **Eviolite** for NFE per pokedex `nfe` or `evos`, else **Assault Vest** if any boss move is special.
- Level matches the boss.
- **Worst hit** percent: max over boss moves of max damage percent of tank HP.
- Columns 4 to 7: each boss slot shows min to max percent for boss attacking the tank.
- Hidden sort key: `worstPct` ascending so best tanks float to the top after default sort.

### Attack mode row generation

Shared for all rows:

- `raidFieldAtk = createField()` then `raidDefenderAtk = createPokemon($('#p1'))` then **`raidFieldAtk.swap()`** so the internal attacker or defender side matches the convention the rest of the matrix expects (boss as defender in field ordering for outgoing attacker damage).
- Rivalry on either side is neutralized by forcing gender **N** where applicable.

Per species (and per Choice item branch):

- If the current boss name equals `RAID_LAST.targetName` and `RAID_MON_INDEX` exists, the code may set `presets` to one or two forced items: **Choice Band** and or **Choice Specs** depending on whether learnable moves from the pool include physical, special, or both.
- For each preset, sets Adamant or Modest for forced choice items, `raidApplyPresetEVs` (252 in attacking stat and Speed, HP 4, Speed IV depends on global attacker nature profile), matches **level** to boss, `raidRebuildPokemon`.
- For each **learnable** move from the augmented picked list:

  - **Superpower and Close Combat**: if both are learnable, only **one** combined row is produced; the calc uses Close Combat if both exist else Superpower.
  - Filters by forced preset category when a Choice item branch is active.
  - **Ability loop**: for each candidate ability, clones or reuses attacker, applies `raidApplyAtkProfileToPokemon` from `RAID_SETTINGS.attackerNatureProfile` (`atk_slow` Brave or Quiet with 252 HP investment and 0 Speed IV, `atk_neutral` Adamant or Modest, `spe_neutralatk` Jolly or Timid), sets item via `bestItemForMoveLocal` (Acrobatics gem, Fling iron ball, Light Ball Pikachu, Technician multihit Loaded Dice, Power Herb Sky Attack, else forced preset or Choice Band or Specs by category), rebuilds, applies multihit `hits` for Skill Link or Loaded Dice, runs **`calc.calculate(gen, tmpAtk, defender, moveObj, field)`**.
  - Picks the ability or item combination that maximizes **max** damage in range for that move row.
  - Row shows min to max damage percent of boss HP for attacker to boss.
  - If boss damage is enabled, for each boss move temporarily **`field.swap()`**, runs boss as attacker vs this row’s attacker as defender, swaps back, fills percent of attacker HP.

**Speed column**: uses `calc.getFinalSpeed` when available with a cached field from `raidGetSpeedFieldSwappedCached` for consistency with filters.

Hidden sort key is **max damage** (not percent) descending for Attack mode.

### Sorting, table update, filters

- Sorts `dataSet` by hidden key (descending max damage for Attack, ascending worst hit for Defend).
- Pops hidden keys, `table.rows.add(dataSet)`.
- Applies regex anchored filter on column 1 if **Filter Move** is set.
- Orders by damage column ascending or descending per mode, then `draw()`.
- Rebinds hover and click popovers on `.raid-mon` for Pokepaste block and clipboard copy.

## UI Injected by `placeBsBtn`

Inserted before `#holder-2_wrapper` content:

- **Raidalculate** button (async click pipeline above).
- **Info** button: hover popover summarizing `RAID_LAST` (target, weaknesses, augmented move pool, added moves like Sacred Sword, per weakness physical or special lists, attacker count).
- **Mode**: Attack vs Defend radio pair updating `RAID_SETTINGS.mode` and toggling visibility of move filter, boss dmg row, attacker nature row vs defender nature and def items row.
- **Boss dmg**: checkbox mirrored into `RAID_SETTINGS.calcBossDamage` (Attack mode only in the row visibility logic).
- **Nature** (Attack): maps to `attackerNatureProfile`.
- **Def Nature** and **Def Items** (Defend): `defenderProfile`, `useDefItems`.

**Inline filters** (moved into the DataTables filter bar): **Filter Move** select populated from `pickedMoves` (with Close Combat and Superpower merged label when both exist), **Speed** select wired to `RAID_SPEED_FILTER` and a DataTables `ext.search` hook comparing row speeds to `raidGetTargetSpeed()` from the current boss.

`constructDataTable` configures DataTables with **ColVis**, custom sort type `damage100` for percent strings, hides type columns 9 and 10 by default, starts with boss columns 4 to 7 hidden until toggled or Defend mode. Patches ColVis button DOM for click handling. Injects small CSS blocks for dark theme readability.

## `performCalculations` vs Main Calculator

On this page, `performCalculations` **never** reads the p2 side for attacker sets. It only uses:

- `RAID_LAST` for candidates and moves.
- **p1** for the boss (or for field inputs that `createField` reads globally).

Changing the boss and clicking table only actions does not repopulate `RAID_LAST`; you need **Raidalculate** again to refresh the candidate list and move pool for a new species.

## Custom Raid Boss Sets (`RAID_CUSTOM_SETS`)

Hardcoded in `raidalculate_controls.js` for specific raid encounters (Cobalion, Excadrill, Terrakion, Virizion, Keldeo). On set selector change, if the chosen set exists in `RAID_CUSTOM_SETS`, the script overwrites base stats and IV or EV inputs to match the raid, then triggers normal HP and stat total updates.

## Exclusion Lists

- **`RAID_MOVE_EXCLUSIONS`**: Moves excluded from the weakness move scan.
- **`RAID_MON_EXCLUSIONS`**: Species excluded from candidate generation (unobtainable or disallowed in this tool’s scope).

## Performance Notes

- Attack mode caps at **300** species but each species can produce many rows (per move, per Choice branch, per ability optimization).
- **Boss dmg** doubles work for Attack mode (extra reverse direction calcs per row).
- The Raidalculate handler uses **`setTimeout(..., 0)`** before `performCalculations` so the browser can paint the **Calculating** button state; work is still synchronous on the main thread.

## Related Documentation

- [UI Flow Deep Dive](./ui-flow-deep-dive.md) for shared controller patterns.
- [Architecture Overview](./architecture-overview.md) for how pages relate.
- [Testing and Validation](./testing-and-validation.md) mentions manual checks for this page.
