// The Team screen: buy towers, buy every upgrade tier, and choose who goes into battle.
import { loadSave, buyTower, buyTier, setTeam } from '../core/save.js';
import { coinsOf, ownedIds, teamIds, towerPrice, tierPrice, unlockedTiers, tierState } from '../core/game.js';
import { attackAt, migrateTower, describeTier, DEFAULT_RULES } from '../core/sim.js';
import { drawTowerIcon } from './draw.js';
import { makeButton, addHeader } from './ui.js';

const FONT = 'system-ui, sans-serif';
const PATH_COLORS = [0xef5350, 0x42a5f5, 0x66bb6a];
const PATH_TEXT = ['#ef5350', '#42a5f5', '#66bb6a'];
const PER_PAGE = 12;
const r1 = (x) => Math.round(x * 10) / 10;

// left column: team slots + tower list; right column: the selected tower
const LX = 40;
const LW = 660;
const DX = 730;
const DW = 510;

/** One-line summary of a tower's base attack. */
export function towerBlurb(def) {
  const a = attackAt(migrateTower(def), [0, 0, 0]);
  const hits = a.hitsAir !== false && a.hitsGround !== false ? 'air + ground' : a.hitsAir !== false ? 'air only' : 'ground only';
  if (a.type === 'income') return 'Earns $' + r1(a.income) + ' every ' + r1(a.cooldown) + 's during waves  ·  Range ' + r1(a.range);
  const dmg = a.type === 'beam' ? 'Beam ' + r1(a.damage) + '/s' : (a.type === 'pulse' ? 'Pulse ' : a.type === 'arc' ? 'Shock ' : 'Damage ') + r1(a.damage);
  return dmg + '  ·  Range ' + r1(a.range) + '  ·  ' + hits;
}

export class TeamScene extends Phaser.Scene {
  constructor() {
    super('Team');
    this.selId = null;
    this.page = 0;
  }

  init(data) {
    if (data && data.sel) this.selId = data.sel;
    if (data && data.page) this.page = data.page;
  }

  create() {
    const gd = (this.gd = this.registry.get('data'));
    this.game_ = gd.game;
    const save = (this.save = loadSave());
    this.coins = coinsOf(save, this.game_);
    this.owned = ownedIds(gd.towers, save);
    this.team = teamIds(gd.towers, save, this.game_);
    if (!this.selId || !gd.towers.some((t) => t.id === this.selId)) this.selId = this.team[0] || (gd.towers[0] && gd.towers[0].id) || null;
    this.msg = '';
    addHeader(this, 'TEAM', { sub: 'Buy towers and their upgrades, then choose who fights.', onBack: () => this.scene.start('Home'), backLabel: 'Home', coins: this.coins });
    this.layer = [];
    this.render();
  }

  def(id) {
    return this.gd.towers.find((t) => t.id === id);
  }

  again(sel = this.selId) {
    this.scene.restart({ sel, page: this.page });
  }

  // ---------- actions ----------

  /** Writes the current team to the save, so later purchases never reshuffle it. */
  lockTeam() {
    if (!Array.isArray(this.save.team)) setTeam(this.team);
  }

  toggleTeam(id) {
    const i = this.team.indexOf(id);
    if (i >= 0) this.team.splice(i, 1);
    else if (this.team.length < this.game_.teamSlots) this.team.push(id);
    else {
      this.msg = 'Team is full. Remove a tower from a slot first.';
      this.selId = id;
      this.render();
      return;
    }
    setTeam(this.team);
    this.again(id);
  }

  buyTowerNow(d) {
    this.lockTeam();
    if (!buyTower(d.id, towerPrice(d), this.game_)) return;
    const team = teamIds(this.gd.towers, loadSave(), this.game_);
    if (team.length < this.game_.teamSlots && !team.includes(d.id)) setTeam(team.concat(d.id)); // free slot: the new tower joins
    this.again(d.id);
  }

  buyTierNow(d, pi, ti) {
    if (!this.owned.includes(d.id)) return;
    const tier = migrateTower(d).paths[pi].tiers[ti];
    if (tierState(d, pi, ti, this.save) !== 'buy') return;
    if (!buyTier(d.id, pi, ti, tierPrice(tier), this.game_)) return;
    this.again(d.id);
  }

  // ---------- drawing ----------

  render() {
    for (const o of this.layer) o.destroy();
    this.layer = [];
    const keep = (o) => {
      this.layer.push(o);
      return o;
    };
    const gd = this.gd;
    const slots = this.game_.teamSlots;

    // team slots
    keep(this.add.text(LX, 100, 'YOUR TEAM   ' + this.team.length + ' / ' + slots, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#7f90a8' }));
    const sw = Math.min(150, Math.floor((LW - (slots - 1) * 10) / slots));
    for (let i = 0; i < slots; i++) {
      const x = LX + i * (sw + 10);
      const y = 122;
      const id = this.team[i];
      const d = id && this.def(id);
      const bg = keep(this.add.rectangle(x + sw / 2, y + 42, sw, 84, d ? 0x1c2a22 : 0x161b23).setStrokeStyle(2, d ? 0x3f6b4d : 0x2a3340));
      if (d) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', () => this.toggleTeam(id)); // click a slot to take the tower out
        const g = keep(this.add.graphics());
        drawTowerIcon(g, d, x + sw / 2, y + 28, 16);
        keep(this.add.text(x + sw / 2, y + 54, d.name, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#e8eef7', align: 'center', wordWrap: { width: sw - 8 } }).setOrigin(0.5, 0));
      } else {
        keep(this.add.text(x + sw / 2, y + 42, 'Empty', { fontFamily: FONT, fontSize: '14px', color: '#4a5a70' }).setOrigin(0.5));
      }
    }
    if (this.msg) keep(this.add.text(LX, 214, this.msg, { fontFamily: FONT, fontSize: '14px', color: '#ef9a9a' }));
    else if (!this.team.length) keep(this.add.text(LX, 214, 'Empty team: levels will pick towers for you.', { fontFamily: FONT, fontSize: '14px', color: '#ffb74d' }));

    // tower list
    keep(this.add.text(LX, 240, 'TOWERS   click one to see its upgrades', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#7f90a8' }));
    const pages = Math.max(1, Math.ceil(gd.towers.length / PER_PAGE));
    this.page = Math.max(0, Math.min(pages - 1, this.page));
    const CW = (LW - 10) / 2;
    const CH = 58;
    gd.towers.slice(this.page * PER_PAGE, this.page * PER_PAGE + PER_PAGE).forEach((d, i) => {
      const x = LX + (i % 2) * (CW + 10);
      const y = 262 + Math.floor(i / 2) * (CH + 8);
      const have = this.owned.includes(d.id);
      const inTeam = this.team.includes(d.id);
      const sel = d.id === this.selId;
      const bg = keep(this.add.rectangle(x + CW / 2, y + CH / 2, CW, CH, have ? (inTeam ? 0x1c2a22 : 0x1f2733) : 0x181d26).setStrokeStyle(sel ? 3 : 2, sel ? 0xffd54f : inTeam ? 0x66bb6a : 0x4a5a70).setInteractive({ useHandCursor: true }));
      bg.on('pointerdown', () => {
        this.selId = d.id;
        this.msg = '';
        this.again(d.id);
      });
      const g = keep(this.add.graphics());
      drawTowerIcon(g, d, x + 28, y + CH / 2, 14, { alpha: have ? 1 : 0.45 });
      keep(this.add.text(x + 54, y + 8, d.name, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: have ? '#e8eef7' : '#8a98ad' }));
      const total = (migrateTower(d).paths || []).reduce((n, p) => n + p.tiers.length, 0);
      const got = unlockedTiers(d, this.save).reduce((n, k) => n + k, 0);
      keep(this.add.text(x + 54, y + 33, have ? (inTeam ? '✔ On team' : 'Owned') + (total ? '  ·  upgrades ' + got + '/' + total : '') : 'Not owned', { fontFamily: FONT, fontSize: '13px', color: have ? (inTeam ? '#81c784' : '#9fb0c8') : '#7f90a8' }));
      this.actionButton(keep, d, x + CW - 108, y + 12, 98, 34, 14);
    });
    if (pages > 1) {
      const prev = keep(makeButton(this, LX, 676, 100, 30, '◀ Prev', () => { this.page--; this.again(); }, { size: 14 }));
      const next = keep(makeButton(this, LX + 110, 676, 100, 30, 'Next ▶', () => { this.page++; this.again(); }, { size: 14 }));
      prev.setEnabled(this.page > 0);
      next.setEnabled(this.page < pages - 1);
      keep(this.add.text(LX + 226, 683, 'Page ' + (this.page + 1) + ' / ' + pages, { fontFamily: FONT, fontSize: '14px', color: '#9fb0c8' }));
    }

    this.renderDetail(keep);
  }

  /** Buy (not owned) or Add / Remove (owned) button for a tower. */
  actionButton(keep, d, x, y, w, h, size) {
    const have = this.owned.includes(d.id);
    if (have) {
      const inTeam = this.team.includes(d.id);
      const b = keep(makeButton(this, x, y, w, h, inTeam ? 'Remove' : 'Add', () => this.toggleTeam(d.id), { size, fill: inTeam ? 0x4a2d2d : 0x2c5d3a, hover: inTeam ? 0x633a3a : 0x37754a }));
      return b;
    }
    const price = towerPrice(d);
    const b = keep(makeButton(this, x, y, w, h, 'Buy ●' + price, () => this.buyTowerNow(d), { size, fill: 0x2c5d3a, hover: 0x37754a }));
    b.setEnabled(this.coins >= price);
    return b;
  }

  renderDetail(keep) {
    const d = this.selId && this.def(this.selId);
    keep(this.add.rectangle(DX + DW / 2, 100 + 300, DW, 600, 0x161b23).setStrokeStyle(2, 0x2a3340));
    if (!d) return;
    const m = migrateTower(d);
    const have = this.owned.includes(d.id);
    const px = DX + 16;
    const g = keep(this.add.graphics());
    drawTowerIcon(g, d, px + 20, 142, 18, { angle: -0.35 });
    keep(this.add.text(px + 52, 118, d.name, { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#e8eef7' }));
    keep(this.add.text(px + 52, 150, towerBlurb(d) + '  ·  $' + d.cost + ' to place', { fontFamily: FONT, fontSize: '13px', color: '#9fb0c8' }));
    this.actionButton(keep, d, DX + DW - 16 - 120, 116, 120, 34, 16);
    if (!have && this.coins < towerPrice(d)) keep(this.add.text(DX + DW - 16, 154, 'Need ' + (towerPrice(d) - this.coins) + ' more', { fontFamily: FONT, fontSize: '13px', color: '#ef9a9a' }).setOrigin(1, 0));

    const paths = m.paths || [];
    keep(this.add.text(px, 184, 'UPGRADES   bought with coins, one tier at a time', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#7f90a8' }));
    if (!paths.length) {
      keep(this.add.text(px, 212, 'This tower has no upgrades.', { fontFamily: FONT, fontSize: '15px', color: '#9fb0c8' }));
      return;
    }
    if (!have) keep(this.add.text(px, 204, 'Buy the tower first to unlock its upgrades.', { fontFamily: FONT, fontSize: '13px', color: '#ffb74d' }));

    const inner = DW - 32;
    const n = paths.length;
    const colW = Math.floor((inner - (n - 1) * 10) / n);
    const most = Math.max(...paths.map((p) => p.tiers.length));
    const boxH = Math.max(38, Math.min(52, Math.floor(270 / Math.max(1, most)) - 6));
    const y0 = 252;
    const info = keep(this.add.text(px, y0 + most * (boxH + 6) + 14, '', { fontFamily: FONT, fontSize: '14px', color: '#cfd8e6', wordWrap: { width: inner }, lineSpacing: 4 }));
    const idle = 'Hover a tier to read what it does. Click the highlighted tier to buy it.';
    info.setText(idle);
    const rules = { ...DEFAULT_RULES, ...(d.upgradeRules || {}) };
    keep(this.add.text(px, 660, 'In battle a tower can use at most ' + rules.maxPaths + ' paths, and only one path may go past tier ' + rules.secondaryMax + '.', { fontFamily: FONT, fontSize: '12px', color: '#7f90a8', wordWrap: { width: inner } }));

    paths.forEach((p, pi) => {
      const x = px + pi * (colW + 10);
      keep(this.add.text(x, 226, p.name || 'Path ' + (pi + 1), { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: PATH_TEXT[pi], wordWrap: { width: colW } }));
      p.tiers.forEach((tier, ti) => {
        const y = y0 + ti * (boxH + 6);
        const st = tierState(d, pi, ti, this.save);
        const price = tierPrice(tier);
        const afford = this.coins >= price;
        const live = have && st === 'buy';
        const edge = st === 'owned' ? 0x66bb6a : 0xe57373; // green outline once bought, red until then
        const bg = keep(this.add.rectangle(x + colW / 2, y + boxH / 2, colW, boxH, st === 'owned' ? 0x1c2a22 : 0x1b212b).setStrokeStyle(3, edge));
        bg.setInteractive({ useHandCursor: live && afford });
        bg.on('pointerdown', () => this.buyTierNow(d, pi, ti));
        bg.on('pointerover', () => {
          let note = '';
          if (st === 'owned') note = 'Bought.';
          else if (!have) note = 'Buy the tower first.';
          else if (st === 'later') note = 'Buy the earlier tiers on this path first.';
          else note = afford ? 'Click to buy for ' + price + ' coins.' : 'Needs ' + (price - this.coins) + ' more coins.';
          info.setText((p.name || 'Path ' + (pi + 1)) + ' · tier ' + (ti + 1) + ': ' + (tier.name || '') + '\n' + (describeTier(tier) || '(no stat change)') + '\nIn battle it costs $' + (tier.cost || 0) + '.   ' + note);
        });
        bg.on('pointerout', () => info.setText(idle));
        const dim = !have || st === 'later';
        keep(this.add.rectangle(x + 5, y + boxH / 2, 4, boxH - 12, PATH_COLORS[pi]).setAlpha(dim ? 0.25 : 1));
        keep(this.add.text(x + 14, y + 5, tier.name || 'Tier ' + (ti + 1), { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: dim ? '#6f7d92' : '#e8eef7', wordWrap: { width: colW - 20 }, maxLines: 1 }));
        const label = st === 'owned' ? '✔ Bought' : price === 0 ? 'Free' : '●' + price;
        const col = st === 'owned' ? '#81c784' : live ? (afford ? '#ffd54f' : '#ef9a9a') : '#6f7d92';
        keep(this.add.text(x + 14, y + boxH - 20, label, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: col }));
      });
    });
  }
}
