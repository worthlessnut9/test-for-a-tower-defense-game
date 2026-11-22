# Zombie Defense

A grid-based tower defense game built with [Phaser 3](https://phaser.io): military towers against zombie hordes. Made to run as a static site on GitHub Pages.
Towers, enemies and levels are plain JSON files, so you can add content without touching the game code.

## Run it

* **GitHub Pages:** push this folder to a repo, then *Settings → Pages → Deploy from a branch → main / (root)*.
* **Locally:** browsers block `fetch` on `file://`, so serve the folder: `python -m http.server` and open <http://localhost:8000>.

Phaser loads from the jsDelivr CDN (see `index.html`). To work offline, save `phaser.min.js` into a `lib/` folder and point the `<script>` tag at it.

## Folder layout

Every tower, enemy, level, zone, act and zombie variant lives in its own folder. Each of the top-level folders has an `index.json` that lists the ids in display order. The game only loads what the index lists.

```
index.html                    page + Phaser script tag
editor.html                   the level / tower / enemy editor (standalone page)
src/main.js                   game config
src/core/                     game logic with no Phaser in it (sim, unlock rules, save, validation, terrain drawing)
src/scenes/                   Phaser scenes (boot, home, level select, team, gameplay)
data/game.json                game-wide settings (team size, coins, endless scaling)
towers/index.json             ordered list of tower ids
towers/<id>/tower.json        one tower
enemies/index.json            ordered list of enemy ids
enemies/<id>/enemy.json       one enemy
levels/index.json             ordered list of level ids
levels/<id>/level.json        one level
zones/index.json              ordered list of zone ids (optional folder)
zones/<id>/zone.json          one zone: the look of the grass, path and its wall types
acts/index.json               ordered list of act ids (optional folder)
acts/<id>/act.json            one story act (chapter)
variants/index.json           ordered list of zombie variant ids (optional folder)
variants/<id>/variant.json    one zombie reskin (snowy, muddy ...)
```

The folders are where sprites will go later: for example `towers/marksman/sprite.png` next to `tower.json`.

## Starter content

The repo ships with 8 towers (each with a full 3 × 5 upgrade tree) and 9 base zombies (each with an alt for every zone variant) but **no levels**: `levels/index.json` is an empty list and the game shows a "No levels yet" message until you add some.

If you are updating from an older version, delete `data/towers.json` and `data/enemies.json`. They are no longer used.

## Adding content

Use the level editor (the Level Workshop) to design levels, towers and enemies, then export and copy the files in.
A copy of the editor is also in this repo as `editor.html`, so once the site is on Pages you can open `/editor.html` on it too.
Its work is autosaved in your browser, so export your files to keep them safe.

The editor's **Download everything (.zip)** button produces every file in the right folder; unzip it over the repo. Each file also has its own Download and Copy buttons on the **Files** tab (a single download is named like `marksman-tower.json`, so put it at the path shown next to it).

Deleting or renaming something in the editor does not remove its old folder from your repo. The index decides what the game loads, so a leftover folder is harmless; delete it by hand if you like. The editor can also import single tower, enemy, level, zone, act and variant files, `index.json` files, and the old bundled `towers.json` / `enemies.json`.

## How things work

* **Towers** (`towers/<id>/tower.json`): a `look` (the drawn operator or machine: `marksman`, `sniper`, `demolitionist`, `flamethrower`, `toxicologist`, `minigunner`, `scrapper`, `tesla`; leave it out for a plain coloured `shape`), `color` (the uniform / casing), an optional one-line `blurb`, `cost` (to place in a level), `price` (coins to buy it on the Team screen, 0 = free starter), a base `attack` and up to three upgrade `paths`. The `attack.type` is one of:
  * `projectile`: flies to the target. `shot` sets how it looks in flight (`bullet`, `tracer`, `grenade` and `flask` are lobbed, `rocket`), `splashRadius` makes it explode, `spinUp` (seconds) makes a gun start 3 times slower and reach full speed after that long of continuous fire.
  * `beam`: constant damage per second to `shots` zombies at once (the flamethrower).
  * `pulse`: hits everything in range at once.
  * `arc`: an instant shock. It hits the target, then jumps to the nearest zombie within `chainRange`, `chain` more times, each jump keeping `chainFalloff` of the damage and never hitting the same zombie twice (the Tesla Coil).
  * `income`: shoots nothing. It pays `income` money every `cooldown` seconds, but only while a wave is on, so waiting around earns nothing (the Scrapper).
  Any attack can also have `slowFactor` + `slowDuration`, `burnDps` + `burnDuration`, `armorPierce`, `shots`, `armorBonus` (extra damage against armored zombies, those with a base armor of 0.2 or more, such as the Armored Walker: `0.5` is +50%), `bounty` (money for every zombie that dies within range), and poison: `poisonDps` plus `poisonRamp` (extra damage per second for every second the zombie has already been poisoned, up to 10 seconds), `poisonDuration` (how long it lasts after the last hit; hitting again keeps the ramp going), `poisonSpread` (a poisoned zombie that dies passes it to zombies this close). Poison and burn ignore armor.
* **The eight towers**: Marksman (a basic rifleman), Sniper (huge slow shots, goes for the strongest zombie), Demolitionist (thrown explosives with splash, extra damage against armored zombies), Flamethrower (very short range, high damage, sets zombies on fire), Toxicologist (very slow flasks of poison that grows deadlier the longer a zombie is poisoned), Minigunner (spins up, then a hail of bullets, rockets at the top of one path, no lasers), Scrapper (earns money during waves and collects bounties, never shoots) and Tesla Coil (medium damage shocks that chain between nearby zombies). Marksman, Demolitionist and Toxicologist are the free starters. The figures are drawn in `src/core/tower.js` and show their upgrades (scopes, extra barrels, bigger tanks, more coils ...).
* **Upgrade paths and tiers** (Bloons-style): each path is a list of tiers bought in order. A tier has a `name`, a `cost` (money spent inside a level), a `price` (coins to unlock it for good on the Team screen, 0 = free) and any of these modifiers, stacked on the base attack and the tiers below it: `damage`, `range`, `splashRadius`, `slowDuration`, `armorPierce`, `shots`, `burnDps`, `armorBonus`, `poisonDps`, `poisonRamp`, `poisonSpread`, `chain`, `chainRange`, `chainFalloff` (at most 1 in total), `income`, `bounty` (add); `cooldown`, `projectileSpeed`, `slowFactor`, `spinUp` (multiply, so `0.8` is 20% faster); `slowTo` (set the slow); `burnDuration`, `poisonDuration` (set); `hitsAir` / `hitsGround` (turn on). An optional `desc` replaces the auto-written tier description.
* **Crosspath rules**: per tower, `upgradeRules: { "maxPaths": 2, "secondaryMax": 2 }` (these are the defaults). A tower can use at most `maxPaths` paths, and only one path may go past tier `secondaryMax`. In game, click a tower and use the three path buttons (or **Q / W / E**); hover a button to read what the next tier does.
* **Enemies** (`enemies/<id>/enemy.json`): a `look` (body plan: `crawler`, `walker`, `runner`, `brute`, `armored`, `king`, `screamer`, `leaper`, `necromancer`, and `bird` for flyers; leave it out for a plain coloured shape), colours (`color` is the skin, `clothes`, `detail` for wounds and veins), `size`, health, speed, rewards, and optional traits (`flying`, `armor` 0-0.95, `regen`, `slowImmune`). Optional abilities, each an object you can leave out:
  * `spawnOnDeath`: `[{ "enemy": "walker", "count": 3 }]`. What it bursts into when killed (the old `splitInto` + `splitCount` still work). A loop (A leaves B, B leaves A) is reported as an error by the editor.
  * `scream`: `{ "interval": 5, "range": 2.5, "duration": 2 }`. Every `interval` seconds it forces every tower within `range` tiles of it to aim at it for `duration` seconds (a tower only takes the bait if the screamer is in its own range).
  * `leap`: `{ "range": 2, "cooldown": 3, "time": 0.5, "minGain": 1 }`. If another path has a point within `range` tiles that is at least `minGain` tiles closer to the exit, it jumps there.
  * `ward`: `{ "range": 2.5 }`. Zombies in range cannot die (they hold at 1 health) while it lives, and towers that would shoot a protected or summoned zombie shoot the ward carrier instead when it is in range.
  * `summon`: `{ "interval": 8, "max": 6, "enemies": [{ "enemy": "walker", "count": 2 }, { "enemy": "crawler", "count": 2 }] }`. Summoned zombies pay no coins or score.
* **The nine base zombies** (they come back in every act, and more will follow): Crawler (very weak, very slow), Walker (weak, slow), Runner (weak, fast), Brute (high health, very slow), Armored Walker (high health, medium speed), Zombie King (medium health, slow; bursts into walkers, crawlers and runners), Screamer (medium, medium; screams), Leaper (weak, medium; jumps lanes), Necromancer (high health, slow; ward + summon).
* **Zombie tiers and ranks**: every zone has a `tier` from 1 to 50 (the shipped zones count up in order) and a level can override it with its own `tier`. A zombie's health, speed, armor and coin reward grow with the tier, so the same Walker is tougher in a later zone. Defaults per tier above 1: health +12%, speed +0.6% (capped at x1.6), armor +0.4% (capped at 0.8), reward +4%. A zombie can change this with `"scaling": { "health", "speed", "armor", "reward" }`. Every 10 tiers is a rank (Hardened 11+, Veteran 21+, Elite 31+, Apex 41+) shown as a coloured mark and pips on the zombie, and in its name.
* **Home screen**: three sections. **Story Mode** plays the levels in order, and each level opens when the one before it is completed (a level's `unlock` rule is an optional *extra* requirement on top of that). **Free Play** is endless mode on any level the story has opened. **Team** is where players spend coins and choose their loadout: buy towers, buy each upgrade tier of each tower (one tier at a time, in order along every path), and pick which owned towers they bring into a level.
* **Coins** are earned by winning story levels (the level's `reward`, default 50, the first time; `repeatRewardPct` of it on replays) and by surviving endless waves (`endlessCoinsPerWave` each). Towers with `price: 0` are owned from the start; anything else is bought on the Team screen. A level's `towers` list still limits what can be built there, so a level can only be played with towers that are on the team and allowed by the level.
* **Upgrades are bought twice**: first with coins on the Team screen (the tier's `price`, permanent, in order on each path), then with money inside a level (the tier's `cost`) as before. A tier the player has not bought shows as locked in battle. Tiers with `price: 0` at the front of a path are unlocked from the start. The editor's playtest has every tier unlocked so you can test levels freely. Bought tiers are saved per tower in the browser's localStorage.
* **Endless mode** replays the level's waves forever; each loop adds `endlessCountGrowth` more enemies per group and `endlessHpGrowth` more health. It ends when the lives run out, and the best wave per level is saved.
* **Game settings** (`data/game.json`): `teamSlots`, `startCoins`, `repeatRewardPct`, `endlessCoinsPerWave`, `endlessHpGrowth`, `endlessCountGrowth`. The Level Workshop's **Game** tab edits these.
* **Zones** (`zones/<id>/zone.json`): a shared look for levels. Each level picks one with `"zone": "<zone id>"`; levels without a zone (or with an unknown id, which also logs a warning) use a plain default look. A zone has `name`, an optional `description`, grass (`grassA`, `grassB`, `grassStyle`), a `paths` list of up to 4 path types and a `walls` list of up to 6 wall types, each `{ "name", "color", "inner", "style" }`. Colours are `#rrggbb`. The two grass colours alternate like a checkerboard. Styles: grass `plain` / `speckle` / `tiles` / `stripes`; path `plain` / `cobble` / `road` / `planks` / `rails` / `dirt` / `gravel` / `sand` / `snow` / `bridge` / `tiles` / `grating` / `mud` / `flesh` / `ice`; wall `block` / `rock` / `tree` / `crate` / `brick` / `fence` / `water` / `bush` / `metal` / `mound` / `ice` / `ruins` / `tent` / `silo` / `barricade`, and the buildings `house` / `cabin` / `warehouse` / `skyscraper` / `shop`. Building tiles that touch (same wall number, next to each other) join into one bigger roof or log wall, so a block of `#` tiles looks like one building. The repo ships 50 zones (10 per act, 4 path types and 6 wall types each, including buildings that fit the zone, with the descriptions from the story outline). The `zones` folder is optional, and the game still runs without it. Old zones with a single `wall` / `wallInner` / `wallStyle` still load as a one-wall zone, and a single `path` / `pathInner` / `pathStyle` loads as a one-path-type zone. Zones are drawn from shapes today, so sprites can replace them later. The zone descriptions mention gimmicks (fog, floods, fires); these are flavour only, not game mechanics yet.
* **Path types in levels**: each level path can say which of its zone's path types it is drawn with, `{ "id": "A", "surface": 2, "points": [...] }` (`surface` is 0-based, 0 or missing = the zone's first path type). It only changes how the path looks, and zombies walk every type the same. Where two paths cross, the first path in the list decides the look. A `surface` the zone doesn't have shows a warning and draws as the first type. In the Level Workshop use the **type** box next to the path picker.
* **Walls in levels**: in `tiles`, `.` is buildable and `#` is the zone's first wall type, `2` to `6` are its second to sixth. Walls are never buildable, and each type only changes how the tile looks. A level that paints a wall number its zone doesn't have shows a warning and draws it like wall type 1. In the Level Workshop, choose the Wall tool and then the wall type to paint.
* **Acts** (`acts/<id>/act.json`): the story chapters. An act has `name`, `description` and `color`. A level joins one with `"act": "<act id>"`. Story mode opens on a card for each act, and each act opens its own list of levels; levels without an act (or with an unknown one) appear under **Other levels**. If there is no `acts` folder, story mode is one flat list as before. Order comes from `acts/index.json`, and the story still unlocks one level after the next straight through every act, in the order of `levels/index.json`, so keep levels grouped by act in that file (the Level Workshop does this for you). Five acts ship: Spring, Summer, Autumn, Winter and The Thaw of Horror.
* **Zombie looks and variants**: zombies are drawn from circles and lines (`src/core/zombie.js`), facing the way they walk, and shared by the game and the Level Workshop. A **variant** (`variants/<id>/variant.json`: `name`, `description`, `tint` `{ color, amount }`, `extras`, and optional gear: `outfit`, one of `hood`, `hardhat`, `brimhat`, `beanie`, `helmet`, `hazmat`, `cap`, `scarf`, with a `gear` colour) reskins every zombie: the tint is blended into skin and clothes and the overlays (`snow`, `frost`, `mud`, `moss`, `soot`, `blood`, `toxic`, `fungus`, `flesh`, `leaves`, `dust`) are drawn on top. A zone picks one with `"variant": "<id>"`, a level can override it with its own `"variant"` (`"none"` cancels the zone's), and a zombie can have its own take on a variant with `"variants": { "snowy": { "color", "clothes", "detail", "extras", "outfit", "gear" } }` in its enemy file (`"outfit": ""` opts out of the variant's gear; the shipped zombies have a take on all eleven variants). Any look works with any variant, so new zombie types get all the reskins for free. Eleven variants ship and every zone has one. The `variants` folder is optional; an unknown variant id is ignored with a warning.
* **Levels**: a tile grid (`.` buildable, `#` and `2` to `6` are wall types), one or more waypoint `paths`, allowed towers, waves, and an `unlock` rule.
* **Playing a level** (laid out like Bloons TD): lives, cash and the round counter sit in a bar above the map, with a ⚙ button for pause / restart / quit. The right panel is a grid of your team's towers (hover one for its stats, click it, then click a tile). Clicking a placed tower swaps the panel to that tower's upgrades: a target selector (◀ ▶), three upgrade paths with their next tier, price and tier pips, and a Sell button. The big green button starts the next round (you can call rounds early) and the one beside it cycles 1x / 2x / 3x speed. Keys: **1-9** pick a tower, **Space** start round, **Q / W / E** upgrade a path, **X** sell, **F** speed, **P** pause, **Esc** cancel (or open the menu).
* **Stars**: 1 for winning, 2 if at least half the lives remain, 3 if no lives were lost.
* **Extra unlock rules** (optional, on top of the story order) can be combined freely: `always`, `levelComplete`, `levelStars`, `levelScore`, `totalStars`, `levelsCompleted`, `totalScore`, plus `all` / `any` groups.
* **Progress** (stars, coins, owned towers, team, best endless waves) is saved in the browser's localStorage (per browser, per device).

## Adding sprites later

Everything is drawn from shapes in `src/scenes/draw.js`, `src/core/zombie.js`, `src/core/tower.js` and `GameScene.js`. To use images, load them in `BootScene`, add an optional `sprite` key to the tower/enemy JSON, and draw that instead of `drawShape`.
