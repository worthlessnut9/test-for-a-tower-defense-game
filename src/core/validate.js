import { pathCells, SHAPES, ATTACK_TYPES, SHOT_KINDS, DEFAULT_ATTACK, MAX_TIER, ABILITY_DEFAULTS, abilityOf, deathSpawns } from './sim.js';
import { wallsUsed, pathTypesUsed, MAX_SURFACES } from './terrain.js';
import { NO_VARIANT } from './zombie.js';
import { TOWER_LOOKS } from './tower.js';

/**
 * Returns [{level:'error'|'warn', msg}] for a level. Used by the game (console) and the editor.
 * zones: the available zones (objects with id, name and walls), or null to skip the zone checks.
 * actIds: the available act ids, or null to skip the act check.
 * variantIds: the available zombie variant ids, or null to skip that check.
 */
export function validateLevel(level, towers, enemies, levelIds = [], zones = null, actIds = null, variantIds = null) {
  const out = [];
  const err = (msg) => out.push({ level: 'error', msg });
  const warn = (msg) => out.push({ level: 'warn', msg });
  const towerIds = towers.map((t) => t.id);
  const enemyIds = enemies.map((e) => e.id);

  if (!level.id) err('Level has no id.');
  if (!level.cols || !level.rows) err('Grid size is missing.');
  if (!Array.isArray(level.tiles) || level.tiles.length !== level.rows || level.tiles.some((r) => r.length !== level.cols)) {
    err('Tile rows do not match the grid size.');
  }

  const paths = level.paths || [];
  if (!paths.length) err('Add at least one path.');
  const pathIds = new Set();
  for (const p of paths) {
    if (pathIds.has(p.id)) err('Duplicate path id "' + p.id + '".');
    pathIds.add(p.id);
    if (!p.points || p.points.length < 2) {
      err('Path ' + p.id + ' needs at least 2 points (start and end).');
      continue;
    }
    for (const pt of p.points) {
      if (pt[0] < 0 || pt[1] < 0 || pt[0] >= level.cols || pt[1] >= level.rows) err('Path ' + p.id + ' leaves the grid.');
    }
    if (p.surface !== undefined && !(Number.isInteger(p.surface) && p.surface >= 0 && p.surface < MAX_SURFACES)) warn('Path ' + p.id + ' has surface ' + p.surface + ', which is not a path type from 0 to ' + (MAX_SURFACES - 1) + '; the first path type is used.');
    const cells = pathCells(p.points);
    const free = cells.filter(() => true).length;
    if (!free) err('Path ' + p.id + ' is empty.');
  }

  if (Array.isArray(level.tiles) && /[^.#2-6]/.test(level.tiles.join(''))) warn('The tile grid has characters other than . # 2 3 4 5 6; they are treated as blocked ground.');
  const zone = zones && level.zone ? zones.find((z) => z.id === level.zone) : null;
  if (level.zone && zones && !zone) warn('Zone "' + level.zone + '" does not exist, so the default look is used.');
  if (level.tier !== undefined && level.tier !== '' && !(Number.isInteger(level.tier) && level.tier >= 1 && level.tier <= MAX_TIER)) warn('Tier ' + level.tier + ' is not a whole number from 1 to ' + MAX_TIER + ', so the zone\'s tier is used.');
  const used = wallsUsed(level.tiles);
  const have = zone && zone.walls ? zone.walls.length : 1;
  if (used > have) warn('The level paints wall type ' + used + ', but ' + (zone ? 'zone "' + zone.name + '"' : 'the default look') + ' only has ' + have + ' wall type' + (have === 1 ? '' : 's') + '. Extra walls are drawn like wall type 1.');
  const pUsed = pathTypesUsed(level);
  const pHave = zone && zone.paths ? zone.paths.length : 1;
  if (pUsed > pHave) warn('A path uses path type ' + pUsed + ', but ' + (zone ? 'zone "' + zone.name + '"' : 'the default look') + ' only has ' + pHave + ' path type' + (pHave === 1 ? '' : 's') + '. Extra path types are drawn like path type 1.');
  if (level.act && actIds && !actIds.includes(level.act)) warn('Act "' + level.act + '" does not exist, so the level is listed under Other levels.');

  if (level.variant && level.variant !== NO_VARIANT && variantIds && !variantIds.includes(level.variant)) warn('Zombie variant "' + level.variant + '" does not exist, so the zone\'s look is used.');

  const allowed = level.towers || [];
  if (!allowed.length) warn('No towers selected; all towers will be allowed.');
  for (const id of allowed) if (!towerIds.includes(id)) err('Allowed tower "' + id + '" does not exist.');

  const waves = level.waves || [];
  if (!waves.length) err('Add at least one wave.');
  waves.forEach((w, i) => {
    if (!(w.groups || []).length) warn('Wave ' + (i + 1) + ' has no enemies.');
    for (const g of w.groups || []) {
      if (!enemyIds.includes(g.enemy)) err('Wave ' + (i + 1) + ' uses missing enemy "' + g.enemy + '".');
      if (g.path && !pathIds.has(g.path)) err('Wave ' + (i + 1) + ' uses missing path "' + g.path + '".');
      if (!(g.count > 0)) warn('Wave ' + (i + 1) + ' has a group with count 0.');
    }
  });

  const pool = allowed.length ? allowed : towerIds;
  const cheapest = Math.min(...towers.filter((t) => pool.includes(t.id)).map((t) => t.cost));
  if (isFinite(cheapest) && level.startMoney < cheapest) warn('Starting money is below the cheapest tower cost.');

  const checkCond = (c) => {
    if (!c) return;
    if (c.level) {
      if (c.level === level.id) err('Unlock rule refers to this level itself.');
      else if (levelIds.length && !levelIds.includes(c.level)) err('Unlock rule refers to missing level "' + c.level + '".');
    }
    (c.conditions || []).forEach(checkCond);
  };
  checkCond(level.unlock);
  return out;
}

/**
 * Checks for the enemy files: spawn references that point nowhere or loop forever, and ability settings that cannot work.
 * Returns [{ enemy: id, level: 'error'|'warn', msg }].
 */
export function validateEnemies(enemies) {
  const out = [];
  const ids = new Set(enemies.map((e) => e.id));
  const add = (e, level, msg) => out.push({ enemy: e.id, level, msg });
  for (const e of enemies) {
    for (const sp of deathSpawns(e)) if (!ids.has(sp.enemy)) add(e, 'warn', 'It leaves behind "' + sp.enemy + '" when killed, but there is no such enemy.');
    const su = abilityOf(e, 'summon');
    if (su) {
      for (const g of su.enemies || []) if (!ids.has(g.enemy)) add(e, 'warn', 'It summons "' + g.enemy + '", but there is no such enemy.');
      if (!(su.enemies || []).length) add(e, 'warn', 'It can summon, but the list of zombies to summon is empty.');
    }
    for (const key of Object.keys(ABILITY_DEFAULTS)) {
      const a = abilityOf(e, key);
      if (!a) continue;
      for (const [k, v] of Object.entries(a)) if (typeof ABILITY_DEFAULTS[key][k] === 'number' && !(Number.isFinite(v) && v > 0)) add(e, 'warn', 'Its ' + key + ' ' + k + ' must be more than 0.');
    }
    if (e.leap && e.flying) add(e, 'warn', 'Flying zombies do not leap (they already fly straight to the exit).');
  }
  // a zombie that bursts into zombies that burst into it again would never stop
  const next = (id) => deathSpawns(enemies.find((x) => x.id === id) || {}).map((x) => x.enemy);
  for (const e of enemies) {
    const seen = new Set();
    const walk = (id) => {
      if (id === e.id && seen.size) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return next(id).some(walk);
    };
    if (next(e.id).some(walk)) add(e, 'error', 'Its death spawns lead back to itself, so killing it would never end.');
  }
  return out;
}

export function validateTower(t, enemiesUnused) {
  const out = [];
  if (!t.id) out.push({ level: 'error', msg: 'Tower has no id.' });
  if (!SHAPES.includes(t.shape)) out.push({ level: 'warn', msg: 'Unknown shape.' });
  if (!t.attack || !ATTACK_TYPES.includes(t.attack.type)) out.push({ level: 'error', msg: 'Unknown attack type.' });
  return out;
}

/** Checks for the game-wide settings (data/game.json plus tower prices). Same shape as validateLevel. */
export function validateGame(game, towers) {
  const out = [];
  const err = (msg) => out.push({ level: 'error', msg });
  const warn = (msg) => out.push({ level: 'warn', msg });
  const free = towers.filter((t) => !(Number(t.price) > 0));
  if (!towers.length) err('There are no towers.');
  else if (!free.length) err('Every tower costs coins, so a new player would have nothing to build. Make at least one tower free (price 0).');
  if (game.teamSlots < 1) err('Team slots must be at least 1.');
  else if (free.length > game.teamSlots) warn(free.length + ' towers are free but the team only has ' + game.teamSlots + ' slots, so some free towers will start on the bench.');
  if (towers.length && towers.length <= game.teamSlots) warn('There are no more towers than team slots, so the team choice does not matter yet.');
  return out;
}

/** Checks on tower files: returns [{ tower, level: 'warn', msg }]. */
export function validateTowers(towers) {
  const out = [];
  for (const t of towers || []) {
    const a = { ...DEFAULT_ATTACK, ...(t.attack || {}) };
    const warn = (msg) => out.push({ tower: t.id, level: 'warn', msg: (t.name || t.id) + ': ' + msg });
    if (t.look && !TOWER_LOOKS.includes(t.look)) warn('unknown design "' + t.look + '", so it is drawn as a plain shape.');
    if (a.shot && !SHOT_KINDS.includes(a.shot)) warn('unknown shot look "' + a.shot + '".');
    if (!ATTACK_TYPES.includes(a.type)) warn('unknown attack type "' + a.type + '".');
    if (a.type === 'income') {
      if (!(a.income > 0)) warn('it earns no money: income is 0.');
      if (!(a.cooldown > 0)) warn('the payout interval must be above 0.');
    } else {
      const poison = a.poisonDps > 0 || a.poisonRamp > 0;
      if (poison && !(a.poisonDuration > 0)) warn('it has poison damage but poison never lasts: set a poison duration.');
      if (!(a.damage > 0) && !(a.burnDps > 0) && !poison && !(a.slowFactor < 1)) warn('it does no damage, burn, poison or slow.');
      if (a.type === 'arc' && a.chain > 0 && !(a.chainRange > 0)) warn('the shock chains but has no jump reach.');
    }
    for (const p of t.paths || []) for (const x of p.tiers || []) {
      if (a.type === 'income' && x.damage) warn('tier "' + x.name + '" adds damage, which an income tower never uses.');
      if (x.chain && a.type !== 'arc') warn('tier "' + x.name + '" adds chain jumps, which only an arc tower uses.');
      if (x.income && a.type !== 'income') warn('tier "' + x.name + '" adds income, which only an income tower pays.');
    }
  }
  return out;
}
