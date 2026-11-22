// Tower looks. Every tower is a small operator (or a machine) drawn from circles and lines through a "painter"
// (the same tiny interface the terrain and zombies use), so the game (Phaser) and the Level Workshop (canvas) draw the same thing.
//
//   look      the design: marksman, sniper, demolitionist, flamethrower, toxicologist, minigunner, scrapper, tesla
//             ('' = a plain coloured shape, so towers made in the editor still work)
//   color     the main colour of the uniform / casing
//   tiers     [path 0, path 1, path 2]: bought upgrades show up on the model (scopes, bigger tanks, more barrels ...)
//
// painter: circle(x, y, r, color, alpha), line(x1, y1, x2, y2, width, color, alpha)
import { mixHex } from './terrain.js';

export const TOWER_LOOKS = ['marksman', 'sniper', 'demolitionist', 'flamethrower', 'toxicologist', 'minigunner', 'scrapper', 'tesla'];

const tShade = (c, k) => mixHex(c, '#000000', k);
const tLight = (c, k) => mixHex(c, '#ffffff', k);
const T_HEX = /^#[0-9a-f]{6}$/i;
const T_SKIN = '#e0b48c';
const T_BLACK = '#1d2127';
const T_METAL = '#59636e';
const T_STEEL = '#9aa5b0';
const T_BRASS = '#d8ae3c';

/** Draws in the tower's own space: forward is +x, units are the tower's radius. */
function tPen(p, cx, cy, R, ang) {
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
    // a rounded bar: a thick line with round ends
    bar(x1, y1, x2, y2, w, col, a = 1) {
      this.limb(x1, y1, x2, y2, w, col, a);
    },
  };
}

/** A hard-looking tRing of dots around the tower in world space (sandbags, drums, insulators ...). */
function tRing(p, cx, cy, R, n, rad, r, col, rim, from = 0, span = Math.PI * 2) {
  for (let i = 0; i < n; i++) {
    const a = from + (span * i) / Math.max(1, n - (span >= Math.PI * 2 ? 0 : 1));
    const x = cx + Math.cos(a) * rad * R;
    const y = cy + Math.sin(a) * rad * R;
    p.circle(x, y + R * 0.04, r * R, rim, 0.9);
    p.circle(x, y, r * R * 0.82, col, 1);
  }
}

function tDisc(p, cx, cy, R, col, a = 1, k = 1.18) {
  p.circle(cx + R * 0.06, cy + R * 0.12, R * k, '#000000', 0.2 * a);
  p.circle(cx, cy, R * k, col, a);
}

const tFlash = (q, x, y, size, kick, col = '#ffe08a') => {
  if (kick < 0.45) return;
  q.dot(x, y, size * kick, col, 0.9);
  q.dot(x, y, size * 0.5 * kick, '#ffffff', 1);
  for (const a of [-0.5, 0, 0.5]) q.seg(x, y, x + Math.cos(a) * size * 1.6 * kick, y + Math.sin(a) * size * 1.6 * kick, 0.07, col, 0.8);
};

// ---------- the soldier everybody shares ----------

/** Shoulders, torso, tHelmet. `P` tunes the build; `hands` are drawn by each look. Returns nothing. */
function tBody(q, c, P = {}) {
  const t = P.torso || 0.46;
  const sh = P.sh || 0.5;
  if (P.pack !== false) q.dot(-0.62, 0, P.packR || 0.34, tShade(c.main, 0.4));
  q.dot(-0.12, 0, t, c.main);
  q.dot(-0.1, -sh, P.shR || 0.27, c.main);
  q.dot(-0.1, sh, P.shR || 0.27, c.main);
  q.dot(-0.1, -sh, (P.shR || 0.27) * 0.55, tLight(c.main, 0.12));
  q.dot(-0.1, sh, (P.shR || 0.27) * 0.55, tLight(c.main, 0.12));
}

function tHelmet(q, c, x = 0.1, r = 0.36, col) {
  const h = col || tShade(c.main, 0.25);
  q.dot(x, -r * 0.95, 0.07, T_SKIN);
  q.dot(x, r * 0.95, 0.07, T_SKIN);
  q.dot(x, 0, r, h);
  q.dot(x - 0.04, 0, r * 0.62, tLight(h, 0.14));
  q.seg(x - r * 0.1, -r * 0.7, x - r * 0.1, r * 0.7, 0.06, tShade(h, 0.4), 0.7);
}

// ---------- the designs ----------

const TLOOK = {
  marksman(q, c, o) {
    const lv = o.tiers;
    const rec = o.kick * 0.18;
    tBody(q, c, { packR: 0.34 });
    // rifle
    const ext = lv[0] >= 4 ? 0.3 : lv[0] >= 2 ? 0.14 : 0;
    const mx = 1.32 + ext - rec;
    q.seg(-0.32 - rec, 0.12, 0.9 - rec, 0.12, 0.17, T_BLACK);
    q.seg(-0.38 - rec, 0.12, -0.12 - rec, 0.12, 0.2, '#5a3d22'); // stock
    q.seg(0.9 - rec, 0.12, mx, 0.12, 0.08, T_METAL);
    q.seg(0.22 - rec, 0.2, 0.34 - rec, 0.38, 0.13, '#272c32'); // magazine
    if (lv[1] >= 2) q.seg(0.4 - rec, 0.2, 0.52 - rec, 0.4, 0.13, '#272c32');
    if (lv[1] >= 4) q.seg(0.22 - rec, 0.38, -0.55, 0.45, 0.07, T_BRASS, 0.9); // ammo belt to the pack
    if (lv[0] >= 1) {
      q.seg(0.15 - rec, 0.12, 0.72 - rec, 0.12, 0.12, '#2b3036');
      q.dot(0.74 - rec, 0.12, 0.08, '#7fd0ff', 0.95);
    }
    if (lv[0] >= 3) {
      q.seg(mx - 0.12, 0.12, mx - 0.28, 0.32, 0.05, T_STEEL);
      q.seg(mx - 0.12, 0.12, mx - 0.28, -0.08, 0.05, T_STEEL);
    }
    if (lv[2] >= 1) q.dot(mx, 0.12, 0.06, '#ffb74d');
    if (lv[2] >= 3) q.seg(0.9 - rec, 0.12, mx - 0.05, 0.12, 0.1, '#e65100', 0.7);
    // arms
    q.limb(-0.1, 0.5, 0.18 - rec, 0.26, 0.18, c.main);
    q.dot(0.18 - rec, 0.26, 0.1, T_SKIN);
    q.limb(-0.1, -0.5, 0.66 - rec, 0.1, 0.18, c.main);
    q.dot(0.66 - rec, 0.1, 0.1, T_SKIN);
    tHelmet(q, c);
    tFlash(q, mx + 0.1, 0.12, 0.28, o.kick);
  },

  sniper(q, c, o) {
    const lv = o.tiers;
    const rec = o.kick * 0.22;
    const ghillie = tShade(c.main, 0.15);
    // lying down: boots, legs, torso, head
    for (const s of [-1, 1]) q.limb(-0.7, s * 0.14, -1.35, s * 0.2, 0.2, tShade(c.main, 0.3));
    q.dot(-0.28, 0, 0.44, ghillie);
    q.dot(-0.4, -0.38, 0.26, ghillie);
    q.dot(-0.4, 0.38, 0.26, ghillie);
    q.dot(0.14, 0, 0.3, T_SKIN);
    q.dot(0.1, 0, 0.34, ghillie);
    q.dot(0.2, 0.04, 0.2, tLight(ghillie, 0.1));
    // leafy strips of the ghillie suit
    const leaves = [[-0.7, -0.3], [-0.2, 0.52], [-0.55, 0.3], [0.05, -0.38], [-0.1, -0.52], [-0.85, 0.1], [0.28, 0.3]];
    leaves.forEach(([x, y], i) => q.dot(x, y, 0.13, i % 2 ? '#6b7d3a' : '#4d5f2c', 0.95));
    // rifle with a big scope
    const len = 2.0 + (lv[0] >= 3 ? 0.35 : 0) - rec;
    q.seg(-0.45 - rec, 0.02, len, 0.02, 0.15, T_BLACK);
    q.seg(-0.5 - rec, 0.02, -0.2 - rec, 0.02, 0.24, '#5a3d22');
    if (lv[0] >= 3) q.seg(2.0 - rec, 0.02, len, 0.02, 0.2, '#15181c');
    q.seg(0.25 - rec, 0.02, 1.0 - rec, 0.02, 0.2, '#262b31');
    q.dot(1.02 - rec, 0.02, 0.12, lv[2] >= 2 ? '#ff6b4a' : '#8fd8ff', 0.95);
    q.dot(0.2 - rec, 0.02, 0.09, '#1a1d21');
    q.seg(1.35, 0.02, 1.15, 0.34, 0.05, T_STEEL);
    q.seg(1.35, 0.02, 1.15, -0.3, 0.05, T_STEEL);
    q.limb(-0.3, -0.45, 0.3 - rec, -0.06, 0.17, ghillie);
    q.limb(-0.25, 0.48, 0.7 - rec, 0.14, 0.17, ghillie);
    if (lv[1] >= 3) {
      // the spotter next to him with binoculars
      q.dot(-0.5, 1.15, 0.38, tShade(c.main, 0.1));
      q.dot(-0.45, 0.85, 0.2, tShade(c.main, 0.1));
      q.dot(-0.05, 1.15, 0.26, tShade(c.main, 0.3));
      q.dot(-0.04, 1.15, 0.15, T_SKIN);
      q.seg(0.15, 1.0, 0.15, 1.3, 0.12, T_BLACK);
      q.dot(0.2, 0.98, 0.07, '#8fd8ff');
      q.dot(0.2, 1.32, 0.07, '#8fd8ff');
    }
    tFlash(q, len + 0.12, 0.02, 0.34, o.kick);
  },

  demolitionist(q, c, o) {
    const lv = o.tiers;
    tBody(q, c, { torso: 0.54, shR: 0.32, sh: 0.55, packR: 0.4 });
    // satchel charges on the back
    q.dot(-0.66, 0, 0.42, '#6b4a2a');
    q.dot(-0.66, 0, 0.28, '#8a6a3c');
    q.dot(-0.66, 0, 0.1, '#cc3b2b');
    if (lv[0] >= 1) for (const s of [-1, 1]) q.dot(-0.72, s * 0.36, 0.2, '#7a5a30');
    if (lv[0] >= 3) for (const s of [-1, 1]) q.dot(-0.96, s * 0.2, 0.18, '#cc3b2b');
    // bandolier of grenades
    if (lv[1] >= 2) {
      q.seg(0.1, -0.55, -0.35, 0.5, 0.11, '#3c3226');
      for (let i = 0; i < 4; i++) q.dot(0.02 - i * 0.14, -0.43 + i * 0.24, 0.09, '#4a5a30');
    }
    // fuel can for the special rounds
    if (lv[2] >= 2) {
      q.seg(-0.5, -0.78, -0.2, -0.78, 0.26, '#a33a22');
      q.dot(-0.2, -0.78, 0.07, '#ffd54f');
    }
    // throwing arm: the grenade is in the hand until it is thrown
    const k = o.kick;
    const hx = 0.35 + 0.65 * k;
    const hy = 0.55 - 0.3 * k;
    q.limb(-0.1, 0.55, (hx - 0.1) * 0.55, (hy + 0.55) * 0.55, 0.22, c.main);
    q.limb((hx - 0.1) * 0.55, (hy + 0.55) * 0.55, hx, hy, 0.2, c.main);
    q.dot(hx, hy, 0.12, T_SKIN);
    if (k < 0.3) {
      q.dot(hx + 0.12, hy - 0.04, 0.17, '#4a5a30');
      q.dot(hx + 0.12, hy - 0.04, 0.07, '#2c3520');
      q.seg(hx + 0.05, hy - 0.2, hx + 0.2, hy - 0.2, 0.05, T_STEEL);
    }
    q.limb(-0.1, -0.55, 0.38, -0.3, 0.2, c.main);
    q.dot(0.38, -0.3, 0.11, T_SKIN);
    // hard hat and goggles
    q.dot(0.1, -0.3, 0.07, T_SKIN);
    q.dot(0.1, 0.3, 0.07, T_SKIN);
    q.dot(0.08, 0, 0.4, '#e8a317');
    q.dot(0.04, 0, 0.26, '#f4c043');
    q.seg(0.08, -0.38, 0.08, 0.38, 0.06, '#b57a10', 0.8);
    q.dot(0.4, -0.15, 0.1, '#7fd0ff');
    q.dot(0.4, 0.15, 0.1, '#7fd0ff');
    q.seg(0.4, -0.15, 0.4, 0.15, 0.05, '#222');
  },

  flamethrower(q, c, o) {
    const lv = o.tiers;
    const rec = o.kick * 0.06;
    tBody(q, c, { torso: 0.5, shR: 0.3, packR: 0.1, pack: false });
    // fuel tanks on the back
    const tw = lv[0] >= 4 ? 0.46 : 0.36;
    const tanks = lv[0] >= 2 ? [-0.3, 0, 0.3] : [-0.22, 0.22];
    for (const y of tanks) {
      q.seg(-1.0, y, -0.3, y, tw, '#9e2b17');
      q.seg(-0.98, y - 0.08, -0.34, y - 0.08, tw * 0.3, '#e0674a', 0.8);
      q.dot(-0.3, y, tw / 2, '#7a1f10');
      q.dot(-1.0, y, tw / 2, '#7a1f10');
    }
    // hose to the gun
    q.seg(-0.3, 0.1, 0.3, 0.42, 0.09, '#1e2226');
    // gun and nozzles
    const jets = lv[2] >= 4 ? 3 : lv[2] >= 2 ? 2 : lv[2] >= 1 ? 2 : 1;
    const reach = 0.11 * (lv[2] || 0) + (lv[0] >= 1 ? 0.06 : 0);
    const ys = jets === 3 ? [-0.34, 0.1, 0.54] : jets === 2 ? [-0.1, 0.34] : [0.16];
    const tipX = 1.05 + reach - rec;
    for (const y of ys) {
      q.seg(0.15 - rec, y, tipX, y, 0.17, '#2d3238');
      q.dot(tipX, y, 0.12, '#15181b');
      q.dot(tipX + 0.03, y, 0.07, o.kick > 0 ? '#ffd54f' : '#ff9d2e');
      if (o.kick > 0.3) q.dot(tipX + 0.25 * o.kick, y, 0.18 * o.kick + 0.05, '#ff9800', 0.7);
    }
    q.limb(-0.1, 0.52, 0.28, 0.38, 0.2, c.main);
    q.dot(0.28, 0.38, 0.11, '#3b3f44');
    q.limb(-0.1, -0.52, 0.6, -0.04, 0.2, c.main);
    q.dot(0.6, -0.04, 0.11, '#3b3f44');
    // gas mask
    tHelmet(q, c, 0.08, 0.36, '#4a4f55');
    q.dot(0.4, 0, 0.17, '#2b2f33');
    q.dot(0.52, 0, 0.09, '#555b62');
    q.dot(0.3, -0.16, 0.1, '#ffcf66');
    q.dot(0.3, 0.16, 0.1, '#ffcf66');
    q.seg(0.4, 0.1, -0.2, 0.2, 0.06, '#1e2226', 0.9);
  },

  toxicologist(q, c, o) {
    const lv = o.tiers;
    // a glow that gets stronger with the potency path
    if (lv[0] >= 2) q.dot(0, 0, 1.5, '#9ccc3c', 0.1 + 0.03 * lv[0]);
    tBody(q, c, { torso: 0.46, packR: 0.1, pack: false });
    // tank with bubbling green liquid
    q.dot(-0.7, 0, 0.5, '#2d4a24');
    q.dot(-0.7, 0, 0.4, '#6fae2d');
    for (const [x, y, r] of [[-0.62, -0.14, 0.09], [-0.8, 0.12, 0.07], [-0.55, 0.16, 0.06]]) q.dot(x, y, r, '#d4f58a', 0.9);
    q.seg(-0.4, 0.16, 0.25, 0.4, 0.07, '#222', 0.9);
    // belt of vials
    const vials = lv[2] >= 3 ? 5 : lv[2] >= 1 ? 3 : 0;
    const vcols = ['#d4f58a', '#ff7a7a', '#7fd0ff', '#e6a8ff', '#ffe27a'];
    for (let i = 0; i < vials; i++) q.dot(0.05, (i - (vials - 1) / 2) * 0.2 - 0.38, 0.09, vcols[i % vcols.length], 0.95);
    // arms: the flask is held forward until it is thrown
    const k = o.kick;
    const fx = 0.78 + 0.35 * k;
    const fy = 0.3;
    q.limb(-0.1, 0.52, fx - 0.2, fy, 0.2, c.main);
    q.dot(fx - 0.2, fy, 0.11, '#2a2e22');
    const big = lv[1] >= 2 ? 0.07 : 0;
    if (k < 0.35) {
      q.dot(fx, fy, 0.25 + big, '#cfe8a0', 0.55);
      q.dot(fx, fy, 0.2 + big, '#8fe04a', 0.95);
      q.dot(fx - 0.06, fy - 0.07, 0.07, '#f2ffd0', 0.9);
      q.seg(fx + 0.2, fy, fx + 0.34, fy, 0.09, '#8a6a3c');
    }
    q.limb(-0.1, -0.52, 0.36, -0.3, 0.2, c.main);
    q.dot(0.36, -0.3, 0.11, '#2a2e22');
    // hood, visor and respirator
    q.dot(0.08, 0, 0.4, tShade(c.main, 0.1));
    q.dot(0.02, 0, 0.26, tLight(c.main, 0.15));
    q.dot(0.36, 0, 0.2, '#1c2417');
    q.dot(0.36, -0.1, 0.08, '#b8f06c', 0.9);
    q.dot(0.36, 0.1, 0.08, '#b8f06c', 0.9);
    q.dot(0.52, 0, 0.1, '#3a3a3a');
    q.dot(0.42, -0.24, 0.09, '#9a9a9a');
    q.dot(0.42, 0.24, 0.09, '#9a9a9a');
  },

  minigunner(q, c, o) {
    const lv = o.tiers;
    const rec = o.kick * 0.1;
    tBody(q, c, { torso: 0.56, shR: 0.34, sh: 0.58, packR: 0.1, pack: false });
    // ammo drum and the belt feeding the gun
    q.dot(-0.78, 0, 0.52, '#2c333a');
    q.dot(-0.78, 0, 0.4, '#4a545e');
    q.dot(-0.78, 0, 0.14, T_BRASS);
    q.seg(-0.5, 0.24, 0.2, 0.34, 0.13, lv[0] >= 3 ? '#b6c2cc' : T_BRASS, 0.95);
    for (let i = 0; i < 5; i++) q.dot(-0.4 + i * 0.12, 0.26 + i * 0.016, 0.045, '#8a6a1a');
    // rocket pods on the shoulders
    if (lv[2] >= 3) {
      for (const s of [-1, 1]) {
        q.seg(-0.2, s * 0.86, 0.35, s * 0.86, 0.3, '#3b4452');
        for (const dy of [-0.07, 0.07]) q.dot(0.37, s * 0.86 + dy, 0.06, '#c64a2f');
      }
    }
    // the gun: a housing and a spinning bundle of barrels
    const n = 3 + (lv[1] >= 3 ? 1 : 0) + (lv[1] >= 4 ? 1 : 0) + (lv[1] >= 5 ? 1 : 0);
    const spin = o.t * (4 + 30 * o.heat);
    const len = 1.62 + (lv[0] >= 4 ? 0.14 : 0) - rec;
    q.seg(0.05 - rec, 0, 0.8 - rec, 0, 0.46, '#303840');
    q.seg(0.08 - rec, -0.12, 0.7 - rec, -0.12, 0.08, '#4a545e');
    const rad = 0.12 + 0.025 * n;
    for (let i = 0; i < n; i++) {
      const a = spin + (i * Math.PI * 2) / n;
      const y = Math.sin(a) * rad;
      const shade2 = 0.2 + 0.25 * (Math.cos(a) * 0.5 + 0.5);
      q.seg(0.8 - rec, y, len, y, 0.1, tLight(T_METAL, shade2 * 0.6));
    }
    q.seg(1.0 - rec, -rad - 0.05, 1.0 - rec, rad + 0.05, 0.07, '#1f252b');
    q.seg(len - 0.04, -rad - 0.05, len - 0.04, rad + 0.05, 0.07, '#1f252b');
    // hands on the grips
    q.limb(-0.1, 0.58, 0.3 - rec, 0.32, 0.22, c.main);
    q.dot(0.3 - rec, 0.3, 0.12, T_SKIN);
    q.limb(-0.1, -0.58, 0.55 - rec, -0.34, 0.22, c.main);
    q.dot(0.55 - rec, -0.32, 0.12, T_SKIN);
    // tHelmet with a dark visor
    tHelmet(q, c, 0.02, 0.4, tShade(c.main, 0.35));
    q.seg(0.32, -0.22, 0.32, 0.22, 0.11, '#0d1115');
    q.seg(0.32, -0.12, 0.32, 0.12, 0.04, '#6fb3d6', 0.7);
    tFlash(q, len + 0.1, Math.sin(spin) * rad, 0.24, o.kick);
  },

  scrapper(q, c, o, p, cx, cy, R) {
    const lv = o.tiers;
    const k = o.kick;
    // the worker (he mostly faces up the road)
    tBody(q, c, { torso: 0.46, packR: 0.1, pack: false });
    q.dot(-0.55, 0, 0.36, '#4a3d2e');
    q.seg(-0.7, -0.2, -0.95, -0.5, 0.1, T_STEEL);
    q.seg(-0.55, 0.15, -0.9, 0.55, 0.1, '#a0522d');
    q.dot(-0.1, 0, 0.3, tShade(c.main, 0.3)); // apron
    // hammer arm swings now and then
    const sw = Math.sin(o.t * 2.2) * 0.12 + k * 0.6;
    q.limb(-0.1, 0.5, 0.45, 0.4 - sw, 0.2, tShade(c.main, 0.15));
    q.dot(0.45, 0.4 - sw, 0.11, T_SKIN);
    q.seg(0.45, 0.4 - sw, 0.95, 0.15 - sw * 1.2, 0.09, '#7a4e2a');
    q.dot(0.98, 0.14 - sw * 1.2, 0.17, '#6a7480');
    q.limb(-0.1, -0.5, 0.35, -0.32, 0.2, tShade(c.main, 0.15));
    q.dot(0.35, -0.32, 0.11, T_SKIN);
    // cap with goggles pushed up
    q.dot(0.08, -0.33, 0.07, T_SKIN);
    q.dot(0.08, 0.33, 0.07, T_SKIN);
    q.dot(0.08, 0, 0.37, '#3b4048');
    q.dot(0.02, 0, 0.24, '#4a525c');
    q.seg(0.4, -0.22, 0.4, 0.22, 0.09, '#2a2e33');
    q.dot(0.2, -0.13, 0.09, '#d8c46a');
    q.dot(0.2, 0.13, 0.09, '#d8c46a');
    // the scrap cart beside him: the pile grows with the salvage path
    const cxl = 0.15;
    const cyl = -1.18;
    q.seg(cxl - 0.7, cyl, cxl + 0.7, cyl, 0.78, '#4b4f55');
    q.seg(cxl - 0.7, cyl, cxl + 0.7, cyl, 0.6, '#363a40');
    for (const x of [-0.5, 0.5]) q.dot(cxl + x, cyl - 0.45, 0.14, '#15171a');
    for (const x of [-0.5, 0.5]) q.dot(cxl + x, cyl + 0.45, 0.14, '#15171a');
    const pile = [[-0.45, -0.1, 0.2, '#8a8f96'], [-0.15, 0.1, 0.22, '#a56a3a'], [0.2, -0.12, 0.2, '#6d7480'], [0.5, 0.05, 0.17, '#b1b6bd'], [0.0, -0.2, 0.17, '#7a4e2a'], [-0.3, 0.2, 0.15, '#c0c5cc'], [0.38, -0.25, 0.15, '#8a5a30'], [-0.05, 0.28, 0.14, '#6d7480'], [0.28, 0.24, 0.14, '#a0a6ae']];
    const show = 4 + Math.min(5, lv[0]);
    pile.slice(0, show).forEach(([x, y, r, col]) => q.dot(cxl + x, cyl + y * 0.7, r, col));
    if (lv[0] >= 4) for (const [x, y] of [[0.1, 0.0], [-0.25, -0.05], [0.35, 0.1]]) q.dot(cxl + x, cyl + y, 0.12, T_BRASS);
    if (lv[0] >= 5) q.dot(cxl, cyl, 0.32, T_BRASS, 0.55);
    // logistics: a conveyor and a crane
    if (lv[1] >= 2) {
      q.seg(cxl + 0.9, cyl - 0.1, cxl + 1.5, cyl - 0.5, 0.22, '#3a3f46');
      for (let i = 0; i < 3; i++) q.dot(cxl + 1.0 + i * 0.2, cyl - 0.18 - i * 0.13, 0.05, T_STEEL);
    }
    if (lv[1] >= 4) {
      q.seg(cxl - 0.9, cyl + 0.4, cxl - 0.2, cyl - 0.9, 0.12, '#e8a317');
      q.dot(cxl - 0.2, cyl - 0.9, 0.12, '#222');
    }
    // scavenging: loot sack, dog tags, a lamp
    if (lv[2] >= 1) q.dot(-0.9, 0.9, 0.3, '#8a7a5a');
    if (lv[2] >= 1) q.dot(-0.9, 0.7, 0.1, '#6a5a3a');
    if (lv[2] >= 3) for (let i = 0; i < 3; i++) q.dot(-0.3 + i * 0.16, 0.62, 0.05, '#d9d9d9');
    if (lv[2] >= 4) {
      q.dot(0.9, 0.95, 0.18, '#444');
      q.dot(0.9, 0.95, 0.1, '#ffe08a');
    }
    // coins pop out when he gets paid
    if (k > 0) for (let i = 0; i < 4; i++) q.dot(cxl - 0.3 + i * 0.25, cyl - 0.4 - k * (0.5 + 0.2 * i), 0.1, T_BRASS, k);
  },

  tesla(q, c, o, p, cx, cy, R) {
    const lv = o.tiers;
    const k = o.kick;
    const charge = Math.max(k, 0.25 + 0.12 * Math.sin(o.t * 6));
    // satellite pylons: one per conductor tier
    const sat = Math.min(4, lv[1]);
    for (let i = 0; i < sat; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const x = Math.cos(a) * 1.2;
      const y = Math.sin(a) * 1.2;
      q.dot(x, y, 0.2, '#353c46');
      q.dot(x, y, 0.13, '#b87333');
      q.dot(x, y, 0.07, tLight('#7fd0ff', k * 0.6), 1);
      q.seg(x * 0.8, y * 0.8, x * 0.4, y * 0.4, 0.04, '#7fd0ff', 0.35 + 0.4 * k);
    }
    // base, windings, toroid
    q.dot(0, 0, 0.98, '#2c323b');
    q.dot(0, 0, 0.9, '#3d4652');
    const rings = 3 + Math.min(3, lv[0]);
    for (let i = 0; i < rings; i++) q.dot(0, 0, 0.82 - i * 0.1, i % 2 ? '#8a5428' : '#c88441');
    q.dot(0, 0, 0.82 - rings * 0.1, '#2a2f37');
    // electrodes (more speed tiers: more of them)
    const prongs = 4 + Math.min(4, lv[2]);
    for (let i = 0; i < prongs; i++) {
      const a = o.t * 0.6 + (i * Math.PI * 2) / prongs;
      q.seg(Math.cos(a) * 0.3, Math.sin(a) * 0.3, Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.07, T_STEEL);
      q.dot(Math.cos(a) * 0.64, Math.sin(a) * 0.64, 0.07, tLight('#7fd0ff', charge * 0.5));
    }
    q.dot(0, 0, 0.34, '#8d98a4');
    q.dot(0, 0, 0.26, tLight('#9fdcff', charge * 0.7));
    q.dot(-0.07, -0.08, 0.1, '#ffffff', 0.9);
    if (k > 0.3) q.dot(0, 0, 1.1 * k + 0.4, '#7fd0ff', 0.18 * k);
    // idle crackle
    const f = Math.floor(o.t * 11);
    for (let i = 0; i < 2; i++) {
      const a = f * 2.4 + i * 3.1;
      q.seg(0, 0, Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0.04, '#bfe9ff', 0.45);
    }
  },
};

/** Base each design stands on, in world space (not rotated). */
const TPAD = {
  marksman(p, cx, cy, R, c) {
    tDisc(p, cx, cy, R, '#313829', 0.9, 1.15);
    tRing(p, cx, cy, R, 11, 1.05, 0.24, '#a39868', '#5e5638');
  },
  sniper(p, cx, cy, R, c) {
    tDisc(p, cx, cy, R, '#2f3627', 0.9, 1.15);
    tRing(p, cx, cy, R, 7, 1.1, 0.26, '#9a8f63', '#5a5236', Math.PI * 0.65, Math.PI * 1.25);
    tRing(p, cx, cy, R, 7, 1.1, 0.26, '#9a8f63', '#5a5236', -Math.PI * 0.6, Math.PI * 1.2);
  },
  demolitionist(p, cx, cy, R, c) {
    tDisc(p, cx, cy, R, '#2a2c30', 0.95, 1.15);
    for (let i = 0; i < 14; i++) {
      const a = (i * Math.PI * 2) / 14;
      p.circle(cx + Math.cos(a) * R * 1.07, cy + Math.sin(a) * R * 1.07, R * 0.13, i % 2 ? '#e6b800' : '#1b1b1b', 1);
    }
  },
  flamethrower(p, cx, cy, R, c) {
    tDisc(p, cx, cy, R, '#241f1c', 0.95, 1.15);
    p.circle(cx, cy, R * 0.95, '#3a2a20', 0.5);
    tRing(p, cx, cy, R, 4, 1.06, 0.22, '#8a2a1a', '#4a1710', Math.PI * 0.25, Math.PI * 1.5);
  },
  toxicologist(p, cx, cy, R, c) {
    tDisc(p, cx, cy, R, '#26331d', 0.95, 1.15);
    p.circle(cx + R * 0.1, cy + R * 0.05, R * 0.92, '#4a7a2a', 0.35);
    for (const [a, r] of [[0.4, 0.12], [1.9, 0.09], [3.3, 0.11], [4.6, 0.08], [5.6, 0.1]]) p.circle(cx + Math.cos(a) * R * 1.0, cy + Math.sin(a) * R * 1.0, r * R, '#b8f06c', 0.8);
  },
  minigunner(p, cx, cy, R, c) {
    tDisc(p, cx, cy, R, '#2b3138', 0.95, 1.15);
    tRing(p, cx, cy, R, 8, 1.07, 0.15, '#5a6672', '#242a30');
    tRing(p, cx, cy, R, 3, 0.9, 0.2, '#6a5a2a', '#3a3015', Math.PI * 0.85, Math.PI * 0.6);
  },
  scrapper(p, cx, cy, R, c) {
    tDisc(p, cx, cy, R, '#3a3226', 0.95, 1.18);
    for (const [a, r, col] of [[0.5, 0.1, '#7a7f86'], [1.6, 0.08, '#a56a3a'], [2.7, 0.1, '#5e646b'], [3.9, 0.09, '#8a5a30'], [5.1, 0.1, '#8a8f96'], [5.8, 0.07, '#b1b6bd']]) p.circle(cx + Math.cos(a) * R * 1.05, cy + Math.sin(a) * R * 1.05, r * R, col, 1);
  },
  tesla(p, cx, cy, R, c) {
    tDisc(p, cx, cy, R, '#2b3139', 0.95, 1.3);
    tRing(p, cx, cy, R, 8, 1.28, 0.1, '#d8dde2', '#6a737d');
  },
};

/** True when `look` is a design this file can draw. */
export const hasTowerLook = (look) => TOWER_LOOKS.includes(look);

/**
 * Draws one tower. Returns false (and draws nothing) when the tower has no design, so the caller can draw its plain shape instead.
 * o: angle (radians, where it is aiming), kick (1 right after firing, down to 0), tiers [a, b, c], heat (0..1, a spin-up gun),
 *    t (seconds, for little animations), pad (false = leave the base out, for small icons)
 */
export function drawTower(p, def, cx, cy, R, o = {}) {
  const look = def && def.look;
  if (!hasTowerLook(look)) return false;
  const main = def.color && T_HEX.test(def.color) ? def.color.toLowerCase() : '#8a9a5b';
  const c = { main };
  const opts = {
    kick: Math.max(0, Math.min(1, o.kick || 0)),
    tiers: [0, 1, 2].map((i) => (o.tiers && o.tiers[i]) || 0),
    heat: Math.max(0, Math.min(1, o.heat || 0)),
    t: o.t || 0,
  };
  if (o.pad !== false && TPAD[look]) TPAD[look](p, cx, cy, R, c);
  // machines and workers that do not aim keep a fixed pose
  const fixed = look === 'scrapper' ? -0.7 : look === 'tesla' ? 0 : null;
  const ang = fixed === null ? o.angle || 0 : fixed;
  const q = tPen(p, cx, cy, look === 'scrapper' ? R * 0.82 : R, ang);
  // soft shadow under the figure
  if (look !== 'tesla') p.circle(cx + R * 0.08, cy + R * 0.14, R * 0.8, '#000000', 0.16);
  TLOOK[look](q, c, opts, p, cx, cy, R);
  return true;
}
