// Pure game simulation. No Phaser, no DOM.
// Units: 1 = one grid cell. Positions are cell-centre based (cell [c,r] is centred at c+0.5, r+0.5).

export const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'star'];
export const TARGETING = ['first', 'last', 'strongest', 'closest'];
export const ATTACK_TYPES = ['projectile', 'beam', 'pulse', 'arc', 'income'];
/** How a projectile looks in flight (only drawing differs). */
export const SHOT_KINDS = ['', 'bullet', 'tracer', 'grenade', 'flask', 'rocket'];
/** A zombie with at least this much base armor counts as "armored" for armorBonus. */
export const ARMORED_AT = 0.2;
/** Poison keeps getting stronger for this many seconds, then stops growing. */
export const POISON_RAMP_CAP = 10;
/** A spinning-up gun starts this many times slower than its full fire rate. */
export const SPIN_START = 3;
export const MAX_PATHS = 3;

export const DEFAULT_ATTACK = {
  type: 'projectile',
  damage: 5,
  range: 2.5,
  cooldown: 1,
  projectileSpeed: 8,
  splashRadius: 0,
  slowFactor: 1,
  slowDuration: 0,
  hitsAir: true,
  hitsGround: true,
  armorPierce: 0, // 0-0.95: fraction of the target's armor that is ignored
  shots: 1, // projectiles per volley / simultaneous beam targets
  burnDps: 0, // damage per second over time (ignores armor)
  burnDuration: 0,
  shot: '', // projectile look: bullet, tracer, grenade, flask, rocket
  armorBonus: 0, // extra damage against armored zombies (0.5 = +50%)
  poisonDps: 0, // poison: damage per second (ignores armor) ...
  poisonRamp: 0, // ... plus this much more for every second the zombie has been poisoned (up to POISON_RAMP_CAP seconds)
  poisonDuration: 0, // poison wears off this long after the last hit
  poisonSpread: 0, // a poisoned zombie that dies spreads its poison to zombies this close
  chain: 0, // arc: how many more zombies the shock jumps to
  chainRange: 1.3, // arc: how far a jump can reach
  chainFalloff: 0.8, // arc: each jump keeps this fraction of the damage
  spinUp: 0, // seconds of continuous fire to reach full fire rate (0 = fires at full rate at once)
  income: 0, // income towers: money paid every `cooldown` seconds while a wave is on
  bounty: 0, // money earned for every zombie that dies within range
};

// Upgrade-path restrictions, like Bloons TD: at most `maxPaths` paths can be used on one tower,
// and only one path may go past tier `secondaryMax`.
export const DEFAULT_RULES = { maxPaths: 2, secondaryMax: 2 };

// ---------- tower tiers ----------
// A tier is a set of modifiers applied on top of the tower's base attack (and the tiers below it):
//   damage +N | range +N | cooldown xN | projectileSpeed xN | splashRadius +N
//   slowTo N (slow factor, lowest wins) | slowFactor xN (strengthens an existing slow) | slowDuration +N
//   armorPierce +N | shots +N | burnDps +N | burnDuration N (longest wins) | hitsAir true | hitsGround true
//   armorBonus +N | poisonDps +N | poisonRamp +N | poisonDuration N (longest wins) | poisonSpread +N
//   chain +N | chainRange +N | chainFalloff +N (at most 1) | spinUp xN | income +N | bounty +N
export function applyTier(a, t) {
  if (t.damage) a.damage += t.damage;
  if (t.range) a.range += t.range;
  if (t.cooldown) a.cooldown *= t.cooldown;
  if (t.projectileSpeed) a.projectileSpeed *= t.projectileSpeed;
  if (t.splashRadius) a.splashRadius += t.splashRadius;
  if (t.slowDuration) a.slowDuration += t.slowDuration;
  if (t.slowTo !== undefined && t.slowTo !== null) {
    a.slowFactor = Math.min(a.slowFactor, t.slowTo);
    if (!(a.slowDuration > 0)) a.slowDuration = 2;
  }
  if (t.slowFactor && a.slowFactor < 1) a.slowFactor = Math.max(0.02, a.slowFactor * t.slowFactor);
  if (t.armorPierce) a.armorPierce = Math.min(0.95, a.armorPierce + t.armorPierce);
  if (t.shots) a.shots += t.shots;
  if (t.burnDps) {
    a.burnDps += t.burnDps;
    if (!(a.burnDuration > 0)) a.burnDuration = 3;
  }
  if (t.burnDuration) a.burnDuration = Math.max(a.burnDuration, t.burnDuration);
  if (t.hitsAir) a.hitsAir = true;
  if (t.hitsGround) a.hitsGround = true;
  if (t.armorBonus) a.armorBonus += t.armorBonus;
  if (t.poisonDps) {
    a.poisonDps += t.poisonDps;
    if (!(a.poisonDuration > 0)) a.poisonDuration = 4;
  }
  if (t.poisonRamp) {
    a.poisonRamp += t.poisonRamp;
    if (!(a.poisonDuration > 0)) a.poisonDuration = 4;
  }
  if (t.poisonDuration) a.poisonDuration = Math.max(a.poisonDuration, t.poisonDuration);
  if (t.poisonSpread) a.poisonSpread += t.poisonSpread;
  if (t.chain) a.chain += t.chain;
  if (t.chainRange) a.chainRange += t.chainRange;
  if (t.chainFalloff) a.chainFalloff = Math.min(1, a.chainFalloff + t.chainFalloff);
  if (t.spinUp) a.spinUp *= t.spinUp;
  if (t.income) a.income += t.income;
  if (t.bounty) a.bounty += t.bounty;
}

/** The tower's attack with `tiers` = [tiersOnPath0, tiersOnPath1, tiersOnPath2] applied. */
export function attackAt(def, tiers) {
  const a = { ...DEFAULT_ATTACK, ...(def.attack || {}) };
  (def.paths || []).forEach((p, pi) => {
    const n = (tiers && tiers[pi]) || 0;
    for (let i = 0; i < n && i < (p.tiers || []).length; i++) applyTier(a, p.tiers[i]);
  });
  a.cooldown = Math.max(0.05, a.cooldown);
  a.damage = Math.max(0, a.damage);
  a.shots = Math.max(1, Math.round(a.shots));
  a.chain = Math.max(0, Math.round(a.chain));
  return a;
}

export function describeTier(t) {
  if (t.desc) return t.desc;
  const p = [];
  const pc = (x) => Math.round(x * 100);
  const n1 = (x) => Math.round(x * 10) / 10;
  if (t.damage) p.push((t.damage > 0 ? '+' : '') + n1(t.damage) + ' damage');
  if (t.range) p.push((t.range > 0 ? '+' : '') + n1(t.range) + ' range');
  if (t.cooldown) p.push(t.cooldown < 1 ? pc(1 - t.cooldown) + '% faster fire' : pc(t.cooldown - 1) + '% slower fire');
  if (t.projectileSpeed) p.push(t.projectileSpeed > 1 ? pc(t.projectileSpeed - 1) + '% faster shots' : pc(1 - t.projectileSpeed) + '% slower shots');
  if (t.splashRadius) p.push('+' + n1(t.splashRadius) + ' splash radius');
  if (t.slowTo !== undefined && t.slowTo !== null) p.push('slows to ' + pc(t.slowTo) + '% speed');
  if (t.slowFactor) p.push('stronger slow');
  if (t.slowDuration) p.push('+' + n1(t.slowDuration) + 's slow time');
  if (t.armorPierce) p.push('ignores ' + pc(t.armorPierce) + '% more armor');
  if (t.shots) p.push('+' + t.shots + (t.shots === 1 ? ' target' : ' targets'));
  if (t.burnDps) p.push('+' + n1(t.burnDps) + ' burn damage/s');
  if (t.burnDuration) p.push('burns for ' + n1(t.burnDuration) + 's');
  if (t.hitsAir) p.push('can hit air');
  if (t.hitsGround) p.push('can hit ground');
  if (t.armorBonus) p.push('+' + pc(t.armorBonus) + '% damage to armored zombies');
  if (t.poisonDps) p.push('+' + n1(t.poisonDps) + ' poison damage/s');
  if (t.poisonRamp) p.push('poison grows +' + n1(t.poisonRamp) + '/s every second');
  if (t.poisonDuration) p.push('poison lasts ' + n1(t.poisonDuration) + 's');
  if (t.poisonSpread) p.push('poison spreads +' + n1(t.poisonSpread) + ' on death');
  if (t.chain) p.push((t.chain > 0 ? '+' : '') + t.chain + (Math.abs(t.chain) === 1 ? ' chain jump' : ' chain jumps'));
  if (t.chainRange) p.push('+' + n1(t.chainRange) + ' jump reach');
  if (t.chainFalloff) p.push('jumps keep +' + pc(t.chainFalloff) + '% more damage');
  if (t.spinUp) p.push(t.spinUp < 1 ? pc(1 - t.spinUp) + '% faster spin-up' : pc(t.spinUp - 1) + '% slower spin-up');
  if (t.income) p.push('+$' + n1(t.income) + ' per payout');
  if (t.bounty) p.push('+$' + n1(t.bounty) + ' per kill nearby');
  return p.join(', ');
}

/** The attack as lines of text for the in-game tower panel and the Team screen: headline, extras, what it can hit. */
export function describeAttack(s) {
  const n1 = (x) => Math.round(x * 10) / 10;
  const pc = (x) => Math.round(x * 100);
  const lines = [];
  if (s.type === 'income') {
    lines.push('Pays $' + n1(s.income) + ' every ' + n1(s.cooldown) + 's while a wave is on');
    if (s.bounty > 0) lines.push('+$' + n1(s.bounty) + ' for every kill within ' + n1(s.range));
    else lines.push('Range ' + n1(s.range));
    return lines;
  }
  if (s.type === 'beam') lines.push('Beam ' + n1(s.damage) + '/s   Range ' + n1(s.range));
  else lines.push((s.type === 'pulse' ? 'Pulse ' : s.type === 'arc' ? 'Shock ' : 'Damage ') + n1(s.damage) + '   Range ' + n1(s.range) + '   ' + n1(1 / s.cooldown) + '/s');
  const x = [];
  if (s.shots > 1) x.push(s.type === 'beam' ? s.shots + ' targets' : s.shots + (s.type === 'arc' ? ' bolts' : ' shots'));
  if (s.type === 'arc') x.push('Chains ' + s.chain + ' (reach ' + n1(s.chainRange) + ', keeps ' + pc(s.chainFalloff) + '%)');
  if (s.splashRadius > 0) x.push('Splash ' + n1(s.splashRadius));
  if (s.slowFactor < 1) x.push('Slow to ' + pc(s.slowFactor) + '%');
  if (s.burnDps > 0) x.push('Burn ' + n1(s.burnDps) + '/s');
  if (s.poisonDuration > 0 && (s.poisonDps > 0 || s.poisonRamp > 0)) x.push('Poison ' + n1(s.poisonDps) + '/s +' + n1(s.poisonRamp) + '/s every second' + (s.poisonSpread > 0 ? ', spreads ' + n1(s.poisonSpread) : ''));
  if (s.armorPierce > 0) x.push('Pierce ' + pc(s.armorPierce) + '%');
  if (s.armorBonus > 0) x.push('+' + pc(s.armorBonus) + '% vs armored');
  if (s.spinUp > 0) x.push('Spins up in ' + n1(s.spinUp) + 's');
  if (s.bounty > 0) x.push('+$' + n1(s.bounty) + ' per kill nearby');
  if (x.length) lines.push(x.join('   '));
  const air = s.hitsAir !== false;
  const ground = s.hitsGround !== false;
  lines.push('Hits: ' + (air && ground ? 'air + ground' : air ? 'air only' : 'ground only'));
  return lines;
}

/** Old format: `upgrades` = flat list with absolute stats. Becomes one path of modifier tiers. */
export function migrateTower(def) {
  if (def.paths) return def;
  const out = { ...def };
  delete out.upgrades;
  const ups = def.upgrades || [];
  if (!ups.length) {
    out.paths = [];
    return out;
  }
  const cur = { ...DEFAULT_ATTACK, ...(def.attack || {}) };
  const r = (x) => Math.round(x * 1000) / 1000;
  const tiers = ups.map((u) => {
    const t = { name: u.name || '', cost: u.cost || 0 };
    for (const f of ['damage', 'range', 'splashRadius', 'slowDuration']) {
      if (u[f] !== undefined && u[f] !== cur[f]) {
        t[f] = r(u[f] - cur[f]);
        cur[f] = u[f];
      }
    }
    for (const f of ['cooldown', 'projectileSpeed']) {
      if (u[f] !== undefined && u[f] !== cur[f]) {
        t[f] = r(u[f] / cur[f]);
        cur[f] = u[f];
      }
    }
    if (u.slowFactor !== undefined && u.slowFactor < cur.slowFactor) {
      t.slowTo = u.slowFactor;
      cur.slowFactor = u.slowFactor;
    }
    return t;
  });
  out.paths = [{ name: 'Upgrades', tiers }];
  return out;
}

// ---------- path helpers ----------

/** Every grid cell covered by a list of [col,row] waypoints (axis-aligned or not). */
export function pathCells(points) {
  const out = [];
  if (!points || !points.length) return out;
  out.push([points[0][0], points[0][1]]);
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 1; k <= n; k++) {
      out.push([Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n)]);
    }
  }
  return out;
}

export function buildPath(points) {
  const pts = points.map((p) => [p[0] + 0.5, p[1] + 0.5]);
  const lens = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    lens.push(l);
    total += l;
  }
  return { pts, lens, total };
}

export function pointAt(path, d) {
  if (path.pts.length === 1) return [path.pts[0][0], path.pts[0][1]];
  if (d <= 0) return [path.pts[0][0], path.pts[0][1]];
  let rem = d;
  for (let i = 0; i < path.lens.length; i++) {
    if (rem <= path.lens[i] || i === path.lens.length - 1) {
      const t = path.lens[i] === 0 ? 0 : Math.min(1, rem / path.lens[i]);
      const a = path.pts[i];
      const b = path.pts[i + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    rem -= path.lens[i];
  }
  const last = path.pts[path.pts.length - 1];
  return [last[0], last[1]];
}

// ---------- zombie tiers ----------
// A zone has a strength tier (1 to MAX_TIER). Every zombie scales with the tier of the level it appears in, so the same Walker is
// tougher in Act 5 than in Act 1. Every RANK_SIZE tiers the zombies also move up a rank (Hardened, Veteran ...), which is shown on them.
export const MAX_TIER = 50;
export const RANK_SIZE = 10;
export const RANK_NAMES = ['', 'Hardened', 'Veteran', 'Elite', 'Apex'];
/** Growth per tier step above 1. An enemy can override any of these with its own `scaling: { health, speed, armor, reward }`. */
export const DEFAULT_SCALING = { health: 0.12, speed: 0.006, armor: 0.004, reward: 0.04 };
const SPEED_CAP = 1.6;
const ARMOR_CAP = 0.8;

export const normTier = (t) => Math.max(1, Math.min(MAX_TIER, Math.floor(Number(t)) || 1));
export const rankOf = (tier) => Math.min(RANK_NAMES.length - 1, Math.floor((normTier(tier) - 1) / RANK_SIZE));

/** An enemy's stats at a tier. Tier 1 is exactly what the enemy file says. */
export function scaleEnemy(def, tier) {
  const t = normTier(tier) - 1;
  const sc = { ...DEFAULT_SCALING, ...(def.scaling || {}) };
  return {
    health: (def.health ?? 30) * (1 + sc.health * t),
    speed: (def.speed ?? 1.4) * Math.min(SPEED_CAP, 1 + sc.speed * t),
    armor: Math.min(ARMOR_CAP, (def.armor || 0) + sc.armor * t),
    reward: Math.round((def.reward || 0) * (1 + sc.reward * t)),
    score: Math.round((def.score || 0) * (1 + sc.reward * t)),
  };
}

/** "Hardened Walker" at tier 11 to 20, and so on. */
export function enemyName(def, tier) {
  const r = RANK_NAMES[rankOf(tier)];
  return (r ? r + ' ' : '') + (def.name || def.id);
}

// Special abilities. Each is an optional object on the enemy file; anything left out takes these defaults.
export const ABILITY_DEFAULTS = {
  scream: { interval: 5, range: 2.5, duration: 2 }, // every `interval` s towers within `range` must shoot this zombie for `duration` s
  leap: { range: 2, cooldown: 3, time: 0.5, minGain: 1 }, // jumps to a lane within `range` cells that is at least `minGain` cells closer to the exit
  ward: { range: 2.5 }, // zombies within `range` cannot die
  summon: { interval: 8, max: 6, enemies: [] }, // every `interval` s calls up to `max` zombies, [{ enemy, count }]
};
export const abilityOf = (def, key) => (def && def[key] ? { ...ABILITY_DEFAULTS[key], ...(def[key] === true ? {} : def[key]) } : null);

/** What an enemy leaves behind when killed: spawnOnDeath [{ enemy, count }], or the old splitInto / splitCount. */
export function deathSpawns(def) {
  const list = Array.isArray(def.spawnOnDeath) ? def.spawnOnDeath.filter((x) => x && x.enemy && x.count > 0) : [];
  if (!list.length && def.splitInto) return [{ enemy: def.splitInto, count: def.splitCount || 0 }];
  return list;
}

/** The point on a path closest to (x, y): its distance along the path, how far away it is, and where it is. */
export function nearestOnPath(path, x, y) {
  let best = { d: 0, dist: Infinity, x: path.pts[0][0], y: path.pts[0][1] };
  let acc = 0;
  for (let i = 0; i < path.lens.length; i++) {
    const a = path.pts[i];
    const b = path.pts[i + 1];
    const len = path.lens[i];
    let t = 0;
    if (len > 0) t = Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / (len * len)));
    const px = a[0] + (b[0] - a[0]) * t;
    const py = a[1] + (b[1] - a[1]) * t;
    const dist = Math.hypot(x - px, y - py);
    if (dist < best.dist) best = { d: acc + len * t, dist, x: px, y: py };
    acc += len;
  }
  return best;
}

function byId(list) {
  const m = {};
  for (const x of list) m[x.id] = x;
  return m;
}

// ---------- the simulation ----------

// Endless mode loops the level's own waves; every extra loop adds enemies and health.
export const ENDLESS_DEFAULTS = { hpGrowth: 0.35, countGrowth: 0.25 };

export class Sim {
  /**
   * opts.allowed: tower ids the player may build (defaults to the level's list, or every tower)
   * opts.endless: true = waves never run out (never 'won')
   * opts.hpGrowth / opts.countGrowth: endless scaling per loop through the level's waves
   * opts.unlocked: { towerId: [tiers unlocked on path 0, 1, 2] }. Tiers beyond that cannot be bought in the level.
   *   Leave it out and every tier is available (editor playtest, tests).
   */
  constructor(level, towerDefs, enemyDefs, opts = {}) {
    this.level = level;
    this.towerDefs = byId(towerDefs.map(migrateTower));
    this.enemyDefs = byId(enemyDefs);
    this.cols = level.cols;
    this.rows = level.rows;
    this.money = level.startMoney ?? 100;
    this.lives = level.startLives ?? 20;
    this.startLives = this.lives;
    this.score = 0;
    this.kills = 0;
    this.time = 0;
    this.waveIndex = 0; // index of the NEXT wave to start
    this.status = 'playing'; // playing | won | lost
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.spawnQueue = [];
    this.events = [];
    this._id = 1;
    this.endless = !!opts.endless;
    this.hpGrowth = opts.hpGrowth ?? ENDLESS_DEFAULTS.hpGrowth;
    this.countGrowth = opts.countGrowth ?? ENDLESS_DEFAULTS.countGrowth;
    this.unlocked = opts.unlocked || null;
    this.tier = normTier(opts.tier ?? level.tier ?? 1);

    this.paths = {};
    this.flyPaths = {};
    this.pathOrder = [];
    for (const p of level.paths || []) {
      if (!p.points || p.points.length < 2) continue;
      this.paths[p.id] = buildPath(p.points);
      this.flyPaths[p.id] = buildPath([p.points[0], p.points[p.points.length - 1]]);
      this.pathOrder.push(p.id);
    }

    this.pathCellSet = new Set();
    for (const p of level.paths || []) for (const c of pathCells(p.points)) this.pathCellSet.add(c[0] + ',' + c[1]);

    const allowed = opts.allowed ? opts.allowed : level.towers && level.towers.length ? level.towers : Object.keys(this.towerDefs);
    this.allowedTowers = allowed.filter((id) => this.towerDefs[id]);
  }

  // ----- building -----

  tileAt(col, row) {
    const r = this.level.tiles[row];
    return r ? r[col] : undefined;
  }

  towerAt(col, row) {
    return this.towers.find((t) => t.col === col && t.row === row) || null;
  }

  canBuild(col, row) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return false;
    if (this.tileAt(col, row) !== '.') return false;
    if (this.pathCellSet.has(col + ',' + row)) return false;
    return !this.towerAt(col, row);
  }

  buildTower(defId, col, row) {
    const def = this.towerDefs[defId];
    if (!def || !this.allowedTowers.includes(defId)) return null;
    if (this.status !== 'playing' || !this.canBuild(col, row) || this.money < def.cost) return null;
    this.money -= def.cost;
    const t = {
      id: this._id++,
      defId,
      def,
      col,
      row,
      x: col + 0.5,
      y: row + 0.5,
      tiers: [0, 0, 0], // upgrade tiers bought on each path
      cd: 0,
      spent: def.cost,
      targeting: def.targeting || 'first',
      beamTargets: [],
      aim: -Math.PI / 2, // the way it is facing (for drawing)
      shotAt: -99, // when it last fired (for recoil)
      heat: 0, // 0..1: how far a spin-up gun has got to full fire rate
      activeUntil: 0,
    };
    if (this.stats(t).type === 'income') t.cd = this.stats(t).cooldown; // the first payout comes a full wait after the wave starts
    this.towers.push(t);
    this.events.push({ type: 'build', x: t.x, y: t.y });
    return t;
  }

  /** Current attack stats of a placed tower (or { def, tiers } for a preview). */
  stats(t) {
    return attackAt(t.def, t.tiers || [0, 0, 0]);
  }

  rules(def) {
    return { ...DEFAULT_RULES, ...(def.upgradeRules || {}) };
  }

  /** The next tier on a path, or null. */
  nextTier(t, p) {
    const path = t.def.paths && t.def.paths[p];
    return (path && path.tiers[t.tiers[p]]) || null;
  }

  /** 'ok' | 'money' | 'max' | 'locked' (tier not bought with coins yet) | 'paths' (too many paths) | 'secondary' (other path already past the cap) | 'none' */
  upgradeStatus(t, p) {
    const path = t.def.paths && t.def.paths[p];
    if (!path) return 'none';
    const tier = path.tiers[t.tiers[p]];
    if (!tier) return 'max';
    if (this.unlocked && t.tiers[p] >= ((this.unlocked[t.def.id] || [])[p] || 0)) return 'locked';
    const r = this.rules(t.def);
    const next = t.tiers.slice();
    next[p]++;
    if (next.filter((x) => x > 0).length > r.maxPaths) return 'paths';
    if (next.filter((x) => x > r.secondaryMax).length > 1) return 'secondary';
    if (this.money < (tier.cost || 0)) return 'money';
    return 'ok';
  }

  upgradeTower(t, p) {
    if (this.status !== 'playing' || this.upgradeStatus(t, p) !== 'ok') return false;
    const tier = this.nextTier(t, p);
    this.money -= tier.cost || 0;
    t.spent += tier.cost || 0;
    t.tiers[p]++;
    this.events.push({ type: 'upgrade', x: t.x, y: t.y });
    return true;
  }

  sellValue(t) {
    return Math.floor(t.spent * 0.7);
  }

  sellTower(t) {
    const i = this.towers.indexOf(t);
    if (i < 0 || this.status !== 'playing') return false;
    this.towers.splice(i, 1);
    this.money += this.sellValue(t);
    return true;
  }

  // ----- waves -----

  get wavesTotal() {
    return (this.level.waves || []).length;
  }

  get allWavesStarted() {
    return !this.endless && this.waveIndex >= this.wavesTotal;
  }

  /** The wave with index i. In endless mode waves past the end loop, with more and tougher enemies. */
  waveDef(i) {
    const waves = this.level.waves || [];
    if (!waves.length) return null;
    if (i < waves.length) return { groups: waves[i].groups || [], hpMult: 1 };
    if (!this.endless) return null;
    const loop = Math.floor(i / waves.length);
    const base = waves[i % waves.length];
    return {
      groups: (base.groups || []).map((g) => ({ ...g, count: Math.ceil((g.count || 0) * (1 + this.countGrowth * loop)) })),
      hpMult: 1 + this.hpGrowth * loop,
    };
  }

  describeWave(i) {
    const w = this.waveDef(i);
    if (!w) return '';
    const counts = {};
    for (const g of w.groups) {
      const name = this.enemyDefs[g.enemy] ? enemyName(this.enemyDefs[g.enemy], this.tier) : g.enemy;
      counts[name] = (counts[name] || 0) + (g.count || 0);
    }
    const txt = Object.entries(counts)
      .map(([n, c]) => c + '× ' + n)
      .join(', ');
    return w.hpMult > 1 ? txt + '  (+' + Math.round((w.hpMult - 1) * 100) + '% health)' : txt;
  }

  startNextWave() {
    if (this.status !== 'playing' || this.allWavesStarted) return false;
    const wave = this.waveDef(this.waveIndex);
    if (!wave) return false;
    for (const g of wave.groups) {
      const pathId = g.path && this.paths[g.path] ? g.path : this.pathOrder[0];
      for (let i = 0; i < (g.count || 0); i++) {
        this.spawnQueue.push({ time: this.time + (g.delay || 0) + i * (g.interval ?? 1), enemy: g.enemy, path: pathId, hpMult: wave.hpMult });
      }
    }
    this.waveIndex++;
    this.events.push({ type: 'wave', index: this.waveIndex });
    return true;
  }

  /** opts.summonedBy: the necromancer that called this zombie (it gives no reward and is protected by it). */
  spawnEnemy(defId, pathId, d = 0, hpMult = 1, opts = {}) {
    const def = this.enemyDefs[defId];
    if (!def) return null;
    const path = (def.flying ? this.flyPaths : this.paths)[pathId] || (def.flying ? this.flyPaths : this.paths)[this.pathOrder[0]];
    if (!path) return null;
    const st = scaleEnemy(def, this.tier);
    const e = {
      id: this._id++,
      def,
      tier: this.tier,
      hp: st.health * hpMult,
      maxHp: st.health * hpMult,
      speed: st.speed,
      armor: st.armor,
      reward: opts.summonedBy ? 0 : st.reward,
      score: opts.summonedBy ? 0 : st.score,
      hpMult,
      path,
      pathId,
      d: Math.max(0, Math.min(d, path.total)),
      x: 0,
      y: 0,
      slowFactor: 1,
      slowUntil: 0,
      burnDps: 0,
      burnUntil: 0,
      poisonDps: 0,
      poisonRamp: 0,
      poisonSpread: 0,
      poisonDur: 0,
      poisonStart: 0,
      poisonUntil: 0,
      dead: false,
      summonedBy: opts.summonedBy || null,
      protector: null, // the necromancer whose ward covers this zombie right now
      lift: 0, // 0 on the ground, up to 1 at the top of a leap (for drawing)
      jump: null,
    };
    const sc = abilityOf(def, 'scream');
    const su = abilityOf(def, 'summon');
    const lp = abilityOf(def, 'leap');
    if (sc) e.screamCd = sc.interval * 0.6;
    if (su) e.summonCd = su.interval * 0.6;
    if (lp) { e.leapCd = 0; e.leapScan = 0; }
    const p = pointAt(path, e.d);
    e.x = p[0];
    e.y = p[1];
    this.enemies.push(e);
    return e;
  }

  // ----- combat helpers -----

  canTarget(stats, e) {
    return e.def.flying ? stats.hitsAir !== false : stats.hitsGround !== false;
  }

  /**
   * Up to n enemies in range, best first according to the tower's targeting rule.
   * A tower that a screamer has screamed at must shoot the screamer (if it is in range), and a tower that would shoot a zombie
   * protected by a necromancer shoots the necromancer instead (if it is in range).
   */
  pickTargets(t, stats, n = 1) {
    const inReach = (e) => !e.dead && this.canTarget(stats, e) && Math.hypot(e.x - t.x, e.y - t.y) <= stats.range;
    let list = [];
    for (const e of this.enemies) {
      if (!inReach(e)) continue;
      const dist = Math.hypot(e.x - t.x, e.y - t.y);
      let s;
      switch (t.targeting) {
        case 'last':
          s = e.path.total - e.d;
          break;
        case 'strongest':
          s = e.hp;
          break;
        case 'closest':
          s = -dist;
          break;
        default:
          s = e.d - e.path.total; // 'first': closest to the exit
      }
      list.push([s, e]);
    }
    list.sort((a, b) => b[0] - a[0]);
    let order = list.map((x) => x[1]);
    if (t.tauntUntil > this.time && t.tauntBy && inReach(t.tauntBy)) order = [t.tauntBy];
    const out = [];
    for (let e of order) {
      const n2 = this.protectorOf(e);
      if (n2 && inReach(n2)) e = n2;
      if (!out.includes(e)) out.push(e);
      if (out.length >= n) break;
    }
    return out;
  }

  pickTarget(t, stats) {
    return this.pickTargets(t, stats, 1)[0] || null;
  }

  applySlow(e, factor, duration) {
    if (!(factor < 1) || !(duration > 0) || e.def.slowImmune || e.def.statusImmune) return;
    if (e.slowUntil <= this.time || factor <= e.slowFactor) {
      e.slowFactor = factor;
      e.slowUntil = Math.max(e.slowUntil, this.time + duration);
    }
  }

  applyBurn(e, dps, duration) {
    if (!(dps > 0) || !(duration > 0) || e.def.statusImmune) return; // statusImmune: slow, burn and poison all bounce off
    if (e.burnUntil <= this.time || dps >= e.burnDps) {
      e.burnDps = dps;
      e.burnUntil = Math.max(e.burnUntil, this.time + duration);
    }
  }

  damageEnemy(e, dmg, pierce = 0) {
    if (e.dead) return;
    const armor = Math.min(0.95, (e.armor || 0) * (1 - pierce));
    e.hp -= dmg * (1 - armor);
    this.checkDeath(e);
  }

  /** The necromancer keeping this zombie alive (its ward covers it, or it was summoned by it), or null. */
  protectorOf(e) {
    const n = e.protector;
    if (n && !n.dead && n !== e) return n;
    const s = e.summonedBy;
    return s && !s.dead && s !== e ? s : null;
  }

  /** Kills an enemy whose health ran out, unless a necromancer is keeping it alive. */
  checkDeath(e) {
    if (e.dead || e.hp > 0) return;
    if (this.protectorOf(e)) e.hp = 1;
    else this.killEnemy(e);
  }

  /** Slow + burn + (optional) damage from one attack hitting one enemy. */
  hit(e, s, dmg) {
    this.damageEnemy(e, dmg * this.armorBonusFor(e, s), s.armorPierce || 0);
    this.applySlow(e, s.slowFactor, s.slowDuration);
    this.applyBurn(e, s.burnDps, s.burnDuration);
    this.applyPoison(e, s);
  }

  /** Damage multiplier of an attack against this zombie (armorBonus only counts against armored zombies). */
  armorBonusFor(e, s) {
    return s.armorBonus > 0 && (e.def.armor || 0) >= ARMORED_AT ? 1 + s.armorBonus : 1;
  }

  /** Poison: damage per second that ignores armor and keeps growing while the zombie stays poisoned. */
  applyPoison(e, s, startAt) {
    if (e.dead || e.def.statusImmune || !(s.poisonDuration > 0) || !(s.poisonDps > 0 || s.poisonRamp > 0)) return;
    if (e.poisonUntil <= this.time) e.poisonStart = startAt === undefined ? this.time : startAt;
    e.poisonDps = Math.max(e.poisonDps, s.poisonDps || 0);
    e.poisonRamp = Math.max(e.poisonRamp, s.poisonRamp || 0);
    e.poisonSpread = Math.max(e.poisonSpread, s.poisonSpread || 0);
    e.poisonDur = Math.max(e.poisonDur, s.poisonDuration);
    e.poisonUntil = Math.max(e.poisonUntil, this.time + s.poisonDuration);
  }

  /** Shock: hits the first zombie, then jumps to the nearest zombie within reach, again and again. */
  zap(t, s, first) {
    const hitSet = new Set();
    const pts = [[t.x, t.y]];
    let cur = first;
    let dmg = s.damage;
    for (let i = 0; i <= s.chain && cur; i++) {
      hitSet.add(cur);
      pts.push([cur.x, cur.y]);
      this.hit(cur, s, dmg);
      dmg *= s.chainFalloff;
      let best = null;
      let bd = s.chainRange;
      for (const o of this.enemies) {
        if (o.dead || hitSet.has(o) || !this.canTarget(s, o)) continue;
        const d = Math.hypot(o.x - cur.x, o.y - cur.y);
        if (d <= bd) {
          bd = d;
          best = o;
        }
      }
      cur = best;
    }
    this.events.push({ type: 'arc', points: pts, color: t.def.color });
  }

  /** True while a wave is on: zombies are waiting to spawn or alive. Income towers only pay then. */
  get waveActive() {
    return this.spawnQueue.length > 0 || this.enemies.some((e) => !e.dead);
  }

  killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    this.money += e.reward || 0;
    this.score += e.score || 0;
    this.kills++;
    this.events.push({ type: 'kill', x: e.x, y: e.y, color: e.def.color });
    // scrappers nearby collect a bounty
    for (const t of this.towers) {
      const s = this.stats(t);
      if (s.bounty > 0 && Math.hypot(t.x - e.x, t.y - e.y) <= s.range) {
        this.money += s.bounty;
        this.events.push({ type: 'income', x: t.x, y: t.y, amount: s.bounty, bounty: true });
      }
    }
    // a poisoned zombie that dies spreads its poison on
    if (e.poisonSpread > 0 && e.poisonUntil > this.time) {
      const sp = { poisonDps: e.poisonDps, poisonRamp: e.poisonRamp, poisonDuration: e.poisonDur, poisonSpread: e.poisonSpread };
      const started = this.time - Math.min(POISON_RAMP_CAP, this.time - e.poisonStart) * 0.5;
      for (const o of this.enemies) if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) <= e.poisonSpread) this.applyPoison(o, sp, started);
      this.events.push({ type: 'splash', x: e.x, y: e.y, r: e.poisonSpread, color: '#9ccc3c' });
    }
    // leaves other zombies behind (a zombie king bursts into a swarm)
    const pieces = [];
    for (const sp of deathSpawns(e.def)) for (let i = 0; i < sp.count; i++) if (this.enemyDefs[sp.enemy]) pieces.push(sp.enemy);
    if (pieces.length) {
      this.events.push({ type: 'burst', x: e.x, y: e.y });
      const ratio = e.path.total ? e.d / e.path.total : 0;
      pieces.forEach((id, i) => {
        const child = this.enemyDefs[id];
        const cpath = (child.flying ? this.flyPaths : this.paths)[e.pathId];
        if (!cpath) return;
        const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.28; // fan out around where it fell
        this.spawnEnemy(id, e.pathId, Math.min(cpath.total - 0.05, ratio * cpath.total + off), e.hpMult || 1);
      });
    }
  }

  // ----- abilities -----

  scream(e, a) {
    for (const t of this.towers) if (Math.hypot(t.x - e.x, t.y - e.y) <= a.range) {
      t.tauntBy = e;
      t.tauntUntil = this.time + a.duration;
    }
    this.events.push({ type: 'scream', id: e.id, x: e.x, y: e.y, r: a.range });
  }

  summon(e, a) {
    let alive = 0;
    for (const o of this.enemies) if (!o.dead && o.summonedBy === e) alive++;
    const list = [];
    for (const g of a.enemies || []) for (let i = 0; i < (g.count || 0); i++) if (this.enemyDefs[g.enemy]) list.push(g.enemy);
    let k = 0;
    for (const id of list) {
      if (alive >= a.max) break;
      const off = (k % 2 ? 1 : -1) * (0.4 + Math.floor(k / 2) * 0.4);
      k++;
      const cpath = (this.enemyDefs[id].flying ? this.flyPaths : this.paths)[e.pathId];
      if (!cpath) continue;
      if (this.spawnEnemy(id, e.pathId, Math.max(0, Math.min(cpath.total - 0.05, e.d + off)), e.hpMult, { summonedBy: e })) alive++;
    }
    if (k) this.events.push({ type: 'summon', x: e.x, y: e.y });
  }

  /** A leaper looks for another lane that is close enough to jump to and gets it nearer the exit. */
  tryLeap(e, a) {
    if (e.def.flying) return;
    const remaining = e.path.total - e.d;
    let best = null;
    for (const id of this.pathOrder) {
      const q = this.paths[id];
      if (q === e.path) continue;
      const n = nearestOnPath(q, e.x, e.y);
      if (n.dist > a.range) continue;
      const rem = q.total - n.d;
      if (remaining - rem < a.minGain) continue;
      if (!best || rem < best.rem) best = { id, q, n, rem };
    }
    if (!best) return;
    e.jump = { t: 0, dur: Math.max(0.1, a.time), fx: e.x, fy: e.y, tx: best.n.x, ty: best.n.y, path: best.q, pathId: best.id, d: best.n.d };
    this.events.push({ type: 'leap', x: e.x, y: e.y });
  }

  // ----- main step -----

  update(dt) {
    if (this.status !== 'playing') return;
    this.time += dt;

    // spawns
    if (this.spawnQueue.length) {
      const rest = [];
      for (const s of this.spawnQueue) {
        if (s.time <= this.time) this.spawnEnemy(s.enemy, s.path, 0, s.hpMult || 1);
        else rest.push(s);
      }
      this.spawnQueue = rest;
    }

    // enemies
    for (const e of this.enemies.slice()) {
      if (e.dead) continue;
      if (e.def.regen) e.hp = Math.min(e.maxHp, e.hp + e.def.regen * dt);
      if (e.burnUntil > this.time) {
        e.hp -= e.burnDps * dt; // burning ignores armor
        this.checkDeath(e);
        if (e.dead) continue;
      }
      if (e.poisonUntil > this.time) {
        const grown = Math.min(POISON_RAMP_CAP, this.time - e.poisonStart);
        e.hp -= (e.poisonDps + e.poisonRamp * grown) * dt; // poison ignores armor and gets worse the longer it lasts
        this.checkDeath(e);
        if (e.dead) continue;
      }
      if (e.slowUntil <= this.time) e.slowFactor = 1;

      // abilities
      const sc = e.screamCd !== undefined && abilityOf(e.def, 'scream');
      if (sc && (e.screamCd -= dt) <= 0) {
        e.screamCd = sc.interval;
        this.scream(e, sc);
      }
      const su = e.summonCd !== undefined && abilityOf(e.def, 'summon');
      if (su && (e.summonCd -= dt) <= 0) {
        e.summonCd = su.interval;
        this.summon(e, su);
      }
      if (e.jump) {
        const j = e.jump;
        j.t += dt;
        const k = Math.min(1, j.t / j.dur);
        e.x = j.fx + (j.tx - j.fx) * k;
        e.y = j.fy + (j.ty - j.fy) * k;
        e.lift = Math.sin(Math.PI * k);
        if (k >= 1) {
          e.path = j.path;
          e.pathId = j.pathId;
          e.d = j.d;
          e.jump = null;
          e.lift = 0;
          e.leapCd = (abilityOf(e.def, 'leap') || ABILITY_DEFAULTS.leap).cooldown;
          this.events.push({ type: 'land', x: e.x, y: e.y });
        }
        continue; // in the air: it does not walk
      }
      const lp = e.leapCd !== undefined && abilityOf(e.def, 'leap');
      if (lp) {
        e.leapCd -= dt;
        e.leapScan -= dt;
        if (e.leapCd <= 0 && e.leapScan <= 0) {
          e.leapScan = 0.2;
          this.tryLeap(e, lp);
          if (e.jump) continue;
        }
      }

      e.d += e.speed * e.slowFactor * dt;
      if (e.d >= e.path.total) {
        e.dead = true;
        this.lives = Math.max(0, this.lives - (e.def.damage ?? 1));
        this.events.push({ type: 'leak', x: e.x, y: e.y });
        continue;
      }
      const p = pointAt(e.path, e.d);
      e.x = p[0];
      e.y = p[1];
    }

    // necromancer wards: zombies inside the range cannot die while the necromancer lives
    for (const e of this.enemies) e.protector = null;
    for (const n of this.enemies) {
      const w = !n.dead && abilityOf(n.def, 'ward');
      if (!w) continue;
      for (const e of this.enemies) if (e !== n && !e.dead && !e.protector && Math.hypot(e.x - n.x, e.y - n.y) <= w.range) e.protector = n;
    }

    // towers
    const waveOn = this.waveActive;
    for (const t of this.towers) {
      const s = this.stats(t);
      const face = (e) => {
        t.aim = Math.atan2(e.y - t.y, e.x - t.x);
      };
      if (s.type === 'beam') {
        t.beamTargets = this.pickTargets(t, s, s.shots);
        if (t.beamTargets[0]) {
          face(t.beamTargets[0]);
          t.shotAt = this.time;
        }
        for (const tgt of t.beamTargets) {
          this.damageEnemy(tgt, s.damage * this.armorBonusFor(tgt, s) * dt, s.armorPierce);
          this.applySlow(tgt, s.slowFactor, s.slowDuration || 0.2);
          this.applyBurn(tgt, s.burnDps, s.burnDuration);
          this.applyPoison(tgt, s);
        }
        continue;
      }
      if (s.type === 'income') {
        // the payout timer only runs while a wave is on, so waiting around between waves earns nothing
        if (waveOn && s.income > 0) {
          t.cd -= dt;
          if (t.cd <= 0) {
            this.money += s.income;
            this.events.push({ type: 'income', x: t.x, y: t.y, amount: s.income });
            t.shotAt = this.time;
            t.cd = s.cooldown;
          }
        }
        continue;
      }
      if (s.spinUp > 0) t.heat = Math.max(0, Math.min(1, t.heat + (t.activeUntil > this.time ? dt : -dt * 1.5) / s.spinUp));
      t.cd -= dt;
      if (t.cd > 0) continue;
      if (s.type === 'pulse') {
        let any = false;
        for (const e of this.enemies.slice()) {
          if (e.dead || !this.canTarget(s, e)) continue;
          if (Math.hypot(e.x - t.x, e.y - t.y) > s.range) continue;
          any = true;
          this.hit(e, s, s.damage);
        }
        if (any) {
          t.cd = s.cooldown;
          t.shotAt = this.time;
          this.events.push({ type: 'pulse', x: t.x, y: t.y, r: s.range, color: t.def.color });
        }
      } else if (s.type === 'arc') {
        const targets = this.pickTargets(t, s, s.shots);
        if (targets.length) {
          t.cd = s.cooldown;
          t.shotAt = this.time;
          face(targets[0]);
          for (const tgt of targets) this.zap(t, s, tgt);
        }
      } else {
        const targets = this.pickTargets(t, s, s.shots);
        if (targets.length) {
          t.cd = s.cooldown * (s.spinUp > 0 ? 1 + (SPIN_START - 1) * (1 - t.heat) : 1);
          t.activeUntil = this.time + 0.35;
          t.shotAt = this.time;
          face(targets[0]);
          for (let i = 0; i < s.shots; i++) {
            const tgt = targets[i % targets.length];
            this.projectiles.push({
              x: t.x,
              y: t.y,
              sx: t.x,
              sy: t.y,
              target: tgt,
              tx: tgt.x,
              ty: tgt.y,
              speed: s.projectileSpeed,
              damage: s.damage,
              splash: s.splashRadius,
              slowFactor: s.slowFactor,
              slowDuration: s.slowDuration,
              burnDps: s.burnDps,
              burnDuration: s.burnDuration,
              armorPierce: s.armorPierce,
              armorBonus: s.armorBonus,
              poisonDps: s.poisonDps,
              poisonRamp: s.poisonRamp,
              poisonDuration: s.poisonDuration,
              poisonSpread: s.poisonSpread,
              kind: s.shot || '',
              hitsAir: s.hitsAir !== false,
              hitsGround: s.hitsGround !== false,
              color: t.def.color,
              done: false,
            });
          }
          this.events.push({ type: 'shot', x: t.x, y: t.y });
        }
      }
    }

    // projectiles
    for (const p of this.projectiles) {
      if (p.target && !p.target.dead) {
        p.tx = p.target.x;
        p.ty = p.target.y;
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (dist <= step || dist < 0.001) {
        p.x = p.tx;
        p.y = p.ty;
        this.projectileHit(p);
        p.done = true;
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
    this.enemies = this.enemies.filter((e) => !e.dead);

    // end conditions
    if (this.lives <= 0) {
      this.status = 'lost';
      this.events.push({ type: 'lose' });
    } else if (this.allWavesStarted && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.status = 'won';
      this.score += this.lives * 10;
      this.events.push({ type: 'win' });
    }
  }

  projectileHit(p) {
    if (p.splash > 0) {
      this.events.push({ type: 'splash', x: p.tx, y: p.ty, r: p.splash, color: p.color });
      for (const e of this.enemies.slice()) {
        if (e.dead) continue;
        if (e.def.flying ? !p.hitsAir : !p.hitsGround) continue;
        if (Math.hypot(e.x - p.tx, e.y - p.ty) <= p.splash) this.hit(e, p, p.damage);
      }
    } else if (p.target && !p.target.dead) {
      this.hit(p.target, p, p.damage);
    }
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** 1 star for a win, 2 if at least half the lives are left, 3 if no lives were lost. */
  stars() {
    if (this.status !== 'won') return 0;
    if (this.lives >= this.startLives) return 3;
    if (this.lives >= Math.ceil(this.startLives / 2)) return 2;
    return 1;
  }
}
