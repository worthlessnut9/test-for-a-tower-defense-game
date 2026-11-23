import { BootScene } from './scenes/BootScene.js';
import { HomeScene } from './scenes/HomeScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { TeamScene } from './scenes/TeamScene.js';
import { GameScene } from './scenes/GameScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#10141b',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 2, touch: { capture: true } },
  disableContextMenu: true, // a long press on a phone must not open a menu
  scene: [BootScene, HomeScene, MenuScene, TeamScene, GameScene],
});

// Touch devices: scenes read registry 'touch' to switch to tap wording and two-tap buying / building.
const markTouch = () => game.registry.set('touch', true);
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) markTouch();
window.addEventListener('touchstart', markTouch, { passive: true, once: true });

// While the "turn your phone sideways" screen is up the game loop is put to sleep, so a level does not run unseen.
if (window.matchMedia) {
  const portrait = window.matchMedia('(orientation: portrait) and (max-width: 700px)');
  let slept = false;
  const sync = () => {
    const loop = game.loop;
    if (!loop || !loop.sleep || !loop.wake) return;
    if (portrait.matches && loop.running) { loop.sleep(); slept = true; }
    else if (!portrait.matches && slept) { loop.wake(true); slept = false; }
  };
  if (portrait.addEventListener) portrait.addEventListener('change', sync);
  else if (portrait.addListener) portrait.addListener(sync);
  sync();
}
