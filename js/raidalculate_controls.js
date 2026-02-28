// --- Raidalculate cached data (loaded once) ---
var RAID_MONSTERS_RAW = null;
var RAID_MON_INDEX = null;   // name -> { name, types:[..], stats:{atk,spa}, learnset:Set, abilities:[..] }
var RAID_MON_INDEX_RESOLVED = null; // resolvedName -> merged mon entry
var RAID_LAST = null;        // last computed raidalculate result
var RAID_FORCE_PRESET = null; // null | { item: 'Choice Band' | 'Choice Specs' }
var RAID_SPEED_FILTER = ""; // "" | "faster" | "slower"
var RAID_SPEED_CACHE = { ts: 0, key: '', field: null, swapped: false, targetSpeed: null };

// --- Raidalculate UI settings (UI only for now; logic later) ---
var RAID_SETTINGS = {
    attackerNatureProfile: 'atk_neutral', // atk_slow | atk_neutral | spe_neutralatk
    calcBossDamage: true,
    mode: 'findAttacker', // findAttacker | findDefender,
    useDefItems: true
};

// --- Raidalculate move exclusions ---
var RAID_MOVE_EXCLUSIONS = [
    "Focus Punch",
    "Fusion Bolt",
    "Paleo Wave",
    "Bolt Strike",
    "Shadow Force",
    "Shadow Strike",
    "V-create",
    "Blue Flare",
    "Aeroblast",
    "Future Sight",
    "Psycho Boost",
    "Psystrike",
    "Zap Cannon"
];

// --- Raidalculate pokemon exclusions (obtainable but not usable) ---
var RAID_MON_EXCLUSIONS = [
    "Zekrom",
    "Giratina",
    "Rayquaza",
    "Mewtwo",
    "Keldeo",
    "Arceus",
    "Lugia"
];


// Custom Raid sets: indexed by species, then set name
var RAID_CUSTOM_SETS = {
    "Cobalion": {
        "Raid 6⭐": {
            level: 100,
            ability: "Justified",
            item: "Expert Belt",
            nature: "Hardy",
            ivs: { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 },
            evs: { hp:0, atk:0, def:0, spa:0, spd:0, spe:252 },
            baseStats: { hp:910, atk:225, def:1290, spa:225, spd:720, spe:108 },
            moves: ["Air Slash","Sacred Sword","Flash Cannon","Stone Edge"]
        }
    },
    "Excadrill": {
        "Raid 4⭐": {
            level: 80,
            ability: "Sand Rush",
            item: "White Herb",
            nature: "Hardy",
            ivs: { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 },
            evs: { hp:0, atk:0, def:0, spa:0, spd:0, spe:192 },
            baseStats: { hp:1110, atk:270, def:489, spa:225, spd:520, spe:88 },
            moves: ["Earthquake","","",""]
        }
    },
    "Terrakion": {
        "Raid 6⭐": {
            level: 100,
            ability: "Justified",
            item: "Lum Berry",
            nature: "Hardy",
            ivs: { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 },
            evs: { hp:0, atk:0, def:0, spa:0, spd:0, spe:252 },
            baseStats: { hp:910, atk:322, def:900, spa:180, spd:900, spe:108 },
            moves: ["Stone Edge","Sacred Sword","Earthquake","Poison Jab"]
        }
    },
    "Virizion": {
        "Raid 6⭐": {
            level: 100,
            ability: "Justified",
            item: "Liechi Berry",
            nature: "Hardy",
            ivs: { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 },
            evs: { hp:0, atk:0, def:0, spa:0, spd:0, spe:252 },
            baseStats: { hp:910, atk:225, def:720, spa:225, spd:1290, spe:108 },
            moves: ["Stone Edge","Stone Edge","X-Scissor","Sacred Sword"]
        }
    },
    "Keldeo": {
        "Raid 6⭐": {
            level: 100,
            ability: "Justified",
            item: "Leftovers",
            nature: "Hardy",
            ivs: { hp:31, atk:31, def:31, spa:31, spd:31, spe:31 },
            evs: { hp:0, atk:0, def:0, spa:0, spd:0, spe:0 },
            baseStats: { hp:910, atk:180, def:900, spa:322, spd:900, spe:108 },
            moves: ["Surf","Secret Sword","Ice Beam","Air Slash"]
        }
    }
};

// Helper to append custom RAID sets for a species to a sets array
function raidAppendCustomSetsToSpecies(speciesName, setsArray) {
    var raidSets = RAID_CUSTOM_SETS[speciesName];
    if (!raidSets) return setsArray;

    Object.keys(raidSets).forEach(function(setName) {
        setsArray.push({
            name: setName,
            isRaid: true
        });
    });

    return setsArray;
}




function raidSyncModeUI() {
    var isDef = (RAID_SETTINGS && RAID_SETTINGS.mode === 'findDefender');
    raidSetMoveFilterVisible(!isDef);
}

function raidBindModeToggleUI() {
    $(document)
        .off('click.raidmode change.raidmode', '#raid-mode-attack, #raid-mode-defend, input[name="raid-mode"], .raid-mode-btn')
        .on('click.raidmode change.raidmode', '#raid-mode-attack, #raid-mode-defend, input[name="raid-mode"], .raid-mode-btn', function () {
            var id = String($(this).attr('id') || '').toLowerCase();
            var val = String($(this).val() || '').toLowerCase();
            var txt = String($(this).text() || '').toLowerCase();

            var wantDef = false;
            if (id.indexOf('def') !== -1) wantDef = true;
            if (val.indexOf('def') !== -1) wantDef = true;
            if (txt.indexOf('def') !== -1) wantDef = true;

            RAID_SETTINGS.mode = wantDef ? 'findDefender' : 'findAttacker';
            raidSyncModeUI();
        });
}


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

function raidTryGetFinalSpeed(pkmn, field, side) {
    // Normalize side string -> actual Side object
    try {
        if (field && typeof side === 'string') {
            const s = side.toLowerCase();
            if (s === 'attacker') side = field.attackerSide || (field.sides && field.sides[0]) || side;
            if (s === 'defender') side = field.defenderSide || (field.sides && field.sides[1]) || side;
        }
    } catch (e) {}
    try {
        if (calc && typeof calc.getFinalSpeed === 'function') {
            try { return Number(calc.getFinalSpeed(gen, pkmn, field, side)); } catch (e0) {}
            try { return Number(calc.getFinalSpeed(pkmn, field, side)); } catch (e1) {}
            try { return Number(calc.getFinalSpeed(gen, pkmn, field)); } catch (e2) {}
            try { return Number(calc.getFinalSpeed(pkmn, field)); } catch (e3) {}
            try { return Number(calc.getFinalSpeed(pkmn)); } catch (e4) {}
        }
    } catch (e) {}

    try {
        if (pkmn?.rawStats?.spe != null) return Number(pkmn.rawStats.spe);
        if (pkmn?.stats?.spe != null) return Number(pkmn.stats.spe);
    } catch (e5) {}
    return null;
}

function raidGetSpeedFieldCacheKey() {
    // Key does not need to be perfect; it just prevents obvious stale caches.
    // Includes speed filter + a few common field inputs.
    var w = $('#weather').val() || '';
    var t = $('#terrain').val() || '';
    var twL = $('#tailwindL').is(':checked') ? '1' : '0';
    var twR = $('#tailwindR').is(':checked') ? '1' : '0';
    return String(RAID_SPEED_FILTER || '') + '|' + w + '|' + t + '|' + twL + '|' + twR;
}

function raidGetSpeedFieldSwappedCached() {
    var key = raidGetSpeedFieldCacheKey();
    var now = Date.now();

    // refresh at most ~4 times/second, or when key changes
    if (!RAID_SPEED_CACHE.field || RAID_SPEED_CACHE.key !== key || (now - (RAID_SPEED_CACHE.ts || 0)) > 250) {
        var f = createField();
        // In attacker-mode calcs we swap once; do the same here so speeds match raid calculations.
        // try { if (f && typeof f.swap === 'function') { f.swap(); } } catch (e) {}
        RAID_SPEED_CACHE = { ts: now, key: key, field: f, swapped: false, targetSpeed: null };
    }
    return RAID_SPEED_CACHE.field;
}

function raidComputeFinalSpeedForMonName(monName, opts) {
    try {
        var p = raidCreatePokemonByName(monName);
        if (!p) return null;
        opts = opts || {};
        if (opts.level != null) p.level = opts.level;
        if (opts.nature) p.nature = opts.nature;
        if (opts.item != null) p.item = opts.item;
        if (opts.ability != null) p.ability = opts.ability;
        if (opts.ivs) p.ivs = $.extend({}, p.ivs || {}, opts.ivs);
        if (opts.evs) p.evs = $.extend({}, p.evs || {}, opts.evs);
        p = raidRebuildPokemon(p);
        var field = raidGetSpeedFieldSwappedCached();
        return raidTryGetFinalSpeed(p, field);
    } catch (e) {
        return null;
    }
}

function raidUpdateP1SpeedTotalMod() {
    try {
        const $p1 = $("#p1");
        if (!$p1.length) return;

        const boss = createPokemon($p1);
        const field = createField();
        const side = field.attackerSide || (field.sides && field.sides[0]);

        if (!window.calc || typeof calc.getFinalSpeed !== "function") return;

        let sp = null;
        try { sp = Number(calc.getFinalSpeed(gen, boss, field, side)); } catch (e0) {}
        if (sp == null || isNaN(sp)) {
            try { sp = Number(calc.getFinalSpeed(boss, field, side)); } catch (e1) {}
        }
        if (sp == null || isNaN(sp)) return;

        const $tm = $p1.find(".sp .totalMod");
        if ($tm.length) $tm.text(String(Math.floor(sp)));
    } catch (e) {}
}


function raidGetTargetSpeed() {
    // cache key MUST include field state
    const key = raidGetSpeedFieldCacheKey();
    if (RAID_SPEED_CACHE && RAID_SPEED_CACHE.key === key &&
        typeof RAID_SPEED_CACHE.targetSpeed === "number" && !isNaN(RAID_SPEED_CACHE.targetSpeed)) {
        return RAID_SPEED_CACHE.targetSpeed;
    }

    try {
        const boss = createPokemon($("#p1"));
        if (!boss) return null;

        const field = createField(); // IMPORTANT: build ONCE
        const side = field.attackerSide || (field.sides && field.sides[0]) || undefined;

        let sp = null;
        if (window.calc && typeof calc.getFinalSpeed === "function") {
            try { sp = Number(calc.getFinalSpeed(gen, boss, field, side)); } catch (e0) {}
            if (sp == null || isNaN(sp)) {
                try { sp = Number(calc.getFinalSpeed(boss, field, side)); } catch (e1) {}
            }
        }

        if (sp == null || isNaN(sp)) return null;

        // store under current key
        RAID_SPEED_CACHE.key = key;
        RAID_SPEED_CACHE.targetSpeed = sp;
        return sp;
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

        // Prefer field-aware final speed using the row meta (if present)
        var sp = null;
        try {
            var cell0 = String(data[0] || '');
            var m = cell0.match(/data-raidkey="([^"]+)"/);
            var rk = m && m[1] ? m[1] : null;
            var meta = rk && RAID_ROW_META ? RAID_ROW_META[rk] : null;
            if (meta && meta.name) {
                // Match level to the current target (boss) if we can
                var lvl = null;
                try {
                    var boss = createPokemon($("#p1"));
                    if (boss && boss.level != null) lvl = boss.level;
                } catch (eBoss) {}

                sp = raidComputeFinalSpeedForMonName(meta.name, {
                    level: lvl,
                    nature: meta.nature,
                    item: meta.item,
                    ability: meta.ability,
                    ivs: meta.ivs,
                    evs: meta.evs
                });
            }
        } catch (eMeta) {}

        // Fallback: use displayed Speed (column index = 8)
        if (sp == null || isNaN(Number(sp))) {
            sp = Number(data[8]);
        }
        if (isNaN(Number(sp))) return true;

        var pass = true;
        if (RAID_SPEED_FILTER === "faster") pass = Number(sp) > t;
        else if (RAID_SPEED_FILTER === "slower") pass = Number(sp) < t;

        return pass;
    });
}

function raidBindSpeedFilter() {
    $(document)
        .off("change.raidspeed", "#raid-speed-filter")
        .on("change.raidspeed", "#raid-speed-filter", function () {
            RAID_SPEED_FILTER = $(this).val() || "";
            // invalidate cached target speed so field/filters are re-read
            if (RAID_SPEED_CACHE) RAID_SPEED_CACHE.targetSpeed = null;
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
        // Skip explicitly-unobtainable entries so duplicates (e.g. Darmanitan) don't override/poison the obtainable one
        if (m && m.obtainable === false) continue;

        var types = raidMonsterTypesFromJson(m.types);
        var stats = (m && m.stats) ? m.stats : {};
        var atk = Number(stats.attack) || 0;
        var spa = Number(stats.sp_attack) || 0;

        // evolutions in monsters.json are objects like { id, name, type, val }
        var evolutions = [];
        if (m && Array.isArray(m.evolutions)) {
            for (var ei = 0; ei < m.evolutions.length; ei++) {
                var en = raidNormName(m.evolutions[ei] && m.evolutions[ei].name);
                if (en) evolutions.push(en);
            }
            evolutions = raidUniq(evolutions);
        }

        idx[name] = {
            name: name,
            types: types,
            stats: {atk: atk, spa: spa},
            learnset: raidBuildLearnset(m),
            abilities: raidBuildAbilities(m),
            evolutions: evolutions,
            obtainable: (m.obtainable !== false),
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
                    evolutions: (mon.evolutions || []).slice(),
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
                existing.obtainable = (existing.obtainable !== false) || (mon.obtainable !== false);
                // merge abilities
                existing.abilities = raidUniq((existing.abilities || []).concat(mon.abilities || []));
                // merge evolutions
                existing.evolutions = raidUniq((existing.evolutions || []).concat(mon.evolutions || []));
            }
        }

        // Inherit base-form learnsets onto evolutions using monsters.json evolutions.
        // Egg moves often live only on base forms in monsters.json; we want evolved forms to also be able to use them.
        (function () {
            if (!RAID_MON_INDEX || !RAID_MON_INDEX_RESOLVED) return;

            // Build child->parent map from monsters.json evolution lists
            var prevoMap = {};
            for (var parentName in RAID_MON_INDEX) {
                var parentMon = RAID_MON_INDEX[parentName];
                if (!parentMon || !parentMon.evolutions || !parentMon.evolutions.length) continue;
                var parentResolved = raidResolveSpeciesName(parentMon.name);
                for (var ei = 0; ei < parentMon.evolutions.length; ei++) {
                    var childResolved = raidResolveSpeciesName(parentMon.evolutions[ei]);
                    if (!childResolved || !parentResolved) continue;
                    if (!prevoMap[childResolved]) prevoMap[childResolved] = parentResolved;
                }
            }

            // Propagate learnsets along prevoMap (handles multi-stage by repeating passes)
            var changed = true;
            var guard = 0;
            while (changed && guard++ < 10) {
                changed = false;
                for (var child in prevoMap) {
                    var parent = prevoMap[child];
                    var cur = RAID_MON_INDEX_RESOLVED[child];
                    var prev = RAID_MON_INDEX_RESOLVED[parent];
                    if (!cur || !cur.learnset || !prev || !prev.learnset) continue;
                    prev.learnset.forEach(function (mv) {
                        var before = cur.learnset.size;
                        cur.learnset.add(mv);
                        if (cur.learnset.size !== before) changed = true;
                    });
                }
            }
        })();
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

function raidHasFightingMove(moveList) {
    for (var i = 0; i < (moveList || []).length; i++) {
        var t = moveList[i] && moveList[i].type;
        if (t && String(t).toLowerCase() === 'fighting') return true;
    }
    return false;
}

function raidAugmentPickedMoves(moveList) {
    var out = (moveList || []).slice();

    // If any picked move is Fighting-type, ensure Sacred Sword is included as an extra option.
    if (raidHasFightingMove(out)) {
        var hasSS = false;
        for (var i = 0; i < out.length; i++) {
            if (out[i] && out[i].name === 'Sacred Sword') { hasSS = true; break; }
        }
        if (!hasSS) {
            out.push({name: 'Sacred Sword', type: 'Fighting', category: 'Physical'});
        }
    }

    return out;
}

function raidIsSuperpowerOrCC(name) {
    return name === 'Superpower' || name === 'Close Combat';
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


function raidGetAtkProfileForCategory(profile, categoryLc) {
    var isPhysical = categoryLc === 'physical';

    if (profile === 'atk_slow') {
        return {
            nature: isPhysical ? 'Brave' : 'Quiet',
            evs: isPhysical
                ? {hp: 252, atk: 252, def: 4, spa: 0, spd: 0, spe: 0}
                : {hp: 252, atk: 0,   def: 4, spa: 252, spd: 0, spe: 0}
        };
    }

    if (profile === 'spe_neutralatk') {
        return {
            nature: isPhysical ? 'Jolly' : 'Timid',
            evs: isPhysical
                ? {hp: 4, atk: 252, def: 0, spa: 0,   spd: 0, spe: 252}
                : {hp: 4, atk: 0,   def: 0, spa: 252, spd: 0, spe: 252}
        };
    }

    // atk_neutral (default)
    return {
        nature: isPhysical ? 'Adamant' : 'Modest',
        evs: isPhysical
            ? {hp: 4, atk: 252, def: 0, spa: 0,   spd: 0, spe: 252}
            : {hp: 4, atk: 0,   def: 0, spa: 252, spd: 0, spe: 252}
    };
}

function raidApplyAtkProfileToPokemon(pkmn, mv) {
    var catLc = String((mv && mv.category) || '').toLowerCase();
    if (catLc !== 'physical' && catLc !== 'special') return pkmn;

    var prof = (RAID_SETTINGS && RAID_SETTINGS.attackerNatureProfile) ? RAID_SETTINGS.attackerNatureProfile : 'atk_neutral';
    var cfg = raidGetAtkProfileForCategory(prof, catLc);

    pkmn.nature = cfg.nature;
    pkmn.evs = $.extend({hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0}, cfg.evs);

    // For -Speed nature profile, force Speed IV to 0 (Brave/Quiet). Otherwise keep 31.
    // Some legacy helpers use `sp` for Speed; set both keys.
    pkmn.ivs = pkmn.ivs || {hp:31, atk:31, def:31, spa:31, spd:31, spe:31};
    var spIv = (prof === 'atk_slow') ? 0 : 31;
    pkmn.ivs.spe = spIv;
    pkmn.ivs.sp = spIv;

    return pkmn;
}

// --- Defender profiles ---
function raidGetDefProfile(profile, isSpDef) {
    // isSpDef = true when optimizing SpD instead of Def

    if (profile === 'def_slow') {
        return {
            nature: isSpDef ? 'Sassy' : 'Relaxed',
            evs: isSpDef
                ? {hp: 252, atk: 0, def: 4, spa: 0, spd: 252, spe: 0}
                : {hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0}
        };
    }

    if (profile === 'def_speed') {
        return {
            nature: isSpDef ? 'Timid' : 'Jolly',
            evs: isSpDef
                ? {hp: 252, atk: 0, def: 4, spa: 0, spd: 252, spe: 252}
                : {hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 252}
        };
    }

    // default neutral speed
    return {
        nature: isSpDef ? 'Careful' : 'Impish',
        evs: isSpDef
            ? {hp: 252, atk: 0, def: 4, spa: 0, spd: 252, spe: 0}
            : {hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0}
    };
}

function raidApplyDefProfile(pkmn, profile, isSpDef) {
    var cfg = raidGetDefProfile(profile, isSpDef);
    pkmn.nature = cfg.nature;
    pkmn.evs = $.extend({hp:0,atk:0,def:0,spa:0,spd:0,spe:0}, cfg.evs);

    // For -Speed defender profile, force Speed IV to 0 (Relaxed/Sassy). Otherwise keep 31.
    // Some legacy helpers use `sp` for Speed; set both keys.
    pkmn.ivs = pkmn.ivs || {hp:31, atk:31, def:31, spa:31, spd:31, spe:31};
    var spIv = (profile === 'def_slow') ? 0 : 31;
    pkmn.ivs.spe = spIv;
    pkmn.ivs.sp = spIv;

    return pkmn;
}

function raidApplyDefItems(pkmn, defenderMoves) {
    if (!RAID_SETTINGS || !RAID_SETTINGS.useDefItems) return pkmn;

    // Eviolite for non-final evolutions
    var resolved = raidResolveSpeciesName(pkmn.name);
    var sp = pokedex && pokedex[resolved];
    var isNFE = false;
    if (sp) {
        if (sp.nfe === true) isNFE = true;
        else if (sp.evos && sp.evos.length) isNFE = true;
    }

    if (isNFE) {
        pkmn.item = 'Eviolite';

        if (String(pkmn.name || '').toLowerCase() === 'dusclops') {
            console.log('[RAID][DEFITEM] Dusclops -> Eviolite. resolved=', resolved, 'sp.nfe=', sp && sp.nfe, 'sp.evos=', sp && sp.evos);
        }
        return pkmn;
    }

    // Assault Vest if boss has special moves
    var hasSpecial = false;
    for (var i = 0; i < defenderMoves.length; i++) {
        var mv = defenderMoves[i];
        if (mv && String(mv.category || '').toLowerCase() === 'special') {
            hasSpecial = true;
            break;
        }
    }

    if (hasSpecial) pkmn.item = 'Assault Vest';
    return pkmn;
}

function raidApplyPresetEVs(attacker) {
    if (!attacker) return;
    // Also apply -Speed profile Speed IV=0 (Brave/Quiet profile) so speed changes actually take effect
    attacker.ivs = attacker.ivs || {hp:31, atk:31, def:31, spa:31, spd:31, spe:31};
    var prof = (RAID_SETTINGS && RAID_SETTINGS.attackerNatureProfile) ? RAID_SETTINGS.attackerNatureProfile : 'atk_neutral';
    var spIv = (prof === 'atk_slow') ? 0 : 31;
    attacker.ivs.spe = spIv;
    attacker.ivs.sp = spIv;
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

// Helper to rebuild a Pokemon so stats are recalculated after EV/nature/item/ability changes
function raidRebuildPokemon(p) {
    if (!p) return p;
    var species = pokedex && pokedex[raidResolveSpeciesName(p.name)];

    var abilityOn = false;
    if (p.ability === "Plus" || p.ability === "Minus") {
        abilityOn = true;
    }

    // var abilityOn = (typeof p.abilityOn === 'boolean') ? p.abilityOn : true;

    return new calc.Pokemon(gen, p.name, {
        level: p.level || defaultLevel || 100,
        ability: p.ability || "",
        abilityOn: abilityOn,
        item: p.item || "",
        gender: p.gender || "N",
        nature: p.nature || "Hardy",
        ivs: p.ivs,
        evs: p.evs,
        moves: p.moves,
        overrides: species ? {baseStats: species.bs, types: species.types} : undefined
    });
}

function raidUpdateBossMoveHeaders(defender) {
    for (var j = 0; j < 4; j++) {
        var m = defender && defender.moves && defender.moves[j];
        var n = m && m.name ? m.name : '';
        if (!n || n === '(No Move)') n = 'Boss Move ' + (j + 1);
        var $th = $('th.boss-move-col[data-slot="' + j + '"]');
        if ($th.length) $th.text(n);
    }
}

// Helper to show/hide the Move filter UI (for Defender mode)
function raidSetMoveFilterVisible(isVisible) {
    var visible = !!isVisible;
    $('#raid-move-filter').toggle(visible);
    $('#raid-move-filter-label').toggle(visible);
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
    var pickedMovesLocal = raidAugmentPickedMoves(RAID_LAST.pickedMoves || []);
    var isDefMode = (RAID_SETTINGS && RAID_SETTINGS.mode === 'findDefender');
    var calcBossDmg = $('#raid-setting-bossdmg').is(':checked');

    // Toggle Boss Damage columns (indexes 4-7): always visible in Defender mode
    var bossColsVisible = isDefMode ? true : calcBossDmg;
    if (table) {
        for (var c = 4; c <= 7; c++) {
            try {
                table.column(c).visible(bossColsVisible);
            } catch (e) {}
        }
    }
    var dataSet = [];
    // Reset hover meta for this run
    RAID_ROW_META = {};
    RAID_ROW_META_ID = 0;

    var pokeInfo = $("#p1");
    // Attacker mode uses the same defender + field for all attacker rows; build once.
    var raidFieldAtk = null;
    var raidDefenderAtk = null;
    if (!isDefMode) {
        raidFieldAtk = createField();
        raidDefenderAtk = createPokemon(pokeInfo);
        raidFieldAtk.swap();
        raidUpdateBossMoveHeaders(raidDefenderAtk);

        if (raidDefenderAtk && raidDefenderAtk.ability === "Rivalry") raidDefenderAtk.gender = "N";
    }
    for (var i = 0; i < setOptions.length; i++) {
        if (setOptions[i].id && typeof setOptions[i].id !== "undefined") {
            // Defender Mode branch
            if (isDefMode) {
                var field = createField();
                defender = createPokemon(pokeInfo);
                raidUpdateBossMoveHeaders(defender);
                var bossMoves = defender.moves || [];

                var hasPhys = false;
                var hasSpec = false;
                for (var bi = 0; bi < bossMoves.length; bi++) {
                    var bm = bossMoves[bi];
                    if (!bm) continue;
                    var c = String(bm.category || '').toLowerCase();
                    if (c === 'physical') hasPhys = true;
                    if (c === 'special') hasSpec = true;
                }

                var defProfiles = [];
                if (hasPhys && hasSpec) defProfiles = [false, true]; // def and spdef
                else if (hasSpec) defProfiles = [true];
                else defProfiles = [false];

                for (var dpi = 0; dpi < defProfiles.length; dpi++) {
                    var isSpDef = defProfiles[dpi];

                    var tank = raidCreatePokemonByName(setOptions[i].id);
                    if (!tank) continue;

                    tank = raidApplyDefProfile(tank, RAID_SETTINGS.defenderProfile || 'def_neutral', isSpDef);
                    tank = raidApplyDefItems(tank, bossMoves);
                    tank.level = defender.level;
                    tank = raidRebuildPokemon(tank);

                    var worstPct = 0;

                    for (var bi2 = 0; bi2 < bossMoves.length; bi2++) {
                        var bm2 = bossMoves[bi2];
                        if (!bm2 || !bm2.name || bm2.name === '(No Move)') continue;

                        var moveObj2 = raidBuildMove(gen, bm2.name);
                        var r2 = calc.calculate(gen, defender, tank, moveObj2, field);

                        var range2 = r2.range();
                        var pct = Math.floor(range2[1] * 1000 / tank.maxHP()) / 10;
                        if (pct > worstPct) worstPct = pct;
                    }

                    // Build row with EXACTLY 11 visible columns (0..10) + 1 hidden sort key
                    var data = [];

                    // 0 Attacker
                    // data.push(raidEscHtml(tank.name));
                    var rk = 'r' + (++RAID_ROW_META_ID);
                    RAID_ROW_META[rk] = {
                        name: tank.name,
                        item: tank.item || '',
                        ability: tank.ability || '',
                        ivs: (tank.ivs || {hp:31, atk:31, def:31, spa:31, spd:31, spe:31}),
                        evs: (tank.evs || {hp:0, atk:0, def:0, spa:0, spd:0, spe:0}),
                        nature: tank.nature || '',
                        move: '',
                        stats: (tank.rawStats || tank.stats || {})
                    };

                    var displayName = tank.name;
                    if (tank.item) {
                        displayName += ' [' + tank.item + ']';
                    }
                    data.push('<span class="raid-mon" data-raidkey="' + rk + '">' + raidEscHtml(displayName) + '</span>');

                    // 1 Best Move column reused as role label
                    data.push(isSpDef ? 'SpD Tank' : 'Def Tank');

                    // 2 Damage(%) column reused as Worst Hit%
                    var worstStr = (Math.round(worstPct * 10) / 10).toFixed(1) + '%';
                    data.push(worstStr);

                    // 3 Ability
                    data.push(tank.ability || '');

                    // 4-7 Boss move damage% (boss -> tank) ALWAYS populated in defender mode
                    for (var biOut = 0; biOut < 4; biOut++) {
                        var bmOut = defender && defender.moves && defender.moves[biOut];
                        var bmNameOut = bmOut && bmOut.name ? bmOut.name : '';
                        if (!bmNameOut || bmNameOut === '(No Move)') {
                            data.push('');
                            continue;
                        }
                        var moveObjOut = raidBuildMove(gen, bmNameOut);
                        var rOut = calc.calculate(gen, defender, tank, moveObjOut, field);

                        var rangeOut = rOut.range();
                        var hpOut = tank.maxHP();
                        var minPctOut = Math.floor(rangeOut[0] * 1000 / hpOut) / 10;
                        var maxPctOut = Math.floor(rangeOut[1] * 1000 / hpOut) / 10;
                        data.push(minPctOut + ' - ' + maxPctOut + '%');
                    }

                    // 8 Speed (field-aware when possible)
                    var spFinalTank = raidTryGetFinalSpeed(tank, field, 'defender');
                    if (spFinalTank == null || isNaN(Number(spFinalTank))) {
                        spFinalTank = (tank.stats && tank.stats.spe != null) ? tank.stats.spe : '';
                    }
                    data.push(spFinalTank);
                    RAID_ROW_META[rk].finalSpeed = spFinalTank;

                    // 9 Type1
                    data.push((tank.types && tank.types[0]) ? tank.types[0] : '');

                    // 10 Type2
                    data.push((tank.types && tank.types[1]) ? tank.types[1] : '');

                    // hidden sort key (worst hit)
                    data.push(worstPct);

                    dataSet.push(data);
                }

                continue;
            }
            // --- End Defender Mode branch ---

            // Raidalculate: ALWAYS generated attacker vs selected raid target (p1)
            var field = raidFieldAtk;
            attacker = raidCreatePokemonByName(setOptions[i].id);
            if (!attacker) continue; // skip invalid species
            defender = raidDefenderAtk;
            if (attacker.ability === "Rivalry") {
                attacker.gender = "N";
            }
            var presets = [null];

            if (RAID_LAST && defender && defender.name === RAID_LAST.targetName && RAID_MON_INDEX) {
                var learnableAll = raidGetLearnableMovesForMon(attacker.name, pickedMovesLocal);
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
                var learnablePicked = raidGetLearnableMovesForMon(attacker.name, pickedMovesLocal);
                if (!learnablePicked || !learnablePicked.length) continue;

                // If both Superpower and Close Combat are learnable, treat them as one combined entry.
                var hasSuperpower = false;
                var hasCloseCombat = false;
                for (var _i = 0; _i < learnablePicked.length; _i++) {
                    var _n = learnablePicked[_i] && learnablePicked[_i].name;
                    if (_n === 'Superpower') hasSuperpower = true;
                    if (_n === 'Close Combat') hasCloseCombat = true;
                }
                var handledFightingPair = false;

                // ability candidates (include pool from monsters.json)
                var monInfo = RAID_MON_INDEX_RESOLVED ? RAID_MON_INDEX_RESOLVED[raidResolveSpeciesName(attacker.name)] : null;
                var abilityCandidates = [];
                if (attacker.ability) abilityCandidates.push(attacker.ability);
                // abilities from monsters.json (extra pool / overrides)
                // monsters.json abilities are objects like { id, name }
                if (monInfo && monInfo.abilities && monInfo.abilities.length) {
                    for (var ai = 0; ai < monInfo.abilities.length; ai++) {
                        var aEntry = monInfo.abilities[ai];
                        var aName2 = (typeof aEntry === "string") ? aEntry : (aEntry && aEntry.name ? aEntry.name : "");
                        if (aName2 && abilityCandidates.indexOf(aName2) === -1) abilityCandidates.push(aName2);
                    }
                }
                if (!abilityCandidates.length) abilityCandidates.push(attacker.ability || "");

                function bestItemForMoveLocal(mv) {
                    if (mv.name === "Acrobatics") return "Flying Gem";
                    if (mv.name === "Fling") return "Iron Ball";
                    if (attacker.name === "Pikachu") return "Light Ball"
                    if (attacker.ability === "Technician" && (mv.multihit && Array.isArray(mv.multihit) && mv.multihit.length > 1 && mv.multihit[1] === 5)) return "Loaded Dice"
                    if (mv.name === "Sky Attack") return "Power Herb"


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
                    // Combine Superpower + Close Combat into a single result row
                    if (raidIsSuperpowerOrCC(mv.name)) {
                        if (handledFightingPair) continue;
                        handledFightingPair = true;
                    }
                    var catLc = String(mv.category || "").toLowerCase();
                    if (wantCat && catLc !== wantCat) continue;

                    // best ability for this specific move
                    var best = null;
                    for (var ab = 0; ab < abilityCandidates.length; ab++) {
                        var tmpAtk = attacker.clone ? attacker.clone() : attacker;
                        tmpAtk.ability = abilityCandidates[ab];
                        if (tmpAtk.ability === "Rivalry") tmpAtk.gender = "N";
                        // Apply nature+EVs per move category
                        tmpAtk = raidApplyAtkProfileToPokemon(tmpAtk, mv);
                        tmpAtk.item = bestItemForMoveLocal(mv);
                        // Rebuild so stats/item/ability are consistent
                        tmpAtk = raidRebuildPokemon(tmpAtk);
                        // If we are on the combined Superpower/Close Combat entry, pick a canonical move for calc.
                        var mvNameForCalc = mv.name;
                        if (raidIsSuperpowerOrCC(mv.name)) {
                            // Prefer Close Combat if available on this mon, else use Superpower.
                            mvNameForCalc = hasCloseCombat ? 'Close Combat' : 'Superpower';
                        }

                        var moveObj = raidBuildMove(gen, mvNameForCalc);

                        // Force hit count for multi-hit moves when relevant (Skill Link / Loaded Dice)
                        if (mv.multihit && Array.isArray(mv.multihit) && mv.multihit.length > 1) {
                            var maxHits = Number(mv.multihit[1]) || 0;
                            if (maxHits > 1) {
                                if (tmpAtk.ability === "Skill Link") {
                                    moveObj.hits = maxHits;
                                } else if (tmpAtk.item === "Loaded Dice") {
                                    moveObj.hits = maxHits - 1;
                                }
                            }
                        }
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
                    var keyMoveName = mv.name;
                    if (raidIsSuperpowerOrCC(mv.name) && hasSuperpower && hasCloseCombat) {
                        keyMoveName = 'Close Combat / Superpower';
                    }
                    var raidKey = setOptions[i].id + '|' + keyMoveName + '|' + (RAID_FORCE_PRESET && RAID_FORCE_PRESET.item ? RAID_FORCE_PRESET.item : '') + '|' + (best.tmpAtk && best.tmpAtk.ability ? best.tmpAtk.ability : '');
                    var ivsNorm = raidNormStatsObj(ivsMeta);
                    var evsNorm = raidNormStatsObj(evsMeta);
                    RAID_ROW_META[raidKey] = {
                        name: resolvedForMeta,
                        item: (best.tmpAtk && best.tmpAtk.item) ? best.tmpAtk.item : (attacker.item || ""),
                        ability: (best.tmpAtk && best.tmpAtk.ability) ? best.tmpAtk.ability : (attacker.ability || ""),
                        nature: natMeta || (attacker.nature || "Hardy"),
                        level: lvlMeta || (attacker.level || defaultLevel || 100),
                        move: (raidIsSuperpowerOrCC(mv.name) && hasSuperpower && hasCloseCombat) ? 'Close Combat / Superpower' : String(mv.name).replace("Hidden Power", "HP"),
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
                    var moveLabel;
                    if (raidIsSuperpowerOrCC(mv.name) && hasSuperpower && hasCloseCombat) {
                        moveLabel = 'Close Combat / Superpower';
                    } else {
                        moveLabel = String(mv.name).replace("Hidden Power", "HP");
                    }
                    data.push(moveLabel);

                    // 2 Damage% (attacker -> boss)
                    data.push(minPercentage + " - " + maxPercentage + "%");

                    // 3 Ability (matches HTML order)
                    data.push(best.tmpAtk.ability || "");

                    // 4-7 Boss move damage% (boss -> attacker)
                    if (!calcBossDmg) {
                        // Keep column count consistent, but don't calculate
                        data.push("");
                        data.push("");
                        data.push("");
                        data.push("");
                    } else {
                        for (var bi = 0; bi < 4; bi++) {
                            var bm = defender && defender.moves && defender.moves[bi];
                            var bmName = bm && bm.name ? bm.name : "";
                            if (!bmName || bmName === "(No Move)") {
                                data.push("");
                                continue;
                            }

                            var bossMoveObj = raidBuildMove(gen, bmName);

                            // swap perspective so boss is attacker
                            field.swap();
                            var br = calc.calculate(gen, defender, best.tmpAtk, bossMoveObj, field);
                            field.swap();

                            var brRange = br.range();
                            var aHP = best.tmpAtk.maxHP();
                            var bMinPct = Math.floor(brRange[0] * 1000 / aHP) / 10;
                            var bMaxPct = Math.floor(brRange[1] * 1000 / aHP) / 10;
                            data.push(bMinPct + " - " + bMaxPct + "%");
                        }
                    }

                    // 8 Speed (field-aware when possible)
                    var spFinalAtk = raidTryGetFinalSpeed(best.tmpAtk, raidGetSpeedFieldSwappedCached(), 'defender');
                    if (spFinalAtk == null || isNaN(Number(spFinalAtk))) {
                        spFinalAtk =
                            (attacker.stats && attacker.stats.spe != null) ? attacker.stats.spe :
                                (attacker.rawStats && attacker.rawStats.spe != null) ? attacker.rawStats.spe : '';
                    }
                    data.push(spFinalAtk);
                    RAID_ROW_META[raidKey].finalSpeed = spFinalAtk;

                    // 9 Type1
                    data.push(attacker.types[0] || "");

                    // 10 Type2
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
    // Sort dataSet descending by highestDamage (last column)
    // dataSet.sort(function (a, b) {
    //     return (Number(b[b.length - 1]) || 0) - (Number(a[a.length - 1]) || 0);
    // });
    var isDefMode = (RAID_SETTINGS && RAID_SETTINGS.mode === 'findDefender');
// Sort dataSet:
// - Attacker: descending by damage
// - Defender: ascending by worst-hit
    dataSet.sort(function (a, b) {
        var av = Number(a[a.length - 1]) || 0;
        var bv = Number(b[b.length - 1]) || 0;
        return isDefMode ? (av - bv) : (bv - av);
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
    // table.order([[2, 'desc']]).draw(); // column 2 is Damage%
    table.order([[2, isDefMode ? 'asc' : 'desc']]).draw();

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

// Loading indicator helper for Raidalculate button
function raidSetLoading(isLoading) {
    var $btn = $('.raid-calc-btn');
    if (!$btn.length) return;

    if (isLoading) {
        if (!$btn.data('orig-text')) {
            $btn.data('orig-text', $btn.text());
        }
        $btn.prop('disabled', true);
        $btn.text('Calculating...');
        $btn.css({ opacity: 0.7 });
    } else {
        var orig = $btn.data('orig-text') || 'Raidalculate';
        $btn.prop('disabled', false);
        $btn.text(orig);
        $btn.css({ opacity: '' });
    }
}

function constructDataTable() {
    table = $("#holder-2").DataTable({
        destroy: true,
        columnDefs: [
            {
                targets: [9, 10],
                visible: false,
                searchable: false
            },
            {targets: [2], type: 'damage100'},
            {targets: [1], orderable: false},
            { targets: [4,5,6,7], visible: false }
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
                if (iColumn === 9 || iColumn === 10) {
                    // keep searchable in sync with visibility
                    column.bSearchable = bVisible;
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

    var pm = raidAugmentPickedMoves(RAID_LAST.pickedMoves || []);
    var names = pm.map(function (m) { return m.name; });

// If both Close Combat and Superpower are present, show a single combined option to match the table rows
    var hasCC = names.indexOf('Close Combat') !== -1;
    var hasSP = names.indexOf('Superpower') !== -1;
    if (hasCC && hasSP) {
        names = names.filter(function (n) { return n !== 'Close Combat' && n !== 'Superpower'; });
        names.push('Close Combat / Superpower');
    }

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
        "<div id='raid-controls' style='margin:6px 0 30px 0;'>" +

        // Row 1: action + settings (inline)
        "  <div id='raid-controls-row1' style='display:flex; align-items:center; gap:8px; flex-wrap:wrap;'>" +
        "    <button class='raid-calc-btn bs-btn bs-btn-default'>Raidalculate</button>" +
        "    <button aria-label='Info' class='raid-info-btn bs-btn bs-btn-default' type='button' style='display:flex; align-items:center; justify-content:center;'>" +
        "      <svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" +
        "        <circle cx='12' cy='12' r='10'></circle>" +
        "        <line x1='12' y1='16' x2='12' y2='12'></line>" +
        "        <line x1='12' y1='8' x2='12.01' y2='8'></line>" +
        "      </svg>" +
        "    </button>" +

        // Mode inline (Field-style buttons)
        "    <span style='margin-left:6px;'>Mode:</span>" +
        "    <span id='raid-mode-inline' style='white-space:nowrap;'>" +
        "      <input class='visually-hidden' type='radio' name='raid-mode-inline' value='findAttacker' id='raid-mode-attack' checked />" +
        "      <label class='btn btn-left' for='raid-mode-attack'>Attack</label>" +
        "      <input class='visually-hidden' type='radio' name='raid-mode-inline' value='findDefender' id='raid-mode-defend' />" +
        "      <label class='btn btn-right' for='raid-mode-defend'>Defend</label>" +
        "    </span>" +
        "  </div>" +

        // Row 2: Boss dmg + Atk profile
        "<div id='raid-controls-row2' style='display:flex; align-items:center; gap:18px; flex-wrap:wrap; margin-top:12px;'>" +

        // Boss dmg toggle
        "    <span id='raid-setting-bossdmg-wrap' style='white-space:nowrap;'>" +
        "      <input class='visually-hidden' type='checkbox' id='raid-setting-bossdmg' checked />" +
        "      <label class='btn btn-mid btn-wide' style='margin-left: 1" +
        "px;' for='raid-setting-bossdmg' title='Adds 4 columns showing boss → attacker damage. This makes Raidalculate slower.'>Boss dmg</label>" +
        "      <span style='margin-left:6px; font-size:12px; opacity:.75;'>adds boss damage (slower) </span>" +
        "    </span>" +

        // Attacker nature profile
        "    <span id='raid-setting-attacker-natures' style='white-space:nowrap;'>" +
        "      <span style='margin-right:6px;'>Nature:</span>" +
        "      <input class='visually-hidden' type='radio' name='raid-setting-attacker-nature' value='atk_slow' id='raid-atkprof-slow' />" +
        "      <label class='btn btn-wide btn-left' style='min-width:95px; text-align:center;' for='raid-atkprof-slow'>+Atk -Spe</label>" +
        "      <input class='visually-hidden' type='radio' name='raid-setting-attacker-nature' value='atk_neutral' id='raid-atkprof-atk' checked />" +
        "      <label class='btn btn-wide btn-mid' style='min-width:95px; text-align:center;' for='raid-atkprof-atk'>+Atk</label>" +
        "      <input class='visually-hidden' type='radio' name='raid-setting-attacker-nature' value='spe_neutralatk' id='raid-atkprof-spe' />" +
        "      <label class='btn btn-wide btn-right' style='min-width:95px; text-align:center;' for='raid-atkprof-spe'>+Spe</label>" +
        "      <span id='raid-atkprof-evs' style='margin-left:10px; font-size:12px; opacity:.75; white-space:nowrap;'></span>" +
        "    </span>" +

        // Defender Mode UI (Defender Nature + Def Items toggle)
        "    <span id='raid-setting-defender-natures' style='white-space:nowrap; display:none; margin-left:18px;'>" +
        "      <span style='margin-right:6px;'>Def Nature:</span>" +
        "      <input class='visually-hidden' type='radio' name='raid-setting-defender-nature' value='def_slow' id='raid-defprof-slow' />" +
        "      <label class='btn btn-wide btn-left' style='min-width:110px; text-align:center;' for='raid-defprof-slow'>+Def -Spe</label>" +
        "      <input class='visually-hidden' type='radio' name='raid-setting-defender-nature' value='def_neutral' id='raid-defprof-neutral' checked />" +
        "      <label class='btn btn-wide btn-mid' style='min-width:110px; text-align:center;' for='raid-defprof-neutral'>+Def</label>" +
        "      <input class='visually-hidden' type='radio' name='raid-setting-defender-nature' value='def_speed' id='raid-defprof-speed' />" +
        "      <label class='btn btn-wide btn-right' style='min-width:110px; text-align:center;' for='raid-defprof-speed'>+Spe</label>" +
        "    </span>" +

        "    <span id='raid-setting-def-items-wrap' style='white-space:nowrap; display:none; margin-left:12px;'>" +
        "      <input class='visually-hidden' type='checkbox' id='raid-setting-defitems' checked />" +
        "      <label class='btn btn-mid btn-wide' for='raid-setting-defitems' title='Enable Eviolite (non-final evolutions) and Assault Vest vs special bosses.'>Def Items</label>" +
        "    </span>" +


        "  </div>" +

        "</div>";

    $("#holder-2_wrapper").prepend(raidalculate);

    // Helper: move filters into DataTables filter bar
    function raidPlaceInlineFilters() {
        // Put filters next to DataTables Search box
        var $filter = $('#holder-2_wrapper .dataTables_filter');
        if (!$filter.length) return;

        // Ensure filter bar is flex and left-align filters, keep Search on far right
        $filter.css({display: 'flex', 'align-items': 'center', gap: '10px', 'flex-wrap': 'wrap', 'justify-content': 'flex-start', width: '100%'});

        // Keep the existing search label/input but make it last
        var $label = $filter.find('label').first();

        // Create (or reuse) our inline filters container
        var $box = $('#raid-inline-filters');
        if (!$box.length) {
            $box = $('<div id="raid-inline-filters" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;"></div>');
            // Insert before the Search label
            if ($label.length) $box.insertBefore($label);
            else $filter.prepend($box);

            $box.append('<span id="raid-move-filter-label" style="white-space:nowrap;">Filter Move:</span>');
            $box.append('<select id="raid-move-filter" class="bs-btn bs-btn-default" style="max-width:220px;"></select>');
            $box.append('<span style="white-space:nowrap;">Speed:</span>');
            $box.append('<select id="raid-speed-filter" class="bs-btn bs-btn-default" style="max-width:160px;">' +
                '<option value="">All</option>' +
                '<option value="faster">Faster than target</option>' +
                '<option value="slower">Slower than target</option>' +
                '</select>');
        }

        // Make the search label align nicely and push Search to the far right
        if ($label.length) {
            // Push Search to the far right
            $label.css({display: 'flex', 'align-items': 'center', gap: '6px', margin: 0, 'margin-left': 'auto'});
        }

        // Ensure filter text is readable in dark themes
        try {
            if (!document.getElementById('raid-inline-filter-style')) {
                var css2 = '' +
                    '#holder-2_wrapper .dataTables_filter, #holder-2_wrapper .dataTables_filter label { color:#e6e6e6 !important; }' +
                    '#holder-2_wrapper #raid-inline-filters span { color:#e6e6e6 !important; }' +
                    '#holder-2_wrapper #raid-inline-filters select { color:#fff !important; background:#222 !important; border:1px solid #555 !important; }' +
                    '#holder-2_wrapper #raid-inline-filters option { color:#000; }';
                var st2 = document.createElement('style');
                st2.id = 'raid-inline-filter-style';
                st2.type = 'text/css';
                st2.appendChild(document.createTextNode(css2));
                document.head.appendChild(st2);
            }
        } catch (e) {
            // ignore
        }
    }

    raidPlaceInlineFilters();
    raidPopulateMoveFilter();
    raidBindMoveFilter();
    raidBindSpeedFilter();
    $(document).on("change input", ".calc-trigger", function () {
        if (window.RAID_SPEED_CACHE) RAID_SPEED_CACHE.targetSpeed = null;
    });

    function raidRefreshSettingsUI() {
        $('input[name="raid-mode-inline"][value="' + RAID_SETTINGS.mode + '"]').prop('checked', true);
        $('#raid-setting-bossdmg').prop('checked', !!RAID_SETTINGS.calcBossDamage);
        $('input[name="raid-setting-attacker-nature"][value="' + RAID_SETTINGS.attackerNatureProfile + '"]').prop('checked', true);
        $('input[name="raid-setting-defender-nature"][value="' + RAID_SETTINGS.defenderProfile + '"]').prop('checked', true);
        $('#raid-setting-defitems').prop('checked', !!RAID_SETTINGS.useDefItems);

        if (RAID_SETTINGS.mode === 'findAttacker') {
            $('#raid-setting-attacker-natures').show();
            $('#raid-setting-bossdmg-wrap').show();
            $('#raid-setting-defender-natures').hide();
            $('#raid-setting-def-items-wrap').hide();
        } else {
            $('#raid-setting-attacker-natures').hide();
            $('#raid-setting-bossdmg-wrap').hide();
            $('#raid-setting-defender-natures').show();
            $('#raid-setting-def-items-wrap').show();
        }
    }

    $(document)
        .off('change.raidsettings', '#raid-setting-bossdmg, #raid-setting-defitems, input[name="raid-mode-inline"], input[name="raid-setting-attacker-nature"], input[name="raid-setting-defender-nature"]')
        .on('change.raidsettings', '#raid-setting-bossdmg, #raid-setting-defitems, input[name="raid-mode-inline"], input[name="raid-setting-attacker-nature"], input[name="raid-setting-defender-nature"]', function () {
            RAID_SETTINGS.calcBossDamage = $('#raid-setting-bossdmg').is(':checked');
            RAID_SETTINGS.useDefItems = $('#raid-setting-defitems').is(':checked');
            RAID_SETTINGS.mode = $('input[name="raid-mode-inline"]:checked').val() || 'findAttacker';
            RAID_SETTINGS.attackerNatureProfile = $('input[name="raid-setting-attacker-nature"]:checked').val() || 'atk_neutral';
            RAID_SETTINGS.defenderProfile = $('input[name="raid-setting-defender-nature"]:checked').val() || 'def_neutral';
            raidRefreshSettingsUI();
        });
// Ensure defender settings defaults exist
if (!RAID_SETTINGS.defenderProfile) RAID_SETTINGS.defenderProfile = 'def_neutral';
if (RAID_SETTINGS.useDefItems === undefined) RAID_SETTINGS.useDefItems = true;

    raidRefreshSettingsUI();
    try {
        var $cv = $('#holder-2_wrapper .ColVis').first();
        if ($cv.length) {
            $cv.css({ marginLeft: 'auto' });           // push it to the far right of row 1
            $('#raid-controls-row1').append($cv);      // place next to Mode/Attack/Defend
        }
    } catch (e) {}

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
                // Exclusions for moves that make no sense in raid
                if (RAID_MOVE_EXCLUSIONS.indexOf(moveName) !== -1) continue;
                // Conditional Ignore for DreamEater
                if (selected.status !== "slp" && moveName === "Dream Eater") continue;

                if (getType(mv) !== wType) continue;

                var bp = getBp(mv);
                var percent = Math.round(100 * Number(selected.originalCurHP) / Number(selected.rawStats.hp));

                // overrides
                if (moveName === "Fling") bp = 130;
                else if (moveName === "Assurance") bp = 120;
                else if (moveName === "Brine" && percent < 50) bp = bp * 2
                else if (selected.status && moveName === "Hex") bp = bp * 2
                else if (selected.status && moveName === "Acrobatics") bp = bp * 2
                // Up the multihits to on average 3.1* for the ones that hit 5 times.
                // https://bulbapedia.bulbagarden.net/wiki/Multistrike_move
                if (mv.multihit && Array.isArray(mv.multihit) && mv.multihit.length > 1 && mv.multihit[1] === 5) {
                    bp = bp * 3.1;
                }

                if (bp <= 0) continue;

                var cat = getCat(mv);
                var catLc = cat.toLowerCase();
                if (catLc === "status") continue;

                var entry = {
                    name: moveName,
                    type: wType,
                    category: cat || "Unknown",
                    bp: bp,
                    multihit: mv && mv.multihit ? mv.multihit : undefined
                };
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

                // Remove Extra Obtainables like Zekrom
                if (RAID_MON_EXCLUSIONS.indexOf(mon.name) !== -1) continue;


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
            var isDefMode = (RAID_SETTINGS && RAID_SETTINGS.mode === 'findDefender');
            if (isDefMode) {
                // Full pool: stable sort by name, NO SLICE
                opts.sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
            } else {
                // Attacker mode: keep your cap
                opts.sort(function (a, b) { return b._score - a._score; });
                if (opts.length > 300) opts = opts.slice(0, 300);
                for (var j = 0; j < opts.length; j++) delete opts[j]._score;
            }

            RAID_LAST.setOptions = opts;
        })();
        raidPopulateMoveFilter();
        raidBindMoveFilter();
        $('#raid-move-filter').val('');
        $('#raid-speed-filter').val('');
        RAID_SPEED_FILTER = "";
        table.clear();

        var $btn = $(this);
        var origText = $btn.text();
        $btn.prop('disabled', true);
        $btn.text('Calculating...');
        $btn.css({ opacity: 0.7 });

        setTimeout(function () {
            try {
                performCalculations();
            } finally {
                $btn.prop('disabled', false);
                $btn.text(origText);
                $btn.css({ opacity: '' });
            }
        }, 0);
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

                // Augmented pool used by calculations (includes auto-added moves like Sacred Sword)
                var rawPicked = (RAID_LAST && RAID_LAST.pickedMoves) ? RAID_LAST.pickedMoves : [];
                var debugPickedMoves = raidAugmentPickedMoves(rawPicked);

                // Determine which moves were auto-added
                var rawNames = {};
                for (var rmi = 0; rmi < rawPicked.length; rmi++) {
                    if (rawPicked[rmi] && rawPicked[rmi].name) rawNames[rawPicked[rmi].name] = true;
                }
                var addedNames = [];
                for (var ami = 0; ami < (debugPickedMoves || []).length; ami++) {
                    var n = debugPickedMoves[ami] && debugPickedMoves[ami].name;
                    if (n && !rawNames[n]) addedNames.push(n);
                }

                var poolList = (debugPickedMoves || [])
                    .map(function (m) { return m && m.name ? m.name : ''; })
                    .filter(Boolean);
                poolList.sort();

                html += '<div><b>Picked move pool (augmented):</b> ' + (debugPickedMoves ? debugPickedMoves.length : 0) + ' moves</div>';
                if (addedNames.length) {
                    addedNames.sort();
                    html += '<div><b>Added Moves:</b> ' + addedNames.join(', ') + '</div>';
                }

// Map added moves by type/category so we can show them in the per-type lists below
                var addedByType = {}; // { [type]: { physical:[name], special:[name] } }
                for (var ax = 0; ax < (debugPickedMoves || []).length; ax++) {
                    var amv = debugPickedMoves[ax];
                    if (!amv || !amv.name) continue;
                    if (addedNames.indexOf(amv.name) === -1) continue;

                    var t = amv.type || '';
                    var cat = String(amv.category || '').toLowerCase();
                    if (!addedByType[t]) addedByType[t] = { physical: [], special: [] };

                    if (cat === 'special') addedByType[t].special.push(amv.name);
                    else addedByType[t].physical.push(amv.name);
                }

                html += '<div style="margin-top:6px;"><b>Generated attackers:</b> ' + (RAID_LAST.setOptions ? RAID_LAST.setOptions.length : 0) + '</div>';
                html += '<hr style="margin:6px 0;" />';

                // Note: picks below are the original weakness picks (pre-augmentation)
                if (RAID_LAST.pickedByWeakType) {
                    for (var wi3 = 0; wi3 < (RAID_LAST.weaknesses || []).length; wi3++) {
                        var ww = RAID_LAST.weaknesses[wi3];
                        var picks = RAID_LAST.pickedByWeakType[ww.type] || {physical: [], special: []};
                        var extra = (addedByType && addedByType[ww.type]) ? addedByType[ww.type] : { physical: [], special: [] };

                        html += '<div style="margin-top:8px;">';
                        html += '<div style="font-weight:700;">' + ww.type + ' (x' + ww.mult + ')</div>';

                        var physNames = (picks.physical || []).map(function (m) { return m.name; });
                        if (extra.physical && extra.physical.length) physNames = physNames.concat(extra.physical);
                        html += '<div><b>Physical:</b> ' + physNames.join(', ') + '</div>';

                        var specNames = (picks.special || []).map(function (m) { return m.name; });
                        if (extra.special && extra.special.length) specNames = specNames.concat(extra.special);
                        html += '<div><b>Special:</b> ' + specNames.join(', ') + '</div>';

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

function setStatus(status) {
    $('#p1 .status').val(status);
    $('#p1 .status').trigger('keyup')
}


$(".set-selector").change(function (e) {
    setLevel("100");
    //Automatically set it to poisned so we get max dmg Hex
    setStatus("Poisoned");
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
    $("#holder-2").show();

    calcDTDimensions();
    constructDataTable();
    placeBsBtn();
    raidBindModeToggleUI();
    raidSyncModeUI();

    $(document).on(
        "change input",
        'input:radio[name="weather"], input:radio[name="gscWeather"], #tailwindL, #tailwindR, #abilityL1, #itemL1, #statusL1, #levelL1, #natureL1',
        function () {
            // wait until shared_controls has done its normal updates
            setTimeout(raidUpdateP1SpeedTotalMod, 0);
        }
    );

// initial paint
    $(function () { setTimeout(raidUpdateP1SpeedTotalMod, 0); });

    // --- Inject RAID_CUSTOM_SETS into existing setdex dropdown (no other files touched) ---
    (function injectRaidSetsIntoSetdex() {
        if (typeof window === "undefined") return;
        if (!window.setdex) return;
        if (typeof RAID_CUSTOM_SETS === "undefined") return;

        Object.keys(RAID_CUSTOM_SETS).forEach(function (species) {
            if (!window.setdex[species]) return;

            var raidSetsForSpecies = RAID_CUSTOM_SETS[species];
            Object.keys(raidSetsForSpecies).forEach(function (setName) {
                // Avoid duplicates if already injected
                if (window.setdex[species][setName]) return;

                window.setdex[species][setName] = {
                    ability: raidSetsForSpecies[setName].ability,
                    item: raidSetsForSpecies[setName].item,
                    nature: raidSetsForSpecies[setName].nature,
                    level: raidSetsForSpecies[setName].level,
                    evs: raidSetsForSpecies[setName].evs,
                    ivs: raidSetsForSpecies[setName].ivs,
                    moves: raidSetsForSpecies[setName].moves,
                    baseStats: raidSetsForSpecies[setName].baseStats,
                    isCustomRaid: true
                };
            });
        });
    })();

    // --- Apply custom raid baseStats / IVs / EVs after set selection ---
    $(document)
        .off('change.raidcustomapply', '.set-selector')
        .on('change.raidcustomapply', '.set-selector', function () {
            var val = $(this).val();
            if (!val || typeof RAID_CUSTOM_SETS === "undefined") return;

            // Expect format: "Species (Set Name)"
            var match = val.match(/^(.+?) \((.+)\)$/);
            if (!match) return;

            var species = match[1];
            var setName = match[2];

            if (!RAID_CUSTOM_SETS[species]) return;
            if (!RAID_CUSTOM_SETS[species][setName]) return;

            var raidSet = RAID_CUSTOM_SETS[species][setName];

            // Delay to let default setdex apply first
            setTimeout(function () {
                var $p1 = $("#p1");
                if (!$p1.length) return;

                var statsOrder = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
                var rowClasses = {
                    hp: 'hp',
                    atk: 'at',
                    def: 'df',
                    spa: 'sa',
                    spd: 'sd',
                    spe: 'sp'
                };

                statsOrder.forEach(function (key) {
                    var rowClass = rowClasses[key];
                    var $row = $p1.find('tr.' + rowClass);
                    if (!$row.length) return;

                    // Base stats
                    if (raidSet.baseStats && raidSet.baseStats[key] != null) {
                        $row.find('input.base').val(raidSet.baseStats[key]);
                    }

                    // IVs
                    if (raidSet.ivs && raidSet.ivs[key] != null) {
                        $row.find('input.ivs').val(raidSet.ivs[key]);
                    }

                    // EVs
                    if (raidSet.evs && raidSet.evs[key] != null) {
                        $row.find('input.evs').val(raidSet.evs[key]);
                    }
                });

                // Recalculate like the normal calculator does
                // 1) update EV sum (existing handlers are bound to keyup/change)
                $p1.find('input.evs, input.ivs').trigger('input').trigger('change').trigger('keyup');

                // 2) update stat totals + stage-mod values via the native functions
                try { calcHP($p1); } catch (e) {}
                try { calcStats($p1); } catch (e) {}

                // 3) keep ability/item side-effects consistent
                try { $p1.find('.ability').trigger('change'); } catch (e) {}
                try { $p1.find('.item').trigger('change'); } catch (e) {}
            }, 0);
        });

    // Keep totals + totalMod in sync when stat stages change (uses native calcStats)
    $(document)
        .off('change.raidboostsync', '#p1 select.boost')
        .on('change.raidboostsync', '#p1 select.boost', function () {
            try { calcStats($('#p1')); } catch (e) {}
        });

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

