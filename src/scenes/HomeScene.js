import { loadSave, resetSave } from '../core/save.js';
import { coinsOf, storyUnlocked, ownedIds, teamIds } from '../core/game.js';
import { drawTowerIcon } from './draw.js';
import { makeButton } from './ui.js';

const FONT = 'system-ui, sans-serif';
const CARD_W = 380;
const CARD_H = 230;
const GAP = 24;

export class HomeScene extends Phaser.Scene {
  constructor() {
    super('Home');
  }

  create() {
    const gd = (this.gd = this.registry.get('data'));
    const save = loadSave();
    const game = gd.game;
    const levels = gd.levels;

    this.add.text(640, 96, 'ZOMBIE DEFENSE', { fontFamily: FONT, fontSize: '58px', fontStyle: 'bold', color: '#e8eef7' }).setOrigin(0.5);
    this.add.text(640, 148, 'Hold the line.', { fontFamily: FONT, fontSize: '20px', color: '#9fb0c8' }).setOrigin(0.5);
    if (this.scale && this.scale.fullscreen && this.scale.fullscreen.available) makeButton(this, 24, 20, 130, 36, '⛶ Fullscreen', () => this.scale.toggleFullscreen(), { size: 15 });
    this.add.text(1256, 24, '● ' + coinsOf(save, game) + ' coins', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffd54f' }).setOrigin(1, 0);

    // numbers for the section subtitles
    let stars = 0;
    let cleared = 0;
    for (const l of levels) {
      const r = save.levels[l.id];
      if (r) stars += r.stars || 0;
      if (r && r.completed) cleared++;
    }
    const open = levels.filter((l, i) => storyUnlocked(levels, i, save));
    let bestWave = 0;
    for (const id in save.endless || {}) bestWave = Math.max(bestWave, save.endless[id]);
    const owned = ownedIds(gd.towers, save);
    const unowned = gd.towers.length - owned.length;
    const team = teamIds(gd.towers, save, game);

    const sections = [
      { key: 'story', title: 'STORY MODE', desc: 'Fight through the levels in order.', info: levels.length ? cleared + ' of ' + levels.length + ' levels cleared   ★ ' + stars + ' / ' + levels.length * 3 : 'No levels yet', go: () => this.scene.start('Menu', { mode: 'story' }) },
      { key: 'free', title: 'FREE PLAY', desc: 'Endless waves on any level you have reached.', info: bestWave ? 'Best: wave ' + bestWave : open.length ? open.length + ' level' + (open.length === 1 ? '' : 's') + ' available' : 'Clear a level in Story Mode first', go: () => this.scene.start('Menu', { mode: 'endless' }) },
      { key: 'team', title: 'TEAM', desc: 'Buy towers and upgrades with coins, then pick who you bring into battle.', info: team.length + ' / ' + game.teamSlots + ' on the team' + (unowned ? '   ·   ' + unowned + ' tower' + (unowned === 1 ? '' : 's') + ' to buy' : ''), go: () => this.scene.start('Team') },
    ];
    const x0 = (1280 - (3 * CARD_W + 2 * GAP)) / 2;
    const y0 = 230;
    sections.forEach((s, i) => {
      const x = x0 + i * (CARD_W + GAP);
      const y = y0;
      const bg = this.add.rectangle(x + CARD_W / 2, y + CARD_H / 2, CARD_W, CARD_H, 0x1f2733).setStrokeStyle(2, 0x4a5a70).setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(0x2a3646));
      bg.on('pointerout', () => bg.setFillStyle(0x1f2733));
      bg.on('pointerdown', s.go);
      this.add.text(x + 26, y + 22, s.title, { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#e8eef7' });
      this.add.text(x + 26, y + 70, s.desc, { fontFamily: FONT, fontSize: '16px', color: '#9fb0c8', wordWrap: { width: CARD_W - 52 } });
      this.add.text(x + 26, y + 150, s.info, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#ffd54f', wordWrap: { width: CARD_W - 52 } });
      if (s.key === 'team') {
        const g = this.add.graphics();
        team.forEach((id, k) => {
          const def = gd.towers.find((t) => t.id === id);
          if (!def) return;
          drawTowerIcon(g, def, x + CARD_W - 26 - (team.length - 1 - k) * 30, y + 36, 11);
        });
      }
    });

    this.resetArmed = false;
    this.resetBtn = makeButton(this, 24, 664, 190, 34, 'Reset progress', () => {
      if (!this.resetArmed) {
        this.resetArmed = true;
        this.resetBtn.setLabel('Click again to confirm');
        this.time.delayedCall(3000, () => {
          this.resetArmed = false;
          this.resetBtn.setLabel('Reset progress');
        });
      } else {
        resetSave();
        this.scene.restart();
      }
    }, { size: 14 });
  }
}
