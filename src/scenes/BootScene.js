import { validateLevel, validateGame } from '../core/validate.js';
import { normGame, normAct } from '../core/game.js';
import { normZone } from '../core/terrain.js';
import { normVariant } from '../core/zombie.js';

async function getJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(path + ' -> HTTP ' + res.status);
  return res.json();
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    const msg = this.add.text(640, 340, 'Loading...', { fontFamily: 'system-ui, sans-serif', fontSize: '28px', color: '#cfd8e6' }).setOrigin(0.5);
    this.load_().then(
      () => this.scene.start('Home'),
      (err) => {
        console.error(err);
        msg.setText('Could not load game data.\n\n' + err.message + '\n\nIf you opened index.html straight from disk, serve the folder instead\n(for example: python -m http.server) and open http://localhost:8000');
        msg.setFontSize(20).setAlign('center').setColor('#ff9e9e');
      }
    );
  }

  // Every tower, enemy, level, zone and act lives in its own folder:  towers/<id>/tower.json, enemies/<id>/enemy.json,
  // levels/<id>/level.json, zones/<id>/zone.json, acts/<id>/act.json, variants/<id>/variant.json. Each top-level folder has an index.json that
  // lists the ids in display order. The zones, acts and variants folders are optional.
  async load_() {
    const set = async (dir, file, key, optional) => {
      const index = await getJSON(dir + '/index.json').catch((err) => {
        if (optional) return {}; // e.g. a repo with no zones folder yet
        throw err;
      });
      const ids = index[key] || [];
      const items = await Promise.all(ids.map((id) => getJSON(dir + '/' + id + '/' + file)));
      items.forEach((it, i) => {
        if (it.id !== ids[i]) console.warn('[' + dir + '/' + ids[i] + '] the id inside ' + file + ' is "' + it.id + '", expected "' + ids[i] + '".');
      });
      return { ids, items };
    };
    const [t, e, l, zs, as, vs] = await Promise.all([set('towers', 'tower.json', 'towers'), set('enemies', 'enemy.json', 'enemies'), set('levels', 'level.json', 'levels'), set('zones', 'zone.json', 'zones', true), set('acts', 'act.json', 'acts', true), set('variants', 'variant.json', 'variants', true)]);
    const zones = zs.items.map(normZone);
    const zonesById = {};
    for (const z of zones) zonesById[z.id] = z;
    const acts = as.items.map(normAct); // story chapters; optional
    const actsById = {};
    for (const a of acts) actsById[a.id] = a;
    const variants = vs.items.map(normVariant); // zombie reskins; optional
    const variantsById = {};
    for (const v of variants) variantsById[v.id] = v;
    const towers = t.items;
    const enemies = e.items;
    const levels = l.items;
    const game = normGame(await getJSON('data/game.json').catch(() => ({}))); // optional file
    for (const v of validateGame(game, towers)) console[v.level === 'error' ? 'error' : 'warn']('[game] ' + v.msg);
    const levelsById = {};
    for (const lv of levels) levelsById[lv.id] = lv;
    for (const lv of levels) {
      for (const v of validateLevel(lv, towers, enemies, l.ids, zones, as.ids, vs.ids)) console[v.level === 'error' ? 'error' : 'warn']('[' + lv.id + '] ' + v.msg);
    }
    this.registry.set('data', { towers, enemies, levels, levelsById, game, zones, zonesById, acts, actsById, variants, variantsById });
  }
}
