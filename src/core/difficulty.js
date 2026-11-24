// An automatic difficulty estimate for a level, from its data alone (no simulation run).
//
// For every wave it asks: how much tower money does it take to kill this wave, and how much money
// will the player realistically have by then? The ratio is the wave's pressure; the hardest wave
// sets the level's score, from 1 (trivial) to 20 (nightmare). It is an estimate: it cannot know how
// well a player places towers, so use it to compare levels with each other and to catch levels that
// are far too easy or too hard, not as a promise.
import { Sim, scaleEnemy, attackAt, migrateTower, deathSpawns, abilityOf, RANK_NAMES, rankOf } from './sim.js';

export const DIFFICULTY_BANDS = [
  { max: 5, label: 'Easy', color: '#66bb6a' },
  { max: 8, label: 'Normal', color: '#9ccc65' },
  { max: 11, label: 'Challenging', color: '#ffd54f' },
  { max: 14, label: 'Hard', color: '#ffa726' },
  { max: 17, label: 'Brutal', color: '#ef5350' },
  { max: Infinity, label: 'Nightmare', color: '#c62828' },
];
export const DIFFICULTY_MAX = 20;
export const bandOf = (score) => DIFFICULTY_BANDS.find((b) => score <= b.max) || DIFFICULTY_BANDS[DIFFICULTY_BANDS.length - 1];

const EFFICIENCY = 0.75; // a real player wastes some shots and overlaps some towers (tuned against a simple building bot)
const BEND = 1.4; // a tower next to a winding path sees more of it than a straight line through its range
const PIERCE = 0.25; // average share of armor that upgrades and poison get past
const round1 = (x) => Math.round(x * 10) / 10;

/** Damage per second a tower deals at its base tier, and what it can hit. null for towers that deal no damage (income). */
export function towerRating(def) {
  const a = attackAt(migrateTower(def), [0, 0, 0]);
  const hasDamage = a.damage > 0 || a.burnDps > 0 || a.poisonDps > 0;
  if (a.type === 'income' || !hasDamage) return null;
  let dps = (a.damage * a.shots) / a.cooldown;
  if (a.spinUp > 0) dps *= 0.65; // it takes a while to reach full fire rate
  if (a.splashRadius > 0) dps *= 1 + Math.min(1.5, a.splashRadius * 0.7);
  if (a.type === 'arc' && a.chain > 0) {
    let k = 1;
    for (let i = 1; i <= a.chain; i++) k += Math.pow(a.chainFalloff, i);
    dps *= k;
  }
  dps += a.burnDps * 0.6 + a.poisonDps * (1 + (a.poisonRamp * a.poisonDuration) / 2) * 0.7;
  return { id: def.id, name: def.name, dps, range: a.range, cost: Math.max(1, def.cost || 1), air: a.hitsAir !== false, ground: a.hitsGround !== false };
}

/** The HP a zombie really has to be shot down for: armor, regeneration and what it leaves behind, plus a nudge for abilities that blunt towers. */
function zombieLoad(defs, id, tier, hpMult, windowT, depth = 0) {
  const def = defs[id];
  if (!def) return { hp: 0, reward: 0, flying: false, speed: 1 };
  const st = scaleEnemy(def, tier);
  let hp = ((st.health * hpMult) / Math.max(0.2, 1 - st.armor * (1 - PIERCE))) + (def.regen > 0 ? def.regen * windowT * 0.5 : 0);
  let reward = st.reward;
  if (def.statusImmune) hp *= 1.15; // slows, burns and poison are wasted on it
  if (abilityOf(def, 'ward')) hp *= 1.4; // others cannot die near it
  if (abilityOf(def, 'scream')) hp *= 1.1; // pulls tower fire away from the others
  if (abilityOf(def, 'leap')) hp *= 1.05;
  if (depth < 1) {
    for (const c of deathSpawns(def)) {
      const k = zombieLoad(defs, c.enemy, tier, hpMult, windowT, depth + 1);
      hp += k.hp * c.count;
      reward += k.reward * c.count;
    }
    const sm = abilityOf(def, 'summon');
    if (sm && sm.enemies.length) {
      const per = sm.enemies.reduce((n, x) => n + x.count, 0);
      const calls = Math.max(0, Math.floor(windowT / sm.interval));
      const extra = Math.min(sm.max, calls * per);
      const avg = sm.enemies.reduce((n, x) => n + zombieLoad(defs, x.enemy, tier, hpMult, windowT, depth + 1).hp * x.count, 0) / Math.max(1, per);
      hp += extra * avg; // called-up zombies pay nothing
    }
  }
  return { hp, reward, flying: !!def.flying, speed: st.speed };
}

/**
 * Rates a level. ctx = { towers, enemies, tier?, night?, hpGrowth?, countGrowth?, endlessWaves? }.
 * Returns { score 1..20, label, color, ratio, peak, waves: [{ n, hp, need, have, ratio }], facts: [...], warnings: [...] }.
 */
export function levelDifficulty(level, ctx) {
  const { towers = [], enemies = [] } = ctx;
  const sim = new Sim(level, towers, enemies, { tier: ctx.tier, night: ctx.night || null, hpGrowth: ctx.hpGrowth, countGrowth: ctx.countGrowth });
  const defs = sim.enemyDefs;
  const allowed = (level.towers && level.towers.length ? towers.filter((t) => level.towers.includes(t.id)) : towers).map(towerRating).filter(Boolean);
  const warnings = [];
  const facts = [];
  const total = sim.wavesTotal;
  const waves = [];
  const nightMult = sim.night ? sim.night.speedMult : 1;
  const bestPerDollar = (list, span, pathT, speed) => {
    // damage a dollar of this kind of tower delivers to one wave: its fire rate times how long the wave is in its range
    const vals = list
      .map((t) => (EFFICIENCY * t.dps * Math.min(span + pathT, span + (2 * t.range * BEND) / Math.max(0.2, speed))) / t.cost)
      .sort((a, b) => b - a);
    if (!vals.length) return 0;
    return vals.length === 1 ? vals[0] : (vals[0] + vals[1]) / 2;
  };
  let money = sim.money;
  let flyingSeen = false;
  const pathLen = (id, flying) => {
    const p = (flying ? sim.flyPaths : sim.paths)[id] || (flying ? sim.flyPaths : sim.paths)[sim.pathOrder[0]];
    return p ? p.total : 0;
  };
  for (let i = 0; i < total; i++) {
    const w = sim.waveDef(i);
    if (!w) break;
    let span = 0;
    let hpGround = 0;
    let hpAir = 0;
    let reward = 0;
    let speedW = 0;
    let lenW = 0;
    let weight = 0;
    const groups = w.groups.map((g) => ({ g, def: defs[g.enemy] })).filter((x) => x.def);
    for (const { g } of groups) span = Math.max(span, (g.delay || 0) + Math.max(0, (g.count || 1) - 1) * (g.interval ?? 1));
    for (const { g, def } of groups) {
      const st = scaleEnemy(def, sim.tier);
      const speed = st.speed * nightMult;
      const len = pathLen(g.path && sim.paths[g.path] ? g.path : sim.pathOrder[0], !!def.flying);
      const window = span + len / Math.max(0.2, speed);
      const k = zombieLoad(defs, g.enemy, sim.tier, w.hpMult, window);
      const n = g.count || 0;
      if (k.flying) {
        hpAir += k.hp * n;
        flyingSeen = true;
      } else hpGround += k.hp * n;
      reward += k.reward * n;
      speedW += speed * k.hp * n;
      lenW += len * k.hp * n;
      weight += k.hp * n;
    }
    const speed = weight ? speedW / weight : 1;
    const len = weight ? lenW / weight : 0;
    const pathT = len / Math.max(0.2, speed);
    const capGround = bestPerDollar(allowed.filter((t) => t.ground), span, pathT, speed);
    const capAir = bestPerDollar(allowed.filter((t) => t.air), span, pathT, speed);
    const need = (hpGround ? (capGround > 0 ? hpGround / capGround : Infinity) : 0) + (hpAir ? (capAir > 0 ? hpAir / capAir : Infinity) : 0);
    waves.push({ n: i + 1, hp: Math.round(hpGround + hpAir), need: Number.isFinite(need) ? Math.round(need) : Infinity, have: Math.round(money), ratio: money > 0 ? need / money : need > 0 ? Infinity : 0, flying: hpAir > 0, pathTime: pathT, count: groups.reduce((n, x) => n + (x.g.count || 0), 0) });
    money += reward;
  }
  if (!allowed.length) warnings.push('No allowed tower deals damage, so this level cannot be won.');
  else {
    if (waves.some((x) => !x.flying) && !allowed.some((t) => t.ground)) warnings.push('No allowed tower can hit ground zombies.');
    if (flyingSeen && !allowed.some((t) => t.air)) warnings.push('Flying zombies come, but no allowed tower can hit them.');
  }
  const peakWave = waves.reduce((b, x) => (!b || x.ratio > b.ratio ? x : b), null);
  const lives = Math.max(1, sim.startLives);
  let ratio = peakWave ? peakWave.ratio * Math.pow(20 / lives, 0.25) : 0;
  // the ratio is squared, so a level whose waves are far below what you can afford stays near 1
  let score = 1 + (DIFFICULTY_MAX - 1) * (Number.isFinite(ratio) ? 1 - Math.exp(-Math.pow(ratio / 2, 2)) : 1);
  if (!waves.length) score = 1;
  score = Math.round(Math.min(DIFFICULTY_MAX, Math.max(1, score)) * 10) / 10;
  const band = bandOf(score);
  if (peakWave) facts.push('Hardest wave: ' + peakWave.n + (Number.isFinite(peakWave.need) ? ', which takes about $' + peakWave.need + ' of towers to stop when about $' + peakWave.have + ' has been earned by then.' : ', which the allowed towers cannot stop.'));
  if (sim.tier > 1) facts.push('Zombies play at tier ' + sim.tier + (RANK_NAMES[rankOf(sim.tier)] ? ' (' + RANK_NAMES[rankOf(sim.tier)] + ')' : '') + ', so they have more health, speed and armor than at tier 1.');
  const lens = sim.pathOrder.map((id) => sim.paths[id].total);
  if (lens.length) facts.push('The path is ' + round1(Math.min(...lens)) + (lens.length > 1 ? ' to ' + round1(Math.max(...lens)) : '') + ' tiles long: a longer walk gives towers more time to shoot.');
  facts.push('You start with $' + sim.money + ' and ' + sim.startLives + ' lives, over ' + total + ' wave' + (total === 1 ? '' : 's') + '.');
  // a difficulty the designer typed in on the level wins over the estimate (but not for the night rating, which is always estimated)
  const hand = Number(level.difficulty);
  const manual = !ctx.night && Number.isFinite(hand) && hand >= 1 && hand <= DIFFICULTY_MAX;
  const auto = score;
  if (manual) { score = Math.round(hand * 10) / 10; }
  const band2 = bandOf(score);
  return { manual, auto, score, label: band2.label, color: band2.color, ratio: Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : Infinity, peak: peakWave ? peakWave.n : 0, waves, facts, warnings, tier: sim.tier };
}
