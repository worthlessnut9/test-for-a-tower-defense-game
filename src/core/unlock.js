// Level unlock conditions. A condition is a small JSON object:
//   {"type":"always"}
//   {"type":"levelComplete","level":"meadow"}
//   {"type":"levelStars","level":"meadow","min":3}
//   {"type":"levelScore","level":"meadow","min":1500}
//   {"type":"totalStars","min":6}
//   {"type":"levelsCompleted","min":3}
//   {"type":"totalScore","min":5000}
//   {"type":"all","conditions":[ ... ]}   every sub-condition must pass
//   {"type":"any","conditions":[ ... ]}   at least one must pass

export const CONDITION_TYPES = ['always', 'levelComplete', 'levelStars', 'levelScore', 'totalStars', 'levelsCompleted', 'totalScore', 'all', 'any'];

function rec(save, id) {
  return (save && save.levels && save.levels[id]) || {};
}

function sum(save, key) {
  let n = 0;
  for (const id in (save && save.levels) || {}) n += save.levels[id][key] || 0;
  return n;
}

export function isUnlocked(c, save) {
  if (!c || c.type === 'always') return true;
  switch (c.type) {
    case 'levelComplete':
      return !!rec(save, c.level).completed;
    case 'levelStars':
      return (rec(save, c.level).stars || 0) >= (c.min ?? 1);
    case 'levelScore':
      return (rec(save, c.level).bestScore || 0) >= (c.min ?? 0);
    case 'totalStars':
      return sum(save, 'stars') >= (c.min ?? 0);
    case 'totalScore':
      return sum(save, 'bestScore') >= (c.min ?? 0);
    case 'levelsCompleted': {
      let n = 0;
      for (const id in (save && save.levels) || {}) if (save.levels[id].completed) n++;
      return n >= (c.min ?? 0);
    }
    case 'all':
      return (c.conditions || []).every((x) => isUnlocked(x, save));
    case 'any':
      return !(c.conditions || []).length || c.conditions.some((x) => isUnlocked(x, save));
    default:
      return true;
  }
}

/** Human-readable list of what is still missing (only unmet leaf conditions). */
export function describeMissing(c, save, names = {}) {
  if (isUnlocked(c, save)) return [];
  const nm = (id) => names[id] || id;
  switch (c.type) {
    case 'levelComplete':
      return ['Complete ' + nm(c.level)];
    case 'levelStars':
      return ['Earn ' + (c.min ?? 1) + '★ on ' + nm(c.level)];
    case 'levelScore':
      return ['Score ' + c.min + ' on ' + nm(c.level)];
    case 'totalStars':
      return ['Collect ' + c.min + '★ in total'];
    case 'totalScore':
      return ['Reach ' + c.min + ' total score'];
    case 'levelsCompleted':
      return ['Complete ' + c.min + ' levels'];
    case 'all':
      return (c.conditions || []).flatMap((x) => describeMissing(x, save, names));
    case 'any': {
      const opts = (c.conditions || []).map((x) => describeMissing(x, save, names).join(' + '));
      return [opts.join('  OR  ')];
    }
    default:
      return [];
  }
}
