import { Sim, TARGETING, describeTier, describeAttack, rankOf, abilityOf } from '../core/sim.js';
import { loadSave, recordResult, recordEndless, addCoins, markSeen, seenIds } from '../core/save.js';
import { storyUnlocked, availableTowers, storyCoins, endlessCoins, unlockedMap, tierPrice } from '../core/game.js';
import { drawShape, drawTowerIcon, hex, phaserPainter } from './draw.js';
import { drawTerrain, zoneFor, levelPathMap, tierFor } from '../core/terrain.js';
import { makeButton } from './ui.js';
import { actKeyOf } from './MenuScene.js';
import { resolveLook, variantFor, drawZombie, zombieAngle, zombiePhase, ZOMBIE_SCALE } from '../core/zombie.js';

const W = 1280;
const H = 720;
const PX = 1000; // the map lives in x 0..PX, the tower panel in PX..W
const SBW = W - PX;
const TOP = 52; // height of the bar across the top of the map (lives, cash, round)
const STEP = 1 / 60;
const ZOOM_MAX_TILE = 88; // zooming stops when a tile is about this many pixels wide
const DRAG_PX = 10; // a press that travels further than this pans the map instead of clicking
const FONT = 'system-ui, sans-serif';
const r1 = (x) => Math.round(x * 10) / 10;
const PATH_COLORS = [0xef5350, 0x42a5f5, 0x66bb6a];
const PATH_HEX = ['#ef9a9a', '#90caf9', '#a5d6a7'];
// Bloons-style blue panels with dark trim
const PAL = { bar: 0x101c26, panel: 0x1d3145, well: 0x132230, card: 0x2c4963, cardHi: 0x3a5f7f, cardSel: 0x4a7aa5, cardOff: 0x243342, edge: 0x0a141c, trim: 0x3e5a73 };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const txt = (scene, x, y, text, size, color, extra = {}) => scene.add.text(x, y, text, { fontFamily: FONT, fontSize: size + 'px', color, ...extra }).setDepth(13);

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init(data) {
    this.levelId = data && data.levelId;
    this.mode = data && data.mode === 'endless' ? 'endless' : 'story';
  }

  create() {
    const gd = (this.gd = this.registry.get('data'));
    this.level = gd.levelsById[this.levelId];
    if (!this.level) {
      this.scene.start('Menu', { mode: this.mode });
      return;
    }
    const game = gd.game;
    const save0 = loadSave();
    const allowed = availableTowers(this.level, gd.towers, save0, game); // the player's team, narrowed by the level
    this.zone = zoneFor(this.level, gd.zonesById);
    this.variant = variantFor(this.level, this.zone); // zombie reskin for this level (its own, else its zone's)
    this.looks = {};
    this.sim = new Sim(this.level, gd.towers, gd.enemies, { allowed, endless: this.mode === 'endless', hpGrowth: game.endlessHpGrowth, countGrowth: game.endlessCountGrowth, unlocked: unlockedMap(gd.towers, save0), tier: tierFor(this.level, this.zone) });
    this.rank = rankOf(this.sim.tier); // shown on every zombie
    this.screamAt = {}; // screamer id -> sim time of its last scream (for the sound waves)
    this.speed = 1;
    this.acc = 0;
    this.paused = false;
    this.menuOpen = false;
    this.menuObjs = [];
    this.bannerT = 0;
    this.buildId = null;
    this.selected = null;
    this.hover = null;
    this.pendingCell = null; // touch: the tile a tower is being previewed on, waiting for a second tap
    this.sellArmed = 0; // touch: time until which the Sell button asks for a second tap
    this.hoverCard = null;
    this.tipPath = null;
    this.fx = [];
    this.ended = false;

    // layout: the map sits under the top bar and left of the tower panel
    const L = this.level;
    this.tile = Math.floor(Math.min((PX - 24) / L.cols, (H - TOP - 12) / L.rows));
    this.ox = Math.floor((PX - this.tile * L.cols) / 2);
    this.oy = TOP + Math.floor((H - TOP - this.tile * L.rows) / 2);
    // zoom: tile0 is the size that fits the whole map; the player can zoom in on big maps (this.tile = tile0 * zoom) and pan around
    this.tile0 = this.tile;
    this.zoom = 1;
    this.zoomMax = Math.max(1.5, Math.min(4, ZOOM_MAX_TILE / this.tile0));
    this.press = null; // a finger / mouse button that went down on the map: a click if it does not travel, a pan if it does
    this.pinch = null;

    this.mapG = this.add.graphics().setDepth(0);
    this.g = this.add.graphics().setDepth(5);
    this.drawMap();
    this.buildPanel();
    this.applyView();

    this.input.mouse.disableContextMenu();
    this.input.on('pointermove', (p) => this.onPointerMove(p));
    this.input.on('pointerdown', (p, over) => this.onPointerDown(p, over));
    this.input.on('pointerup', (p) => this.onPointerUp(p));
    this.input.on('pointerupoutside', () => {
      this.press = null;
      this.pinch = null;
    });
    this.input.on('wheel', (p, over, dx, dy) => {
      if (this.ended || this.menuOpen || !this.inMapView(p.x, p.y)) return;
      this.zoomAt(p.x, p.y, dy < 0 ? 1.15 : 1 / 1.15);
    });
    const kb = this.input.keyboard;
    kb.on('keydown-SPACE', () => this.startWave());
    kb.on('keydown-ESC', () => this.onEsc());
    kb.on('keydown-P', () => {
      if (!this.menuOpen) this.paused = !this.paused;
    });
    kb.on('keydown-F', () => this.cycleSpeed());
    kb.on('keydown-Q', () => this.doUpgrade(0));
    kb.on('keydown-W', () => this.doUpgrade(1));
    kb.on('keydown-E', () => this.doUpgrade(2));
    kb.on('keydown-X', () => this.doSell());
    kb.on('keydown', (e) => {
      if (e.key === '+' || e.key === '=') return this.zoomBy(1.25);
      if (e.key === '-' || e.key === '_') return this.zoomBy(0.8);
      if (e.key === '0') return this.zoomFit();
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= this.sim.allowedTowers.length) this.chooseBuild(this.sim.allowedTowers[n - 1]);
    });
  }

  // ---------- geometry ----------

  /** Is this screen point on the visible map (not the top bar or the tower panel)? */
  inMapView(x, y) {
    return x >= 0 && x < PX && y >= TOP && y < H;
  }

  cellAt(x, y) {
    if (!this.inMapView(x, y)) return null;
    const c = Math.floor((x - this.ox) / this.tile);
    const r = Math.floor((y - this.oy) / this.tile);
    if (c < 0 || r < 0 || c >= this.level.cols || r >= this.level.rows) return null;
    return { col: c, row: r };
  }

  // ---------- zoom and pan ----------

  /** Keeps the map on screen: centred while it fits, otherwise it can be dragged until an edge shows. */
  clampView() {
    const L = this.level;
    const mw = L.cols * this.tile;
    const mh = L.rows * this.tile;
    const vh = H - TOP;
    const M = 12;
    this.ox = mw <= PX - 2 * M + 0.5 ? Math.floor((PX - mw) / 2) : Math.min(M, Math.max(PX - mw - M, this.ox));
    this.oy = mh <= vh - M + 0.5 ? TOP + Math.floor((vh - mh) / 2) : Math.min(TOP + M, Math.max(H - mh - M, this.oy));
  }

  /** Moves the drawn terrain (it is drawn once at the fitted size and scaled) and updates the zoom buttons. */
  applyView() {
    this.tile = this.tile0 * this.zoom;
    this.clampView();
    this.mapG.setPosition(this.ox, this.oy).setScale(this.zoom);
    if (this.bZoomIn) {
      this.bZoomIn.setEnabled(this.zoom < this.zoomMax - 0.01);
      this.bZoomOut.setEnabled(this.zoom > 1.01);
      this.bZoomFit.setEnabled(this.zoom > 1.01);
    }
  }

  /** Zoom by a factor, keeping the map point under screen point (sx, sy) where it is. */
  zoomAt(sx, sy, factor) {
    const z = Math.max(1, Math.min(this.zoomMax, this.zoom * factor));
    if (z === this.zoom) return;
    const wx = (sx - this.ox) / this.tile;
    const wy = (sy - this.oy) / this.tile;
    this.zoom = z;
    this.tile = this.tile0 * z;
    this.ox = sx - wx * this.tile;
    this.oy = sy - wy * this.tile;
    this.applyView();
  }

  zoomBy(factor) {
    if (this.ended || this.menuOpen) return;
    this.zoomAt(PX / 2, (TOP + H) / 2, factor);
  }

  zoomFit() {
    if (this.ended || this.menuOpen) return;
    this.zoom = 1;
    this.applyView();
  }

  panBy(dx, dy) {
    this.ox += dx;
    this.oy += dy;
    this.applyView();
  }

  // ---------- pointer: tap / click, drag to pan, pinch / wheel to zoom ----------

  onPointerDown(p, over) {
    if (this.ended || this.menuOpen) return;
    if (p.wasTouch) this.registry.set('touch', true);
    if (p.rightButtonDown()) {
      this.cancel();
      return;
    }
    if (over && over.length) return; // a button was pressed, not the map
    if (!this.inMapView(p.x, p.y)) return;
    this.press = { id: p.id, x: p.x, y: p.y, lx: p.x, ly: p.y, moved: false };
  }

  onPointerMove(p) {
    const a = this.input.pointer1;
    const b = this.input.pointer2;
    if (a && b && a.isDown && b.isDown) {
      // two fingers: pinch to zoom, and the middle point drags the map
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      this.press = null;
      if (this.pinch) {
        this.zoomAt(mx, my, d / this.pinch.d);
        this.panBy(mx - this.pinch.mx, my - this.pinch.my);
      }
      this.pinch = { d, mx, my };
      return;
    }
    this.pinch = null;
    const pr = this.press;
    if (pr && p.isDown && p.id === pr.id) {
      if (!pr.moved && Math.hypot(p.x - pr.x, p.y - pr.y) > DRAG_PX) pr.moved = true;
      if (pr.moved) {
        this.panBy(p.x - pr.lx, p.y - pr.ly);
        pr.lx = p.x;
        pr.ly = p.y;
      }
      return;
    }
    if (!p.wasTouch) this.hover = this.cellAt(p.x, p.y); // a dragging finger does not hover: touch previews come from taps
  }

  onPointerUp(p) {
    const pr = this.press;
    this.press = null;
    if (this.pinch && !(this.input.pointer1 && this.input.pointer1.isDown && this.input.pointer2 && this.input.pointer2.isDown)) this.pinch = null;
    if (!pr || pr.moved || this.ended || this.menuOpen || p.id !== pr.id) return;
    const cell = this.cellAt(pr.x, pr.y);
    if (cell) this.onCellClick(cell, !!p.wasTouch);
  }

  px(x) {
    return this.ox + x * this.tile;
  }

  py(y) {
    return this.oy + y * this.tile;
  }

  drawMap() {
    const g = this.mapG;
    const T = this.tile0;
    const L = this.level;
    // drawn at the fitted tile size with the map's corner at (0, 0); applyView() positions and scales this layer
    drawTerrain(phaserPainter(g), this.zone, L.tiles, levelPathMap(L), 0, 0, T);
    // spawn / exit markers
    for (const p of this.level.paths) {
      const s = p.points[0];
      const e = p.points[p.points.length - 1];
      g.lineStyle(3, 0x66bb6a, 1);
      g.strokeRect(s[0] * T + 2, s[1] * T + 2, T - 4, T - 4);
      g.lineStyle(3, 0xef5350, 1);
      g.strokeRect(e[0] * T + 2, e[1] * T + 2, T - 4, T - 4);
    }
    g.lineStyle(1, 0x000000, 0.18);
    for (let c = 0; c <= L.cols; c++) g.lineBetween(c * T, 0, c * T, L.rows * T);
    for (let r = 0; r <= L.rows; r++) g.lineBetween(0, r * T, L.cols * T, r * T);
  }

  // ---------- top bar + tower panel ----------

  buildPanel() {
    const sim = this.sim;
    const x0 = PX + 12;
    const iw = SBW - 24;

    // top bar: lives, cash, level name, round, menu
    const bar = this.add.graphics().setDepth(20);
    bar.fillStyle(PAL.bar, 1);
    bar.fillRect(0, 0, PX, TOP);
    bar.fillStyle(PAL.edge, 1);
    bar.fillRect(0, TOP - 2, PX, 2);
    const pill = (x, w) => {
      bar.fillStyle(0x07101a, 0.9);
      bar.fillRoundedRect(x, 7, w, 38, 12);
      bar.lineStyle(2, PAL.trim, 1);
      bar.strokeRoundedRect(x, 7, w, 38, 12);
    };
    const roundX = PX - 12 - 38 - 8 - 190;
    pill(12, 112);
    pill(132, 150);
    pill(roundX, 190);
    this.add.text(24, 9, '♥', { fontFamily: FONT, fontSize: '28px', color: '#ef5350' }).setDepth(21);
    this.tLives = this.add.text(56, 12, '', { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#ffffff' }).setDepth(21);
    bar.fillStyle(0xffca28, 1);
    bar.fillCircle(154, 26, 12);
    bar.lineStyle(2, 0xb28704, 1);
    bar.strokeCircle(154, 26, 12);
    this.add.text(154, 26, '$', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#7a5a00' }).setOrigin(0.5).setDepth(22);
    this.tMoney = this.add.text(176, 12, '', { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#ffffff' }).setDepth(21);
    const zb = { size: 18, depth: 21, fill: PAL.card, hover: PAL.cardHi, stroke: PAL.trim };
    this.bZoomOut = makeButton(this, roundX - 8 - 50 - 4 - 36 - 4 - 36, 7, 36, 38, '−', () => this.zoomBy(0.8), zb);
    this.bZoomIn = makeButton(this, roundX - 8 - 50 - 4 - 36, 7, 36, 38, '+', () => this.zoomBy(1.25), zb);
    this.bZoomFit = makeButton(this, roundX - 8 - 50, 7, 50, 38, 'Fit', () => this.zoomFit(), { ...zb, size: 15 });
    this.add.text((282 + roundX - 8 - 50 - 4 - 36 - 4 - 36) / 2, 26, this.level.name + (this.mode === 'endless' ? '  ∞ endless' : ''), { fontFamily: FONT, fontSize: '16px', color: '#8fb0cc' }).setOrigin(0.5).setDepth(21);
    this.tWave = this.add.text(roundX + 95, 26, '', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(21);
    this.bMenu = makeButton(this, PX - 12 - 38, 7, 38, 38, '⚙', () => this.toggleMenu(), { size: 22, depth: 21, fill: PAL.card, hover: PAL.cardHi, stroke: PAL.trim });
    this.banner = this.add.text(PX / 2, TOP + 56, '', { fontFamily: FONT, fontSize: '46px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 7 }).setOrigin(0.5).setDepth(30).setAlpha(0);

    // right panel
    const sb = this.add.graphics().setDepth(8);
    sb.fillStyle(PAL.panel, 1);
    sb.fillRect(PX, 0, SBW, H);
    sb.fillStyle(PAL.edge, 1);
    sb.fillRect(PX - 3, 0, 3, H);
    sb.fillStyle(PAL.trim, 1);
    sb.fillRect(PX, 0, 2, H);
    sb.fillStyle(PAL.well, 1);
    sb.fillRoundedRect(x0 - 6, 8, iw + 12, 584, 12);
    this.uiG = this.add.graphics().setDepth(11);

    // --- shop view: a grid of tower cards
    this.shopObjs = [];
    this.shopObjs.push(txt(this, x0, 16, 'TOWERS', 13, '#8fb0cc', { fontStyle: 'bold' }));
    const n = sim.allowedTowers.length;
    const gap = 8;
    const cw = Math.floor((iw - gap) / 2);
    const rows = Math.max(1, Math.ceil(n / 2));
    const ch = Math.min(96, Math.floor((520 - (rows - 1) * gap) / rows));
    this.cards = sim.allowedTowers.map((id, i) => {
      const def = sim.towerDefs[id];
      const x = x0 + (i % 2) * (cw + gap);
      const y = 40 + Math.floor(i / 2) * (ch + gap);
      const b = makeButton(this, x, y, cw, ch, '', () => this.chooseBuild(id), {
        fill: PAL.card,
        hover: PAL.cardHi,
        stroke: PAL.edge,
        onOver: () => {
          this.hoverCard = id;
        },
        onOut: () => {
          if (this.hoverCard === id) this.hoverCard = null;
        },
      });
      const name = txt(this, x + cw / 2, y + ch * 0.56, def.name, 13, '#e8eef7', { fontStyle: 'bold', align: 'center', wordWrap: { width: cw - 8 } }).setOrigin(0.5, 0);
      const price = txt(this, x + cw / 2, y + ch - 7, '$' + def.cost, 16, '#81c784', { fontStyle: 'bold' }).setOrigin(0.5, 1);
      this.shopObjs.push(b, name, price);
      if (i < 9) this.shopObjs.push(txt(this, x + 8, y + 5, String(i + 1), 11, '#8fb0cc'));
      return { id, b, name, price, x, y, w: cw, h: ch };
    });
    this.tHint = txt(this, x0, 562, '', 12, '#9fb8d0', { wordWrap: { width: iw } });
    this.shopObjs.push(this.tHint);

    // --- selected-tower view: name, targeting, three upgrade paths, sell
    this.selObjs = [];
    this.tName = txt(this, x0 + 50, 15, '', 19, '#e8eef7', { fontStyle: 'bold' });
    this.tTiers = txt(this, x0 + 50, 39, '', 12, '#8fb0cc');
    this.bClose = makeButton(this, PX + SBW - 12 - 30, 14, 30, 30, '✕', () => this.cancel(), { size: 14, fill: PAL.card, hover: PAL.cardHi, stroke: PAL.edge });
    this.bTargetL = makeButton(this, x0, 62, 40, 34, '◀', () => this.cycleTarget(-1), { size: 14, fill: PAL.card, hover: PAL.cardHi, stroke: PAL.edge });
    this.bTargetR = makeButton(this, x0 + iw - 40, 62, 40, 34, '▶', () => this.cycleTarget(1), { size: 14, fill: PAL.card, hover: PAL.cardHi, stroke: PAL.edge });
    this.tTarget = txt(this, x0 + iw / 2, 79, '', 15, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
    this.pathRows = [0, 1, 2].map((pi) => {
      const y = 104 + pi * 122;
      const b = makeButton(this, x0, y, iw, 116, '', () => this.doUpgrade(pi), {
        fill: PAL.card,
        hover: PAL.cardHi,
        stroke: PATH_COLORS[pi],
        onOver: () => {
          this.tipPath = pi;
        },
        onOut: () => {
          if (this.tipPath === pi) this.tipPath = null;
        },
      });
      const name = txt(this, x0 + 12, y + 8, '', 12, PATH_HEX[pi], { fontStyle: 'bold' });
      const sub = txt(this, x0 + 12, y + 25, '', 16, '#ffffff', { fontStyle: 'bold', wordWrap: { width: iw - 24 } });
      const cost = txt(this, x0 + iw - 12, y + 8, '', 14, '#ffd54f', { fontStyle: 'bold' }).setOrigin(1, 0);
      const desc = txt(this, x0 + 12, y + 48, '', 12, '#cfd8e6', { wordWrap: { width: iw - 24 }, lineSpacing: 2 });
      return { b, name, sub, cost, desc, y, pi };
    });
    this.bSell = makeButton(this, x0, 472, iw, 34, 'Sell', () => this.doSell(), { size: 15, fill: 0x7a2f2f, hover: 0x9a3b3b, stroke: PAL.edge });
    this.tInfo = txt(this, x0, 514, '', 13, '#cfd8e6', { lineSpacing: 3, wordWrap: { width: iw } });
    this.selObjs.push(this.tName, this.tTiers, this.bClose, this.bTargetL, this.bTargetR, this.tTarget, this.bSell, this.tInfo);

    // hover card for the tower grid (floats over the map, left of the panel)
    this.tipBg = this.add.rectangle(0, 0, 10, 10, 0x0a141c, 0.96).setStrokeStyle(2, PAL.trim).setOrigin(1, 0).setDepth(60).setVisible(false);
    this.tipTx = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#e8eef7', lineSpacing: 4, wordWrap: { width: 250 } }).setOrigin(1, 0).setDepth(61).setVisible(false);

    // next round + play / fast-forward
    this.tNext = txt(this, x0, 600, '', 12, '#9fb8d0', { wordWrap: { width: iw } });
    this.bWave = makeButton(this, x0, 640, 168, 62, '▶  Start round 1', () => this.startWave(), { size: 19, fill: 0x2e9e45, hover: 0x3fbf5a, stroke: 0x155c27 });
    this.bSpeed = makeButton(this, x0 + 176, 640, iw - 176, 62, '▶▶\n1x', () => this.cycleSpeed(), { size: 17, fill: PAL.card, hover: PAL.cardHi, stroke: PAL.edge });

    this.refreshInfo();
  }

  statText(s) {
    return describeAttack(s).join('\n');
  }

  setPathRowsVisible(v, count = 3) {
    this.pathRows.forEach((r, i) => {
      const on = v && i < count;
      r.b.setVisible(on);
      r.name.setVisible(on);
      r.sub.setVisible(on);
      r.cost.setVisible(on);
      r.desc.setVisible(on);
    });
    if (!v) this.tipPath = null;
  }

  /** Switches the panel between the tower grid and the selected tower's upgrades. */
  refreshInfo() {
    const sim = this.sim;
    const t = this.selected;
    this.hoverCard = null;
    for (const o of this.shopObjs) o.setVisible(!t);
    for (const o of this.selObjs) o.setVisible(!!t);
    if (t) {
      const paths = t.def.paths || [];
      this.setPathRowsVisible(true, paths.length);
      this.pathRows.forEach((r, i) => {
        const path = paths[i];
        if (path) r.name.setText((path.name || 'Path ' + (i + 1)).toUpperCase());
      });
      this.tName.setText(t.def.name);
      this.updatePathRows();
    } else {
      this.setPathRowsVisible(false);
      if (this.buildId) {
        const def = sim.towerDefs[this.buildId];
        this.tHint.setText(this.registry.get('touch') === true ? 'Placing ' + def.name + ' ($' + def.cost + '). Tap an empty tile to preview it, tap the same tile again to build. Tap the card again to cancel.' : 'Placing ' + def.name + ' ($' + def.cost + '). Click an empty tile to build it. Right-click or Esc to cancel.');
      } else if (!sim.allowedTowers.length) {
        this.tHint.setText('No towers are available on this level.');
      } else {
        this.tHint.setText(this.registry.get('touch') === true ? 'Pick a tower, then tap an empty tile to build it. Tap a placed tower to upgrade or sell it.' : 'Pick a tower, then click an empty tile to build it. Click a placed tower to upgrade or sell it.');
      }
    }
  }

  /** Text of one upgrade path (and whether it can be bought) for the selected tower. */
  pathRowState(t, pi) {
    const sim = this.sim;
    const path = t.def.paths[pi];
    const st = sim.upgradeStatus(t, pi);
    const tier = sim.nextTier(t, pi);
    const rules = sim.rules(t.def);
    const what = tier ? describeTier(tier) || '(no stat change)' : '';
    let sub = '';
    let cost = '';
    let desc = '';
    if (st === 'max') {
      sub = 'Fully upgraded';
      cost = 'MAX';
      desc = 'Every tier on this path is bought.';
    } else if (st === 'locked') {
      sub = tier.name || 'Tier ' + (t.tiers[pi] + 1);
      cost = 'TEAM';
      desc = 'Not bought yet. Unlock it on the Team screen (' + tierPrice(tier) + ' coins) to use it in battle.\n' + what;
    } else if (st === 'paths') {
      sub = 'Locked';
      desc = 'A tower can use at most ' + rules.maxPaths + ' paths.';
    } else if (st === 'secondary') {
      sub = 'Locked';
      desc = 'Only one path may go past tier ' + rules.secondaryMax + '.';
    } else {
      sub = tier.name || 'Tier ' + (t.tiers[pi] + 1);
      cost = '$' + (tier.cost || 0);
      desc = what;
    }
    return { st, sub, cost, desc, tier, path };
  }

  updatePathRows() {
    const t = this.selected;
    if (!t) return;
    this.pathRows.forEach((r, pi) => {
      const path = (t.def.paths || [])[pi];
      if (!path) return;
      const s = this.pathRowState(t, pi);
      r.sub.setText(s.sub);
      r.cost.setText(s.cost);
      r.desc.setText(s.desc);
      const dim = s.st === 'paths' || s.st === 'secondary' || s.st === 'locked' || s.st === 'max';
      r.b.setEnabled(s.st === 'ok' && !this.ended);
      r.b.bg.setStrokeStyle(3, s.st === 'locked' ? 0xe57373 : 0x66bb6a); // red outline until the upgrade is bought, green once it is
      r.sub.setAlpha(dim ? 0.55 : 1);
      r.desc.setAlpha(dim ? 0.7 : 1);
      r.cost.setColor(s.st === 'money' ? '#ef9a9a' : s.st === 'locked' || s.st === 'max' ? '#90a4ae' : '#ffd54f');
    });
    this.tTiers.setText('Upgrades ' + t.tiers.join(' - '));
    this.tTarget.setText('Target: ' + cap(t.targeting));
    this.bSell.setLabel((this.sellIsArmed() ? 'Tap again to sell  +$' : 'Sell  +$') + this.sim.sellValue(t));
    this.tInfo.setText(this.statText(this.sim.stats(t)));
  }

  /** Tier pips, drawn every frame on the shared graphics layer. */
  drawSelection(ug) {
    const t = this.selected;
    const sim = this.sim;
    drawTowerIcon(ug, t.def, PX + 12 + 22, 36, 15, { tiers: t.tiers, angle: -0.35, t: this.sim.time });
    this.pathRows.forEach((r, pi) => {
      const path = (t.def.paths || [])[pi];
      if (!path) return;
      const s = this.pathRowState(t, pi);
      const locked = s.st === 'paths' || s.st === 'secondary' || s.st === 'locked';
      const n = path.tiers.length;
      for (let i = 0; i < n; i++) {
        const owned = i < t.tiers[pi];
        const open = !sim.unlocked || i < ((sim.unlocked[t.def.id] || [])[pi] || 0); // bought on the Team screen
        const x = r.b.x + 12 + i * 20;
        const y = r.y + 100;
        ug.fillStyle(PATH_COLORS[pi], owned ? 1 : !open ? 0.1 : locked ? 0.15 : 0.35);
        ug.fillRect(x, y, 16, 8);
        // outline: green once the tier is bought on the Team screen, red until then
        ug.lineStyle(2, open ? 0x66bb6a : 0xe57373, 0.95);
        ug.strokeRect(x, y, 16, 8);
        if (!owned && i === t.tiers[pi] && s.st === 'ok') {
          ug.lineStyle(2, 0xffffff, 0.9);
          ug.strokeRect(x, y, 16, 8);
        }
      }
    });
  }

  // ---------- actions ----------

  chooseBuild(id) {
    if (this.ended || !this.sim.allowedTowers.includes(id)) return;
    this.pendingCell = null;
    if (this.registry.get('touch') === true) this.hover = null;
    this.buildId = this.buildId === id ? null : id;
    this.selected = null;
    this.refreshInfo();
  }

  cancel() {
    this.pendingCell = null;
    if (this.registry.get('touch') === true) this.hover = null;
    this.sellArmed = 0;
    this.buildId = null;
    this.selected = null;
    this.refreshInfo();
  }

  /** Esc: back out of a build / selection first, otherwise open the pause menu. */
  onEsc() {
    if (this.ended) return;
    if (this.menuOpen) this.closeMenu();
    else if (this.buildId || this.selected) this.cancel();
    else this.openMenu();
  }

  /** Back to the level list, on the act this level belongs to. */
  toMenu() {
    this.scene.start('Menu', { mode: this.mode, act: this.mode === 'story' ? actKeyOf(this.gd, this.level) : undefined });
  }

  toggleMenu() {
    if (this.ended) return;
    if (this.menuOpen) this.closeMenu();
    else this.openMenu();
  }

  openMenu() {
    this.menuOpen = true;
    this.pausedBefore = this.paused;
    this.paused = true;
    const d = 150;
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setDepth(d).setInteractive();
const fsOk = !!(this.scale && this.scale.fullscreen && this.scale.fullscreen.available);
    const panel = this.add.rectangle(W / 2, H / 2 + (fsOk ? 31 : 0), 340, fsOk ? 362 : 300, PAL.panel).setStrokeStyle(3, PAL.trim).setDepth(d + 1);
    const title = this.add.text(W / 2, H / 2 - 112, 'PAUSED', { fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(d + 2);
    const opt = { depth: d + 3, size: 18, fill: PAL.card, hover: PAL.cardHi, stroke: PAL.edge };
    const b1 = makeButton(this, W / 2 - 120, H / 2 - 66, 240, 50, 'Resume', () => this.closeMenu(), { ...opt, fill: 0x2e9e45, hover: 0x3fbf5a });
    const b2 = makeButton(this, W / 2 - 120, H / 2 - 4, 240, 50, 'Restart level', () => this.scene.restart({ levelId: this.levelId, mode: this.mode }), opt);
    const b3 = makeButton(this, W / 2 - 120, H / 2 + 58, 240, 50, 'Quit to level select', () => this.toMenu(), opt);
    this.menuObjs = [dim, panel, title, b1, b2, b3];
    if (fsOk) this.menuObjs.push(makeButton(this, W / 2 - 120, H / 2 + 120, 240, 50, this.scale.isFullscreen ? 'Exit fullscreen' : 'Fullscreen', () => { this.scale.toggleFullscreen(); this.closeMenu(); }, opt));
  }

  closeMenu() {
    this.menuOpen = false;
    this.paused = !!this.pausedBefore;
    for (const o of this.menuObjs) o.destroy();
    this.menuObjs = [];
  }

  onCellClick({ col, row }, touch = false) {
    const sim = this.sim;
    const t = sim.towerAt(col, row);
    if (this.buildId && !t) {
      if (touch) {
        // a finger covers the tile, so the first tap only previews the tower and its range; tapping the same tile again builds it
        const p = this.pendingCell;
        if (!p || p.col !== col || p.row !== row) {
          this.pendingCell = { col, row };
          this.hover = { col, row };
          return;
        }
        this.pendingCell = null;
      }
      sim.buildTower(this.buildId, col, row);
      this.refreshInfo();
      return;
    }
    this.pendingCell = null;
    this.buildId = null;
    this.selected = t;
    this.refreshInfo();
  }

  doUpgrade(p) {
    if (this.ended || !this.selected) return;
    this.sim.upgradeTower(this.selected, p);
    this.refreshInfo();
  }

  sellIsArmed() {
    return this.sellFor === this.selected && this.sellArmed > Date.now();
  }

  doSell() {
    if (this.ended || !this.selected) return;
    if (this.registry.get('touch') === true && !this.sellIsArmed()) {
      // on a phone selling needs a second tap within a few seconds (it cannot be undone)
      this.sellArmed = Date.now() + 3000;
      this.sellFor = this.selected;
      this.updatePathRows();
      return;
    }
    this.sellArmed = 0;
    this.sim.sellTower(this.selected);
    this.selected = null;
    this.refreshInfo();
  }

  cycleTarget(dir = 1) {
    if (!this.selected) return;
    const i = TARGETING.indexOf(this.selected.targeting);
    this.selected.targeting = TARGETING[(i + dir + TARGETING.length) % TARGETING.length];
    this.refreshInfo();
  }

  cycleSpeed() {
    if (this.menuOpen) return;
    this.speed = this.speed >= 3 ? 1 : this.speed + 1;
  }

  startWave() {
    if (this.ended || this.menuOpen) return;
    const before = this.sim.waveIndex;
    this.sim.startNextWave();
    if (this.sim.waveIndex !== before) {
      this.bannerT = 2;
      this.banner.setText('Round ' + this.sim.waveIndex);
    }
  }

  // ---------- frame loop ----------

  update(time, delta) {
    if (!this.sim) return;
    const dt = Math.min(delta, 100) / 1000;
    if (!this.paused && !this.ended) {
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= STEP && n < 12 && this.sim.status === 'playing') {
        this.sim.update(STEP);
        this.acc -= STEP;
        n++;
        this.handleEvents();
      }
      this.noteSeen();
      if (this.sim.status !== 'playing' && !this.ended) this.showEnd();
    }
    this.fx = this.fx.filter((f) => (f.life -= dt) > 0);
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      this.banner.setAlpha(Math.max(0, Math.min(1, this.bannerT / 0.8)));
    }
    this.updateHud();
    this.drawDynamic();
  }

  /** Zombies on the field are remembered, so the Team screen can list them from then on. */
  noteSeen() {
    if (!this.seen) this.seen = new Set(seenIds(loadSave()));
    let fresh = null;
    for (const e of this.sim.enemies) {
      const id = e.def && e.def.id;
      if (id && !this.seen.has(id)) (fresh = fresh || []).push(id), this.seen.add(id);
    }
    if (fresh) markSeen(fresh);
  }

  /** A small number that drifts up and fades (income). */
  floatText(x, y, text, color) {
    if (!this.inMapView(this.px(x), this.py(y))) return; // zoomed away from it: do not draw over the top bar or the panel
    const t = this.add.text(this.px(x), this.py(y) - this.tile * 0.4, text, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color, stroke: '#101418', strokeThickness: 3 }).setOrigin(0.5).setDepth(40);
    if (this.tweens) this.tweens.add({ targets: t, y: t.y - 34, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    else t.destroy();
  }

  /** Fire along the line from the nozzle to the target: a few flickering blobs, red at the tip, yellow at the nozzle. */
  drawFlame(g, x1, y1, x2, y2, seed, time) {
    const T = this.tile;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const start = T * 0.42;
    const N = 11;
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1);
      const along = start + (len - start + T * 0.15) * k;
      const wob = Math.sin(time * 26 + i * 1.7 + seed) * T * 0.07 * k;
      const px = x1 + (dx / len) * along + nx * wob;
      const py = y1 + (dy / len) * along + ny * wob;
      const r = T * (0.07 + 0.2 * k) * (0.85 + 0.25 * Math.sin(time * 34 + i * 2.3 + seed));
      g.fillStyle(k < 0.35 ? 0xfff176 : k < 0.7 ? 0xff9800 : 0xe64a19, 0.8 - 0.35 * k);
      g.fillCircle(px, py, r);
    }
  }

  /** A jagged bolt through the list of points (tesla coil). */
  drawLightning(g, f) {
    const k = f.life / f.max;
    const pts = f.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const ax = this.px(pts[i][0]);
      const ay = this.py(pts[i][1]);
      const bx = this.px(pts[i + 1][0]);
      const by = this.py(pts[i + 1][1]);
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / len;
      const ny = (bx - ax) / len;
      const steps = Math.max(3, Math.round(len / 14));
      let lx = ax;
      let ly = ay;
      for (let s = 1; s <= steps; s++) {
        const u = s / steps;
        const j = s === steps ? 0 : (Math.sin((f.seed + i * 13 + s * 7.3) * 12.9898) * 43758.5453 % 1) * 12;
        const x = ax + (bx - ax) * u + nx * j;
        const y = ay + (by - ay) * u + ny * j;
        g.lineStyle(5, f.color, 0.3 * k);
        g.lineBetween(lx, ly, x, y);
        g.lineStyle(2, 0xe6f7ff, 0.95 * k);
        g.lineBetween(lx, ly, x, y);
        lx = x;
        ly = y;
      }
    }
  }

  /** Shots look different by kind: bullets and tracers are streaks, grenades and flasks are lobbed, rockets leave a flame. */
  drawProjectile(g, p) {
    const T = this.tile;
    const x = this.px(p.x);
    const y = this.py(p.y);
    const kind = p.kind || '';
    const dx = this.px(p.tx) - x;
    const dy = this.py(p.ty) - y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    if (kind === 'bullet' || kind === 'tracer') {
      const len = kind === 'tracer' ? 22 : 9;
      g.lineStyle(kind === 'tracer' ? 2 : 2.5, kind === 'tracer' ? 0xcfe9ff : 0xffe9a8, 0.95);
      g.lineBetween(x - ux * len, y - uy * len, x, y);
      return;
    }
    if (kind === 'grenade' || kind === 'flask') {
      const total = Math.hypot(this.px(p.tx) - this.px(p.sx), this.py(p.ty) - this.py(p.sy)) || 1;
      const k = Math.max(0, Math.min(1, 1 - d / total));
      const h = Math.sin(Math.PI * k) * Math.min(T * 1.1, total * 0.45);
      g.fillStyle(0x000000, 0.25);
      g.fillCircle(x, y, 4);
      if (kind === 'flask') {
        g.fillStyle(0x8fe04a, 0.95);
        g.fillCircle(x, y - h, 6);
        g.fillStyle(0xf2ffd0, 0.9);
        g.fillCircle(x - 2, y - h - 2, 2);
      } else {
        g.fillStyle(0x4a5a30, 1);
        g.fillCircle(x, y - h, 5.5);
        g.fillStyle(0xd6d6d6, 1);
        g.fillRect(x - 1.5, y - h - 8, 3, 3);
      }
      return;
    }
    if (kind === 'rocket') {
      g.lineStyle(4, 0xff9800, 0.7);
      g.lineBetween(x - ux * 12, y - uy * 12, x, y);
      g.fillStyle(0xd7dce0, 1);
      g.fillCircle(x, y, 3.5);
      return;
    }
    g.fillStyle(hex(p.color), 1);
    g.fillCircle(x, y, p.splash > 0 ? 6 : 4);
  }

  handleEvents() {
    for (const e of this.sim.drainEvents()) {
      switch (e.type) {
        case 'kill':
          this.fx.push({ kind: 'burst', x: e.x, y: e.y, color: hex(e.color), life: 0.35, max: 0.35 });
          break;
        case 'splash':
          this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: e.r, color: hex(e.color), life: 0.3, max: 0.3 });
          break;
        case 'pulse':
          this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: e.r, color: hex(e.color), life: 0.4, max: 0.4 });
          break;
        case 'build':
        case 'upgrade':
          this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 0.7, color: 0xffffff, life: 0.3, max: 0.3 });
          break;
        case 'leak':
          this.cameras.main.shake(140, 0.004);
          break;
        case 'scream':
          this.screamAt[e.id] = this.sim.time;
          this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: e.r, color: 0xffffff, life: 0.6, max: 0.6 });
          break;
        case 'summon':
          this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 1.2, color: 0x9a5ae8, life: 0.5, max: 0.5 });
          break;
        case 'burst':
          this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 1.4, color: 0xd8b04a, life: 0.45, max: 0.45 });
          break;
        case 'arc':
          this.fx.push({ kind: 'arc', points: e.points, color: hex(e.color), life: 0.22, max: 0.22, seed: Math.floor(Math.random() * 1000) });
          break;
        case 'income':
          this.floatText(e.x, e.y, '+$' + (Math.round(e.amount * 10) / 10), e.bounty ? '#ffe082' : '#a5d6a7');
          break;
        case 'leap':
        case 'land':
          this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 0.5, color: 0xd9d4b0, life: 0.25, max: 0.25 });
          break;
        default:
      }
    }
  }

  updateHud() {
    const sim = this.sim;
    this.tMoney.setText(String(sim.money));
    this.tLives.setText(String(sim.lives));
    this.tWave.setText('Round ' + Math.max(1, sim.waveIndex) + (this.mode === 'endless' ? '  ∞' : ' / ' + sim.wavesTotal));
    this.tNext.setText(sim.allWavesStarted ? 'All rounds sent. Defeat the rest!' : 'Next: ' + sim.describeWave(sim.waveIndex));
    this.bWave.setLabel(sim.allWavesStarted ? 'All rounds sent' : '▶  Start round ' + (sim.waveIndex + 1));
    this.bWave.setEnabled(!this.ended && !sim.allWavesStarted);
    this.bSpeed.setLabel('▶▶\n' + (this.paused ? 'paused' : this.speed + 'x'));

    const ug = this.uiG;
    ug.clear();
    if (this.selected && !sim.towers.includes(this.selected)) {
      this.selected = null; // sold or destroyed
      this.refreshInfo();
    }
    if (this.selected) {
      this.updatePathRows();
      this.drawSelection(ug);
      this.tipBg.setVisible(false);
      this.tipTx.setVisible(false);
      return;
    }
    // tower grid: icons, affordability, hover card
    for (const c of this.cards) {
      const def = sim.towerDefs[c.id];
      const ok = sim.money >= def.cost;
      drawTowerIcon(ug, def, c.x + c.w / 2, c.y + c.h * 0.29, Math.min(20, c.h * 0.2), { alpha: ok ? 1 : 0.4, angle: -0.35 });
      c.price.setColor(ok ? '#81c784' : '#ef9a9a');
      c.name.setAlpha(ok ? 1 : 0.6);
      c.b.setFill(this.buildId === c.id ? PAL.cardSel : ok ? PAL.card : PAL.cardOff);
    }
    // no hover on a phone: the tooltip stays on the card that was tapped
    const tipId = this.hoverCard || (this.registry.get('touch') === true && this.buildId) || null;
    const hc = tipId && this.cards.find((c) => c.id === tipId);
    this.tipBg.setVisible(!!hc);
    this.tipTx.setVisible(!!hc);
    if (hc) {
      const def = sim.towerDefs[hc.id];
      this.tipTx.setText(def.name + '   $' + def.cost + '\n' + this.statText(sim.stats({ def, tiers: [0, 0, 0] })) + (this.registry.get('touch') === true ? '\n\nTap the map to preview it, tap again to build.' : '\n\nClick, then click the map to build.'));
      const w = Math.max(200, this.tipTx.width + 20);
      const h = this.tipTx.height + 16;
      const top = Math.max(TOP + 8, Math.min(hc.y, H - h - 10));
      this.tipBg.setPosition(PX - 10, top).setSize(w, h).setDisplaySize(w, h);
      this.tipTx.setPosition(PX - 20, top + 8);
    }
  }

  drawDynamic() {
    const g = this.g;
    const sim = this.sim;
    const T = this.tile;
    g.clear();

    // hover / ghost
    if (this.hover && !this.ended) {
      const { col, row } = this.hover;
      if (this.buildId) {
        const def = sim.towerDefs[this.buildId];
        const ok = sim.canBuild(col, row) && sim.money >= def.cost;
        const cx = this.px(col + 0.5);
        const cy = this.py(row + 0.5);
        g.fillStyle(ok ? 0xffffff : 0xff5252, 0.12);
        g.fillRect(this.px(col), this.py(row), T, T);
        const range = sim.stats({ def, tiers: [0, 0, 0] }).range * T;
        g.fillStyle(ok ? 0xffffff : 0xff5252, 0.07);
        g.fillCircle(cx, cy, range);
        g.lineStyle(2, ok ? 0xffffff : 0xff5252, 0.45);
        g.strokeCircle(cx, cy, range);
        drawTowerIcon(g, def, cx, cy, T * 0.28, { alpha: 0.7, angle: -0.35, pad: true });
      } else {
        g.lineStyle(2, 0xffffff, 0.2);
        g.strokeRect(this.px(col) + 1, this.py(row) + 1, T - 2, T - 2);
      }
    }

    // towers
    for (const t of sim.towers) {
      const cx = this.px(t.x);
      const cy = this.py(t.y);
      g.fillStyle(0x1c232c, 1);
      g.fillRoundedRect(this.px(t.col) + 3, this.py(t.row) + 3, T - 6, T - 6, 6);
      const ts = sim.stats(t);
      const kickLen = ts.type === 'income' ? 0.7 : 0.16;
      drawTowerIcon(g, t.def, cx, cy, T * 0.28, { pad: true, angle: t.aim, kick: Math.max(0, 1 - (sim.time - t.shotAt) / kickLen), tiers: t.tiers, heat: t.heat, t: sim.time });
      // tier bars: one short bar per upgrade path, coloured like the path rows
      const bwid = (T - 12) / 3 - 2;
      for (let p = 0; p < 3; p++) {
        const n = (t.def.paths && t.def.paths[p] && t.def.paths[p].tiers.length) || 5;
        const bx = this.px(t.col) + 6 + p * (bwid + 2);
        g.fillStyle(0x000000, 0.5);
        g.fillRect(bx, this.py(t.row) + T - 9, bwid, 4);
        if (t.tiers[p] > 0) {
          g.fillStyle(PATH_COLORS[p], 1);
          g.fillRect(bx, this.py(t.row) + T - 9, bwid * Math.min(1, t.tiers[p] / n), 4);
        }
      }
      if (t.tauntUntil > sim.time && t.tauntBy && !t.tauntBy.dead) {
        // a screamer has made this tower shoot at it
        g.lineStyle(3, 0xff5252, 0.9);
        g.strokeCircle(cx, cy, T * 0.5);
        g.lineStyle(1, 0xff5252, 0.45);
        g.lineBetween(cx, cy, this.px(t.tauntBy.x), this.py(t.tauntBy.y));
        g.fillStyle(0xff5252, 1);
        g.fillRect(cx - 2, cy - T * 0.5 - 12, 4, 7);
        g.fillRect(cx - 2, cy - T * 0.5 - 3, 4, 3);
      }
      if (t === this.selected) {
        const range = sim.stats(t).range * T;
        g.fillStyle(0xffffff, 0.07);
        g.fillCircle(cx, cy, range);
        g.lineStyle(2, 0xffffff, 0.55);
        g.strokeCircle(cx, cy, range);
        g.lineStyle(2, 0xffd54f, 1);
        g.strokeRect(this.px(t.col) + 1, this.py(t.row) + 1, T - 2, T - 2);
      }
      if (ts.type === 'beam') {
        for (const bt of t.beamTargets || []) {
          if (bt.dead) continue;
          if (t.def.look === 'flamethrower') this.drawFlame(g, cx, cy, this.px(bt.x), this.py(bt.y), t.id, sim.time);
          else {
            g.lineStyle(4, hex(t.def.color), 0.35);
            g.lineBetween(cx, cy, this.px(bt.x), this.py(bt.y));
            g.lineStyle(2, 0xffffff, 0.9);
            g.lineBetween(cx, cy, this.px(bt.x), this.py(bt.y));
          }
        }
      }
    }

    // necromancer wards: the zone where zombies cannot die, and a thread to each zombie it is keeping alive
    for (const n of sim.enemies) {
      const w = abilityOf(n.def, 'ward');
      if (!w) continue;
      const nx = this.px(n.x);
      const ny = this.py(n.y);
      g.fillStyle(0x7a5ad0, 0.09);
      g.fillCircle(nx, ny, w.range * T);
      g.lineStyle(2, 0x9a7af0, 0.4);
      g.strokeCircle(nx, ny, w.range * T);
    }
    for (const e of sim.enemies) {
      const n = sim.protectorOf(e);
      if (!n) continue;
      g.lineStyle(1, 0x9a7af0, 0.55);
      g.lineBetween(this.px(e.x), this.py(e.y), this.px(n.x), this.py(n.y));
    }

    // enemies
    const zp = phaserPainter(g);
    for (const e of sim.enemies) {
      const x = this.px(e.x);
      const y = this.py(e.y);
      const r = (e.def.size || 0.3) * T;
      const fy = y - (e.def.flying ? 4 : 0);
      const pal = this.looks[e.def.id] || (this.looks[e.def.id] = resolveLook(e.def, this.variant, this.registry.get('data').variantsById));
      if (pal.look) {
        const ang = e.jump ? Math.atan2(e.jump.ty - e.jump.fy, e.jump.tx - e.jump.fx) : zombieAngle(e);
        const sf = this.screamAt[e.id] === undefined ? 0 : Math.max(0, 1 - (sim.time - this.screamAt[e.id]) / 0.8);
        drawZombie(zp, pal, x, fy, r * ZOMBIE_SCALE, { angle: ang, phase: zombiePhase(e), seed: e.id + 1, flying: !!e.def.flying, lift: e.lift, fx: sf, rank: this.rank });
        if (sim.protectorOf(e)) {
          g.lineStyle(2, 0x9a7af0, 0.85);
          g.strokeCircle(x, fy, r * ZOMBIE_SCALE + 5);
        }
      } else {
        if (e.def.flying) {
          g.fillStyle(0x000000, 0.25);
          g.fillCircle(x + 5, y + 9, r * 0.8);
        }
        g.fillStyle(hex(pal.skin), 1);
        drawShape(g, e.def.shape, x, fy, r);
      }
      if (e.slowFactor < 1) {
        g.lineStyle(2, 0x80deea, 0.9);
        g.strokeCircle(x, fy, (pal.look ? r * ZOMBIE_SCALE : r) + 3);
      }
      if (e.burnUntil > sim.time) {
        g.fillStyle(0xff9800, 0.95);
        g.fillCircle(x - r * 0.5, fy - r - 2, 3);
        g.fillStyle(0xffeb3b, 0.95);
        g.fillCircle(x + r * 0.2, fy - r - 4, 2.5);
        g.fillStyle(0xff5722, 0.95);
        g.fillCircle(x + r * 0.7, fy - r - 1, 2.2);
      }
      if (e.hp < e.maxHp) {
        const w = Math.max(T * 0.6, r * 2);
        const by = y - (pal.look ? r * ZOMBIE_SCALE : r) - 8 - (e.def.flying ? 4 : 0);
        g.fillStyle(0x000000, 0.6);
        g.fillRect(x - w / 2, by, w, 4);
        g.fillStyle(e.hp / e.maxHp > 0.5 ? 0x66bb6a : e.hp / e.maxHp > 0.25 ? 0xffca28 : 0xef5350, 1);
        g.fillRect(x - w / 2, by, w * Math.max(0, e.hp / e.maxHp), 4);
      }
    }

    // projectiles
    for (const p of sim.projectiles) this.drawProjectile(g, p);

    // effects
    for (const f of this.fx) {
      const k = 1 - f.life / f.max;
      const x = this.px(f.x);
      const y = this.py(f.y);
      if (f.kind === 'arc') {
        this.drawLightning(g, f);
      } else if (f.kind === 'ring') {
        const r = f.r * T * (0.3 + 0.7 * k);
        g.fillStyle(f.color, 0.25 * (1 - k));
        g.fillCircle(x, y, r);
        g.lineStyle(2, f.color, 0.8 * (1 - k));
        g.strokeCircle(x, y, r);
      } else {
        g.fillStyle(f.color, 1 - k);
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          g.fillCircle(x + Math.cos(a) * T * 0.5 * k, y + Math.sin(a) * T * 0.5 * k, 3 * (1 - k) + 0.5);
        }
      }
    }
  }

  // ---------- win / lose ----------

  showEnd() {
    this.ended = true;
    const sim = this.sim;
    const game = this.gd.game;
    const endless = this.mode === 'endless';
    const won = sim.status === 'won';
    const levels = this.gd.levels;
    const idx = levels.findIndex((l) => l.id === this.levelId);
    let save;
    let coins = 0;
    let title;
    let lines;
    let stars = 0;
    if (endless) {
      const reached = sim.waveIndex;
      const prevBest = recordEndless(this.levelId, reached);
      coins = endlessCoins(game, reached);
      title = 'GAME OVER';
      lines = ['Reached wave ' + reached + (reached > prevBest ? '   (new best!)' : '   (best ' + prevBest + ')'), 'Enemies defeated: ' + sim.kills, 'Score: ' + sim.score];
      save = loadSave();
    } else {
      stars = sim.stars();
      const prev = loadSave().levels[this.levelId] || {};
      save = recordResult(this.levelId, { won, stars, score: sim.score });
      const newBest = won && sim.score > (prev.bestScore || 0);
      if (won) coins = storyCoins(this.level, game, !!prev.completed);
      title = won ? 'AREA SECURED' : 'OVERRUN';
      lines = ['Score: ' + sim.score + (newBest ? '   (new best!)' : ''), 'Lives left: ' + sim.lives + ' / ' + sim.startLives, 'Enemies defeated: ' + sim.kills];
      if (!won) lines.push('Wave reached: ' + sim.waveIndex + ' / ' + sim.wavesTotal);
    }
    if (coins > 0) {
      addCoins(coins, game);
      lines.push('Coins earned: +' + coins);
    }
    const good = won || (endless && coins > 0);

    const d = 100;
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setDepth(d).setInteractive();
    this.add.rectangle(W / 2, H / 2, 520, 360, 0x1a212b).setStrokeStyle(3, good ? 0x66bb6a : 0xef5350).setDepth(d + 1);
    this.add.text(W / 2, H / 2 - 135, title, { fontFamily: FONT, fontSize: '38px', fontStyle: 'bold', color: good ? '#a5d6a7' : '#ef9a9a' }).setOrigin(0.5).setDepth(d + 2);
    if (won) this.add.text(W / 2, H / 2 - 80, '★'.repeat(stars) + '☆'.repeat(3 - stars), { fontFamily: FONT, fontSize: '48px', color: '#ffd54f' }).setOrigin(0.5).setDepth(d + 2);
    this.add.text(W / 2, H / 2 - 20, lines.join('\n'), { fontFamily: FONT, fontSize: '18px', color: '#cfd8e6', align: 'center', lineSpacing: 6 }).setOrigin(0.5, 0).setDepth(d + 2);

    const next = won && !endless ? levels[idx + 1] : null;
    const nextOk = next && storyUnlocked(levels, idx + 1, save);
    const btns = [['Replay', () => this.scene.restart({ levelId: this.levelId, mode: this.mode })], ['Levels', () => this.toMenu()]];
    if (nextOk) btns.push(['Next level ▶', () => this.scene.start('Game', { levelId: next.id, mode: 'story' })]);
    const bw = 140;
    const total = btns.length * bw + (btns.length - 1) * 12;
    btns.forEach(([label, fn], i) => {
      makeButton(this, W / 2 - total / 2 + i * (bw + 12), H / 2 + 120, bw, 44, label, fn, { depth: d + 3, size: 17 });
    });
    if (next && !nextOk) {
      this.add.text(W / 2, H / 2 + 92, 'The next level still has an extra requirement - check the level select.', { fontFamily: FONT, fontSize: '13px', color: '#9fb0c8' }).setOrigin(0.5).setDepth(d + 2);
    }
  }
}
