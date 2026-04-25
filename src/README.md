# Source Notes

This document summarizes balance and mechanics adjustments used by this calculator fork.

## Core Updates

- Added snow support to Gen 5 mechanics.
- Added Snowscape as a move.
- Updated burn interaction so it does not reduce Facade damage.
- Added Sharpness and Neutralizing Gas in `abilities.js`.
- Fixed critical damage multiplier to 1.5.

## Base Stat Updates

- Butterfree: Special Attack 80 -> 90
- Beedrill: Attack 80 -> 90
- Pidgeot: Speed 91 -> 101
- Pikachu: Defence 30 -> 40, Special Defence 40 -> 50
- Raichu: Speed 100 -> 110
- Nidoqueen: Attack 82 -> 92
- Nidoking: Attack 92 -> 102
- Clefable: Special Attack 85 -> 95
- Wigglytuff: Special Attack 75 -> 85
- Vileplume: Special Attack 100 -> 110
- Poliwrath: Attack 85 -> 95
- Alakazam: Special Defence 85 -> 95
- Victreebel: Special Defence 60 -> 70
- Golem: Attack 110 -> 120
- Ampharos: Defence 75 -> 85
- Bellossom: Defence 85 -> 95
- Azumarill: Special Attack 50 -> 60
- Jumpluff: Special Defence 85 -> 95
- Beautifly: Special Attack 90 -> 100
- Exploud: Special Defence 63 -> 73
- Staraptor: Special Defence 50 -> 60
- Roserade: Defence 55 -> 65
- Stoutland: Attack 100 -> 110
- Unfezant: Attack 105 -> 115
- Gigalith: Special Defence 70 -> 80
- Seismitoad: Attack 85 -> 95
- Leavanny: Special Defence 70 -> 80
- Scolipede: Attack 90 -> 100
- Krookodile: Defence 70 -> 80
- Cresselia: Defence -> 110
- Cresselia: Special Defence -> 120

- Arbok: Attack 85 -> 95
- Dugtrio: Attack 80 -> 100 (checked)
- Farfetch'd: Attack 65 -> 90
- Dodrio: Speed 100 -> 110
- Electrode: Speed 140 -> 150
- Exeggutor: Special Defence 65 -> 75
- Noctowl: Special Attack 76 -> 86
- Ariados: Special Defence 60 -> 70
- Qwilfish: Defence 75 -> 85
- Magcargo: HP 50 -> 60, Special Attack 80 -> 90
- Corsola: HP 55 -> 65, Defence 85 -> 95, Special Defence 85 -> 95
- Mantine: HP 65 -> 85
- Swellow: Special Attack 50 -> 75
- Pelipper: Special Attack 85 -> 95
- Masquerain: Special Attack 80 -> 100, Speed 60 -> 80
- Delcatty: Speed 70 -> 90
- Volbeat: Defence 55 -> 75, Special Defence 75 -> 85
- Lunatone: HP 70 -> 90
- Solrock: HP 70 -> 90
- Chimecho: HP 65 -> 75, Defence 70 -> 80, Special Defence 80 -> 90
- Woobat: HP 55 -> 65
- Crustle: Attack 95 -> 105
- Beartic: Attack 110 -> 130
- Cryogonal: HP 70 -> 80, Defence 30 -> 50
- Mega Alakazam: Special Defence 95 -> 105 (checked)

Reference:
[Pokemon base stat change discussion](https://pokemondb.net/pokebase/267683/pokemon-increased-decreased-previous-generation-generation)

## Gen 5 Move Patch Notes

```javascript
var MMO_PATCH = {
    "Rapid Spin": { bp: 50 },
    "Sucker Punch": { bp: 70 },
    Outrage: { bp: 90 },
    "Ice Ball": { isBullet: true },
    Thief: { bp: 60 },
    Barrage: { isBullet: true },
    Bubble: { bp: 40 },
    Chatter: { bp: 65 },
    "Egg Bomb": { isBullet: true },
    "Follow Me": { priority: 2 },
    Hurricane: { bp: 110 },
    "Hidden Power": { bp: 60 },
    "Hidden Power Bug": { bp: 60 },
    "Hidden Power Dark": { bp: 60 },
    "Hidden Power Dragon": { bp: 60 },
    "Hidden Power Electric": { bp: 60 },
    "Hidden Power Fighting": { bp: 60 },
    "Hidden Power Fire": { bp: 60 },
    "Hidden Power Flying": { bp: 60 },
    "Hidden Power Ghost": { bp: 60 },
    "Hidden Power Grass": { bp: 60 },
    "Hidden Power Ground": { bp: 60 },
    "Hidden Power Ice": { bp: 60 },
    "Hidden Power Poison": { bp: 60 },
    "Hidden Power Psychic": { bp: 60 },
    "Hidden Power Rock": { bp: 60 },
    "Hidden Power Steel": { bp: 60 },
    "Hidden Power Water": { bp: 60 },
    "Magma Storm": { bp: 100 },
    "Magnet Bomb": { isBullet: true },
    "Mist Ball": { isBullet: true },
    Moonlight: { type: "Fairy" },
    "Mud Bomb": { isBullet: true },
    "Searing Shot": { isBullet: true },
    "Smelling Salts": { bp: 70 },
    Synchronoise: { bp: 120 },
    "Techno Blast": { bp: 120 },
    Thunder: { bp: 110 },
    "Wake-Up Slap": { bp: 70 },
    "Acid Spray": { isBullet: true },
    "Air Cutter": { bp: 60 },
    "Ancient Power": {},
    Assurance: { bp: 60 },
    "Aura Sphere": { bp: 80, isBullet: true, isPulse: true },
    Blizzard: { bp: 110 },
    "Bullet Seed": { isBullet: true },
    Charm: { type: "Fairy" },
    "Cotton Spore": { target: "allAdjacentFoes" },
    Crabhammer: { bp: 100 },
    "Dark Pulse": { isPulse: true },
    "Draco Meteor": { bp: 130 },
    "Dragon Pulse": { bp: 85, isPulse: true },
    "Electro Ball": { isBullet: true },
    "Energy Ball": { bp: 90, isBullet: true },
    "Final Gambit": { makesContact: false },
    "Fire Blast": { bp: 110 },
    "Fire Pledge": { bp: 80 },
    Flamethrower: { bp: 90 },
    "Focus Blast": { isBullet: true },
    "Frost Breath": { bp: 60 },
    "Future Sight": { bp: 120 },
    "Grass Pledge": { bp: 80 },
    "Gyro Ball": { isBullet: true },
    "Heal Pulse": { isPulse: true },
    "Heat Wave": { bp: 95 },
    Hex: { bp: 65 },
    "Hydro Pump": { bp: 110 },
    "Ice Beam": { bp: 90 },
    Incinerate: { bp: 60 },
    "Leaf Storm": { bp: 130 },
    Lick: { bp: 30 },
    "Low Sweep": { bp: 65 },
    "Meteor Mash": { bp: 90 },
    "Muddy Water": { bp: 90 },
    Octazooka: { isBullet: true },
    Overheat: { bp: 130 },
    "Pin Missile": { bp: 25 },
    "Power Gem": { bp: 80 },
    "Rage Powder": { priority: 2 },
    "Rock Tomb": { bp: 60 },
    "Rock Wrecker": { isBullet: true },
    "Seed Bomb": { isBullet: true },
    "Shadow Ball": { isBullet: true },
    "Skull Bash": { bp: 130 },
    "Sludge Bomb": { isBullet: true },
    Smog: { bp: 30 },
    Snore: { bp: 50 },
    "Storm Throw": { bp: 60 },
    "Struggle Bug": { bp: 50 },
    Surf: { bp: 90 },
    Thunderbolt: { bp: 90 },
    "Vine Whip": { bp: 45 },
    "Water Pledge": { bp: 80 },
    "Water Pulse": { isPulse: true },
    "Weather Ball": { isBullet: true },
    "Zap Cannon": { isBullet: true },
    "Aerial Ace": { isSlicing: true },
    "Air Slash": { isSlicing: true },
    "Cross Poison": { isSlicing: true },
    "Fury Cutter": { bp: 40, isSlicing: true },
    "Leaf Blade": { isSlicing: true },
    "Night Slash": { isSlicing: true },
    "Psycho Cut": { isSlicing: true },
    "Razor Leaf": { isSlicing: true },
    "Razor Shell": { isSlicing: true },
    "Sacred Sword": { isSlicing: true },
    Slash: { isSlicing: true },
    "Solar Blade": { isSlicing: true },
    "X-Scissor": { isSlicing: true }
};

var BW = (0, util_1.extend)(true, {}, DPP, BW_PATCH, MMO_PATCH);
delete BW["Faint Attack"];
```
