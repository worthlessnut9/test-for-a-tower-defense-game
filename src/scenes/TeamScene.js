// The Team screen: buy towers, buy every upgrade tier, and choose who goes into battle.
import { loadSave, buyTower, buyTier, setTeam, seenIds } from '../core/save.js';
import { coinsOf, ownedIds, teamIds, towerPrice, tierPrice, unlockedTiers, tierState } from '../core/game.js';
import { attackAt, migrateTower, describeTier, scaleEnemy, abilityOf, deathSpawns, MAX_TIER, DEFAULT_RULES } from '../core/sim.js';
import { resolveLook, drawZombie, ZOMBIE_SCALE } from '../core/zombie.js';
import { drawTowerIcon, drawShape, phaserPainter, hex } from './draw.js';
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

const plural = (name, n) => (n > 1 ? name + 's' : name);
const list = (parts) => (parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0] || '');

/** Short tags for what makes a zombie special ("Flying", "Splits on death"...). Empty for a plain zombie. */
export function zombieTags(def) {
  const t = [];
  if (def.flying) t.push('Flying');
  if (def.armor >= 0.2) t.push('Armored');
  if (def.regen > 0) t.push('Regenerates');
  if (def.statusImmune) t.push('Status-immune');
  else if (def.slowImmune) t.push('Slow-immune');
  if (deathSpawns(def).length) t.push('Splits on death');
  if (def.scream) t.push('Screams');
  if (def.leap) t.push('Leaps');
  if (def.ward) t.push('Wards others');
  if (def.summon) t.push('Summons');
  return t;
}

/** One-line stats for the zombie list. */
export function zombieBlurb(def) {
  return 'HP ' + Math.round(def.health) + '  ·  Speed ' + def.speed.toFixed(1) + '  ·  $' + Math.round(def.reward || 0);
}

/** Plain-language lines that say what a zombie does. `nameOf(id)` turns an enemy id into its name. */
export function zombieNotes(def, nameOf = (id) => id) {
  const n = [];
  if (def.flying) n.push('Flies over the field. Only towers that can hit air can shoot it.');
  if (def.armor > 0) n.push('Armor ' + Math.round(def.armor * 100) + '%: it ignores that share of every hit. Poison and burn ignore armor.');
  if (def.regen > 0) n.push('Heals ' + r1(def.regen) + ' health every second.');
  if (def.statusImmune) n.push('Immune to every status effect: slow, burn and poison do nothing. Only direct damage hurts it.');
  else if (def.slowImmune) n.push('Cannot be slowed.');
  const drops = deathSpawns(def);
  if (drops.length) n.push('When it dies it spawns ' + list(drops.map((x) => x.count + ' ' + plural(nameOf(x.enemy), x.count))) + '.');
  const sc = abilityOf(def, 'scream');
  if (sc) n.push('Every ' + r1(sc.interval) + 's it screams: towers within ' + r1(sc.range) + ' tiles must shoot it for ' + r1(sc.duration) + 's.');
  const lp = abilityOf(def, 'leap');
  if (lp) n.push('Every ' + r1(lp.cooldown) + 's it leaps up to ' + r1(lp.range) + ' tiles ahead along the path.');
  const wd = abilityOf(def, 'ward');
  if (wd) n.push('Zombies within ' + r1(wd.range) + ' tiles of it cannot die.');
  const sm = abilityOf(def, 'summon');
  if (sm) n.push('Every ' + r1(sm.interval) + 's it calls up to ' + sm.max + ' more zombies' + (sm.enemies.length ? ' (' + list(sm.enemies.map((x) => x.count + ' ' + plural(nameOf(x.enemy), x.count))) + ' per call, no reward)' : '') + '.');
  if (!n.length) n.push('No special ability.');
  return n;
}

const speedWord = (v) => (v < 0.7 ? 'very slow' : v < 1 ? 'slow' : v < 1.3 ? 'average' : v < 2 ? 'fast' : 'very fast');

/** True when the tower is owned and one of its next tiers can be bought with the coins at hand. */
export function hasBuyableTier(d, save, coins, owned) {
  if (!owned) return false;
  return (migrateTower(d).paths || []).some((p, pi) => p.tiers.some((tier, ti) => tierState(d, pi, ti, save) === 'buy' && coins >= tierPrice(tier)));
}

export class TeamScene extends Phaser.Scene {
  constructor() {
    super('Team');
    this.selId = null;
    this.page = 0;
    this.view = 'towers';
    this.zsel = null;
    this.zpage = 0;
  }

  init(data) {
    this.tierPick = null; // touch: the tier that was tapped once and is waiting for a second tap to buy
    if (data && data.sel) this.selId = data.sel;
    if (data && data.page) this.page = data.page;
    this.view = (data && data.view) || 'towers'; // 'towers' or 'zombies'
    this.zsel = (data && data.zsel) || null;
    this.zpage = (data && data.zpage) || 0;
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
    const zs = this.metZombies();
    if (!this.zsel || !zs.some((z) => z.id === this.zsel)) this.zsel = zs[0] ? zs[0].id : null;
    addHeader(this, 'TEAM', { sub: this.view === 'zombies' ? 'The zombies you have met, and what each one does.' : 'Buy towers and their upgrades, then choose who fights.', onBack: () => this.scene.start('Home'), backLabel: 'Home', coins: this.coins });
    const tabs = [['towers', 'Towers', 164], ['zombies', 'Zombies', 284]];
    for (const [v, label, x] of tabs) {
      const on = this.view === v;
      makeButton(this, x, 20, 110, 36, label, () => { if (!on) this.scene.restart({ sel: this.selId, page: this.page, view: v, zsel: this.zsel, zpage: this.zpage }); }, { size: 15, fill: on ? 0x35507a : 0x2b3544, stroke: on ? 0xffd54f : 0x4a5a70 });
    }
    this.layer = [];
    this.render();
  }

  /** The zombies the player has met in a level so far; the rest stay hidden. */
  metZombies() {
    const seen = seenIds(this.save);
    return (this.gd.enemies || []).filter((z) => seen.includes(z.id));
  }

  def(id) {
    return this.gd.towers.find((t) => t.id === id);
  }

  again(sel = this.selId) {
    this.scene.restart({ sel, page: this.page, view: this.view, zsel: this.zsel, zpage: this.zpage });
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

  /** A tap or click on a tier. With a finger (no hover) the first tap shows what the tier does and the second tap buys it. */
  tapTier(d, pi, ti, touch) {
    if (touch) {
      this.registry.set('touch', true);
      const key = d.id + ':' + pi + ':' + ti;
      if (this.tierPick !== key) {
        this.tierPick = key;
        this.render();
        return;
      }
      this.tierPick = null;
    }
    this.buyTierNow(d, pi, ti);
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
    if (this.view === 'zombies') {
      this.renderZombies(keep);
      return;
    }
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
    keep(this.add.text(LX, 240, 'TOWERS   click one to see its upgrades.   ★ = an upgrade you can buy now', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#7f90a8' }));
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
      const nameT = keep(this.add.text(x + 54, y + 8, d.name, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: have ? '#e8eef7' : '#8a98ad' }));
      if (hasBuyableTier(d, this.save, this.coins, have)) keep(this.add.text(x + 54 + (nameT.width || 90) + 8, y + 7, '★', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#ffd54f' }));
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

  /** Draws one zombie (its designed look, else a plain coloured shape) centred on x, y with body radius R. */
  zombieFigure(g, def, x, y, R, o = {}) {
    const pal = resolveLook(def, null, this.gd.variantsById);
    if (pal.look) drawZombie(phaserPainter(g), pal, x, y, R * ZOMBIE_SCALE, { angle: o.angle || 0, phase: 0.7, seed: 3, flying: !!def.flying });
    else {
      g.fillStyle(hex(pal.skin), 1);
      drawShape(g, def.shape, x, y, R);
    }
  }

  /** The zombie area: a list of every zombie in the game on the left and a card with the selected one on the right. */
  renderZombies(keep) {
    const zs = this.metZombies();
    const nameOf = (id) => (zs.find((z) => z.id === id) || {}).name || 'unknown zombie'; // a zombie you have not met stays unnamed
    keep(this.add.text(LX, 100, 'ZOMBIES   ' + zs.length + ' met so far' + (zs.length ? ', click one for details' : ''), { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#7f90a8' }));
    if (!zs.length) {
      keep(this.add.text(LX, 130, 'You have not met any zombies yet.\nPlay a level: each kind is added here the first time it shows up.', { fontFamily: FONT, fontSize: '16px', color: '#9fb0c8', lineSpacing: 6 }));
      keep(this.add.rectangle(DX + DW / 2, 100 + 300, DW, 600, 0x161b23).setStrokeStyle(2, 0x2a3340));
      return;
    }
    const perPage = 12;
    const pages = Math.max(1, Math.ceil(zs.length / perPage));
    this.zpage = Math.max(0, Math.min(pages - 1, this.zpage));
    const CW = (LW - 10) / 2;
    const CH = 76;
    const figs = []; // portraits are drawn after the cards so they sit on top of them
    zs.slice(this.zpage * perPage, this.zpage * perPage + perPage).forEach((z, i) => {
      const x = LX + (i % 2) * (CW + 10);
      const y = 124 + Math.floor(i / 2) * (CH + 8);
      const sel = z.id === this.zsel;
      const bg = keep(this.add.rectangle(x + CW / 2, y + CH / 2, CW, CH, 0x1f2733).setStrokeStyle(sel ? 3 : 2, sel ? 0xffd54f : 0x4a5a70).setInteractive({ useHandCursor: true }));
      bg.on('pointerdown', () => {
        this.zsel = z.id;
        this.again();
      });
      figs.push([z, x + 34, y + CH / 2 + 2, Math.min(17, Math.max(11, (z.size || 0.3) * 48))]);
      keep(this.add.text(x + 70, y + 8, z.name || z.id, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#e8eef7' }));
      keep(this.add.text(x + 70, y + 31, zombieBlurb(z), { fontFamily: FONT, fontSize: '13px', color: '#9fb0c8' }));
      const tags = zombieTags(z);
      keep(this.add.text(x + 70, y + 51, tags.length ? tags.join('  ·  ') : 'Plain zombie', { fontFamily: FONT, fontSize: '12px', color: tags.length ? '#ffb74d' : '#7f90a8', wordWrap: { width: CW - 80 }, maxLines: 1 }));
    });
    const g = keep(this.add.graphics());
    for (const f of figs) this.zombieFigure(g, ...f);
    if (pages > 1) {
      const prev = keep(makeButton(this, LX, 676, 100, 30, '◀ Prev', () => { this.zpage--; this.again(); }, { size: 14 }));
      const next = keep(makeButton(this, LX + 110, 676, 100, 30, 'Next ▶', () => { this.zpage++; this.again(); }, { size: 14 }));
      prev.setEnabled(this.zpage > 0);
      next.setEnabled(this.zpage < pages - 1);
      keep(this.add.text(LX + 226, 683, 'Page ' + (this.zpage + 1) + ' / ' + pages, { fontFamily: FONT, fontSize: '14px', color: '#9fb0c8' }));
    }

    // the selected zombie
    keep(this.add.rectangle(DX + DW / 2, 100 + 300, DW, 600, 0x161b23).setStrokeStyle(2, 0x2a3340));
    const z = zs.find((q) => q.id === this.zsel);
    if (!z) return;
    const px = DX + 16;
    const inner = DW - 32;
    const dg = keep(this.add.graphics());
    this.zombieFigure(dg, z, px + 44, 160, Math.min(40, Math.max(22, (z.size || 0.3) * 100)));
    keep(this.add.text(px + 100, 118, z.name || z.id, { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#e8eef7' }));
    const tags = zombieTags(z);
    keep(this.add.text(px + 100, 150, tags.length ? tags.join('  ·  ') : 'Plain zombie', { fontFamily: FONT, fontSize: '13px', color: tags.length ? '#ffb74d' : '#9fb0c8', wordWrap: { width: inner - 100 } }));

    const rows = [
      ['Health', String(Math.round(z.health))],
      ['Speed', z.speed.toFixed(1) + ' tiles per second (' + speedWord(z.speed) + ')'],
      ['Armor', Math.round((z.armor || 0) * 100) + '%'],
      ['Reward', '$' + Math.round(z.reward || 0) + ' per kill'],
      ['Lives lost', String(z.damage == null ? 1 : z.damage) + ' if it reaches the exit'],
    ];
    keep(this.add.text(px, 214, 'STATS   at tier 1', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#7f90a8' }));
    rows.forEach(([k, v], i) => {
      keep(this.add.text(px, 238 + i * 24, k, { fontFamily: FONT, fontSize: '15px', color: '#9fb0c8' }));
      keep(this.add.text(px + 110, 238 + i * 24, v, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#e8eef7' }));
    });

    keep(this.add.text(px, 370, 'WHAT IT DOES', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#7f90a8' }));
    const notesT = keep(this.add.text(px, 394, zombieNotes(z, nameOf).map((n) => '• ' + n).join('\n'), { fontFamily: FONT, fontSize: '14px', color: '#cfd8e6', wordWrap: { width: inner }, lineSpacing: 5 }));
    const gy = Math.min(560, 394 + (notesT.height || 100) + 26); // the growth note sits right under the abilities

    const top = scaleEnemy(z, MAX_TIER);
    keep(this.add.text(px, gy, 'IT GROWS', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#7f90a8' }));
    keep(this.add.text(px, gy + 24, 'Zones make zombies tougher. By zone tier ' + MAX_TIER + ' it has ' + Math.round(top.health) + ' health, speed ' + top.speed.toFixed(2) + ', ' + Math.round(top.armor * 100) + '% armor and pays $' + top.reward + '.', { fontFamily: FONT, fontSize: '13px', color: '#9fb0c8', wordWrap: { width: inner }, lineSpacing: 3 }));
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
    const touch = this.registry.get('touch') === true;
    const idle = touch ? 'Tap a tier to read what it does. Tap it again to buy it.' : 'Hover a tier to read what it does. Click a yellow tier to buy it.';
    let shown = idle; // what the info box returns to when the pointer leaves a tier (a tapped tier stays shown)
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
        const edge = st === 'owned' ? 0x66bb6a : live && afford ? 0xffd54f : 0xe57373; // green once bought, yellow when you can buy it now, red until then
        const bg = keep(this.add.rectangle(x + colW / 2, y + boxH / 2, colW, boxH, this.tierPick === d.id + ':' + pi + ':' + ti ? 0x2c384a : st === 'owned' ? 0x1c2a22 : 0x1b212b).setStrokeStyle(3, edge));
        bg.setInteractive({ useHandCursor: live && afford });
        const key = d.id + ':' + pi + ':' + ti;
        const tierText = (tap) => {
          let note = '';
          if (st === 'owned') note = 'Bought.';
          else if (!have) note = 'Buy the tower first.';
          else if (st === 'later') note = 'Buy the earlier tiers on this path first.';
          else note = afford ? (tap ? 'Tap again to buy for ' : 'Click to buy for ') + price + ' coins.' : 'Needs ' + (price - this.coins) + ' more coins.';
          return (p.name || 'Path ' + (pi + 1)) + ' · tier ' + (ti + 1) + ': ' + (tier.name || '') + '\n' + (describeTier(tier) || '(no stat change)') + '\nIn battle it costs $' + (tier.cost || 0) + '.   ' + note;
        };
        if (this.tierPick === key) { shown = tierText(true); info.setText(shown); }
        bg.on('pointerdown', (ptr) => this.tapTier(d, pi, ti, !!(ptr && ptr.wasTouch)));
        bg.on('pointerover', () => info.setText(tierText(false)));
        bg.on('pointerout', () => info.setText(shown));
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
