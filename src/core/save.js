// Progress is stored in the browser's localStorage (falls back to memory if unavailable).
const KEY = 'td-save-v1';
let memory = null;

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.levels) return s;
    }
  } catch (e) {
    if (memory) return memory;
  }
  return memory || { levels: {} };
}

function persist(save) {
  memory = save;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch (e) {
    /* private mode etc. - keep in memory only */
  }
}

/** Keeps the best stars / score per level. */
export function recordResult(levelId, { won, stars, score }) {
  const save = loadSave();
  const r = save.levels[levelId] || { completed: false, stars: 0, bestScore: 0, plays: 0 };
  r.plays = (r.plays || 0) + 1;
  if (won) {
    r.completed = true;
    r.stars = Math.max(r.stars || 0, stars);
    r.bestScore = Math.max(r.bestScore || 0, score);
  }
  save.levels[levelId] = r;
  persist(save);
  return save;
}

/** Adds (or removes, if negative) coins. */
export function addCoins(amount, game) {
  const save = loadSave();
  const cur = Number.isFinite(save.coins) ? save.coins : (game && game.startCoins) || 0;
  save.coins = Math.max(0, cur + amount);
  persist(save);
  return save;
}

/** Spends coins to own a tower. Returns false if it can't be afforded or is already owned. */
export function buyTower(id, price, game) {
  const save = loadSave();
  const cur = Number.isFinite(save.coins) ? save.coins : (game && game.startCoins) || 0;
  save.owned = save.owned || [];
  if (save.owned.includes(id) || cur < price) return false;
  save.coins = cur - price;
  save.owned.push(id);
  persist(save);
  return true;
}

/** Spends coins to unlock one upgrade tier (tiers are bought in order; the caller checks the order). */
export function buyTier(towerId, pathIndex, tierIndex, price, game) {
  const save = loadSave();
  const cur = Number.isFinite(save.coins) ? save.coins : (game && game.startCoins) || 0;
  save.tiers = save.tiers || {};
  const have = (save.tiers[towerId] || []).slice();
  while (have.length < 3) have.push(0);
  if ((have[pathIndex] || 0) > tierIndex || cur < price) return false;
  save.coins = cur - price;
  have[pathIndex] = tierIndex + 1;
  save.tiers[towerId] = have;
  persist(save);
  return true;
}

/** Saves the player's chosen team (tower ids). */
export function setTeam(ids) {
  const save = loadSave();
  save.team = ids.slice();
  persist(save);
  return save;
}

/** Keeps the best wave reached per level in endless mode. Returns the previous best. */
export function recordEndless(levelId, wave) {
  const save = loadSave();
  save.endless = save.endless || {};
  const prev = save.endless[levelId] || 0;
  if (wave > prev) save.endless[levelId] = wave;
  persist(save);
  return prev;
}

/** Remembers zombies the player has met in a level (their ids). Returns true when something new was added. */
export function markSeen(ids) {
  const save = loadSave();
  const seen = Array.isArray(save.seen) ? save.seen : [];
  const fresh = [...new Set(ids)].filter((id) => typeof id === 'string' && !seen.includes(id));
  if (!fresh.length) return false;
  save.seen = seen.concat(fresh);
  persist(save);
  return true;
}

/** The ids of the zombies the player has met so far. */
export function seenIds(save = loadSave()) {
  return Array.isArray(save.seen) ? save.seen : [];
}

export function resetSave() {
  persist({ levels: {} });
}
