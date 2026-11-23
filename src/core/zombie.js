// Zombie looks. Everything is drawn from circles and lines through a "painter" (the same small interface the terrain uses),
// so the game (Phaser) and the Level Workshop (canvas) draw identical zombies, and sprites can replace this later.
//
//   look      the body plan: crawler, walker, runner, brute, armored, hazmat, king, screamer, leaper, necromancer, bird ('' = a plain shape)
//   colours   skin, clothes, detail (wounds, veins), set per enemy
//   variant   a reskin applied on top (snowy, muddy ...): a tint plus overlays like snow or moss. A zone or a level picks one.
//
// painter: circle(x, y, r, color, alpha), line(x1, y1, x2, y2, width, color, alpha)
import { pointAt } from './sim.js';
import { mixHex } from './terrain.js';

export const LOOKS = ['crawler', 'walker', 'runner', 'brute', 'armored', 'hazmat', 'king', 'screamer', 'leaper', 'necromancer', 'bird'];
/** Gear a variant can put on every zombie's head (parka hood, hard hat, straw hat ...). */
export const OUTFITS = ['hood', 'hardhat', 'brimhat', 'beanie', 'helmet', 'hazmat', 'cap', 'scarf'];
/** Colour of the mark that shows a zombie's rank (rank 0 has none). */
export const RANK_COLORS = ['', '#b0753a', '#c4ccd4', '#e0b83a', '#d83a3a'];
export const EXTRAS = ['snow', 'frost', 'mud', 'moss', 'soot', 'blood', 'toxic', 'fungus', 'flesh', 'leaves', 'dust'];
/** Zombies are drawn a little larger than their hit circle so the details read. */
export const ZOMBIE_SCALE = 1.35;
/** Variant id that forces the plain look (used by a level to cancel its zone's variant). */
export const NO_VARIANT = 'none';
export const DEFAULT_TINT = { color: '#ffffff', amount: 0 };

const HEX = /^#[0-9a-f]{6}$/i;
const hexOr = (v, d) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : d);
const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

/** A variant with anything missing filled in. */
export function normVariant(v) {
  v = v || {};
  const t = v.tint || {};
  return {
    id: String(v.id == null ? '' : v.id),
    name: v.name ? String(v.name) : String(v.id || 'Variant'),
    description: v.description ? String(v.description) : '',
    tint: { color: hexOr(t.color, DEFAULT_TINT.color), amount: clamp01(Number(t.amount)) },
    extras: Array.isArray(v.extras) ? v.extras.filter((x, i, a) => EXTRAS.includes(x) && a.indexOf(x) === i) : [],
    outfit: OUTFITS.includes(v.outfit) ? v.outfit : '',
    gear: hexOr(v.gear, ''),
  };
}

/**
 * The colours and overlays to draw an enemy with. `variants` is a map id -> variant.
 * Order: the enemy's own colours, then the variant's tint and overlays, then the enemy's own override for that variant (if it has one).
 */
export function resolveLook(def, variantId, variants) {
  const skin0 = hexOr(def.color, '#7cb342');
  const out = {
    look: LOOKS.includes(def.look) ? def.look : '',
    skin: skin0,
    cloth: hexOr(def.clothes, mixHex(skin0, '#2b3340', 0.6)),
    detail: hexOr(def.detail, '#a3242b'),
    extras: [],
    outfit: '',
    gear: '',
  };
  const v = variantId && variantId !== NO_VARIANT && variants ? variants[variantId] : null;
  if (v) {
    const nv = normVariant(v);
    if (nv.tint.amount > 0) {
      out.skin = mixHex(out.skin, nv.tint.color, nv.tint.amount);
      out.cloth = mixHex(out.cloth, nv.tint.color, nv.tint.amount);
    }
    out.extras = nv.extras.slice();
    out.outfit = nv.outfit;
    out.gear = nv.gear;
  }
  const ov = variantId && def.variants ? def.variants[variantId] : null;
  if (ov) {
    if (ov.color) out.skin = hexOr(ov.color, out.skin);
    if (ov.clothes) out.cloth = hexOr(ov.clothes, out.cloth);
    if (ov.detail) out.detail = hexOr(ov.detail, out.detail);
    if (Array.isArray(ov.extras)) out.extras = ov.extras.filter((x) => EXTRAS.includes(x));
    if (ov.outfit !== undefined) out.outfit = OUTFITS.includes(ov.outfit) ? ov.outfit : ''; // '' = this zombie does not wear the variant's gear
    if (ov.gear) out.gear = hexOr(ov.gear, out.gear);
  }
  if (out.outfit && !out.gear) out.gear = '#8a8a8a';
  return out;
}

/** Which variant a level plays with: the level's own, else its zone's. 'none' on a level forces the plain look. */
export function variantFor(level, zone) {
  const own = level && level.variant;
  if (own) return own === NO_VARIANT ? '' : own;
  return (zone && zone.variant) || '';
}

/** The direction an enemy is walking, in radians (screen coordinates). */
export function zombieAngle(e) {
  const a = pointAt(e.path, e.d);
  const b = pointAt(e.path, e.d + 0.08);
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  if (Math.abs(dx) + Math.abs(dy) < 1e-6) {
    const c = pointAt(e.path, Math.max(0, e.d - 0.08));
    dx = a[0] - c[0];
    dy = a[1] - c[1];
  }
  return dx || dy ? Math.atan2(dy, dx) : 0;
}

/** Walking pose from the distance travelled, so feet stop when the zombie is slowed or held. */
export const zombiePhase = (e) => e.d * 3.4 + (e.id % 7);

// ---------- drawing ----------

function rng(seed) {
  let s = (seed >>> 0) + 0x9e3779b9;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draws in the zombie's own space: forward is +x, units are the zombie's radius. */
function pen(p, cx, cy, R, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const X = (x, y) => cx + (x * c - y * s) * R;
  const Y = (x, y) => cy + (x * s + y * c) * R;
  return {
    dot: (x, y, r, col, a = 1) => p.circle(X(x, y), Y(x, y), Math.max(0.6, r * R), col, a),
    seg: (x1, y1, x2, y2, w, col, a = 1) => p.line(X(x1, y1), Y(x1, y1), X(x2, y2), Y(x2, y2), Math.max(1, w * R), col, a),
    limb(x1, y1, x2, y2, w, col, a = 1) {
      this.seg(x1, y1, x2, y2, w, col, a);
      this.dot(x1, y1, w / 2, col, a);
      this.dot(x2, y2, w / 2, col, a);
    },
  };
}

const shade = (c, k) => mixHex(c, '#000000', k);
const light = (c, k) => mixHex(c, '#ffffff', k);

/** Standing zombies share one body; the parameters change the build. Returns where overlays can go. */
function humanoid(q, pal, ph, P) {
  const s1 = Math.sin(ph);
  const legC = shade(pal.cloth, 0.3);
  // legs and feet
  for (const s of [-1, 1]) {
    const fx = P.tx - 0.28 + P.stride * Math.sin(ph + (s > 0 ? 0 : Math.PI));
    q.limb(P.tx - 0.1, s * P.legY * 0.8, fx, s * P.legY, P.legW, legC);
    q.dot(fx, s * P.legY, P.footR, P.boot || shade(pal.skin, 0.35));
  }
  // torso and shoulders
  q.dot(P.tx, 0, P.torso, pal.cloth);
  q.dot(P.tx, -P.sh * 0.55, P.torso * 0.82, pal.cloth);
  q.dot(P.tx, P.sh * 0.55, P.torso * 0.82, pal.cloth);
  // arms reaching forward
  for (const s of [-1, 1]) {
    const swing = Math.sin(ph + (s > 0 ? 0 : Math.PI)) * P.armSwing;
    const sx = P.sx;
    const sy = s * P.sh;
    const ex = sx + P.armLen * 0.5 + swing * 0.4;
    const ey = s * (P.sh + 0.12);
    const hx = sx + P.armLen + swing * 0.5;
    const hy = s * (P.sh * 0.72) + swing * 0.12;
    q.dot(sx, sy, P.shR, pal.cloth);
    q.limb(sx, sy, ex, ey, P.armW, pal.cloth);
    q.limb(ex, ey, hx, hy, P.armW * 0.85, P.sleeve || pal.skin);
    q.dot(hx, hy, P.handR, P.glove || light(pal.skin, 0.06));
    if (P.claws) for (const a of [-0.35, 0, 0.35]) q.seg(hx, hy, hx + 0.32 * Math.cos(a), hy + 0.32 * Math.sin(a) + s * 0.04, 0.05, '#e8e4d4');
  }
  // head
  if (P.hair !== false) q.dot(P.hx - 0.07, 0, P.hr * 0.95, shade(pal.skin, 0.55), 0.9);
  q.dot(P.hx, 0, P.hr, pal.skin);
  if (P.hair !== false) q.dot(P.hx - 0.1, s1 * 0.04, P.hr * 0.6, shade(pal.skin, 0.62), 0.85);
  for (const s of [-1, 1]) q.dot(P.hx + P.hr * 0.72, s * P.hr * 0.38, 0.06, P.eye || '#efe56a');
  // wounds
  q.dot(P.tx - 0.04, P.torso * 0.35, 0.1, pal.detail, 0.95);
  q.dot(P.hx + 0.02, -P.hr * 0.55, 0.07, pal.detail, 0.9);
  if (P.scars) for (const s of [-1, 1]) q.seg(P.tx - 0.25, s * 0.25, P.tx + 0.15, s * 0.5, 0.05, pal.detail, 0.9);
  return {
    head: [P.hx, 0, P.hr],
    parts: [[P.tx, 0, P.torso], [P.sx, -P.sh, P.shR], [P.sx, P.sh, P.shR], [P.tx, -P.sh * 0.55, P.torso * 0.8], [P.tx, P.sh * 0.55, P.torso * 0.8]],
  };
}

const HUMAN = { tx: -0.2, torso: 0.4, sh: 0.55, shR: 0.3, sx: -0.02, armLen: 0.95, armW: 0.2, handR: 0.12, armSwing: 0.28, hx: 0.3, hr: 0.37, legY: 0.22, stride: 0.22, footR: 0.15, legW: 0.18 };

const LOOK_DRAW = {
  walker: (q, pal, ph) => humanoid(q, pal, ph, HUMAN),
  runner: (q, pal, ph) => humanoid(q, pal, ph, { ...HUMAN, torso: 0.32, sh: 0.42, shR: 0.24, sx: 0.05, tx: -0.12, armLen: 0.6, armW: 0.16, handR: 0.1, armSwing: 0.6, hx: 0.45, hr: 0.3, legY: 0.2, stride: 0.5, footR: 0.13, legW: 0.15 }),
  brute: (q, pal, ph) => humanoid(q, pal, ph, { ...HUMAN, torso: 0.62, sh: 0.72, shR: 0.42, sx: -0.05, tx: -0.15, armLen: 0.85, armW: 0.38, handR: 0.27, armSwing: 0.14, hx: 0.3, hr: 0.3, legY: 0.32, stride: 0.12, footR: 0.22, legW: 0.3, scars: true, eye: '#ffb74d' }),
  crawler(q, pal, ph) {
    const sw = Math.sin(ph);
    // trailing legs
    for (const s of [-1, 1]) {
      const k = Math.sin(ph + (s > 0 ? 0 : Math.PI)) * 0.1;
      q.limb(-0.6, s * 0.12, -1.05 + k, s * 0.32, 0.14, shade(pal.cloth, 0.2));
      q.dot(-1.05 + k, s * 0.32, 0.09, shade(pal.skin, 0.3));
    }
    q.dot(-0.5, 0, 0.3, pal.cloth);
    q.dot(-0.15, 0, 0.38, pal.cloth);
    q.dot(0.18, 0, 0.32, light(pal.cloth, 0.05));
    for (const s of [-1, 1]) {
      const k = Math.sin(ph + (s > 0 ? 0 : Math.PI));
      const hx = 0.95 + k * 0.28;
      q.dot(0.2, s * 0.34, 0.2, pal.cloth);
      q.limb(0.2, s * 0.34, 0.6 + k * 0.12, s * 0.5, 0.16, pal.skin);
      q.limb(0.6 + k * 0.12, s * 0.5, hx, s * 0.4, 0.13, pal.skin);
      q.dot(hx, s * 0.4, 0.1, light(pal.skin, 0.06));
    }
    q.dot(0.5, 0, 0.29, shade(pal.skin, 0.5), 0.9);
    q.dot(0.52 + sw * 0.01, 0, 0.27, pal.skin);
    for (const s of [-1, 1]) q.dot(0.72, s * 0.12, 0.055, '#efe56a');
    q.dot(-0.2, 0.15, 0.11, pal.detail, 0.95);
    q.dot(0.52, -0.16, 0.07, pal.detail, 0.9);
    return { head: [0.52, 0, 0.27], parts: [[-0.5, 0, 0.3], [-0.15, 0, 0.38], [0.18, 0, 0.32], [0.2, -0.34, 0.2], [0.2, 0.34, 0.2]] };
  },
  armored(q, pal, ph) {
    const P = { ...HUMAN, torso: 0.46, sh: 0.62, shR: 0.34, sx: -0.02, tx: -0.16, armLen: 0.9, armW: 0.24, handR: 0.15, armSwing: 0.18, hx: 0.3, hr: 0.33, legY: 0.26, stride: 0.14, footR: 0.18, legW: 0.22 };
    const A = humanoid(q, pal, ph, P);
    const steel = mixHex(pal.cloth, '#b4bec9', 0.62);
    // pauldrons, chest plate and a visored helmet
    for (const s of [-1, 1]) {
      q.dot(P.sx, s * P.sh, 0.36, shade(steel, 0.25));
      q.dot(P.sx, s * P.sh, 0.28, steel);
      q.seg(P.sx - 0.1, s * (P.sh - 0.18), P.sx - 0.1, s * (P.sh + 0.18), 0.05, light(steel, 0.35), 0.8);
    }
    q.dot(P.tx, 0, 0.42, shade(steel, 0.25));
    q.dot(P.tx, 0, 0.35, steel);
    q.dot(P.tx, 0, 0.18, light(steel, 0.18));
    for (const s of [-1, 1]) q.dot(P.tx + 0.02, s * 0.26, 0.04, shade(steel, 0.45));
    q.dot(P.hx - 0.02, 0, P.hr * 1.1, shade(steel, 0.3));
    q.dot(P.hx, 0, P.hr * 1.0, steel);
    q.seg(P.hx - P.hr * 0.8, 0, P.hr * 0.9 + P.hx, 0, 0.05, light(steel, 0.35), 0.9);
    q.seg(P.hx + P.hr * 0.55, -P.hr * 0.55, P.hx + P.hr * 0.55, P.hr * 0.55, 0.1, '#15181b');
    for (const s of [-1, 1]) q.dot(P.hx + P.hr * 0.55, s * P.hr * 0.25, 0.04, '#efe56a');
    return { head: [P.hx, 0, P.hr * 1.05], parts: [[P.tx, 0, P.torso], [P.sx, -P.sh, P.shR], [P.sx, P.sh, P.shR]] };
  },
  hazmat(q, pal, ph) {
    // a sealed chemical suit: the enemy's colour is the suit, its detail colour the hazard trim. Gloves and boots are black rubber.
    const suit = pal.skin;
    const P = { ...HUMAN, torso: 0.48, sh: 0.62, shR: 0.35, sx: -0.02, tx: -0.16, armLen: 0.86, armW: 0.27, handR: 0.17, armSwing: 0.2, hx: 0.3, hr: 0.34, legY: 0.26, stride: 0.15, footR: 0.19, legW: 0.24, hair: false, sleeve: suit, glove: '#25282c', boot: '#25282c' };
    // twin air tanks strapped to the back, drawn first so the body covers their front
    for (const s of [-1, 1]) {
      q.limb(P.tx - 0.46, s * 0.17, P.tx - 0.8, s * 0.17, 0.22, '#8f989f');
      q.dot(P.tx - 0.82, s * 0.17, 0.11, '#6a7278');
      q.seg(P.tx - 0.52, s * 0.17, P.tx - 0.68, s * 0.17, 0.05, '#dfe4e8', 0.85);
    }
    const A = humanoid(q, pal, ph, P);
    // hazard stripes across the chest and a belt
    q.seg(P.tx + 0.1, -0.44, P.tx + 0.1, 0.44, 0.09, pal.detail, 0.95);
    q.seg(P.tx - 0.08, -0.4, P.tx - 0.08, 0.4, 0.05, shade(suit, 0.45), 0.9);
    for (const s of [-1, 1]) q.dot(P.tx + 0.1, s * 0.46, 0.05, shade(suit, 0.4));
    // hood, tinted visor with the eyes behind it, and a filter canister on the front
    q.dot(P.hx - 0.02, 0, P.hr * 1.2, shade(suit, 0.28));
    q.dot(P.hx - 0.02, 0, P.hr * 1.1, suit);
    q.dot(P.hx + P.hr * 0.42, 0, P.hr * 0.66, '#12302e', 0.96);
    q.dot(P.hx + P.hr * 0.34, -P.hr * 0.24, P.hr * 0.2, '#8fe8d8', 0.6);
    for (const s of [-1, 1]) q.dot(P.hx + P.hr * 0.62, s * P.hr * 0.26, 0.05, '#efe56a');
    q.dot(P.hx + P.hr * 1.0, P.hr * 0.12, 0.11, '#3a3d40');
    q.dot(P.hx + P.hr * 1.0, P.hr * 0.12, 0.05, '#9aa3aa');
    // a hose from the mask round to the tanks
    q.seg(P.hx + P.hr * 0.9, P.hr * 0.16, P.tx + 0.1, 0.4, 0.05, '#2a2d31', 0.9);
    q.seg(P.tx + 0.1, 0.4, P.tx - 0.62, 0.2, 0.05, '#2a2d31', 0.9);
    return { head: [P.hx, 0, P.hr * 1.1], parts: A.parts };
  },
  king(q, pal, ph) {
    // a rat king: a knot of zombies fused together, tails and limbs tangled, with a crowned head in the middle
    const sat = [[-0.55, -0.62], [-0.68, 0.55], [0.12, -0.85], [0.2, 0.88], [-1.0, 0.0]];
    sat.forEach(([x, y], i) => q.limb(0.0, 0.0, x, y, 0.16, i % 2 ? shade(pal.skin, 0.3) : shade(pal.cloth, 0.3)));
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.3;
      q.seg(0.5 * Math.cos(a), 0.5 * Math.sin(a), 0.78 * Math.cos(a + 1.2), 0.78 * Math.sin(a + 1.2), 0.09, i % 2 ? pal.skin : pal.detail, 0.85);
    }
    sat.forEach(([x, y], i) => {
      const w = Math.sin(ph + i * 1.3) * 0.07;
      q.dot(x, y, 0.3, i % 2 ? pal.cloth : shade(pal.cloth, 0.2));
      q.limb(x + 0.05, y, x + 0.5 + w, y + (y > 0 ? -0.2 : 0.2), 0.11, pal.skin);
      q.dot(x + 0.28, y, 0.18, shade(pal.skin, 0.35 * (i % 2)));
      q.dot(x + 0.3, y, 0.15, pal.skin);
      for (const k of [-1, 1]) q.dot(x + 0.4, y + k * 0.06, 0.035, '#efe56a');
    });
    q.dot(0, 0, 0.68, shade(pal.cloth, 0.2));
    q.dot(0, 0, 0.56, pal.cloth);
    q.dot(-0.1, 0, 0.4, shade(pal.skin, 0.3), 0.9);
    q.dot(0.12, 0, 0.1, pal.detail, 0.95);
    q.dot(0.28, 0, 0.36, shade(pal.skin, 0.4));
    q.dot(0.3, 0, 0.33, pal.skin);
    for (const s of [-1, 1]) q.dot(0.52, s * 0.13, 0.05, '#efe56a');
    // crown
    const gold = '#e0b83a';
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * 6.283;
      q.dot(0.26 + 0.22 * Math.cos(a), 0.22 * Math.sin(a), 0.07, k % 2 ? gold : light(gold, 0.35));
    }
    q.dot(0.26 + 0.22, 0, 0.045, '#d8283a');
    return { head: [0.28, 0, 0.34], parts: [[0, 0, 0.62], ...sat.map(([x, y]) => [x, y, 0.3])] };
  },
  screamer(q, pal, ph, o) {
    const P = { ...HUMAN, torso: 0.34, sh: 0.46, shR: 0.24, sx: 0.0, tx: -0.14, armLen: 0.78, armW: 0.15, handR: 0.1, armSwing: 0.2, hx: 0.34, hr: 0.4, legY: 0.2, stride: 0.16, footR: 0.13, legW: 0.15, hair: false };
    const A = humanoid(q, pal, ph, P);
    const mx = P.hx + 0.3;
    q.dot(mx, 0, 0.22, shade(pal.skin, 0.55));
    q.dot(mx + 0.01, 0, 0.17, '#1a0808');
    q.dot(mx + 0.03, 0, 0.09, pal.detail, 0.9);
    for (const a of [-1.1, -0.55, 0.55, 1.1]) q.dot(mx + 0.01 + 0.17 * Math.cos(a), 0.17 * Math.sin(a), 0.03, '#f2eedc');
    // sound waves
    const fx = o && o.fx > 0 ? o.fx : 0;
    if (fx > 0) {
      for (let i = 0; i < 3; i++) {
        const r = 0.8 + i * 0.5 + (1 - fx) * 0.9;
        for (let k = -3; k < 3; k++) {
          const a1 = k * 0.22;
          const a2 = (k + 1) * 0.22;
          q.seg(mx + r * Math.cos(a1), r * Math.sin(a1), mx + r * Math.cos(a2), r * Math.sin(a2), 0.07, '#ffffff', 0.6 * fx * (1 - i * 0.25));
        }
      }
    }
    return A;
  },
  leaper(q, pal, ph, o) {
    const up = (o && o.lift) || 0;
    const P = { ...HUMAN, torso: 0.3, sh: 0.4, shR: 0.22, sx: 0.12, tx: -0.1, armLen: 0.7 + up * 0.5, armW: 0.14, handR: 0.11, armSwing: 0.15, hx: 0.5, hr: 0.3, legY: 0.3, stride: 0.34 * (1 - up), footR: 0.2, legW: 0.22, claws: true, hair: false };
    const A = humanoid(q, pal, ph, P);
    for (const s of [-1, 1]) {
      q.dot(P.tx - 0.2, s * 0.36, 0.22, shade(pal.cloth, 0.1));
      q.dot(P.tx - 0.2, s * 0.36, 0.12, light(pal.cloth, 0.08));
    }
    return A;
  },
  necromancer(q, pal, ph) {
    const glow = pal.detail;
    const sway = Math.sin(ph * 0.5) * 0.03;
    // tattered robe and cape
    q.dot(-0.35, 0, 0.62, shade(pal.cloth, 0.35));
    for (const [x, y] of [[-0.9, -0.35], [-0.95, 0.0], [-0.9, 0.35], [-0.7, -0.62], [-0.7, 0.62]]) q.dot(x + sway, y, 0.17, shade(pal.cloth, 0.3));
    q.dot(-0.1, 0, 0.58, pal.cloth);
    q.dot(0.0, 0, 0.45, light(pal.cloth, 0.08));
    // arms: a staff in one hand, a spell in the other
    q.seg(0.2, 0.62, 1.28, 0.5, 0.07, '#5a4630');
    q.limb(0.05, 0.45, 0.75, 0.56, 0.2, pal.cloth);
    q.dot(0.77, 0.55, 0.1, pal.skin);
    q.dot(1.3, 0.5, 0.26, glow, 0.25);
    q.dot(1.3, 0.5, 0.14, light(glow, 0.25));
    q.dot(1.27, 0.46, 0.05, '#ffffff', 0.9);
    q.limb(0.05, -0.45, 0.72, -0.5, 0.2, pal.cloth);
    q.dot(0.76, -0.5, 0.1, pal.skin);
    q.dot(0.9, -0.5, 0.2, glow, 0.3);
    q.dot(0.9, -0.5, 0.09, light(glow, 0.3), 0.95);
    // hood and a face of darkness with glowing eyes
    q.dot(0.18, 0, 0.38, shade(pal.cloth, 0.4));
    q.dot(0.2, 0, 0.33, shade(pal.cloth, 0.15));
    q.dot(0.4, 0, 0.18, '#0d0d12');
    for (const s of [-1, 1]) q.dot(0.48, s * 0.08, 0.045, light(glow, 0.3));
    return { head: [0.2, 0, 0.34], parts: [[-0.1, 0, 0.55], [0.05, -0.45, 0.25], [0.05, 0.45, 0.25], [-0.5, 0, 0.4]] };
  },
  bird(q, pal, ph) {
    const flap = Math.sin(ph * 2.6);
    const span = 0.62 + 0.38 * Math.abs(flap);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const ex = -0.1 - 0.5 * t - flap * 0.1 * s * 0;
        q.seg(0.05 - 0.15 * t, s * 0.12, ex - 0.2 * t, s * (0.34 + span * (0.95 - 0.25 * t)), 0.2 - 0.03 * i, i % 2 ? shade(pal.cloth, 0.25) : pal.cloth, 0.95);
      }
      q.dot(0.05, s * 0.2, 0.17, pal.cloth);
    }
    for (const dy of [-0.14, 0, 0.14]) q.seg(-0.35, 0, -0.85, dy, 0.1, shade(pal.cloth, 0.3));
    q.dot(-0.18, 0, 0.26, pal.skin);
    q.dot(0.1, 0, 0.3, pal.skin);
    for (const x of [-0.15, 0, 0.15]) q.seg(x, -0.22, x, 0.22, 0.04, light(pal.skin, 0.55), 0.8); // bare ribs
    q.dot(0.12, -0.08, 0.09, pal.detail, 0.95);
    q.dot(0.42, 0, 0.17, pal.skin);
    q.seg(0.55, 0, 0.82, 0, 0.1, '#d8a64a');
    for (const s of [-1, 1]) q.dot(0.48, s * 0.09, 0.045, '#e8e8e8');
    return { head: [0.42, 0, 0.17], parts: [[0.1, 0, 0.3], [-0.18, 0, 0.26], [0.0, -0.45, 0.2], [0.0, 0.45, 0.2]] };
  },
};

/** Gear worn on the head (and sometimes the body): a variant puts it on every zombie, and a zombie can opt out. */
function outfit(q, name, gear, A) {
  const [hx, hy, hr] = A.head;
  const dark = shade(gear, 0.3);
  const lite = light(gear, 0.3);
  const eyes = () => { for (const s of [-1, 1]) q.dot(hx + hr * 0.72, hy + s * hr * 0.38, 0.05, '#efe56a'); };
  switch (name) {
    case 'hood':
      q.dot(hx - 0.06, hy, hr * 1.2, dark);
      q.dot(hx - 0.04, hy, hr * 1.1, gear);
      q.dot(hx + hr * 0.42, hy, hr * 0.58, A.skin || '#9a9a7a');
      for (let k = -4; k <= 4; k++) { const a = k * 0.3; q.dot(hx + hr * 0.38 + hr * 0.7 * Math.cos(a), hy + hr * 0.7 * Math.sin(a), 0.075, '#f4f1ea'); }
      break;
    case 'hardhat':
      q.dot(hx - 0.02, hy, hr * 1.02, dark);
      q.dot(hx - 0.02, hy, hr * 0.9, gear);
      q.seg(hx - hr * 0.75, hy, hx + hr * 0.7, hy, 0.07, lite, 0.9);
      q.dot(hx + hr * 0.85, hy, hr * 0.42, dark);
      break;
    case 'brimhat':
      q.dot(hx, hy, hr * 1.75, dark, 0.95);
      q.dot(hx, hy, hr * 1.62, gear, 0.97);
      q.dot(hx, hy, hr * 0.85, dark);
      q.dot(hx, hy, hr * 0.74, lite);
      break;
    case 'beanie':
      q.dot(hx - 0.02, hy, hr * 1.0, dark);
      q.dot(hx - 0.02, hy, hr * 0.88, gear);
      q.dot(hx - 0.02, hy, 0.1, lite);
      break;
    case 'helmet':
      q.dot(hx - 0.02, hy, hr * 1.08, shade(gear, 0.4));
      q.dot(hx - 0.02, hy, hr * 0.98, gear);
      q.seg(hx - hr * 0.8, hy - hr * 0.5, hx + hr * 0.8, hy + hr * 0.5, 0.04, dark, 0.9);
      q.seg(hx - hr * 0.8, hy + hr * 0.5, hx + hr * 0.8, hy - hr * 0.5, 0.04, dark, 0.9);
      q.dot(hx + hr * 0.7, hy, hr * 0.3, dark, 0.9);
      break;
    case 'hazmat':
      for (const pt of A.parts) q.dot(pt[0], pt[1], pt[2] * 0.95, gear, 0.6);
      q.dot(hx - 0.02, hy, hr * 1.2, dark);
      q.dot(hx - 0.02, hy, hr * 1.1, gear);
      q.dot(hx + hr * 0.45, hy, hr * 0.62, '#12302e', 0.95);
      q.dot(hx + hr * 0.4, hy - hr * 0.22, hr * 0.2, '#8fe8d8', 0.6);
      q.dot(hx + hr * 0.98, hy + hr * 0.35, 0.1, '#3a3d40');
      break;
    case 'cap':
      q.dot(hx - 0.02, hy, hr * 0.95, dark);
      q.dot(hx - 0.02, hy, hr * 0.84, gear);
      q.seg(hx + hr * 0.45, hy, hx + hr * 1.2, hy, 0.22, dark);
      break;
    case 'scarf':
      for (let k = 0; k < 7; k++) { const a = 2.0 + k * 0.38; q.dot(hx + hr * 0.9 * Math.cos(a), hy + hr * 0.9 * Math.sin(a), 0.11, k % 2 ? gear : dark); }
      q.limb(hx - hr * 0.8, hy + 0.1, hx - hr * 1.7, hy + 0.34, 0.12, gear);
      q.limb(hx - hr * 0.8, hy + 0.1, hx - hr * 1.6, hy - 0.05, 0.1, dark);
      break;
    default:
  }
  if (name === 'hood' || name === 'hazmat') eyes();
}

/** Overlays that make a variant: snow, mud, moss and so on, scattered over the body (steady for a given seed). */
function overlay(q, name, A, rnd) {
  const [hx, hy, hr] = A.head;
  const spot = () => {
    const pt = A.parts[Math.floor(rnd() * A.parts.length)];
    const a = rnd() * 6.283;
    const d = Math.sqrt(rnd()) * pt[2] * 0.8;
    return [pt[0] + Math.cos(a) * d, pt[1] + Math.sin(a) * d, pt];
  };
  const each = (n, fn) => { for (let i = 0; i < n; i++) { const [x, y, pt] = spot(); fn(x, y, pt, i); } };
  switch (name) {
    case 'snow':
      q.dot(hx - 0.05, hy, hr * 0.8, '#f2f8fc', 0.96);
      q.dot(hx + 0.06, hy - hr * 0.3, hr * 0.28, '#ffffff');
      for (const pt of A.parts) q.dot(pt[0] - pt[2] * 0.15, pt[1], pt[2] * 0.52, '#eef5fa', 0.92);
      each(6, (x, y) => q.dot(x, y, 0.04 + rnd() * 0.04, '#ffffff'));
      break;
    case 'frost':
      for (const pt of A.parts) q.dot(pt[0], pt[1], pt[2] * 0.9, '#a8dcf5', 0.28);
      q.dot(hx, hy, hr * 0.9, '#a8dcf5', 0.3);
      each(5, (x, y) => q.dot(x, y, 0.06, '#e2f6ff', 0.95));
      each(5, (x, y) => { const a = rnd() * 6.283; q.seg(x, y, x + Math.cos(a) * 0.2, y + Math.sin(a) * 0.2, 0.05, '#aee4ff', 0.95); });
      break;
    case 'mud':
      each(8, (x, y) => q.dot(x, y, 0.07 + rnd() * 0.1, rnd() < 0.5 ? '#6b4a2b' : '#4f3820', 0.92));
      q.dot(hx - 0.05, hy + hr * 0.3, hr * 0.28, '#5a3f24', 0.9);
      break;
    case 'moss':
      each(5, (x, y) => { q.dot(x, y, 0.12 + rnd() * 0.06, '#4f8a3a', 0.92); q.dot(x + 0.03, y - 0.03, 0.06, '#86c85e'); });
      q.dot(hx - 0.1, hy + hr * 0.4, hr * 0.38, '#4f8a3a', 0.9);
      break;
    case 'soot':
      each(5, (x, y) => q.dot(x, y, 0.14 + rnd() * 0.08, '#1b1b1d', 0.55));
      q.dot(hx, hy, hr * 0.7, '#1b1b1d', 0.4);
      each(3, (x, y) => { q.dot(x, y, 0.08, '#ff7a1a', 0.3); q.dot(x, y, 0.035, '#ffc24a'); });
      break;
    case 'blood':
      each(7, (x, y) => q.dot(x, y, 0.06 + rnd() * 0.08, rnd() < 0.6 ? '#8f1c1c' : '#c62828', 0.95));
      each(2, (x, y) => q.seg(x, y, x + 0.05, y + 0.2, 0.04, '#8f1c1c', 0.9));
      q.dot(hx + hr * 0.5, hy, hr * 0.3, '#8f1c1c', 0.9);
      break;
    case 'toxic':
      each(5, (x, y) => { q.dot(x, y, 0.16, '#9be32a', 0.3); q.dot(x, y, 0.06, '#d2ff6a'); });
      each(2, (x, y) => q.seg(x, y, x, y + 0.2, 0.05, '#7ac11a', 0.9));
      q.dot(hx, hy, hr, '#9be32a', 0.22);
      break;
    case 'fungus':
      each(3, (x, y) => {
        q.seg(x, y, x - 0.08, y - 0.06, 0.05, '#e8dcc8');
        q.dot(x - 0.1, y - 0.07, 0.1, '#a860e8');
        q.dot(x - 0.12, y - 0.09, 0.035, '#e6ccff');
      });
      each(5, (x, y) => q.dot(x, y, 0.03, '#4af0d0', 0.85));
      break;
    case 'flesh':
      each(3, (x, y) => {
        const a = rnd() * 6.283;
        const mx = x + Math.cos(a) * 0.2;
        const my = y + Math.sin(a) * 0.2;
        q.seg(x, y, mx, my, 0.07, '#c04a6a');
        q.seg(mx, my, mx + Math.cos(a + 0.9) * 0.15, my + Math.sin(a + 0.9) * 0.15, 0.05, '#c04a6a');
      });
      each(3, (x, y) => q.dot(x, y, 0.09, '#d86a82'));
      break;
    case 'leaves': {
      const cols = ['#d9822b', '#b8501c', '#e0b83a', '#9a3a1c'];
      each(6, (x, y, pt, i) => q.dot(x, y, 0.05 + rnd() * 0.04, cols[i % 4]));
      q.dot(hx - 0.04, hy - hr * 0.3, 0.07, cols[0]);
      q.dot(hx + 0.04, hy + hr * 0.3, 0.06, cols[2]);
      break;
    }
    case 'dust':
      each(5, (x, y) => q.dot(x, y, 0.12 + rnd() * 0.08, '#d8c08a', 0.45));
      q.dot(hx - 0.05, hy, hr * 0.8, '#d8c08a', 0.35);
      break;
    default:
  }
}

/**
 * Draws one zombie. `pal` comes from resolveLook(). Options: angle (radians, facing), phase (walking pose), seed (keeps
 * the overlays steady), flying (a larger, softer shadow), lift (0 to 1, a leap: the body rises off its shadow),
 * fx (0 to 1, a screamer's sound waves), rank (0 to 4, draws the rank mark).
 */
export function drawZombie(p, pal, cx, cy, R, o = {}) {
  const ang = o.angle || 0;
  const lift = Math.max(0, Math.min(1, o.lift || 0));
  const rank = o.rank || 0;
  if (rank > 0 && RANK_COLORS[rank]) {
    const rc = RANK_COLORS[rank];
    p.circle(cx, cy + R * 0.1, R * 1.3, rc, 0.22);
    p.circle(cx, cy + R * 0.1, R * 1.05, rc, 0.16);
  }
  p.circle(cx + R * (o.flying ? 0.35 : 0.08), cy + R * (o.flying ? 0.7 : 0.14), R * (o.flying ? 0.6 : 0.85) * (1 - lift * 0.25), '#000000', (o.flying ? 0.2 : 0.22) * (1 - lift * 0.4));
  const by = cy - lift * R * 0.9;
  const RR = R * (1 + lift * 0.22);
  const q = pen(p, cx, by, RR, ang);
  const draw = LOOK_DRAW[pal.look];
  let A;
  if (draw) A = draw(q, pal, o.phase == null ? 0.7 : o.phase, { fx: o.fx || 0, lift });
  else {
    q.dot(0, 0, 0.8, pal.skin);
    A = { head: [0.2, 0, 0.4], parts: [[0, 0, 0.8]] };
  }
  A.skin = pal.skin;
  if (pal.outfit && pal.gear && !(pal.look === 'armored' || pal.look === 'hazmat' || pal.look === 'king' || pal.look === 'necromancer') && !(pal.look === 'screamer' && (pal.outfit === 'hood' || pal.outfit === 'hazmat'))) outfit(q, pal.outfit, pal.gear, A);
  if (pal.extras && pal.extras.length) {
    const rnd = rng((o.seed || 1) * 7919);
    for (const x of pal.extras) overlay(q, x, A, rnd);
  }
  if (rank > 0 && RANK_COLORS[rank]) {
    // one pip per rank under the zombie
    for (let i = 0; i < rank; i++) {
      const px = cx + (i - (rank - 1) / 2) * R * 0.42;
      p.circle(px, cy + R * 1.28, R * 0.16, '#101418', 0.9);
      p.circle(px, cy + R * 1.28, R * 0.11, RANK_COLORS[rank], 1);
    }
  }
}
