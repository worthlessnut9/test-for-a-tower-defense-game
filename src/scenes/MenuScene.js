import { loadSave } from '../core/save.js';
import { coinsOf, storyUnlocked, storyMissing, groupByAct, actSummary } from '../core/game.js';
import { drawTerrain, zoneFor, levelPathMap } from '../core/terrain.js';
import { makeButton, addHeader } from './ui.js';
import { phaserPainter } from './draw.js';

const FONT = 'system-ui, sans-serif';
const COLS = 5;
const PER_PAGE = 10;
const CARD_W = 224;
const CARD_H = 214;
const GAP = 16;
const TOP = 134; // where the first row of level cards starts
export const OTHER_ACT = '__other'; // story group for levels with no (or an unknown) act

const hexNum = (s) => parseInt(String(s || '#6aa7e0').replace('#', ''), 16);

/** The Menu act key a level belongs to (undefined when the game has no acts at all). */
export function actKeyOf(gd, level) {
  if (!gd.acts || !gd.acts.length) return undefined;
  return gd.actsById && gd.actsById[level.act] ? level.act : OTHER_ACT;
}

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
    this.page = 0;
    this.mode = 'story';
    this.actKey = undefined;
  }

  init(data) {
    this.mode = data && data.mode === 'endless' ? 'endless' : 'story';
    this.actKey = this.mode === 'story' && data ? data.act : undefined;
    this.page = 0;
  }

  /** Story shows every level in order (inside the chosen act). Free Play shows only the levels the story has opened. */
  entries() {
    const levels = this.gd.levels;
    if (this.mode === 'endless') return levels.map((level, index) => ({ level, index, open: storyUnlocked(levels, index, this.save) })).filter((e) => e.open);
    const src = this.group ? this.group.entries : levels.map((level, index) => ({ level, index }));
    return src.map(({ level, index }) => ({ level, index, open: storyUnlocked(levels, index, this.save) }));
  }

  create() {
    this.gd = this.registry.get('data');
    this.save = loadSave();
    const endless = this.mode === 'endless';
    const levels = this.gd.levels;
    this.groups = endless ? [] : groupByAct(levels, this.gd.acts);
    const hasActs = this.groups.some((g) => g.act);
    this.group = null;
    if (hasActs && this.actKey !== undefined) this.group = this.groups.find((g) => (g.act ? g.act.id : OTHER_ACT) === this.actKey) || null;
    this.view = hasActs && !this.group ? 'acts' : 'levels';

    let total = 0;
    for (const id in this.save.levels) total += this.save.levels[id].stars || 0;
    const max = levels.length * 3;
    const coins = coinsOf(this.save, this.gd.game);
    this.cardLayer = [];

    if (this.view === 'acts') {
      addHeader(this, 'STORY MODE', { sub: 'Choose an act      ★ ' + total + ' / ' + max, onBack: () => this.scene.start('Home'), backLabel: 'Home', coins });
      this.renderActs();
      return;
    }

    const g = this.group;
    const actNo = g && g.act ? this.gd.acts.findIndex((a) => a.id === g.act.id) + 1 : 0;
    addHeader(this, endless ? 'FREE PLAY' : g ? (actNo ? 'ACT ' + actNo : 'OTHER LEVELS') : 'STORY MODE', {
      sub: endless ? 'Endless waves: how far can you get?' : g ? (g.act ? g.act.name : 'Levels without an act') : 'Clear each level to open the next      ★ ' + total + ' / ' + max,
      onBack: () => this.scene.start(g ? 'Menu' : 'Home', g ? { mode: 'story' } : undefined),
      backLabel: g ? 'Acts' : 'Home',
      coins,
    });
    if (g && g.act && g.act.description) {
      this.add.text(640, 100, g.act.description, { fontFamily: FONT, fontSize: '13px', color: '#9fb0c8', align: 'center', wordWrap: { width: 1000 } }).setOrigin(0.5, 0);
    }
    this.list = this.entries();

    if (!this.list.length) {
      const none = !levels.length;
      this.add.text(640, 330, none ? 'No levels yet' : 'No levels unlocked yet', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#e8eef7' }).setOrigin(0.5);
      this.add.text(640, 400, none ? 'Design levels in the Level Workshop, copy the exported files into the levels/ folder\n(including levels/index.json), then reload this page.' : 'Open the first level in Story Mode, then come back.', { fontFamily: FONT, fontSize: '18px', color: '#9fb0c8', align: 'center', lineSpacing: 6 }).setOrigin(0.5);
      return;
    }

    this.renderPage();
    const pages = Math.ceil(this.list.length / PER_PAGE);
    if (pages > 1) {
      this.prev = makeButton(this, 440, 650, 120, 40, '◀ Prev', () => this.flip(-1));
      this.next = makeButton(this, 720, 650, 120, 40, 'Next ▶', () => this.flip(1));
      this.pageText = this.add.text(640, 670, '', { fontFamily: FONT, fontSize: '16px', color: '#9fb0c8' }).setOrigin(0.5);
      this.updatePager();
    }
  }

  flip(d) {
    const pages = Math.ceil(this.list.length / PER_PAGE);
    this.page = Math.max(0, Math.min(pages - 1, this.page + d));
    this.renderPage();
    this.updatePager();
  }

  updatePager() {
    if (!this.prev) return;
    const pages = Math.ceil(this.list.length / PER_PAGE);
    this.prev.setEnabled(this.page > 0);
    this.next.setEnabled(this.page < pages - 1);
    this.pageText.setText('Page ' + (this.page + 1) + ' / ' + pages);
  }

  // ---------- act picker ----------

  renderActs() {
    const levels = this.gd.levels;
    const n = this.groups.length;
    const gap = 12;
    const h = Math.min(104, Math.floor((560 - (n - 1) * gap) / n));
    this.groups.forEach((group, i) => {
      const y = 112 + i * (h + gap);
      const x = 70;
      const w = 1140;
      const sum = actSummary(group, levels, this.save);
      const act = group.act;
      const color = act ? hexNum(act.color) : 0x6b7787;
      const cssColor = act ? act.color : '#9fb0c8';
      const open = sum.open;
      const bg = this.add.rectangle(x + w / 2, y + h / 2, w, h, open ? 0x1f2733 : 0x171b22).setStrokeStyle(2, open ? 0x4a5a70 : 0x2a313c);
      this.add.rectangle(x + 6, y + h / 2, 12, h, color).setAlpha(open ? 1 : 0.35);
      if (open) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => bg.setFillStyle(0x2a3646));
        bg.on('pointerout', () => bg.setFillStyle(0x1f2733));
        bg.on('pointerdown', () => this.scene.start('Menu', { mode: 'story', act: act ? act.id : OTHER_ACT }));
      }
      const no = act ? this.gd.acts.findIndex((a) => a.id === act.id) + 1 : 0;
      this.add.text(x + 30, y + 10, no ? 'ACT ' + no : 'EXTRA', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: open ? cssColor : '#5a6573' });
      this.add.text(x + 30, y + 28, act ? act.name : 'Other levels', { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: open ? '#e8eef7' : '#6b7787', wordWrap: { width: 780 } });
      if (act && act.description && h >= 84) this.add.text(x + 30, y + 62, act.description, { fontFamily: FONT, fontSize: '13px', color: open ? '#9fb0c8' : '#586270', wordWrap: { width: 780 }, maxLines: 2 });
      if (open) {
        this.add.text(x + w - 24, y + 16, sum.cleared + ' / ' + sum.total + ' cleared', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#e8eef7' }).setOrigin(1, 0);
        this.add.text(x + w - 24, y + 46, '★ ' + sum.stars + ' / ' + sum.maxStars, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#ffd54f' }).setOrigin(1, 0);
      } else {
        const names = {};
        for (const l of levels) names[l.id] = l.name;
        this.add.text(x + w - 24, y + 14, 'LOCKED', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#ff8a80' }).setOrigin(1, 0);
        this.add.text(x + w - 24, y + 34, storyMissing(levels, group.entries[0].index, this.save, names).join('\n'), { fontFamily: FONT, fontSize: '13px', color: '#c9a0a0', align: 'right', wordWrap: { width: 300 } }).setOrigin(1, 0);
      }
    });
  }

  // ---------- level cards ----------

  renderPage() {
    for (const o of this.cardLayer) o.destroy();
    this.cardLayer = [];
    const names = {};
    for (const l of this.gd.levels) names[l.id] = l.name;
    const startX = (1280 - (COLS * CARD_W + (COLS - 1) * GAP)) / 2;
    const items = this.list.slice(this.page * PER_PAGE, this.page * PER_PAGE + PER_PAGE);
    items.forEach((e, i) => {
      const x = startX + (i % COLS) * (CARD_W + GAP);
      const y = TOP + Math.floor(i / COLS) * (CARD_H + GAP);
      this.card(e.level, e.index, x, y, e.open, e.open ? [] : storyMissing(this.gd.levels, e.index, this.save, names));
    });
  }

  card(level, index, x, y, unlocked, missing) {
    const add = (o) => {
      this.cardLayer.push(o);
      return o;
    };
    const rec = this.save.levels[level.id] || {};
    const bg = add(this.add.rectangle(x + CARD_W / 2, y + CARD_H / 2, CARD_W, CARD_H, unlocked ? 0x1f2733 : 0x171b22).setStrokeStyle(2, unlocked ? 0x4a5a70 : 0x2a313c));
    if (unlocked) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(0x2a3646));
      bg.on('pointerout', () => bg.setFillStyle(0x1f2733));
      bg.on('pointerdown', () => this.scene.start('Game', { levelId: level.id, mode: this.mode }));
    }

    // mini map preview
    const g = add(this.add.graphics());
    const s = Math.min((CARD_W - 24) / level.cols, 72 / level.rows);
    const mw = s * level.cols;
    const mx = x + (CARD_W - mw) / 2;
    const my = y + 10;
    const dim = unlocked ? 1 : 0.35;
    drawTerrain(phaserPainter(g, dim), zoneFor(level, this.gd.zonesById), level.tiles, levelPathMap(level), mx, my, s);

    add(this.add.text(x + 12, y + 90, (index + 1) + '. ' + level.name, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: unlocked ? '#e8eef7' : '#6b7787', wordWrap: { width: CARD_W - 24 }, maxLines: 2 }));
    if (unlocked) {
      add(this.add.text(x + 12, y + 134, level.description || '', { fontFamily: FONT, fontSize: '12px', color: '#9fb0c8', wordWrap: { width: CARD_W - 24 }, maxLines: 2 }));
      if (this.mode === 'endless') {
        const best = (this.save.endless || {})[level.id] || 0;
        add(this.add.text(x + 12, y + CARD_H - 32, best ? 'Best: wave ' + best : 'Not played yet', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffd54f' }));
      } else {
        const st = rec.stars || 0;
        add(this.add.text(x + 12, y + CARD_H - 38, '★'.repeat(st) + '☆'.repeat(3 - st), { fontFamily: FONT, fontSize: '24px', color: '#ffd54f' }));
        if (rec.completed) add(this.add.text(x + CARD_W - 12, y + CARD_H - 28, 'Best ' + rec.bestScore, { fontFamily: FONT, fontSize: '13px', color: '#9fb0c8' }).setOrigin(1, 0));
      }
    } else {
      add(this.add.text(x + 12, y + 134, 'LOCKED', { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#ff8a80' }));
      add(this.add.text(x + 12, y + 150, missing.join('\n'), { fontFamily: FONT, fontSize: '12px', color: '#c9a0a0', wordWrap: { width: CARD_W - 24 } }));
    }
  }
}
