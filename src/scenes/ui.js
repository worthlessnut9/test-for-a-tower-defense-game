// Small button helper built from Phaser rectangles + text.
export function makeButton(scene, x, y, w, h, label, onClick, opts = {}) {
  const depth = opts.depth ?? 10;
  const fill = opts.fill ?? 0x2b3544;
  const bg = scene.add.rectangle(x + w / 2, y + h / 2, w, h, fill).setStrokeStyle(2, opts.stroke ?? 0x4a5a70).setDepth(depth).setInteractive({ useHandCursor: true });
  const tx = scene.add
    .text(x + w / 2, y + h / 2, label, { fontFamily: 'system-ui, sans-serif', fontSize: (opts.size ?? 16) + 'px', color: '#e8eef7', align: 'center', wordWrap: { width: w - 12 } })
    .setOrigin(0.5)
    .setDepth(depth + 2);
  // small buttons get a bigger invisible touch area (at least 44 px each way), so a finger can hit them
  const padX = Math.max(0, Math.min(8, (44 - w) / 2));
  const padY = Math.max(0, Math.min(8, (44 - h) / 2));
  if ((padX || padY) && typeof Phaser !== 'undefined' && Phaser.Geom && Phaser.Geom.Rectangle) {
    bg.setInteractive(new Phaser.Geom.Rectangle(-padX, -padY, w + 2 * padX, h + 2 * padY), Phaser.Geom.Rectangle.Contains);
    if (bg.input) bg.input.cursor = 'pointer';
  }
  const b = { bg, tx, enabled: true, x, y, w, h, fill };
  bg.on('pointerover', () => {
    if (b.enabled) bg.setFillStyle(opts.hover ?? 0x3a4a60);
    if (opts.onOver) opts.onOver();
  });
  bg.on('pointerout', () => {
    bg.setFillStyle(b.enabled ? b.fill : 0x20252e);
    if (opts.onOut) opts.onOut();
  });
  bg.on('pointerdown', (p, lx, ly, ev) => {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    if (b.enabled) onClick(p);
  });
  b.setLabel = (s) => tx.setText(s);
  b.setEnabled = (on) => {
    b.enabled = on;
    bg.setFillStyle(on ? b.fill : 0x20252e);
    tx.setAlpha(on ? 1 : 0.4);
    bg.input.cursor = on ? 'pointer' : 'default';
  };
  b.setFill = (c) => {
    b.fill = c;
    if (b.enabled) bg.setFillStyle(c);
  };
  b.setVisible = (v) => {
    bg.setVisible(v);
    tx.setVisible(v);
    bg.input.enabled = v;
  };
  b.destroy = () => {
    bg.destroy();
    tx.destroy();
  };
  return b;
}

const FONT = 'system-ui, sans-serif';

/** Title, optional back button and optional coin counter shared by the menu screens. */
export function addHeader(scene, title, opts = {}) {
  const out = {};
  scene.add.text(640, 38, title, { fontFamily: FONT, fontSize: '38px', fontStyle: 'bold', color: '#e8eef7' }).setOrigin(0.5);
  if (opts.sub) scene.add.text(640, 78, opts.sub, { fontFamily: FONT, fontSize: '17px', color: '#9fb0c8' }).setOrigin(0.5);
  if (opts.onBack) out.back = makeButton(scene, 24, 20, 120, 36, '◀ ' + (opts.backLabel || 'Back'), opts.onBack, { size: 15 });
  if (opts.coins !== undefined) out.coins = scene.add.text(1256, 24, '● ' + opts.coins + ' coins', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffd54f' }).setOrigin(1, 0);
  return out;
}
