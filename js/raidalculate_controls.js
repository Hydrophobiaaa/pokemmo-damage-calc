// --- Raidalculate cached data (loaded once) ---
var RAID_MONSTERS_RAW = null;
var RAID_MON_INDEX = null;   // name -> { name, types:[..], stats:{atk,spa}, learnset:Set, abilities:[..] }
var RAID_MON_INDEX_RESOLVED = null; // resolvedName -> merged mon entry
var RAID_LAST = null;        // last computed raidalculate result
var RAID_FORCE_PRESET = null; // null | { item: 'Choice Band' | 'Choice Specs' }
var RAID_SPEED_FILTER = ""; // "" | "faster" | "slower"

// --- Raidalculate per-row metadata for hover popups ---
var RAID_ROW_META = {}; // raidKey -> { base, ivs, evs, stats }

function raidEscHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function raidNormName(s) {
    return String(s || '').trim();
}

function raidUniq(arr) {
    return Array.from(new Set((arr || []).filter(Boolean)));
}

function raidGetTargetSpeed() {
    // Prefer cached target speed from last Raidalculate run
    if (RAID_LAST && typeof RAID_LAST.targetSpeed === "number" && !isNaN(RAID_LAST.targetSpeed)) return RAID_LAST.targetSpeed;

    // Fallback: read from current P1
    try {
        var p = createPokemon($("#p1"));
        var s = (p && p.rawStats && p.rawStats.spe != null) ? Number(p.rawStats.spe)
            : (p && p.stats && p.stats.spe != null) ? Number(p.stats.spe)
                : NaN;
        return isNaN(s) ? null : s;
    } catch (e) {
        return null;
    }
}

function raidEnsureSpeedFilterHook() {
    if ($.fn.dataTable.ext.search._raidSpeedHook) return;
    $.fn.dataTable.ext.search._raidSpeedHook = true;

    $.fn.dataTable.ext.search.push(function (settings, data) {
        // only our table
        if (!table || settings.nTable !== table.table().node()) return true;

        if (!RAID_SPEED_FILTER) return true;

        var t = raidGetTargetSpeed();
        if (t == null) return true;

        // Speed column index = 4
        var sp = Number(data[4]);
        if (isNaN(sp)) return true;

        if (RAID_SPEED_FILTER === "faster") return sp > t;
        if (RAID_SPEED_FILTER === "slower") return sp < t;
        return true;
    });
}

function raidBindSpeedFilter() {
    $(document)
        .off("change.raidspeed", "#raid-speed-filter")
        .on("change.raidspeed", "#raid-speed-filter", function () {
            RAID_SPEED_FILTER = $(this).val() || "";
            if (table) table.draw(); // filter only, no recalc
        });
}

// monsters.json uses uppercase like "GRASS"; calc uses "Grass"
function raidMonsterTypesFromJson(typesArr) {
    var out = [];
    for (var i = 0; i < (typesArr || []).length; i++) {
        var t = raidNormName(typesArr[i]);
        if (!t) continue;
        t = t.toLowerCase();
        out.push(t.charAt(0).toUpperCase() + t.slice(1));
    }
    return raidUniq(out);
}

function raidBuildLearnset(mon) {
    var set = new Set();
    var ms = mon && mon.moves;
    if (!Array.isArray(ms)) return set;
    for (var i = 0; i < ms.length; i++) {
        var mvName = raidNormName(ms[i] && ms[i].name);
        if (mvName) set.add(mvName);
    }
    return set;
}

function raidBuildAbilities(mon) {
    var out = [];
    var abs = mon && mon.abilities;
    if (!Array.isArray(abs)) return out;
    for (var i = 0; i < abs.length; i++) {
        var n = raidNormName(abs[i] && abs[i].name);
        if (n) out.push(n);
    }
    return raidUniq(out);
}

function raidIndexMonsters(monstersArr) {
    var idx = {};
    for (var i = 0; i < (monstersArr || []).length; i++) {
        var m = monstersArr[i];
        var name = raidNormName(m && m.name);
        if (!name) continue;

        var types = raidMonsterTypesFromJson(m.types);
        var stats = (m && m.stats) ? m.stats : {};
        var atk = Number(stats.attack) || 0;
        var spa = Number(stats.sp_attack) || 0;

        idx[name] = {
            name: name,
            types: types,
            stats: {atk: atk, spa: spa},
            learnset: raidBuildLearnset(m),
            abilities: raidBuildAbilities(m),
            obtainable: !!m.obtainable,
        };
    }
    return idx;
}

async function raidEnsureMonstersLoaded() {
    if (RAID_MON_INDEX) return true;
    try {
        var res = await fetch('js/data/monsters.json', {cache: 'no-store'});
        if (!res.ok) throw new Error('HTTP ' + res.status);
        RAID_MONSTERS_RAW = await res.json();
        RAID_MON_INDEX = raidIndexMonsters(RAID_MONSTERS_RAW);
        // Build resolved-name index (resolvedName -> merged mon entry)
        RAID_MON_INDEX_RESOLVED = {};
        for (var k in RAID_MON_INDEX) {
            var mon = RAID_MON_INDEX[k];
            if (!mon) continue;
            var resolved = raidResolveSpeciesName(mon.name);
            if (!resolved) continue;

            var existing = RAID_MON_INDEX_RESOLVED[resolved];
            if (!existing) {
                RAID_MON_INDEX_RESOLVED[resolved] = {
                    name: resolved,
                    types: mon.types ? mon.types.slice() : [],
                    stats: {atk: mon.stats.atk || 0, spa: mon.stats.spa || 0},
                    learnset: new Set(Array.from(mon.learnset || [])),
                    abilities: (mon.abilities || []).slice(),
                    obtainable: mon.obtainable,
                };
            } else {
                // merge types (prefer existing; if empty, take)
                if ((!existing.types || !existing.types.length) && mon.types) existing.types = mon.types.slice();
                // merge stats (take max)
                existing.stats.atk = Math.max(existing.stats.atk || 0, mon.stats.atk || 0);
                existing.stats.spa = Math.max(existing.stats.spa || 0, mon.stats.spa || 0);
                // merge learnset
                if (mon.learnset) {
                    mon.learnset.forEach(function (mv) {
                        existing.learnset.add(mv);
                    });
                }
                existing.obtainable = existing.obtainable && mon.obtainable
                // merge abilities
                existing.abilities = raidUniq((existing.abilities || []).concat(mon.abilities || []));
            }
        }
        return true;
    } catch (e) {
        return false;
    }
}

function raidPopover(msg, width) {
    $(".bs-btn").popover({
        html: true,
        content: '<span style="color:#000; white-space:nowrap; display:block;">' + msg + '</span>',
        placement: "right",
        template:
            '<div class="popover" role="tooltip" style="width:' + (width || 240) + 'px;">' +
            '<div class="arrow"></div><div class="popover-content" style="white-space:nowrap;"></div></div>',
    }).popover('show');
    setTimeout(function () {
        $(".bs-btn").popover('destroy');
    }, 1350);
}

function raidGetLearnableMovesForMon(monName, moveList) {
    if (!RAID_MON_INDEX_RESOLVED) return [];
    var key = raidResolveSpeciesName(monName);
    var mon = RAID_MON_INDEX_RESOLVED[key];
    if (!mon || !mon.learnset) return [];
    var out = [];
    for (var i = 0; i < (moveList || []).length; i++) {
        var mv = moveList[i];
        if (!mv || !mv.name) continue;
        if (mon.learnset.has(mv.name)) out.push(mv);
    }
    return out;
}

// Helper: resolve monsters.json names to calc/pokedex names
function raidResolveSpeciesName(name) {
    var n = raidNormName(name);
    if (!n) return n;
    if (pokedex && pokedex[n]) return n;

    // Common gender symbol conversions
    var n1 = n.replace(/♀/g, "-F").replace(/♂/g, "-M");
    if (pokedex && pokedex[n1]) return n1;

    // Some datasets use these variants
    var n2 = n.replace(/♀/g, " F").replace(/♂/g, " M");
    if (pokedex && pokedex[n2]) return n2;

    var n3 = n.replace(/♀/g, "Female").replace(/♂/g, "Male");
    if (pokedex && pokedex[n3]) return n3;

    // Nidoran special-case (some sources include symbols, calc often uses -F/-M)
    if (n.indexOf("Nidoran") === 0) {
        if ((n.indexOf("♀") !== -1 || /-F$/.test(n1)) && pokedex && pokedex["Nidoran-F"]) return "Nidoran-F";
        if ((n.indexOf("♂") !== -1 || /-M$/.test(n1)) && pokedex && pokedex["Nidoran-M"]) return "Nidoran-M";
    }
    // Fallback: try case-insensitive match
    if (pokedex) {
        var keys = Object.keys(pokedex);
        var upper = n.toUpperCase();
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].toUpperCase() === upper) return keys[i];
        }
    }
    return n;
}

function raidApplyPresetEVs(attacker) {
    if (!attacker) return;
    attacker.evs = attacker.evs || {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
    attacker.evs.hp = 4;
    attacker.evs.def = 0;
    attacker.evs.spd = 0;
    attacker.evs.spe = 252;
    if (attacker.nature === "Adamant")
        attacker.evs.atk = 252;
    if (attacker.nature === "Modest")
        attacker.evs.spa = 252;
}


// Helper: create a raid attacker/defender by species name (plain, no parens)
function raidCreatePokemonByName(pokemonName) {
    var resolvedName = raidResolveSpeciesName(pokemonName);
    var species = pokedex && pokedex[resolvedName];
    if (!species) {
        // Skip unknown/debug entries entirely
        console.log('Skipping unknown pokemon ' + pokemonName);
        return null;
    }

    var ivs = {};
    var evs = {};
    for (var i = 0; i < LEGACY_STATS[gen].length; i++) {
        var stat = legacyStatToStat(LEGACY_STATS[gen][i]);
        ivs[stat] = 31;
        evs[stat] = 0;
    }

    var moves4 = [
        new calc.Move(gen, "(No Move)"),
        new calc.Move(gen, "(No Move)"),
        new calc.Move(gen, "(No Move)"),
        new calc.Move(gen, "(No Move)"),
    ];

    // Ensure default nature is set to Hardy (already the default, but explicitly)
    return new calc.Pokemon(gen, resolvedName, {
        level: defaultLevel || 100,
        ability: (species.abilities && species.abilities[0]) || "",
        abilityOn: true,
        item: "",
        gender: species.gender === "N" ? "N" : "N",
        nature: "Hardy",
        ivs: ivs,
        evs: evs,
        moves: moves4,
        overrides: {
            baseStats: species.bs,
            types: species.types
        }
    });
}


// Helper to build a move object for raid calcs with BP overrides for certain moves
function raidBuildMove(gen, moveName) {
    if (moveName === 'Fling') return new calc.Move(gen, 'Fling', {overrides: {basePower: 130}});
    // Assurance: DO NOT override BP here; calculator handles conditional BP.
    return new calc.Move(gen, moveName);
}

function raidGetBaseStatsNorm(resolvedName) {
    var sp = pokedex && pokedex[resolvedName];
    var bs = sp && sp.bs ? sp.bs : null;
    var out = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
    if (!bs) return out;

    function pick(keyModern, keyLegacy) {
        return Number(
            (bs[keyModern] != null ? bs[keyModern] : undefined) ??
            (bs[keyLegacy] != null ? bs[keyLegacy] : undefined)
        ) || 0;
    }

    out.hp = pick('hp', 'hp');
    out.atk = pick('atk', 'at');
    out.def = pick('def', 'df');
    out.spa = pick('spa', 'sa');
    out.spd = pick('spd', 'sd');
    out.spe = pick('spe', 'sp');

    // Gen 1 has only Special
    if (gen === 1) out.spd = out.spa;
    return out;
}

function raidComputeFinalStats(resolvedName, ivs, evs, level, nature) {
    var base = raidGetBaseStatsNorm(resolvedName);
    var out = {};
    var keys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    var lvl = Number(level || defaultLevel || 100);
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var iv = Number((ivs && ivs[k] != null) ? ivs[k] : 31);
        var ev = Number((evs && evs[k] != null) ? evs[k] : 0);
        var b = Number(base[k] || 0);
        // Use the calc library stat function (same one used elsewhere in this project)
        out[k] = calc.calcStat(gen, k, b, iv, ev, lvl, (k === 'hp') ? undefined : (nature || 'Hardy'));
    }
    if (gen === 1) out.spd = out.spa;
    return out;
}

// Helper: normalize a stats object (rawStats or stats) to { hp, atk, def, spa, spd, spe }
function raidNormStatsObj(stats) {
    var s = stats || {};
    return {
        hp: Number(s.hp ?? s.HP ?? 0),
        atk: Number(s.atk ?? s.at ?? s.Attack ?? 0),
        def: Number(s.def ?? s.df ?? s.Defense ?? 0),
        spa: Number(s.spa ?? s.sa ?? s['Sp. Atk'] ?? s['SpA'] ?? 0),
        spd: Number(s.spd ?? s.sd ?? s['Sp. Def'] ?? s['SpD'] ?? 0),
        spe: Number(s.spe ?? s.sp ?? s.Speed ?? 0)
    };
}

// Helper: extract numeric final stats from a calc.Pokemon (prefer API, normalize legacy keys)
function raidExtractFinalStats(p) {
    if (!p) return {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
    // Prefer methods/known numeric sources
    var hp = 0;
    try {
        if (typeof p.maxHP === 'function') hp = p.maxHP();
        else if (typeof p.curHP === 'number') hp = p.curHP;
    } catch (e) {
    }

    // Other stats come from stats/rawStats; normalize legacy keys
    var s = raidNormStatsObj(p.rawStats || p.stats);
    // Ensure HP is not a broken value from legacy parsing
    if (hp && hp > 0) s.hp = hp;
    return s;
}

// Helper to rebuild a Pokemon so stats are recalculated after EV/nature/item/ability changes
function raidRebuildPokemon(p) {
    if (!p) return p;
    var species = pokedex && pokedex[raidResolveSpeciesName(p.name)];
    return new calc.Pokemon(gen, p.name, {
        level: p.level || defaultLevel || 100,
        ability: p.ability || "",
        abilityOn: true,
        item: p.item || "",
        gender: p.gender || "N",
        nature: p.nature || "Hardy",
        ivs: p.ivs,
        evs: p.evs,
        moves: p.moves,
        overrides: species ? {baseStats: species.bs, types: species.types} : undefined
    });
}


$.fn.DataTable.ColVis.prototype._fnDomColumnButton = function (i) {
    var
        that = this,
        column = this.s.dt.aoColumns[i],
        dt = this.s.dt;

    var title = this.s.fnLabel === null ?
        column.sTitle :
        this.s.fnLabel(i, column.sTitle, column.nTh);

    return $(
        '<li ' + (dt.bJUI ? 'class="ui-button ui-state-default"' : '') + '>' +
        '<label>' +
        '<input type="checkbox" />' +
        '<span>' + title + '</span>' +
        '</label>' +
        '</li>'
    )
        .click(function (e) {
            var showHide = !$('input', this).is(":checked");
            if (e.target.nodeName.toLowerCase() !== "li") {
                showHide = !showHide;
            }

            /* Need to consider the case where the initialiser created more than one table - change the
             * API index that DataTables is using
             */
            var oldIndex = $.fn.dataTableExt.iApiIndex;
            $.fn.dataTableExt.iApiIndex = that._fnDataTablesApiIndex();

            // Optimisation for server-side processing when scrolling - don't do a full redraw
            if (dt.oFeatures.bServerSide) {
                that.s.dt.oInstance.fnSetColumnVis(i, showHide, false);
                that.s.dt.oInstance.fnAdjustColumnSizing(false);
                if (dt.oScroll.sX !== "" || dt.oScroll.sY !== "") {
                    that.s.dt.oInstance.oApi._fnScrollDraw(that.s.dt);
                }
                that._fnDrawCallback();
            } else {
                that.s.dt.oInstance.fnSetColumnVis(i, showHide);
            }

            $.fn.dataTableExt.iApiIndex = oldIndex; /* Restore */

            if ((e.target.nodeName.toLowerCase() === 'input' || e.target.nodeName.toLowerCase() === 'li') && that.s.fnStateChange !== null) {
                that.s.fnStateChange.call(that, i, showHide);
            }
        })[0];
};

/**
 * DataTables custom sort: ascending numeric sort for a value that parses as float.
 * Used for the "damage100" column type.
 */
function raidParseMaxPercent(v) {
    if (v == null) return 0;
    var s = String(v);
    var parts = s.split('-');
    var tail = (parts.length > 1 ? parts[parts.length - 1] : parts[0]);
    tail = tail.replace('%', '').trim();
    var n = parseFloat(tail);
    return isNaN(n) ? 0 : n;
}

$.fn.dataTableExt.oSort['damage100-asc'] = function (a, b) {
    return raidParseMaxPercent(a) - raidParseMaxPercent(b);
};

$.fn.dataTableExt.oSort['damage100-desc'] = function (a, b) {
    return raidParseMaxPercent(b) - raidParseMaxPercent(a);
};


function performCalculations() {
    var attacker, defender;
    // Raidalculate mode: ONLY use generated sets
    if (!RAID_LAST || !RAID_LAST.setOptions || !RAID_LAST.setOptions.length) {
        raidPopover('Click Raidalculate to generate attackers', 320);
        return;
    }
    var setOptions = RAID_LAST.setOptions;
    var dataSet = [];
    var pokeInfo = $("#p1");
    for (var i = 0; i < setOptions.length; i++) {
        if (setOptions[i].id && typeof setOptions[i].id !== "undefined") {
            // Raidalculate: ALWAYS generated attacker vs selected raid target (p1)
            var field = createField();
            attacker = raidCreatePokemonByName(setOptions[i].id);
            if (!attacker) continue; // skip invalid species
            defender = createPokemon(pokeInfo);
            field.swap();
            if (attacker.ability === "Rivalry") {
                attacker.gender = "N";
            }
            if (defender.ability === "Rivalry") {
                defender.gender = "N";
            }
            var presets = [null];

            if (RAID_LAST && defender && defender.name === RAID_LAST.targetName && RAID_MON_INDEX) {
                var learnableAll = raidGetLearnableMovesForMon(attacker.name, RAID_LAST.pickedMoves);
                var hasPhys = false, hasSpec = false;

                for (var lm = 0; lm < learnableAll.length; lm++) {
                    var c = String(learnableAll[lm].category || "").toLowerCase();
                    if (c === "physical") hasPhys = true;
                    if (c === "special") hasSpec = true;
                }
                if (hasPhys && hasSpec) presets = [{item: "Choice Band"}, {item: "Choice Specs"}];
                else if (hasPhys) presets = [{item: "Choice Band"}];
                else if (hasSpec) presets = [{item: "Choice Specs"}];
            }

            for (var pr = 0; pr < presets.length; pr++) {
                RAID_FORCE_PRESET = presets[pr];
                // Set best nature for the forced item preset
                if (RAID_FORCE_PRESET && RAID_FORCE_PRESET.item === "Choice Band") {
                    attacker.nature = "Adamant";
                } else if (RAID_FORCE_PRESET && RAID_FORCE_PRESET.item === "Choice Specs") {
                    attacker.nature = "Modest";
                } else {
                    // If no preset, keep Hardy; calculateMovesOfAttacker will still pick best move/item
                    attacker.nature = attacker.nature || "Hardy";
                }
                raidApplyPresetEVs(attacker);

                //Make sure we're also the same level.
                attacker.level = defender.level;

                // Rebuild so stats update from nature + ev changes
                attacker = raidRebuildPokemon(attacker);

                // For this attacker+preset, show ALL picked moves the mon can learn
                var learnablePicked = raidGetLearnableMovesForMon(attacker.name, RAID_LAST.pickedMoves);
                if (!learnablePicked || !learnablePicked.length) continue;

                // ability candidates (include pool from monsters.json)
                var monInfo = RAID_MON_INDEX_RESOLVED ? RAID_MON_INDEX_RESOLVED[raidResolveSpeciesName(attacker.name)] : null;
                var abilityCandidates = [];
                if (attacker.ability) abilityCandidates.push(attacker.ability);
                if (monInfo && monInfo.abilities && monInfo.abilities.length) {
                    for (var ai = 0; ai < monInfo.abilities.length; ai++) {
                        if (abilityCandidates.indexOf(monInfo.abilities[ai]) === -1) abilityCandidates.push(monInfo.abilities[ai]);
                    }
                }
                if (!abilityCandidates.length) abilityCandidates.push(attacker.ability || "");

                function bestItemForMoveLocal(mv) {
                    if (mv.name === "Acrobatics") return "Flying Gem";
                    if (mv.name === "Fling") return "Iron Ball";
                    if (RAID_FORCE_PRESET && RAID_FORCE_PRESET.item) return RAID_FORCE_PRESET.item;
                    var c = String(mv.category || "").toLowerCase();
                    if (c === "physical") return "Choice Band";
                    if (c === "special") return "Choice Specs";
                    return attacker.item || "";
                }

                var wantCat = null;
                if (RAID_FORCE_PRESET && RAID_FORCE_PRESET.item === "Choice Band") wantCat = "physical";
                else if (RAID_FORCE_PRESET && RAID_FORCE_PRESET.item === "Choice Specs") wantCat = "special";

                var rowBase = setOptions[i].id;
                if (RAID_FORCE_PRESET && RAID_FORCE_PRESET.item) rowBase += " [" + RAID_FORCE_PRESET.item + "]";

                for (var mi = 0; mi < learnablePicked.length; mi++) {
                    var mv = learnablePicked[mi];
                    if (!mv || !mv.name) continue;
                    var catLc = String(mv.category || "").toLowerCase();
                    if (wantCat && catLc !== wantCat) continue;

                    // best ability for this specific move
                    var best = null;
                    for (var ab = 0; ab < abilityCandidates.length; ab++) {
                        var tmpAtk = attacker.clone ? attacker.clone() : attacker;
                        tmpAtk.ability = abilityCandidates[ab];
                        if (tmpAtk.ability === "Rivalry") tmpAtk.gender = "N";
                        tmpAtk.item = bestItemForMoveLocal(mv);
                        // Rebuild so stats/item/ability are consistent
                        tmpAtk = raidRebuildPokemon(tmpAtk);

                        var moveObj = raidBuildMove(gen, mv.name);
                        var r = calc.calculate(gen, tmpAtk, defender, moveObj, field);
                        var range = r.range();
                        var maxDmg = range[1];
                        if (!best || maxDmg > best.maxD) {
                            best = {
                                tmpAtk: tmpAtk,
                                r: r,
                                minD: range[0],
                                maxD: range[1]
                            };
                        }
                    }

                    if (!best) continue;

                    var minPercentage = Math.floor(best.minD * 1000 / defender.maxHP()) / 10;
                    var maxPercentage = Math.floor(best.maxD * 1000 / defender.maxHP()) / 10;

                    // Store hover meta for this specific row
                    var resolvedForMeta = raidResolveSpeciesName(attacker.name);
                    var ivsMeta = (best.tmpAtk && best.tmpAtk.ivs) ? best.tmpAtk.ivs : attacker.ivs;
                    var evsMeta = (best.tmpAtk && best.tmpAtk.evs) ? best.tmpAtk.evs : attacker.evs;
                    var lvlMeta = (best.tmpAtk && best.tmpAtk.level) ? best.tmpAtk.level : (attacker.level || defaultLevel || 100);
                    var natMeta = (best.tmpAtk && best.tmpAtk.nature) ? best.tmpAtk.nature : (attacker.nature || 'Hardy');
                    // Unique key per attacker + move + preset + ability
                    var raidKey = setOptions[i].id + '|' + mv.name + '|' + (RAID_FORCE_PRESET && RAID_FORCE_PRESET.item ? RAID_FORCE_PRESET.item : '') + '|' + (best.tmpAtk && best.tmpAtk.ability ? best.tmpAtk.ability : '');
                    var ivsNorm = raidNormStatsObj(ivsMeta);
                    var evsNorm = raidNormStatsObj(evsMeta);
                    RAID_ROW_META[raidKey] = {
                        name: resolvedForMeta,
                        item: (best.tmpAtk && best.tmpAtk.item) ? best.tmpAtk.item : (attacker.item || ""),
                        ability: (best.tmpAtk && best.tmpAtk.ability) ? best.tmpAtk.ability : (attacker.ability || ""),
                        nature: natMeta || (attacker.nature || "Hardy"),
                        level: lvlMeta || (attacker.level || defaultLevel || 100),
                        move: String(mv.name).replace("Hidden Power", "HP"),
                        base: raidGetBaseStatsNorm(resolvedForMeta),
                        ivs: ivsNorm,
                        evs: evsNorm,
                        stats: raidComputeFinalStats(resolvedForMeta, ivsNorm, evsNorm, lvlMeta, natMeta)
                    };

                    var displayName = rowBase;
                    // If the move forces a different item (e.g. Fling -> Iron Ball), show that in the name.
                    if (best.tmpAtk && best.tmpAtk.item && RAID_FORCE_PRESET && RAID_FORCE_PRESET.item && best.tmpAtk.item !== RAID_FORCE_PRESET.item) {
                        displayName = setOptions[i].id + ' [' + best.tmpAtk.item + ']';
                    }
                    var attackerCell = '<span class="raid-mon" data-raidkey="' + raidEscHtml(raidKey) + '">' + raidEscHtml(displayName) + '</span>';

                    var data = [attackerCell];
                    // 1 Move
                    var moveLabel = String(mv.name).replace("Hidden Power", "HP");
                    data.push(moveLabel);
                    // 2 Damage%
                    data.push(minPercentage + " - " + maxPercentage + "%");
                    // 3 Ability
                    data.push(best.tmpAtk.ability || "");
                    // 4 Speed
                    var spdObj = raidNormStatsObj((best.tmpAtk && (best.tmpAtk.rawStats || best.tmpAtk.stats)) ? (best.tmpAtk.rawStats || best.tmpAtk.stats) : (attacker.rawStats || attacker.stats));
                    data.push(spdObj.spe != null ? spdObj.spe : "");
                    // 5 Type1
                    data.push(attacker.types[0] || "");
                    // 6 Type2
                    data.push(attacker.types[1] || "");
                    // hidden sort key
                    data.push(best.maxD);
                    dataSet.push(data);
                }
            }
            RAID_FORCE_PRESET = null;
        }
    }
    var pokemon = defender;
    if (pokemon) pokeInfo.find(".sp .totalMod").text(pokemon.stats.spe);
    // Sort dataSet descending by highestDamage (last column)
    dataSet.sort(function (a, b) {
        return (Number(b[b.length - 1]) || 0) - (Number(a[a.length - 1]) || 0);
    });
    // Drop the hidden sort key column before rendering
    for (var di = 0; di < dataSet.length; di++) {
        dataSet[di].pop();
    }
    table.rows.add(dataSet);

// Apply move filter BEFORE draw
    var cur = $('#raid-move-filter').val();
    if (cur) table.column(1).search('^' + raidEscapeRegex(cur) + '$', true, false);
    else table.column(1).search('');

    // Then sort + draw once
    table.order([[2, 'desc']]).draw(); // column 2 is Damage%

    // Hover on attacker name: Pokepaste-style block with Final Stats
    $('#holder-2 tbody')
        .off('mouseenter.raidmon mouseleave.raidmon click.raidmon', 'span.raid-mon')
        .on('mouseenter.raidmon', 'span.raid-mon', function () {
            var k = $(this).attr('data-raidkey');
            var m = RAID_ROW_META[k];
            if (!m) return;
            var header = m.name || '';
            if (m.item) header += ' @ ' + m.item;
            var lines = [];
            lines.push(header);
            if (m.ability) lines.push('Ability: ' + m.ability);
            lines.push(raidFmtSlashStats('IVs', m.ivs, false));
            lines.push(raidFmtSlashStats('EVs', m.evs, true));
            if (m.nature) lines.push(String(m.nature) + ' Nature');
            if (m.move) lines.push('- ' + m.move);
            lines.push('');
            lines.push(raidFmtSlashStats('Final Stats', m.stats, false));

            var text = lines.join('\n');
            var html = '<pre style="margin:0; font-family:monospace; white-space:pre;">' + raidEscHtml(text) + '</pre>';

            $(this).popover({
                html: true,
                content: html,
                placement: 'right',
                trigger: 'manual',
                container: 'body',
                template: '<div class="popover raid-pokepaste-popover" role="tooltip" style="width:820px; max-width:800px;">' +
                    '<div class="arrow"></div><div class="popover-content" style="white-space:pre; overflow:visible;"></div></div>'
            }).popover('show');
        })
        .on('mouseleave.raidmon', 'span.raid-mon', function () {
            $(this).popover('destroy');
        })
        .on('click.raidmon', 'span.raid-mon', function () {
            var k = $(this).attr('data-raidkey');
            var m = RAID_ROW_META[k];
            if (!m) return;

            var header = m.name || '';
            if (m.item) header += ' @ ' + m.item;

            var lines = [];
            lines.push(header);
            if (m.ability) lines.push('Ability: ' + m.ability);
            lines.push(raidFmtSlashStats('IVs', m.ivs, false));
            lines.push(raidFmtSlashStats('EVs', m.evs, true));
            if (m.nature) lines.push(String(m.nature) + ' Nature');
            if (m.move) lines.push('- ' + m.move);
            lines.push('');
            lines.push(raidFmtSlashStats('Final Stats', m.stats, false));

            var text = lines.join('\n');

            // Enhanced: Copy to clipboard and show "Copied!" popup
            var copyPromise;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                copyPromise = navigator.clipboard.writeText(text);
            } else {
                copyPromise = new Promise(function (resolve) {
                    var ta = document.createElement('textarea');
                    ta.value = text;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    resolve();
                });
            }

            var $el = $(this);
            copyPromise.then(function () {
                var offset = $el.offset();
                var $toast = $('<div class="raid-copy-toast">Copied!</div>');
                $('body').append($toast);

                $toast.css({
                    position: 'absolute',
                    top: offset.top - 28,
                    left: offset.left,
                    padding: '4px 8px',
                    'font-size': '12px',
                    'border-radius': '4px',
                    'z-index': 9999,
                    'background': 'rgba(0,0,0,0.8)',
                    color: '#fff',
                    'pointer-events': 'none',
                    opacity: 0
                });

                $toast.animate({opacity: 1}, 120);
                setTimeout(function () {
                    $toast.animate({opacity: 0}, 200, function () {
                        $toast.remove();
                    });
                }, 900);
            });
        });

// Helper: format IVs/EVs/Final Stats in Pokepaste slash format
    function raidFmtSlashStats(prefix, obj, onlyNonZero) {
        var o = obj || {};
        var parts = [];

        function add(k, label) {
            var v = (o[k] != null) ? Number(o[k]) : 0;
            if (onlyNonZero && (!v || v === 0)) return;
            parts.push(v + ' ' + label);
        }

        add('hp', 'HP');
        add('atk', 'Atk');
        add('def', 'Def');
        add('spa', 'SpA');
        add('spd', 'SpD');
        add('spe', 'Spe');
        if (!parts.length && onlyNonZero) return prefix + ': 0 HP';
        return prefix + ': ' + parts.join(' / ');
    }
}


var table;

function constructDataTable() {
    table = $("#holder-2").DataTable({
        destroy: true,
        columnDefs: [
            {targets: [2], type: 'damage100'},
            {targets: [1], orderable: false}
        ],
        dom: 'C<"clear">fti',
        colVis: {
            exclude: [0, 1, 2],
            stateChange: function (iColumn, bVisible) {
                var column = table.settings()[0].aoColumns[iColumn];
                if (column.bSearchable !== bVisible) {
                    column.bSearchable = bVisible;
                    table.rows().invalidate();
                }
            }
        },
        paging: false,
        scrollX: Math.floor(dtWidth / 100) * 100, // round down to nearest hundred
        scrollY: dtHeight,
        scrollCollapse: true
    });
    $(".dataTables_wrapper").css({"max-width": dtWidth});
    raidEnsureSpeedFilterHook();
    // ColVis dropdown: force dark text
    setTimeout(function () {
        // Force dark text + readable background for the ColVis dropdown in dark themes (some themes use CSS vars like --text)
        var css = '' +
            'body .ColVis_collection { background:#fff !important; --text:#000 !important; --fg:#000 !important; color:#000 !important; }' +
            'body .ColVis_collection, body .ColVis_collection * { color:#000 !important; --text:#000 !important; --fg:#000 !important; opacity:1 !important; }' +
            'body .ColVis_collection li { background:#fff !important; color:#000 !important; --text:#000 !important; --fg:#000 !important; opacity:1 !important; }' +
            'body .ColVis_collection li * { color:#000 !important; --text:#000 !important; --fg:#000 !important; opacity:1 !important; }' +
            'body .ColVis_collection label, body .ColVis_collection span { color:#000 !important; opacity:1 !important; }' +
            'body .ColVis_collection input { opacity:1 !important; }';
        if (!document.getElementById('raid-colvis-style')) {
            var st = document.createElement('style');
            st.id = 'raid-colvis-style';
            st.type = 'text/css';
            st.appendChild(document.createTextNode(css));
            document.head.appendChild(st);
        }
    }, 0);
    // Raidalculate hover popover styling (Pokepaste block)
    setTimeout(function () {
        if (document.getElementById('raid-hover-style')) return;
        var css = '' +
            '.raid-pokepaste-popover .popover-content{ padding:10px 12px; }' +
            '.raid-pokepaste-popover pre{ margin:0; }' +
            '@media (prefers-color-scheme: dark){' +
            '.raid-pokepaste-popover{ background:#2b2b2b !important; border-color:#555 !important; }' +
            '.raid-pokepaste-popover .popover-content{ background:#2b2b2b !important; }' +
            '.raid-pokepaste-popover .arrow:after{ border-right-color:#2b2b2b !important; border-left-color:#2b2b2b !important; }' +
            '.raid-pokepaste-popover pre{ color:#e4e4e4 !important; }' +
            '}';
        var st = document.createElement('style');
        st.id = 'raid-hover-style';
        st.type = 'text/css';
        st.appendChild(document.createTextNode(css));
        document.head.appendChild(st);
    }, 0);
}


// --- Move filter helpers ---
function raidEscapeRegex(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function raidPopulateMoveFilter() {
    var $sel = $('#raid-move-filter');
    if (!$sel.length) return;
    $sel.empty();
    $sel.append('<option value="">All moves</option>');
    if (!RAID_LAST || !RAID_LAST.pickedMoves) return;
    var names = RAID_LAST.pickedMoves.map(function (m) {
        return m.name;
    });
    names.sort();
    for (var i = 0; i < names.length; i++) {
        $sel.append('<option value="' + raidEscHtml(names[i]) + '">' + raidEscHtml(names[i]) + '</option>');
    }
}

function raidBindMoveFilter() {
    // Delegated binding so it survives reinjecting controls / rebuilding the table
    $(document)
        .off('change.raidmove', '#raid-move-filter')
        .on('change.raidmove', '#raid-move-filter', function () {
            if (!table) return;
            var v = $(this).val();
            if (!v) {
                table.column(1).search('', true, false).draw();
                return;
            }
            table.column(1).search('^' + raidEscapeRegex(v) + '$', true, false).draw();
        });
}

function placeBsBtn() {
    // Avoid duplicating the controls when constructDataTable/placeBsBtn is called multiple times
    $('#raid-controls').remove();

    var raidalculate =
        "<div id='raid-controls' style='position:relative; height:28px;'>" +
        "<button style='position:absolute' class='raid-calc-btn bs-btn bs-btn-default'>Raidalculate</button>" +
        "<button style='position:absolute; margin-left:110px;  display:flex; align-items:center; justify-content:center;' aria-label='Info' class='raid-info-btn bs-btn bs-btn-default' type='button'>" +
        "<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" +
        "<circle cx='12' cy='12' r='10'></circle>" +
        "<line x1='12' y1='16' x2='12' y2='12'></line>" +
        "<line x1='12' y1='8' x2='12.01' y2='8'></line>" +
        "</svg>" +
        "</button>" +
        "<span style='position:absolute; margin-left:180px; line-height:30px;'>Filter Move:</span>" +
        "<select id='raid-move-filter' style='position:absolute; margin-left:270px; max-width:240px;' class='bs-btn bs-btn-default'></select>" +
        "<span style='position:absolute; margin-left:500px; line-height:30px;'>Speed:</span>" +
        "<select id='raid-speed-filter' style='position:absolute; margin-left:555px; max-width:170px;' class='bs-btn bs-btn-default'>" +
        "<option value=''>All</option>" +
        "<option value='faster'>Faster than target</option>" +
        "<option value='slower'>Slower than target</option>" +
        "</select>" +
        "</div>";

    $("#holder-2_wrapper").prepend(raidalculate);
    raidPopulateMoveFilter();
    raidBindMoveFilter();
    raidBindSpeedFilter();
    $(".raid-calc-btn").off("click.raidalculate").on("click.raidalculate", async function () {
        // 1) selected target
        var selected;
        var field = createField()
        try {
            selected = createPokemon($("#p1"));
        } catch (e) {
            selected = null;
        }
        if (!selected || !selected.name) {
            raidPopover("Select a Pokemon first", 240);
            return;
        }
        if (!typeChart || !moves) {
            raidPopover("TypeChart/Moves not loaded", 280);
            return;
        }
        // 2) weaknesses
        var defTypes = [selected.types && selected.types[0], selected.types && selected.types[1]].filter(Boolean);

        function typeMult(atk, def) {
            var row = typeChart[atk];
            if (!row) return 1;
            var m = row[def];
            m = (typeof m === "number") ? m : 1;

            // Inverse typing: invert each per-type multiplier
            if (field.isInverseTypes) {
                if (m === 0) m = 2;
                else if (m !== 1) m = 1 / m; // 2<->0.5, 4<->0.25, etc
            }
            return m;
        }

        function effVs(atk, defs) {
            var m = 1;
            for (var i = 0; i < defs.length; i++) m *= typeMult(atk, defs[i]);
            return m;
        }

        var weaknessTypes = Object.keys(typeChart)
            .filter(function (t) {
                return t && t !== "???";
            })
            .map(function (t) {
                return ({type: t, mult: effVs(t, defTypes)});
            })
            .filter(function (x) {
                return x.mult > 1;
            })
            .sort(function (a, b) {
                return b.mult - a.mult;
            });

        if (!weaknessTypes.length) {
            raidPopover("No weaknesses found", 240);
            return;
        }

        // 3) pick top 3 PHYSICAL and top 3 SPECIAL moves per weakness type (gen-scoped)
        function getBp(mv) {
            return Number(mv.bp ?? mv.BP ?? mv.basePower ?? mv.BasePower ?? mv.power ?? mv.Power) || 0;
        }

        function getType(mv) {
            return mv.type || mv.t || mv.Type;
        }

        function getCat(mv) {
            return String(mv.category || mv.Category || mv.damageClass || mv.DamageClass || "").trim();
        }

        var pickedByWeakType = {}; // { [type]: { physical: [...], special: [...] } }
        var pickedFlat = [];       // flat list of all picked moves (dedup later)

        for (var wi = 0; wi < weaknessTypes.length; wi++) {
            var wType = weaknessTypes[wi].type;
            var phys = [];
            var spec = [];

            for (var moveName in moves) {
                var mv = moves[moveName];
                if (!mv) continue;
                if (getType(mv) !== wType) continue;

                var bp = getBp(mv);
                var percent = Math.round(100 * Number(selected.originalCurHP) / Number(selected.rawStats.hp));

                // overrides
                if (moveName === "Fling") bp = 130;
                else if (moveName === "Assurance") bp = 120;
                else if (moveName === "Brine" && percent < 50) bp = bp * 2

                if (bp <= 0) continue;

                var cat = getCat(mv);
                var catLc = cat.toLowerCase();
                if (catLc === "status") continue;

                var entry = {name: moveName, type: wType, category: cat || "Unknown", bp: bp};
                if (catLc === "physical") phys.push(entry);
                else if (catLc === "special") spec.push(entry);
            }

            phys.sort(function (a, b) {
                return b.bp - a.bp;
            });
            spec.sort(function (a, b) {
                return b.bp - a.bp;
            });

            pickedByWeakType[wType] = {
                physical: phys.slice(0, 4),
                special: spec.slice(0, 4)
            };

            pickedFlat = pickedFlat.concat(pickedByWeakType[wType].physical);
            pickedFlat = pickedFlat.concat(pickedByWeakType[wType].special);
        }

        // 4) load monsters.json (cached)
        var ok = await raidEnsureMonstersLoaded();
        if (!ok) {
            raidPopover("Unable to load monsters.json", 300);
            return;
        }

        // 5-7) store data for performCalculations()
        pickedFlat.sort(function (a, b) {
            return b.bp - a.bp;
        });
        var dedup = {};
        var pickedMoves = [];
        for (var pi = 0; pi < pickedFlat.length; pi++) {
            var k = pickedFlat[pi].name;
            if (dedup[k]) continue;
            dedup[k] = true;
            pickedMoves.push(pickedFlat[pi]);
        }

        RAID_LAST = {
            targetName: selected.name,
            targetTypes: defTypes.slice(),
            weaknesses: weaknessTypes,
            pickedByWeakType: pickedByWeakType,
            pickedMoves: pickedMoves, // global move pool used in calculations
        };
        RAID_LAST.targetSpeed = (selected && selected.rawStats && selected.rawStats.spe != null)
            ? Number(selected.rawStats.spe)
            : (selected && selected.stats && selected.stats.spe != null)
                ? Number(selected.stats.spe)
                : null;

        // build generated attacker list (no tiers) - REQUIRED for performCalculations()
        (function () {
            if (!RAID_MON_INDEX_RESOLVED || !RAID_LAST || !RAID_LAST.pickedMoves) return;

            var opts = [];
            for (var monName in RAID_MON_INDEX_RESOLVED) {
                var mon = RAID_MON_INDEX_RESOLVED[monName];
                if (!mon) continue;
                if (mon.obtainable === false) continue;

                // must learn at least 1 picked move
                var learnableAll = raidGetLearnableMovesForMon(monName, RAID_LAST.pickedMoves);
                if (!learnableAll.length) continue;

                // score = best (bp * stab * relevant stat)
                var best = 0;
                for (var i = 0; i < learnableAll.length; i++) {
                    var mv = learnableAll[i];
                    var cat = String(mv.category || '').toLowerCase();
                    var stab = (mon.types && mon.types.indexOf(mv.type) !== -1) ? 1.5 : 1;
                    var stat = (cat === 'physical') ? (mon.stats.atk || 0) : (cat === 'special' ? (mon.stats.spa || 0) : 0);
                    var score = (mv.bp || 0) * stab * stat;
                    if (score > best) best = score;
                }
                if (best <= 0) continue;

                opts.push({id: monName, _score: best});
            }

            opts.sort(function (a, b) {
                return b._score - a._score;
            });
            if (opts.length > 300) opts = opts.slice(0, 300);
            for (var j = 0; j < opts.length; j++) delete opts[j]._score;

            RAID_LAST.setOptions = opts;
        })();
        raidPopulateMoveFilter();
        raidBindMoveFilter();
        $('#raid-move-filter').val('');
        $('#raid-speed-filter').val('');
        RAID_SPEED_FILTER = "";
        table.clear();
        performCalculations();
    });

    // Debug info button (hover to show last raidalculate summary)
    $(".raid-info-btn")
        .off("mouseenter.raidinfo mouseleave.raidinfo")
        .on("mouseenter.raidinfo", function () {
            var html = '';
            if (!RAID_LAST) {
                html = '<div style="color:#000;">No Raidalculate data yet. Click Raidalculate first.</div>';
            } else {
                html += '<div style="color:#000; white-space:normal;">';
                html += '<div style="font-weight:700;">Raidalculate Debug</div>';
                html += '<div><b>Target:</b> ' + (RAID_LAST.targetName || '') + '</div>';
                html += '<div><b>Target Types:</b> ' + ((RAID_LAST.targetTypes || []).join('/') || '') + '</div>';
                html += '<div><b>Weaknesses:</b> ' + (RAID_LAST.weaknesses || []).map(function (x) {
                    return x.type + ' x' + x.mult;
                }).join(', ') + '</div>';
                html += '<div><b>Picked move pool:</b> ' + (RAID_LAST.pickedMoves ? RAID_LAST.pickedMoves.length : 0) + ' moves</div>';
                html += '<div><b>Generated attackers:</b> ' + (RAID_LAST.setOptions ? RAID_LAST.setOptions.length : 0) + '</div>';
                html += '<hr style="margin:6px 0;" />';
                if (RAID_LAST.pickedByWeakType) {
                    for (var wi3 = 0; wi3 < (RAID_LAST.weaknesses || []).length; wi3++) {
                        var ww = RAID_LAST.weaknesses[wi3];
                        var picks = RAID_LAST.pickedByWeakType[ww.type] || {physical: [], special: []};
                        html += '<div style="margin-top:8px;">';
                        html += '<div style="font-weight:700;">' + ww.type + ' (x' + ww.mult + ')</div>';
                        html += '<div><b>Physical:</b> ' + (picks.physical || []).map(function (m) {
                            return m.name;
                        }).join(', ') + '</div>';
                        html += '<div><b>Special:</b> ' + (picks.special || []).map(function (m) {
                            return m.name;
                        }).join(', ') + '</div>';
                        html += '</div>';
                    }
                }
                html += '</div>';
            }
            $(this).popover({
                html: true,
                content: html,
                placement: "right",
                trigger: "manual",
                template:
                    '<div class="popover" role="tooltip" style="width:650px; max-width:650px;">' +
                    '<div class="arrow"></div><div class="popover-content" style="white-space:normal;"></div></div>'
            }).popover('show');
        })
        .on("mouseleave.raidinfo", function () {
            $(this).popover('destroy');
        });
};

function setLevel(lvl) {
    $('.level').val(lvl);
    $('.level').keyup();
    $('.level').popover({
        html: true,
        content: '<span style="color:#000; white-space:nowrap; display:block;">Level has been set to ' + lvl + '</span>',
        placement: "right",
        template: '<div class="popover" role="tooltip" style="width:200px;"><div class="arrow"></div><div class="popover-content" style="white-space:nowrap;"></div></div>'
    }).popover('show');
    setTimeout(function () {
        $('.level').popover('destroy');
    }, 1350);
}

$(".set-selector").change(function (e) {
    setLevel("100");
});


var dtHeight, dtWidth;
$(document).ready(function () {
    // Page init:
    // - Reads URL params to determine mode and redirect if needed.
    // - Sets initial UI (mode radio, table header label, shows table).
    // - Calculates DataTable dimensions, initializes the table, and adds the button.
    var params = new URLSearchParams(window.location.search);
    window.mode = params.get("mode");
    if (window.mode) {
        if (window.mode !== "one-vs-all" && window.mode !== "all-vs-one") {
            window.location.replace("index" + linkExtension + "?" + params);
        }
    } else {
        window.mode = "one-vs-all";
    }

    $("#" + mode).prop("checked", true);
    $("#raid-format").prop("checked", true).trigger("change");
    $("#tookDamageL").prop("checked", true).trigger("change");
    $("#holder-2 th:first").text((mode === "one-vs-all") ? "Attacker" : "Defender");
    // Raidalculate column order: Attacker | Move | Damage% | Ability | Speed | Type1 | Type2
    $("#holder-2 th").eq(3).text("Ability");
    $("#holder-2 th").eq(4).text("Speed");
    $("#holder-2 th").eq(5).text("Type 1");
    $("#holder-2 th").eq(6).text("Type 2");
    $("#holder-2").show();

    calcDTDimensions();
    constructDataTable();
    placeBsBtn();
});

/**
 * Get the bottom Y offset of a jQuery element (top + outerHeight).
 *
 * @param {JQuery} obj jQuery-wrapped element.
 * @returns {number} Bottom offset in pixels.
 */
function getBottomOffset(obj) {
    return obj.offset().top + obj.outerHeight();
}

function calcDTDimensions() {
    $("#holder-2").DataTable({
        dom: 'C<"clear">frti'
    });

    var theadBottomOffset = getBottomOffset($(".sorting"));
    var heightUnderDT = getBottomOffset($(".holder-0")) - getBottomOffset($("#holder-2 tbody"));
    dtHeight = $(document).height() - theadBottomOffset - heightUnderDT;
    dtWidth = $(window).width() - $("#holder-2").offset().left;
    dtWidth -= 2 * parseFloat($(".holder-0").css("padding-right"));
}
