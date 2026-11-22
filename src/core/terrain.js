// Zones: the look of a level's ground. A zone sets the grass colours and style, up to four kinds of path and up to
// six kinds of wall (each with its own colours and style). Levels paint walls with the tile characters
// '#' (wall 1), '2' (wall 2) ... '6' (wall 6); '.' is open, buildable ground. Each path of a level picks which of the
// zone's path types it is drawn with (`surface`, 0 = the first). Building walls join up: touching tiles of one wall type
// become one bigger building.
// Drawing is engine-agnostic: it talks to a "painter" with three calls, so the same code draws the game
// map (Phaser), the level-select previews and the editor (canvas).
//   painter.rect(x, y, w, h, '#rrggbb', alpha)
//   painter.circle(x, y, radius, '#rrggbb', alpha)
//   painter.line(x1, y1, x2, y2, width, '#rrggbb', alpha)

import { pathCells, normTier } from './sim.js';

export const GRASS_STYLES = ['plain', 'speckle', 'tiles', 'stripes'];
export const PATH_STYLES = ['plain', 'cobble', 'road', 'planks', 'rails', 'dirt', 'gravel', 'sand', 'snow', 'bridge', 'tiles', 'grating', 'mud', 'flesh', 'ice'];
export const WALL_STYLES = ['block', 'rock', 'tree', 'crate', 'brick', 'fence', 'water', 'bush', 'metal', 'mound', 'house', 'cabin', 'warehouse', 'skyscraper', 'shop', 'tent', 'ruins', 'silo', 'ice', 'barricade'];
/** The wall styles that are buildings (touching tiles of one type merge into one bigger building). */
export const BUILDING_STYLES = ['house', 'cabin', 'warehouse', 'skyscraper', 'shop', 'barricade'];
export const MAX_WALLS = 6;
export const MAX_SURFACES = 4;
export const WALL_CHARS = '#23456';

/** Index (0-based) of the wall type a tile character stands for, or -1 if it is not a wall. */
export const wallIndex = (ch) => WALL_CHARS.indexOf(ch);
/** The tile character that paints wall type i (0-based). */
export const wallChar = (i) => WALL_CHARS.charAt(i);

export const DEFAULT_PATH = { name: 'Path', color: '#4c5157', inner: '#575d64', style: 'plain' };
export const DEFAULT_WALL = { name: 'Wall', color: '#4a4f55', inner: '#5b6168', style: 'block' };

/** What a level looks like when it has no zone: scorched ground, concrete, asphalt. */
export const DEFAULT_ZONE = {
  id: '',
  name: 'Scorched Ground',
  description: '',
  variant: '',
  tier: 1, // zombie strength: every zombie scales with the zone's tier (1 to 50)
  grassA: '#3a3d2e',
  grassB: '#35382a',
  grassStyle: 'plain',
  paths: [{ ...DEFAULT_PATH }],
  walls: [{ ...DEFAULT_WALL }],
};

function zoneColor(v, fallback) {
  let s = String(v == null ? '' : v).trim();
  if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s.slice(1).split('').map((x) => x + x).join('');
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : fallback;
}

/** One path type, with anything missing filled in. */
export function normPath(w, i = 0) {
  w = w || {};
  return {
    name: w.name ? String(w.name) : 'Path ' + (i + 1),
    color: zoneColor(w.color, DEFAULT_PATH.color),
    inner: zoneColor(w.inner, DEFAULT_PATH.inner),
    style: PATH_STYLES.includes(w.style) ? w.style : DEFAULT_PATH.style,
  };
}

/** One wall type, with anything missing filled in. */
export function normWall(w, i = 0) {
  w = w || {};
  return {
    name: w.name ? String(w.name) : 'Wall ' + (i + 1),
    color: zoneColor(w.color, DEFAULT_WALL.color),
    inner: zoneColor(w.inner, DEFAULT_WALL.inner),
    style: WALL_STYLES.includes(w.style) ? w.style : DEFAULT_WALL.style,
  };
}

/** Fills in anything missing so a zone is always complete. Old zones with one wall (wall / wallInner / wallStyle) become a one-entry `walls` list. */
export function normZone(z) {
  z = z || {};
  const D = DEFAULT_ZONE;
  let walls;
  if (Array.isArray(z.walls) && z.walls.length) walls = z.walls.slice(0, MAX_WALLS).map(normWall);
  else if (z.wall !== undefined || z.wallInner !== undefined || z.wallStyle !== undefined) walls = [normWall({ name: 'Wall', color: z.wall, inner: z.wallInner, style: z.wallStyle }, 0)];
  else walls = [{ ...DEFAULT_WALL }];
  // old zones had one path (path / pathInner / pathStyle): it becomes a one-entry `paths` list
  let paths;
  if (Array.isArray(z.paths) && z.paths.length) paths = z.paths.slice(0, MAX_SURFACES).map(normPath);
  else if (z.path !== undefined || z.pathInner !== undefined || z.pathStyle !== undefined) paths = [normPath({ name: 'Path', color: z.path, inner: z.pathInner, style: z.pathStyle }, 0)];
  else paths = [{ ...DEFAULT_PATH }];
  return {
    id: z.id == null ? D.id : String(z.id),
    name: z.name || z.id || D.name,
    description: z.description ? String(z.description) : '',
    variant: z.variant ? String(z.variant) : '',
    tier: normTier(z.tier),
    grassA: zoneColor(z.grassA, D.grassA),
    grassB: zoneColor(z.grassB, D.grassB),
    grassStyle: GRASS_STYLES.includes(z.grassStyle) ? z.grassStyle : D.grassStyle,
    paths,
    walls,
  };
}

/** The zone a level uses (already-normalised zones keyed by id), or the default look. */
export function zoneFor(level, zonesById) {
  return (level && zonesById && zonesById[level.zone]) || DEFAULT_ZONE;
}

/** The zombie strength tier a level plays at: its own `tier`, else its zone's, else 1. */
export function tierFor(level, zone) {
  return normTier(level && level.tier ? level.tier : zone && zone.tier ? zone.tier : 1);
}

/** Which path type (0-based) each path cell of a level is drawn with: a Map "col,row" -> surface. The first path to cover a cell wins. */
export function levelPathMap(level) {
  const m = new Map();
  for (const pth of (level && level.paths) || []) {
    const sf = Math.max(0, Math.min(MAX_SURFACES - 1, Math.floor(Number(pth.surface)) || 0));
    for (const [c, r] of pathCells(pth.points)) if (!m.has(c + ',' + r)) m.set(c + ',' + r, sf);
  }
  return m;
}

/** The highest path type (1-based) any path of a level asks for; 1 if none says. */
export function pathTypesUsed(level) {
  let max = 1;
  for (const pth of (level && level.paths) || []) max = Math.max(max, (Math.floor(Number(pth.surface)) || 0) + 1);
  return max;
}

/** The highest wall type (1-based) a level's tiles use; 0 if it has no walls. */
export function wallsUsed(tiles) {
  let max = 0;
  for (const row of tiles || []) for (const ch of row) max = Math.max(max, wallIndex(ch) + 1);
  return max;
}

/** Blends colour a toward colour b by t (0..1). */
export function mixHex(a, b, t) {
  const p = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const x = p(a);
  const y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// Stable pseudo-random number per tile so decoration doesn't flicker or move between frames.
function tileRand(c, r, k) {
  let h = (Math.imul(c, 374761393) + Math.imul(r, 668265263) + Math.imul(k + 1, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Which way a path tile runs: 'h' (only left/right neighbours), 'v' (only up/down) or 'x' (corner, junction, end). */
function runOf(pathSet, c, r) {
  const has = (dc, dr) => pathSet.has(c + dc + ',' + (r + dr));
  const horiz = has(-1, 0) || has(1, 0);
  const vert = has(0, -1) || has(0, 1);
  return horiz && !vert ? 'h' : vert && !horiz ? 'v' : 'x';
}

function drawPathTile(p, pd, pathSet, x, y, T, c, r) {
  const inset = Math.max(2, Math.round(T * 0.07));
  const col = pd.color;
  const inn = pd.inner;
  p.rect(x, y, T, T, col, 1);
  const run = runOf(pathSet, c, r);
  const lw = (f) => Math.max(1, T * f);
  // (u, v) -> pixels, where u runs along the path and v across it
  const at = (u, v) => (run === 'v' ? [x + T * v, y + T * u] : [x + T * u, y + T * v]);
  const alongLine = (v, w, color, alpha = 1, u0 = 0, u1 = 1) => { const [x1, y1] = at(u0, v); const [x2, y2] = at(u1, v); p.line(x1, y1, x2, y2, w, color, alpha); };
  switch (pd.style) {
    case 'cobble':
      for (let k = 0; k < 4; k++) {
        const sx = x + T * (k % 2 ? 0.53 : 0.08) + (tileRand(c, r, k) - 0.5) * T * 0.05;
        const sy = y + T * (k > 1 ? 0.53 : 0.08) + (tileRand(c, r, k + 4) - 0.5) * T * 0.05;
        p.rect(sx, sy, T * 0.39, T * 0.39, inn, 1);
      }
      break;
    case 'road': {
      const marking = mixHex(inn, '#ffffff', 0.5);
      const w = Math.max(2, T * 0.08);
      if (run === 'h') p.rect(x + T * 0.28, y + T / 2 - w / 2, T * 0.44, w, marking, 1);
      else if (run === 'v') p.rect(x + T / 2 - w / 2, y + T * 0.28, w, T * 0.44, marking, 1);
      else p.rect(x + T / 2 - w, y + T / 2 - w, w * 2, w * 2, marking, 1);
      break;
    }
    case 'planks':
      // boards lie across the direction of travel
      for (let k = 0; k < 4; k++) {
        const o = T * (0.03 + 0.245 * k);
        if (run === 'h') p.rect(x + o, y + T * 0.04, T * 0.21, T * 0.92, inn, 1);
        else p.rect(x + T * 0.04, y + o, T * 0.92, T * 0.21, inn, 1);
      }
      break;
    case 'rails': {
      const steel = mixHex(inn, '#ffffff', 0.45);
      for (const f of [0.16, 0.5, 0.84]) {
        if (run === 'v') p.rect(x + T * 0.18, y + T * f - T * 0.04, T * 0.64, T * 0.08, inn, 1);
        else p.rect(x + T * f - T * 0.04, y + T * 0.18, T * 0.08, T * 0.64, inn, 1);
      }
      for (const f of [0.36, 0.64]) {
        if (run === 'v') p.line(x + T * f, y, x + T * f, y + T, lw(0.06), steel, 1);
        else p.line(x, y + T * f, x + T, y + T * f, lw(0.06), steel, 1);
      }
      break;
    }
    case 'dirt': {
      // two wheel ruts and a few stones
      if (run === 'x') p.circle(x + T / 2, y + T / 2, T * 0.3, inn, 0.7);
      else for (const f of [0.33, 0.67]) alongLine(f, lw(0.14), inn, 0.75);
      for (let k = 0; k < 4; k++) p.circle(x + (0.1 + tileRand(c, r, k + 40) * 0.8) * T, y + (0.1 + tileRand(c, r, k + 50) * 0.8) * T, lw(0.03), mixHex(col, '#000000', 0.25), 0.8);
      break;
    }
    case 'gravel':
      for (let k = 0; k < 11; k++) {
        const tone = k % 3 === 0 ? mixHex(inn, '#000000', 0.25) : k % 3 === 1 ? inn : mixHex(inn, '#ffffff', 0.2);
        p.circle(x + (0.08 + tileRand(c, r, k + 60) * 0.84) * T, y + (0.08 + tileRand(c, r, k + 80) * 0.84) * T, T * (0.035 + tileRand(c, r, k + 100) * 0.035), tone, 1);
      }
      break;
    case 'sand': {
      for (let k = 0; k < 3; k++) {
        const v = 0.2 + k * 0.28 + (tileRand(c, r, k + 110) - 0.5) * 0.08;
        const u0 = 0.05 + tileRand(c, r, k + 120) * 0.3;
        alongLine(v, lw(0.045), inn, 0.85, u0, u0 + 0.35 + tileRand(c, r, k + 130) * 0.2);
      }
      for (let k = 0; k < 3; k++) p.circle(x + (0.1 + tileRand(c, r, k + 140) * 0.8) * T, y + (0.1 + tileRand(c, r, k + 150) * 0.8) * T, lw(0.025), mixHex(col, '#ffffff', 0.3), 1);
      break;
    }
    case 'snow': {
      p.rect(x + inset, y + inset, T - inset * 2, T - inset * 2, inn, 0.6);
      const dent = mixHex(col, '#6a8aa5', 0.5);
      const [fx, fy] = at(0.3, 0.38);
      p.circle(fx, fy, lw(0.06), dent, 1);
      if (run !== 'x') { const [gx, gy] = at(0.7, 0.62); p.circle(gx, gy, lw(0.06), dent, 1); }
      for (let k = 0; k < 3; k++) p.circle(x + (0.1 + tileRand(c, r, k + 160) * 0.8) * T, y + (0.1 + tileRand(c, r, k + 170) * 0.8) * T, lw(0.02), '#ffffff', 1);
      break;
    }
    case 'bridge': {
      // planks across the way, with a rail and posts on both edges
      for (let k = 0; k < 4; k++) {
        const o = T * (0.03 + 0.245 * k);
        if (run === 'v') p.rect(x + T * 0.04, y + o, T * 0.92, T * 0.21, inn, 1);
        else p.rect(x + o, y + T * 0.04, T * 0.21, T * 0.92, inn, 1);
      }
      if (run !== 'x') {
        const rail = mixHex(inn, '#000000', 0.45);
        for (const v of [0.05, 0.95]) {
          alongLine(v, lw(0.09), rail, 1);
          for (const u of [0.25, 0.75]) { const [px, py] = at(u, v); p.circle(px, py, lw(0.075), mixHex(rail, '#ffffff', 0.2), 1); }
        }
      }
      break;
    }
    case 'tiles':
      for (let k = 0; k < 4; k++) {
        const light = (k + c + r) % 2 ? mixHex(inn, '#ffffff', 0.07) : mixHex(inn, '#000000', 0.07);
        p.rect(x + T * (k % 2 ? 0.52 : 0.04), y + T * (k > 1 ? 0.52 : 0.04), T * 0.44, T * 0.44, light, 1);
      }
      break;
    case 'grating': {
      for (let k = 1; k < 5; k++) {
        p.line(x + (T * k) / 5, y + inset * 0.5, x + (T * k) / 5, y + T - inset * 0.5, lw(0.05), inn, 0.95);
        p.line(x + inset * 0.5, y + (T * k) / 5, x + T - inset * 0.5, y + (T * k) / 5, lw(0.05), inn, 0.95);
      }
      for (const [bx, by] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) p.circle(x + bx * T, y + by * T, lw(0.035), mixHex(inn, '#ffffff', 0.3), 1);
      break;
    }
    case 'mud':
      for (let k = 0; k < 3; k++) {
        const bx = x + (0.2 + tileRand(c, r, k + 180) * 0.6) * T;
        const by = y + (0.2 + tileRand(c, r, k + 190) * 0.6) * T;
        p.circle(bx, by, T * (0.14 + tileRand(c, r, k + 200) * 0.1), inn, 0.85);
        p.circle(bx - T * 0.03, by - T * 0.03, lw(0.04), mixHex(inn, '#ffffff', 0.28), 0.6);
      }
      for (let k = 0; k < 3; k++) p.circle(x + (0.1 + tileRand(c, r, k + 210) * 0.8) * T, y + (0.1 + tileRand(c, r, k + 220) * 0.8) * T, lw(0.025), mixHex(col, '#000000', 0.3), 0.9);
      break;
    case 'flesh': {
      for (let k = 0; k < 3; k++) {
        const v0 = 0.2 + k * 0.3;
        const v1 = v0 + (tileRand(c, r, k + 230) - 0.5) * 0.22;
        const v2 = v0 + (tileRand(c, r, k + 240) - 0.5) * 0.22;
        const pts = [at(0, v0), at(0.35, v1), at(0.7, v2), at(1, v0)];
        for (let i = 0; i < 3; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], lw(0.06), inn, 0.9);
      }
      for (let k = 0; k < 3; k++) {
        const lx = x + (0.15 + tileRand(c, r, k + 250) * 0.7) * T;
        const ly = y + (0.15 + tileRand(c, r, k + 260) * 0.7) * T;
        p.circle(lx, ly, lw(0.08), mixHex(inn, '#ffffff', 0.15), 1);
        p.circle(lx - lw(0.02), ly - lw(0.02), lw(0.03), mixHex(inn, '#ffffff', 0.55), 0.8);
      }
      break;
    }
    case 'ice': {
      p.rect(x + inset, y + inset, T - inset * 2, T - inset * 2, inn, 0.35);
      p.line(x + T * 0.15, y + T * 0.85, x + T * 0.5, y + T * 0.5, lw(0.05), '#ffffff', 0.6);
      p.line(x + T * 0.45, y + T * 0.9, x + T * 0.8, y + T * 0.55, lw(0.05), '#ffffff', 0.5);
      const crack = mixHex(col, '#2a5a80', 0.45);
      const a0 = tileRand(c, r, 270) * 6.283;
      const cx = x + T * 0.5;
      const cy = y + T * 0.5;
      p.line(cx, cy, cx + Math.cos(a0) * T * 0.4, cy + Math.sin(a0) * T * 0.4, lw(0.03), crack, 0.9);
      p.line(cx, cy, cx + Math.cos(a0 + 2.2) * T * 0.3, cy + Math.sin(a0 + 2.2) * T * 0.3, lw(0.03), crack, 0.9);
      break;
    }
    default: // plain
      p.rect(x + inset, y + inset, T - inset * 2, T - inset * 2, inn, 1);
  }
}

/** The roof rectangle of a building tile: it reaches the tile edge on sides where the same building continues. */
function roofBox(x, y, T, nb, padF) {
  const pad = T * padF;
  const l = nb.L ? 0 : pad;
  const u = nb.U ? 0 : pad;
  const rr = nb.R ? 0 : pad;
  const d = nb.D ? 0 : pad;
  return [x + l, y + u, T - l - rr, T - u - d];
}

function drawWallTile(p, w, ground, x, y, T, c, r, nb) {
  const inset = Math.max(2, Math.round(T * 0.07));
  const col = w.color;
  const inn = w.inner;
  switch (w.style) {
    case 'rock': {
      p.rect(x, y, T, T, ground, 1);
      const blobs = [[0.36, 0.6, 0.25], [0.64, 0.52, 0.27], [0.5, 0.3, 0.2]];
      blobs.forEach(([bx, by, br], k) => {
        const jx = (tileRand(c, r, k) - 0.5) * 0.08;
        const jy = (tileRand(c, r, k + 9) - 0.5) * 0.08;
        p.circle(x + (bx + jx) * T + T * 0.03, y + (by + jy) * T + T * 0.04, br * T, col, 1);
        p.circle(x + (bx + jx) * T, y + (by + jy) * T, br * T * 0.82, inn, 1);
      });
      break;
    }
    case 'tree':
      p.rect(x, y, T, T, ground, 1);
      p.circle(x + T * 0.55, y + T * 0.8, T * 0.3, '#000000', 0.22);
      p.rect(x + T * 0.43, y + T * 0.52, T * 0.14, T * 0.34, col, 1);
      p.circle(x + T * 0.5, y + T * 0.4, T * 0.35, inn, 1);
      p.circle(x + T * 0.4, y + T * 0.3, T * 0.14, mixHex(inn, '#ffffff', 0.18), 1);
      break;
    case 'crate': {
      p.rect(x, y, T, T, col, 1);
      p.rect(x + inset, y + inset, T - inset * 2, T - inset * 2, inn, 1);
      const lw = Math.max(1, T * 0.06);
      p.line(x + inset, y + inset, x + T - inset, y + T - inset, lw, col, 1);
      p.line(x + T - inset, y + inset, x + inset, y + T - inset, lw, col, 1);
      break;
    }
    case 'brick': {
      p.rect(x, y, T, T, col, 1);
      const g = Math.max(1, T * 0.035);
      const bh = T / 3;
      for (let k = 0; k < 3; k++) {
        const cuts = k % 2 ? [0, 0.25, 0.75, 1] : [0, 0.5, 1];
        for (let i = 0; i < cuts.length - 1; i++) {
          const shade = (tileRand(c, r, k * 4 + i) - 0.5) * 0.16;
          const bx = x + cuts[i] * T;
          const bw = (cuts[i + 1] - cuts[i]) * T;
          p.rect(bx + g, y + k * bh + g, bw - 2 * g, bh - 2 * g, mixHex(inn, shade > 0 ? '#ffffff' : '#000000', Math.abs(shade)), 1);
        }
      }
      break;
    }
    case 'fence': {
      p.rect(x, y, T, T, ground, 1);
      p.rect(x, y + T * 0.28, T, T * 0.09, col, 1);
      p.rect(x, y + T * 0.64, T, T * 0.09, col, 1);
      for (let k = 0; k < 4; k++) {
        const px = x + T * (0.06 + k * 0.24);
        p.rect(px + T * 0.02, y + T * 0.14, T * 0.17, T * 0.76, '#000000', 0.2);
        p.rect(px, y + T * 0.1, T * 0.17, T * 0.76, inn, 1);
        p.rect(px, y + T * 0.1, T * 0.17, T * 0.07, mixHex(inn, '#ffffff', 0.22), 1);
      }
      break;
    }
    case 'water': {
      p.rect(x, y, T, T, col, 1);
      for (let k = 0; k < 3; k++) {
        const lx = x + T * (0.08 + tileRand(c, r, k) * 0.35);
        const ly = y + T * (0.2 + k * 0.28 + (tileRand(c, r, k + 5) - 0.5) * 0.1);
        const len = T * (0.25 + tileRand(c, r, k + 10) * 0.22);
        p.line(lx, ly, lx + len, ly, Math.max(1.5, T * 0.045), inn, 0.85);
      }
      break;
    }
    case 'bush':
      p.rect(x, y, T, T, ground, 1);
      p.circle(x + T * 0.52, y + T * 0.78, T * 0.3, '#000000', 0.2);
      [[0.34, 0.58, 0.25], [0.66, 0.58, 0.25], [0.5, 0.36, 0.27]].forEach(([bx, by, br]) => {
        p.circle(x + bx * T, y + by * T, br * T, col, 1);
        p.circle(x + bx * T, y + by * T - T * 0.02, br * T * 0.84, inn, 1);
      });
      p.circle(x + T * 0.42, y + T * 0.3, Math.max(1.5, T * 0.05), mixHex(inn, '#ffffff', 0.3), 1);
      p.circle(x + T * 0.62, y + T * 0.5, Math.max(1.5, T * 0.04), mixHex(inn, '#ffffff', 0.3), 1);
      break;
    case 'metal': {
      p.rect(x, y, T, T, col, 1);
      p.rect(x + inset, y + inset, T - inset * 2, T - inset * 2, inn, 1);
      for (let k = 1; k <= 3; k++) {
        const lx = x + inset + (k * (T - inset * 2)) / 4;
        p.line(lx, y + inset, lx, y + T - inset, Math.max(1, T * 0.05), col, 0.9);
      }
      break;
    }
    case 'mound':
      p.rect(x, y, T, T, ground, 1);
      p.circle(x + T * 0.5, y + T * 0.82, T * 0.34, '#000000', 0.18);
      [[0.5, 0.36, 0.24], [0.3, 0.62, 0.25], [0.7, 0.62, 0.25], [0.5, 0.68, 0.27]].forEach(([bx, by, br]) => {
        p.circle(x + bx * T, y + by * T, br * T, col, 1);
        p.circle(x + bx * T, y + by * T - T * 0.02, br * T * 0.86, inn, 1);
      });
      break;
    case 'house': {
      // gabled roof seen from above. Edge colour = walls and eaves, inner = roof. Touching house tiles share one roof.
      p.rect(x, y, T, T, col, 1);
      const [rx, ry, rw, rh] = roofBox(x, y, T, nb, 0.07);
      p.rect(rx, ry, rw, rh, inn, 1);
      p.rect(rx, y + T * 0.5, rw, ry + rh - (y + T * 0.5), '#000000', 0.12);
      for (const f of [0.17, 0.33, 0.67, 0.83]) p.rect(rx, y + T * f, rw, Math.max(1, T * 0.025), mixHex(inn, '#000000', 0.2), 1);
      p.rect(rx, y + T * 0.47, rw, T * 0.06, mixHex(inn, '#ffffff', 0.28), 1);
      if (tileRand(c, r, 301) < 0.4) {
        p.rect(x + T * 0.64, y + T * 0.12, T * 0.16, T * 0.2, mixHex(col, '#000000', 0.25), 1);
        p.rect(x + T * 0.67, y + T * 0.15, T * 0.1, T * 0.14, '#1c1c1c', 1);
      }
      break;
    }
    case 'cabin': {
      // log walls: horizontal logs with round ends where the building stops
      p.rect(x, y, T, T, col, 1);
      for (let k = 0; k < 5; k++) {
        const ly = y + (k * T) / 5;
        const log = k % 2 ? mixHex(inn, '#000000', 0.12) : inn;
        const lx0 = nb.L ? x : x + T * 0.06;
        const lx1 = nb.R ? x + T : x + T * 0.94;
        p.rect(lx0, ly + T * 0.02, lx1 - lx0, T / 5 - T * 0.04, log, 1);
        p.rect(lx0, ly + T * 0.02, lx1 - lx0, T * 0.03, mixHex(log, '#ffffff', 0.18), 1);
        if (!nb.L) p.circle(x + T * 0.06, ly + T / 10, T * 0.07, mixHex(inn, '#ffffff', 0.25), 1);
        if (!nb.R) p.circle(x + T * 0.94, ly + T / 10, T * 0.07, mixHex(inn, '#ffffff', 0.25), 1);
      }
      if (tileRand(c, r, 302) < 0.3) p.rect(x + T * 0.66, y + T * 0.1, T * 0.15, T * 0.2, '#2a2a2a', 1);
      break;
    }
    case 'warehouse': {
      // flat corrugated roof with vents
      p.rect(x, y, T, T, col, 1);
      const [rx, ry, rw, rh] = roofBox(x, y, T, nb, 0.06);
      p.rect(rx, ry, rw, rh, inn, 1);
      for (let k = 0; k < 6; k++) p.line(x + (T * (k + 0.5)) / 6, ry, x + (T * (k + 0.5)) / 6, ry + rh, Math.max(1, T * 0.02), col, 0.5);
      if (tileRand(c, r, 303) < 0.45) {
        p.circle(x + T * 0.5, y + T * 0.5, T * 0.19, col, 1);
        p.circle(x + T * 0.5, y + T * 0.5, T * 0.14, mixHex(inn, '#000000', 0.25), 1);
        p.line(x + T * 0.38, y + T * 0.5, x + T * 0.62, y + T * 0.5, Math.max(1, T * 0.03), col, 1);
        p.line(x + T * 0.5, y + T * 0.38, x + T * 0.5, y + T * 0.62, Math.max(1, T * 0.03), col, 1);
      }
      if (!nb.D) p.rect(rx, y + T - T * 0.1, rw, T * 0.04, '#000000', 0.22);
      break;
    }
    case 'skyscraper': {
      // roof with stepped setbacks, plant boxes and an occasional helipad
      p.rect(x, y, T, T, col, 1);
      const [rx, ry, rw, rh] = roofBox(x, y, T, nb, 0.07);
      p.rect(rx, ry, rw, rh, inn, 1);
      const sx = nb.L ? x : x + T * 0.2;
      const sy = nb.U ? y : y + T * 0.2;
      const ex = nb.R ? x + T : x + T * 0.8;
      const ey = nb.D ? y + T : y + T * 0.8;
      p.rect(sx, sy, ex - sx, ey - sy, mixHex(inn, '#ffffff', 0.12), 1);
      p.rect(sx, sy, ex - sx, Math.max(1, T * 0.03), mixHex(inn, '#ffffff', 0.35), 1);
      if (tileRand(c, r, 304) < 0.25) {
        p.circle(x + T * 0.5, y + T * 0.5, T * 0.28, col, 1);
        p.circle(x + T * 0.5, y + T * 0.5, T * 0.23, mixHex(inn, '#ffffff', 0.18), 1);
        p.rect(x + T * 0.42, y + T * 0.42, T * 0.16, T * 0.16, col, 1);
      } else {
        p.rect(x + T * (0.3 + tileRand(c, r, 305) * 0.2), y + T * (0.3 + tileRand(c, r, 306) * 0.2), T * 0.22, T * 0.18, col, 1);
        p.circle(x + T * 0.72, y + T * 0.7, Math.max(1.5, T * 0.04), '#e53935', 1);
      }
      break;
    }
    case 'shop': {
      // flat roof with a striped awning along the front (bottom)
      p.rect(x, y, T, T, col, 1);
      const [rx, ry, rw, rh] = roofBox(x, y, T, nb, 0.06);
      p.rect(rx, ry, rw, rh, inn, 1);
      p.rect(x + T * 0.12, y + T * 0.18, T * 0.2, T * 0.16, mixHex(inn, '#000000', 0.25), 1);
      if (!nb.D) {
        for (let k = 0; k < 5; k++) p.rect(x + (T * k) / 5, y + T * 0.64, T / 5, T * 0.3, (c * 5 + k) % 2 ? '#f4f0e6' : col, 1);
        p.rect(x, y + T * 0.94, T, T * 0.06, '#000000', 0.25);
      }
      break;
    }
    case 'tent':
      p.rect(x, y, T, T, ground, 1);
      p.rect(x + T * 0.1, y + T * 0.14, T * 0.8, T * 0.72, '#000000', 0.18);
      p.rect(x + T * 0.08, y + T * 0.1, T * 0.8, T * 0.38, inn, 1);
      p.rect(x + T * 0.08, y + T * 0.48, T * 0.8, T * 0.38, mixHex(inn, '#000000', 0.18), 1);
      p.line(x + T * 0.08, y + T * 0.48, x + T * 0.88, y + T * 0.48, Math.max(1.5, T * 0.06), col, 1);
      for (const [gx, gy, hx, hy] of [[0.08, 0.48, 0.0, 0.3], [0.88, 0.48, 1.0, 0.3], [0.08, 0.86, 0.0, 0.98], [0.88, 0.86, 1.0, 0.98]]) {
        p.line(x + gx * T, y + gy * T, x + hx * T, y + hy * T, Math.max(1, T * 0.025), col, 0.7);
        p.circle(x + hx * T, y + hy * T, Math.max(1.2, T * 0.03), col, 1);
      }
      p.rect(x + T * 0.42, y + T * 0.62, T * 0.12, T * 0.24, mixHex(inn, '#000000', 0.45), 1);
      break;
    case 'ruins': {
      // broken wall stubs and scattered rubble
      p.rect(x, y, T, T, ground, 1);
      for (let k = 0; k < 2; k++) {
        const wx = x + T * (0.08 + tileRand(c, r, 310 + k) * 0.35);
        const wy = y + T * (0.12 + k * 0.45 + tileRand(c, r, 320 + k) * 0.1);
        const ww = T * (0.28 + tileRand(c, r, 330 + k) * 0.3);
        p.rect(wx + T * 0.02, wy + T * 0.03, ww, T * 0.15, '#000000', 0.25);
        p.rect(wx, wy, ww, T * 0.15, col, 1);
        p.rect(wx + T * 0.02, wy + T * 0.02, ww - T * 0.04, T * 0.08, inn, 1);
      }
      for (let k = 0; k < 7; k++) p.circle(x + (0.08 + tileRand(c, r, k + 340) * 0.84) * T, y + (0.08 + tileRand(c, r, k + 350) * 0.84) * T, T * (0.03 + tileRand(c, r, k + 360) * 0.05), k % 2 ? col : inn, 1);
      break;
    }
    case 'silo':
      p.rect(x, y, T, T, ground, 1);
      p.circle(x + T * 0.56, y + T * 0.58, T * 0.44, '#000000', 0.22);
      p.circle(x + T * 0.5, y + T * 0.5, T * 0.46, col, 1);
      p.circle(x + T * 0.5, y + T * 0.5, T * 0.38, inn, 1);
      p.circle(x + T * 0.5, y + T * 0.5, T * 0.26, mixHex(inn, '#000000', 0.12), 1);
      p.circle(x + T * 0.5, y + T * 0.5, T * 0.09, col, 1);
      p.line(x + T * 0.5, y + T * 0.5, x + T * 0.5 + T * 0.34, y + T * 0.5 - T * 0.2, Math.max(1, T * 0.04), col, 1);
      break;
    case 'ice': {
      p.rect(x, y, T, T, ground, 1);
      p.circle(x + T * 0.5, y + T * 0.55, T * 0.4, col, 0.85);
      for (let k = 0; k < 6; k++) {
        const a = -2.6 + k * 0.45 + (tileRand(c, r, 370 + k) - 0.5) * 0.3;
        const len = T * (0.28 + tileRand(c, r, 380 + k) * 0.18);
        p.line(x + T * 0.5, y + T * 0.6, x + T * 0.5 + Math.cos(a) * len, y + T * 0.6 + Math.sin(a) * len, Math.max(2, T * 0.1), k % 2 ? inn : mixHex(inn, '#ffffff', 0.3), 1);
      }
      p.circle(x + T * 0.4, y + T * 0.42, Math.max(1.5, T * 0.05), '#ffffff', 0.9);
      break;
    }
    case 'barricade': {
      // concrete barrier with hazard stripes; touching barricades run together
      p.rect(x, y, T, T, ground, 1);
      const bx0 = nb.L ? x : x + T * 0.08;
      const bx1 = nb.R ? x + T : x + T * 0.92;
      p.rect(bx0, y + T * 0.38, bx1 - bx0, T * 0.3, '#000000', 0.2);
      p.rect(bx0, y + T * 0.32, bx1 - bx0, T * 0.32, col, 1);
      for (let k = 0; k < 5; k++) {
        const sx = x + T * (0.02 + 0.2 * k);
        if (sx < bx0 || sx + T * 0.14 > bx1) continue;
        p.line(sx, y + T * 0.62, sx + T * 0.14, y + T * 0.34, Math.max(1.5, T * 0.07), (c * 5 + k) % 2 ? inn : col, 1);
      }
      p.rect(bx0, y + T * 0.32, bx1 - bx0, Math.max(1, T * 0.03), mixHex(col, '#ffffff', 0.3), 1);
      break;
    }
    default: // block
      p.rect(x, y, T, T, col, 1);
      p.rect(x + inset, y + inset, T - inset * 2, T - inset * 2, inn, 1);
  }
}

function drawGroundTile(p, z, x, y, T, c, r, ground, specLight, specDark) {
  p.rect(x, y, T, T, ground, 1);
  if (z.grassStyle === 'speckle') {
    for (let k = 0; k < 4; k++) {
      p.circle(x + (0.1 + tileRand(c, r, k + 20) * 0.8) * T, y + (0.1 + tileRand(c, r, k + 30) * 0.8) * T, Math.max(1, T * 0.035), k % 2 ? specLight : specDark, 1);
    }
  } else if (z.grassStyle === 'tiles') {
    const lw = Math.max(1, T * 0.025);
    p.line(x + T / 2, y, x + T / 2, y + T, lw, specDark, 0.45);
    p.line(x, y + T / 2, x + T, y + T / 2, lw, specDark, 0.45);
    p.line(x, y, x + T, y, lw, specDark, 0.45);
    p.line(x, y, x, y + T, lw, specDark, 0.45);
  } else if (z.grassStyle === 'stripes') {
    p.rect(x, y, T, T / 2, '#000000', 0.07);
  }
}

/**
 * Paints every tile of a level.
 * tiles: the level's rows ('.' open, '#' / '2'..'6' walls). pathSet: the path cells, a Set of "col,row" strings, or a Map
 * "col,row" -> path type (see levelPathMap) so each path can use a different one of the zone's path types.
 * (ox, oy): where tile (0,0) starts. T: tile size in pixels.
 */
export function drawTerrain(p, zone, tiles, pathSet, ox, oy, T) {
  const z = zone && zone.walls ? zone : DEFAULT_ZONE;
  const paths = z.paths && z.paths.length ? z.paths : DEFAULT_ZONE.paths;
  const specLight = mixHex(z.grassA, '#ffffff', 0.14);
  const specDark = mixHex(z.grassA, '#000000', 0.2);
  const surfaces = pathSet instanceof Map ? pathSet : null;
  for (let r = 0; r < tiles.length; r++) {
    const row = tiles[r];
    for (let c = 0; c < row.length; c++) {
      const x = ox + c * T;
      const y = oy + r * T;
      const ground = (r + c) % 2 ? z.grassB : z.grassA;
      const wi = wallIndex(row[c]);
      const key = c + ',' + r;
      if (pathSet && pathSet.has(key)) drawPathTile(p, paths[(surfaces && surfaces.get(key)) || 0] || paths[0], pathSet, x, y, T, c, r);
      else if (wi >= 0) {
        const same = (cc, rr) => rr >= 0 && rr < tiles.length && tiles[rr][cc] === row[c] && !(pathSet && pathSet.has(cc + ',' + rr));
        const nb = { L: same(c - 1, r), R: same(c + 1, r), U: same(c, r - 1), D: same(c, r + 1) };
        drawWallTile(p, z.walls[wi] || z.walls[0], ground, x, y, T, c, r, nb);
      } else drawGroundTile(p, z, x, y, T, c, r, ground, specLight, specDark);
    }
  }
}
