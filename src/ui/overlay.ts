import { BOSS_MINIGAME_THRESHOLDS } from '../data/balance';
import type { FishingWorld } from '../game/fishing';
import { formatNumber } from '../game/format';
import type { BuildingId } from '../render/models';
import type { WorldRenderer } from '../render/worldRenderer';
import { coin, h, setText } from './dom';

const RARITY_LABEL: Record<string, string> = { common: '', rare: '★ ', endangered: '★★ ', legendary: '★★★ ' };
const BUILDING_NAMES: Record<BuildingId, string> = {
  researchCenter: 'Research Center',
  fishingWorkshop: 'Fishing Workshop',
  boatWorkshop: 'Boat Workshop',
  fishermenSchool: "Fishermen's School",
  aquarium: 'Aquarium Museum',
  lighthouse: 'Lighthouse',
};

/** World-anchored UI: HP bars, floating numbers, building labels and the boss fight UI. */
export class Overlay {
  private hp = h('div', { class: 'hpbar', style: 'display:none' });
  private hpName = h('div', { class: 'name' });
  private hpFill = h('div', { class: 'fill' });
  private labels = new Map<BuildingId, HTMLElement>();
  private boss: HTMLElement;
  private bossName = h('span');
  private bossTimer = h('span', { class: 'timer' });
  private bossFill = h('div', { class: 'fill' });
  private bossHint = h('div', { class: 'tap-hint' });
  private mini: HTMLElement;
  private miniGreen = h('div', { class: 'green' });
  private miniMarker = h('div', { class: 'marker' });
  private miniTime = h('div', { class: 'time' });
  private miniBanner = h('div', { class: 'mini-banner', style: 'display:none' });
  private lastFloat = 0;

  constructor(private root: HTMLElement, private world: FishingWorld, private renderer: WorldRenderer) {
    this.hp.append(this.hpName, h('div', { class: 'track' }, this.hpFill));
    root.append(this.hp);
    for (const [id, name] of Object.entries(BUILDING_NAMES) as [BuildingId, string][]) {
      const el = h('div', { class: 'building-label', style: 'display:none' }, name);
      this.labels.set(id, el);
      root.append(el);
    }
    const track = h('div', { class: 'track' }, this.bossFill, ...BOSS_MINIGAME_THRESHOLDS.map((t) => h('div', { class: 'mark', style: `left:${t * 100}%` })));
    this.boss = h('div', { class: 'boss-hud', style: 'display:none' }, h('div', { class: 'title' }, this.bossName, this.bossTimer), track, this.bossHint);
    this.mini = h('div', { class: 'minigame', style: 'display:none' }, h('div', { class: 'bar' }, this.miniGreen), this.miniMarker, this.miniTime);
    root.append(this.boss, this.mini, this.miniBanner);
  }

  update(islandMode: boolean): void {
    // HP bar over the hooked fish
    const t = this.world.target;
    if (t && t.state === 'hooked' && !islandMode) {
      const p = this.renderer.toScreen(t.x, 1.2, t.z);
      this.hp.style.display = '';
      this.hp.style.left = `${p.x}px`;
      this.hp.style.top = `${p.y}px`;
      setText(this.hpName, RARITY_LABEL[t.rarity] + t.species.name);
      this.hpFill.style.width = `${Math.max(0, (t.hp / t.maxHp) * 100)}%`;
    } else if (this.hp.style.display !== 'none') this.hp.style.display = 'none';

    for (const [id, el] of this.labels) {
      if (!islandMode) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }
      const p = this.renderer.buildingScreenPos(id);
      el.style.display = p.visible ? '' : 'none';
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    }

    // boss
    const fight = this.world.fight;
    const boss = this.world.boss;
    if (fight && boss && !fight.over) {
      this.boss.style.display = '';
      setText(this.bossName, boss.species.name);
      setText(this.bossTimer, `⏱ ${Math.ceil(fight.timeLeft)}s`);
      this.bossTimer.classList.toggle('low', fight.timeLeft < 10);
      this.bossFill.style.width = `${fight.hpFraction * 100}%`;
      setText(this.bossHint, fight.phase === 'minigame' ? '' : 'TAP TAP TAP!');
      if (fight.phase === 'minigame') {
        this.mini.style.display = '';
        this.miniGreen.style.bottom = `${fight.greenStart * 100}%`;
        this.miniGreen.style.height = `${fight.greenSize * 100}%`;
        this.miniMarker.style.top = `${(1 - fight.slider) * 100}%`;
        setText(this.miniTime, `${Math.ceil(fight.miniTimeLeft)}s`);
        this.miniBanner.style.display = '';
        setText(this.miniBanner, fight.miniHits === 0 ? 'Tap when the line\nis in the green!' : `Hits: ${fight.miniHits}`);
      } else {
        this.mini.style.display = 'none';
        this.miniBanner.style.display = 'none';
      }
    } else {
      if (this.boss.style.display !== 'none') this.boss.style.display = 'none';
      if (this.mini.style.display !== 'none') this.mini.style.display = 'none';
      if (this.miniBanner.style.display !== 'none') this.miniBanner.style.display = 'none';
    }
  }

  floatDamage(x: number, z: number, dmg: number, crit = false): void {
    const now = performance.now();
    if (!crit && now - this.lastFloat < 60) return; // keep fast tapping readable
    this.lastFloat = now;
    const p = this.renderer.toScreen(x + (Math.random() - 0.5) * 1.5, 1.6, z);
    this.spawn(h('div', { class: crit ? 'float crit' : 'float dmg' }, crit ? `CRIT -${formatNumber(dmg)}` : `-${formatNumber(dmg)}`), p.x, p.y);
  }

  floatLucky(x: number, z: number): void {
    const p = this.renderer.toScreen(x, 3.2, z);
    this.spawn(h('div', { class: 'float lucky' }, '🍀 LUCKY ×3'), p.x, p.y);
  }

  /** Big centred reward message. */
  rewardPop(text: string): void {
    const el = h('div', { class: 'reward-pop' }, text);
    this.root.append(el);
    el.addEventListener('animationend', () => el.remove());
  }

  floatGold(x: number, z: number, gold: number, big = false): void {
    const p = this.renderer.toScreen(x, 2, z);
    this.spawn(h('div', { class: `float gold${big ? ' big' : ''}` }, '+', coin(), formatNumber(gold)), p.x, p.y);
  }

  floatText(clientX: number, clientY: number, text: string): void {
    this.spawn(h('div', { class: 'float dmg' }, text), clientX, clientY);
  }

  flashMini(): void {
    this.mini.classList.remove('flash-good');
    void this.mini.offsetWidth;
    this.mini.classList.add('flash-good');
  }

  private spawn(el: HTMLElement, x: number, y: number): void {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.root.append(el);
    el.addEventListener('animationend', () => el.remove());
  }
}
