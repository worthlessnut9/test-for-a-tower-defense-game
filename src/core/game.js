// Game-wide rules that sit above single levels: story order, coins, owned towers and the team loadout.
import { isUnlocked, describeMissing } from './unlock.js';
import { migrateTower } from './sim.js';

export const DEFAULT_GAME = {
  teamSlots: 4, // how many towers a player brings into a level
  startCoins: 0,
  repeatRewardPct: 25, // replaying a cleared level pays this % of its reward
  endlessCoinsPerWave: 5,
  endlessHpGrowth: 0.35, // extra enemy health per loop through the level's waves in endless mode
  endlessCountGrowth: 0.25, // extra enemies per loop
};
export const DEFAULT_LEVEL_REWARD = 50;

const clampNum = (v, d, lo, hi) => {
  const x = Number(v);
  const y = Number.isFinite(x) && v !== '' && v !== null && v !== undefined ? x : d;
  return Math.min(hi, Math.max(lo, y));
};

export function normGame(g) {
  g = g || {};
  return {
    teamSlots: Math.round(clampNum(g.teamSlots, DEFAULT_GAME.teamSlots, 1, 10)),
    startCoins: Math.round(clampNum(g.startCoins, DEFAULT_GAME.startCoins, 0, 1e9)),
    repeatRewardPct: Math.round(clampNum(g.repeatRewardPct, DEFAULT_GAME.repeatRewardPct, 0, 1000)),
    endlessCoinsPerWave: Math.round(clampNum(g.endlessCoinsPerWave, DEFAULT_GAME.endlessCoinsPerWave, 0, 1e6)),
    endlessHpGrowth: clampNum(g.endlessHpGrowth, DEFAULT_GAME.endlessHpGrowth, 0, 10),
    endlessCountGrowth: clampNum(g.endlessCountGrowth, DEFAULT_GAME.endlessCountGrowth, 0, 10),
  };
}

// ---------- story: levels in order, each unlocked by finishing the one before ----------

const isDone = (save, id) => !!(save && save.levels && save.levels[id] && save.levels[id].completed);

/** Level i is open when the previous level is complete and its own (optional) extra rule passes. */
export function storyUnlocked(levels, i, save) {
  const l = levels[i];
  if (!l) return false;
  if (i > 0 && !isDone(save, levels[i - 1].id)) return false;
  return isUnlocked(l.unlock, save);
}

export function storyMissing(levels, i, save, names) {
  const out = [];
  if (i > 0 && !isDone(save, levels[i - 1].id)) out.push('Complete ' + levels[i - 1].name);
  if (!isUnlocked(levels[i].unlock, save)) out.push(...describeMissing(levels[i].unlock, save, names));
  return out;
}

// ---------- acts: story chapters that group levels ----------

export const DEFAULT_ACT_COLOR = '#6aa7e0';

/** An act as the game uses it: id, name, description and an accent colour. */
export function normAct(a) {
  a = a || {};
  const c = String(a.color == null ? '' : a.color).trim();
  return {
    id: a.id == null ? '' : String(a.id),
    name: a.name || a.id || 'Act',
    description: a.description ? String(a.description) : '',
    color: /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : DEFAULT_ACT_COLOR,
  };
}

/**
 * Levels grouped by act, in act order: [{ act, entries: [{ level, index }] }]. `index` is the level's place in the
 * whole story (which is what unlocks by). Acts with no levels are left out. Levels with no act, or an unknown one,
 * go in a last group with act = null.
 */
export function groupByAct(levels, acts) {
  const groups = (acts || []).map((act) => ({ act, entries: [] }));
  const other = { act: null, entries: [] };
  levels.forEach((level, index) => {
    const g = groups.find((x) => x.act.id === level.act);
    (g || other).entries.push({ level, index });
  });
  const out = groups.filter((g) => g.entries.length);
  if (other.entries.length) out.push(other);
  return out;
}

/** Progress through a group of levels: how many are cleared, stars, and whether its first level is open. */
export function actSummary(group, levels, save) {
  let cleared = 0;
  let stars = 0;
  for (const { level } of group.entries) {
    const r = save && save.levels && save.levels[level.id];
    if (r && r.completed) cleared++;
    if (r) stars += r.stars || 0;
  }
  const first = group.entries[0];
  return { cleared, total: group.entries.length, stars, maxStars: group.entries.length * 3, open: !!first && storyUnlocked(levels, first.index, save) };
}

// ---------- coins ----------

export const coinsOf = (save, game) => (save && Number.isFinite(save.coins) ? save.coins : game.startCoins);

/** Coins for winning a story level: full reward the first time, a smaller share on replays. */
export function storyCoins(level, game, alreadyCleared) {
  const r = Math.max(0, Math.round(level.reward ?? DEFAULT_LEVEL_REWARD));
  return alreadyCleared ? Math.floor((r * game.repeatRewardPct) / 100) : r;
}

/** Coins for an endless run: pays for every wave you got through (not the one that beat you). */
export function endlessCoins(game, waveReached) {
  return Math.max(0, waveReached - 1) * game.endlessCoinsPerWave;
}

// ---------- owned towers and the team ----------

export const towerPrice = (def) => Math.max(0, Math.round(Number(def.price) || 0));

/** Tower ids the player owns: free ones plus anything bought. Data order. */
export function ownedIds(towers, save) {
  const bought = new Set((save && save.owned) || []);
  return towers.filter((t) => towerPrice(t) === 0 || bought.has(t.id)).map((t) => t.id);
}

/** The player's team: their saved choice (owned towers only, within the slot limit), or the first owned towers. */
export function teamIds(towers, save, game) {
  const owned = ownedIds(towers, save);
  if (save && Array.isArray(save.team)) {
    const seen = new Set();
    const kept = save.team.filter((id) => owned.includes(id) && !seen.has(id) && seen.add(id)).slice(0, game.teamSlots);
    // a saved team whose towers no longer exist (the roster changed) falls back to the first owned towers instead of leaving the player with nothing
    return kept.length || !save.team.length ? kept : owned.slice(0, game.teamSlots);
  }
  return owned.slice(0, game.teamSlots);
}

// ---------- upgrade tiers bought with coins ----------
// Every tier has a coin `price` (0 = free). A tier can only be used in a level once the player has bought it
// on the Team screen. Tiers are bought in order along each path.

export const tierPrice = (tier) => Math.max(0, Math.round(Number(tier && tier.price) || 0));

/** For each path of a tower: how many tiers (from the start) the player has unlocked. Free tiers at the front come for nothing. */
export function unlockedTiers(def, save) {
  const saved = (save && save.tiers && save.tiers[def.id]) || [];
  return (migrateTower(def).paths || []).map((p, i) => {
    const tiers = p.tiers || [];
    let n = Math.max(0, Math.min(tiers.length, Math.floor(Number(saved[i]) || 0)));
    while (n < tiers.length && tierPrice(tiers[n]) === 0) n++;
    return n;
  });
}

/** { towerId: [unlockedOnPath0, ...] } for a list of towers, as the Sim wants it. */
export function unlockedMap(towers, save) {
  const m = {};
  for (const t of towers) m[t.id] = unlockedTiers(t, save);
  return m;
}

/** 'owned' | 'buy' (the next one to buy on its path) | 'later' (an earlier tier on the path comes first). */
export function tierState(def, pathIndex, tierIndex, save) {
  const n = unlockedTiers(def, save)[pathIndex] || 0;
  return tierIndex < n ? 'owned' : tierIndex === n ? 'buy' : 'later';
}

/** Which towers can be built in a level: the team, narrowed by the level's own list. Never empty if avoidable. */
export function availableTowers(level, towers, save, game) {
  const allowed = level.towers && level.towers.length ? level.towers : towers.map((t) => t.id);
  const owned = ownedIds(towers, save);
  const pick = (ids) => allowed.filter((id) => ids.includes(id));
  const a = pick(teamIds(towers, save, game));
  if (a.length) return a;
  const b = pick(owned).slice(0, game.teamSlots); // team has nothing this level allows: pick for them
  return b.length ? b : allowed.filter((id) => towers.some((t) => t.id === id));
}
