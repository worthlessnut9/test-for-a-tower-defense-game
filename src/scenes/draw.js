// Shape drawing helpers for Phaser Graphics (everything in the game is drawn from simple shapes).
import { drawTower } from '../core/tower.js';

// Map colours: scorched ground, concrete wreckage, asphalt road.
export const PALETTE = { grassA: 0x3a3d2e, grassB: 0x35382a, wall: 0x4a4f55, wallIn: 0x5b6168, path: 0x4c5157, pathIn: 0x575d64 };

export function hex(c) {
  let s = String(c || '#888888').replace('#', '');
  if (s.length === 3) s = s.split('').map((x) => x + x).join('');
  const n = parseInt(s, 16);
  return Number.isNaN(n) ? 0x888888 : n;
}

function poly(n, x, y, r, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
  }
  return pts;
}

export function shapePoints(shape, x, y, r) {
  switch (shape) {
    case 'triangle':
      return [{ x, y: y - r }, { x: x + r * 0.92, y: y + r * 0.72 }, { x: x - r * 0.92, y: y + r * 0.72 }];
    case 'diamond':
      return [{ x, y: y - r * 1.15 }, { x: x + r * 0.8, y }, { x, y: y + r * 1.15 }, { x: x - r * 0.8, y }];
    case 'hexagon':
      return poly(6, x, y, r, 0);
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r * 1.1 : r * 0.5;
        pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
      }
      return pts;
    }
    default:
      return null;
  }
}

/** Fills a shape with the graphics object's current fillStyle. */
export function drawShape(g, shape, x, y, r) {
  if (shape === 'square') {
    g.fillRect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
    return;
  }
  const pts = shapePoints(shape, x, y, r);
  if (!pts) g.fillCircle(x, y, r);
  else g.fillPoints(pts, true);
}

/** Adapts a Phaser Graphics object to the painter that drawTerrain() expects. `alpha` dims everything (locked previews). */
export function phaserPainter(g, alpha = 1) {
  return {
    rect(x, y, w, h, c, a = 1) {
      g.fillStyle(hex(c), a * alpha);
      g.fillRect(x, y, w, h);
    },
    circle(x, y, r, c, a = 1) {
      g.fillStyle(hex(c), a * alpha);
      g.fillCircle(x, y, r);
    },
    line(x1, y1, x2, y2, w, c, a = 1) {
      g.lineStyle(w, hex(c), a * alpha);
      g.lineBetween(x1, y1, x2, y2);
    },
  };
}

/**
 * A tower: its designed look when it has one, else a plain coloured shape. `r` is the radius of the plain shape; the figure is drawn a bit bigger.
 * o: alpha, angle, kick, tiers, heat, t, pad (a base under it, default off for small icons)
 */
export function drawTowerIcon(g, def, x, y, r, o = {}) {
  const alpha = o.alpha == null ? 1 : o.alpha;
  if (drawTower(phaserPainter(g, alpha), def, x, y, r * 1.42, { pad: false, angle: -0.6, ...o })) return;
  g.fillStyle(hex(def.color), alpha);
  drawShape(g, def.shape, x, y, r);
}
