import '@fontsource/baloo-2/500.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
import { Audio, vibrate } from './audio';
import { FishingWorld } from './game/fishing';
import { BOAT_CLASS_NAMES, boatClassFor, Fleet } from './game/fleet';
import { BOOSTS, FISHERMAN_NAMES, PEARL_INCOME_BONUS } from './data/balance';
import { canClaimDaily, ensureMissions } from './game/missions';
import { formatNumber } from './game/format';
import { Game } from './game/game';
import { loadState, newGame, SAVE_KEY, serializeState } from './game/state';
import { WorldRenderer } from './render/worldRenderer';
import { Ads } from './services/ads';
import { TestAdProvider } from './ui/testAd';
import { coin, h } from './ui/dom';
import { Hud } from './ui/hud';
import { Overlay } from './ui/overlay';
import { PanelManager } from './ui/panels';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const overlayRoot = document.getElementById('overlay')!;
const uiRoot = document.getElementById('ui')!;

function readSave(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

const game = new Game(loadState(readSave()));
const world = new FishingWorld(game);
const fleet = new Fleet(game, () => world.boat);
const renderer = new WorldRenderer(canvas, world, game, fleet);
const audio = new Audio();
const ads = new Ads(game, new TestAdProvider(uiRoot));

function save(): void {
  game.state.lastSeen = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, serializeState(game.state));
  } catch {
    /* storage full or unavailable: keep playing */
  }
}

const sfx = (name: Parameters<Audio['play']>[0]) => {
  audio.enabled = game.state.settings.sound;
  audio.play(name);
};

const panels = new PanelManager(uiRoot, {
  game,
  preview: (sp) => renderer.renderPreview(sp),
  sfx,
  reward: (text) => overlay.rewardPop(text),
  ads,
  onClose: () => {},
  confirmVoyage: () => {
    const pearls = game.pearlsForVoyage;
    const after = 1 + (game.state.pearlsEarned + pearls) * PEARL_INCOME_BONUS;
    hud.confirmVoyage(pearls, after, () => {
      if (!game.startVoyage()) return;
      world.abandonFight();
      fleet.reset();
      renderer.fleetRenderer.reset();
      panels.close();
      renderer.mode = 'sea';
      world.syncZone(true);
      renderer.applyTheme();
      save();
    });
  },
  confirmReset: () => hud.confirmReset(() => {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    game.state = newGame();
    ensureMissions(game);
    fleet.reset();
    renderer.fleetRenderer.reset();
    panels.close();
    renderer.mode = 'sea';
    world.syncZone(true);
    renderer.applyTheme();
  }),
});

const hud = new Hud(uiRoot, game, world, panels, {
  toggleIsland: () => {
    renderer.mode = renderer.mode === 'island' ? 'sea' : 'island';
    if (renderer.mode === 'sea') panels.close();
  },
  isIslandMode: () => renderer.mode === 'island',
  sfx,
  ads,
});
const overlay = new Overlay(overlayRoot, world, renderer);

// --- Events → feedback -----------------------------------------------------------

/** Gold of the last catch, for the floating number (game 'catch' fires before world 'caught'). */
let lastCatchGold = 0;

game.on((e) => {
  switch (e.type) {
    case 'catch': {
      lastCatchGold = e.gold;
      if (e.lucky) {
        const t = world.target ?? world.boat;
        overlay.floatLucky(t.x, t.z);
      }
      const special = e.species.rarity !== 'common';
      sfx(special ? 'rare' : 'catch');
      vibrate(special ? 40 : 15, game.state.settings.haptics);
      if (e.firstTime) hud.toast([`📖 New in the Atlas: ${e.species.name}`], special);
      if (e.trophy) hud.toast(['🏆 Trophy found!'], true);
      break;
    }
    case 'goldfish':
      sfx('goldfish');
      vibrate(30, game.state.settings.haptics);
      hud.toast(['✨ Golden Koi! +', coin(), formatNumber(e.gold)], true);
      break;
    case 'boss-defeated':
      sfx('win');
      vibrate(120, game.state.settings.haptics);
      hud.toast([`🐋 ${e.species.name} caught! +`, coin(), formatNumber(e.gold)], true);
      if (e.levelComplete) setTimeout(() => hud.showLevelComplete(game.state.level), 1200);
      save();
      break;
    case 'voyage':
      sfx('win');
      overlay.rewardPop(`⛵ New Voyage! +${formatNumber(e.pearls)} 🐚`);
      hud.toast([`🐚 Gold from fish is now ×${formatNumber(game.pearlBonus)}`], true);
      break;
    case 'boost':
      hud.toast([`⚡ ${BOOSTS[e.boost].name} +${e.minutes} min`], true);
      break;
    case 'zone-unlocked':
      hud.toast([`🗺️ Zone ${e.zone} unlocked!`], true);
      save();
      break;
    case 'level-changed':
      hud.toast([`⛵ Welcome to Level ${e.level}!`], true);
      panels.close();
      renderer.mode = 'sea';
      world.syncZone(true);
      save();
      break;
  }
});

world.on((e) => {
  switch (e.type) {
    case 'hit':
      overlay.floatDamage(e.x, e.z, e.damage, e.crit);
      sfx(e.crit ? 'mini' : 'tap');
      break;
    case 'treasure-spawn':
      hud.toast([e.treasure.kind === 'chest' ? '🧰 A treasure chest is floating by — tap it!' : '🍾 A message in a bottle — tap it!'], true);
      break;
    case 'boss-continue-offer':
      sfx('error');
      hud.showBossContinue(e.boss.species.name, e.fight.hpFraction, () => { world.acceptContinue(); sfx('boss'); }, () => world.declineContinue());
      break;
    case 'treasure-opened': {
      const r = e.reward;
      hud.offerDouble('Double this treasure!', 'double-treasure', () => {
        game.grant(r);
        overlay.rewardPop(r.kind === 'gold' ? `×2! +${formatNumber(r.amount)} gold` : r.kind === 'rubies' ? `×2! +${r.amount} rubies` : `×2! ${BOOSTS[r.boost].name} +${r.minutes} min`);
      });
      sfx('goldfish');
      vibrate(40, game.state.settings.haptics);
      overlay.rewardPop(r.kind === 'gold' ? `🧰 +${formatNumber(r.amount)} gold` : r.kind === 'rubies' ? `🧰 +${r.amount} rubies!` : `🧰 ${BOOSTS[r.boost].name} ${r.minutes} min!`);
      break;
    }
    case 'frenzy-start':
      sfx('win');
      vibrate(60, game.state.settings.haptics);
      overlay.rewardPop('🔥 FRENZY! ×2 damage');
      break;
    case 'caught':
      overlay.floatGold(e.fish.x, e.fish.z, lastCatchGold);
      break;
    case 'goldfish-collected':
      overlay.floatGold(e.goldfish.x, e.goldfish.z, e.gold, true);
      hud.offerDouble('Double the koi gold!', 'double-goldfish', () => {
        game.addGold(e.gold);
        overlay.rewardPop(`×2! +${formatNumber(e.gold)} gold`);
      });
      break;
    case 'boss-start':
      sfx('boss');
      hud.toast([`🐋 ${e.boss.species.name} appears! 60 seconds!`], true);
      break;
    case 'boss-mini-hit':
      sfx(e.hit ? 'mini' : 'error');
      if (e.hit) overlay.flashMini();
      break;
    case 'boss-lost':
      sfx('lose');
      hud.toast(['💨 The boss escaped and recovers… upgrade and try again!']);
      break;
  }
});

fleet.on((e) => {
  if (e.type === 'fleet-unload') {
    const p = renderer.toScreen(e.boat.x, 2, e.boat.z);
    if (p.visible && e.gold > 0) overlay.floatGold(e.boat.x, e.boat.z, e.gold);
  } else if (e.type === 'fleet-launch' && e.boat.index === 0) {
    const cls = BOAT_CLASS_NAMES[boatClassFor(e.boat.tier)];
    hud.toast([e.firstOfClass ? `⛵ New boat type: ${cls}! ${FISHERMAN_NAMES[e.boat.tier]} sets sail` : `⛵ ${FISHERMAN_NAMES[e.boat.tier]} joins your fleet`], e.firstOfClass);
  } else if (e.type === 'fleet-launch') {
    hud.toast([`⛵ Extra ${BOAT_CLASS_NAMES[boatClassFor(e.boat.tier)].toLowerCase()} for your ${FISHERMAN_NAMES[e.boat.tier]}s`]);
  }
});

// --- Input -----------------------------------------------------------------------

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (hud.modalOpen) return;
  if (panels.current) {
    panels.close();
    return;
  }
  const building = renderer.pickBuilding(e.clientX, e.clientY);
  if (building && (renderer.mode === 'island' || !world.fight)) {
    sfx('click');
    panels.open(building);
    return;
  }
  if (renderer.mode === 'island') {
    renderer.mode = 'sea';
    return;
  }
  const p = renderer.screenToWorld(e.clientX, e.clientY);
  if (p) world.tapAt(p.x, p.z);
  else world.tap();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) world.tap();
});
window.addEventListener('resize', () => renderer.resize());
document.addEventListener('contextmenu', (e) => e.preventDefault());

// --- Offline earnings & saving ------------------------------------------------------------

function checkOffline(): void {
  const pending = game.pendingOffline();
  game.state.lastSeen = Date.now();
  if (pending) hud.showOffline(pending.gold, pending.seconds, pending.countedSeconds);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
  else checkOffline();
});
window.addEventListener('pagehide', save);
setInterval(save, 5000);
// Harbour Manager (ruby purchase) hires fishermen automatically
setInterval(() => {
  for (let i = 0; i < 5 && game.managerStep(); i++);
}, 1000);
ensureMissions(game);
checkOffline();

// Offer the daily reward once per session, after the player has started fishing.
let dailyOffered = false;
setInterval(() => {
  if (dailyOffered || !canClaimDaily(game) || game.state.stats.fishCaught < 3) return;
  if (panels.current || hud.modalOpen || world.fight) return;
  dailyOffered = true;
  panels.open('daily');
}, 1000);

// --- Main loop ----------------------------------------------------------------------------

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.tick(dt);
  fleet.update(dt);
  // a boss fight pauses while a menu is open
  const menuOpen = !!panels.current || renderer.mode === 'island' || hud.modalOpen;
  if (!(world.fight && menuOpen)) world.update(dt);
  renderer.update(dt);
  overlay.update(renderer.mode === 'island');
  hud.update();
  panels.update();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug helpers for testing in the browser console.
(window as unknown as Record<string, unknown>).whaleHunter = { game, world, fleet, save, h };
