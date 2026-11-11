import {
  catchesToUnlockNext,
  FISHERMAN_NAMES,
  isBossZone,
  SPAWN_CHANCE,
  UPGRADES,
  type UpgradeId,
  ZONES_PER_LEVEL,
  AD_RUBY_REWARD,
  BOOSTS,
  type BoostId,
  DAILY_REWARDS,
  PEARL_INCOME_BONUS,
  PEARL_UPGRADES,
  PRESTIGE_MIN_LEVEL,
  AD_DAILY_LIMIT,
  BOAT_SKINS,
  CAPTAINS_PASS_DAILY_RUBIES,
  DECOR,
  PERMANENTS,
  TIME_WARPS,
  ENGINE_VISUAL_TIERS,
  EXHIBITS,
  RUBY_PACKS,
  STARTER_PACK,
  RUBY_ADS_PER_DAY,
} from '../data/balance';
import type { Billing } from '../services/billing';
import type { Analytics, LocalAnalytics } from '../services/analytics';
import type { Ads } from '../services/ads';
import { ALL_SPECIES, bossSpecies, themeFor, type FishSpecies } from '../data/fish';
import {
  autoDps,
  boatSpeedMult,
  bestFishingZone,
  fishermanBulkCost,
  fishermanMaxAffordable,
  fishermanMilestoneMult,
  fishermanProduction,
  fleetFishPerSecond,
  nextFishermanMilestone,
  radarMultiplier,
  tapDamage,
  zoneAverageGold,
  zoneUnlockPrice,
} from '../game/economy';
import { BOAT_CLASS_NAMES, boatClassFor, boatsForTier, MAX_FLEET_BOATS } from '../game/fleet';
import { formatDuration, formatNumber } from '../game/format';
import { canClaimDaily, claimDaily, claimMission, dailyStreak, ensureMissions, missionDone, missionLabel, missionProgress, missionRubiesLeftToday, missionRubyReward, nextDailyIndex, skipCooldown, skipMission } from '../game/missions';
import type { Game } from '../game/game';
import type { BuildingId } from '../render/models';
import { coin, h, pressButton, ruby, setDisabled, setText } from './dom';

export type PanelId = BuildingId | 'atlas' | 'shop' | 'settings' | 'missions' | 'daily' | 'boosts';
type Updater = () => void;

export interface PanelHost {
  game: Game;
  preview(species: FishSpecies): string;
  sfx(name: 'buy' | 'click' | 'error'): void;
  reward(text: string): void;
  onClose(): void;
  confirmReset(): void;
  confirmVoyage(): void;
  ads: Ads;
  billing: Billing;
  toast(text: string): void;
  analytics: Analytics;
  playtest: LocalAnalytics;
}

interface PanelDef {
  icon: string;
  title: () => string;
  subtitle?: () => string;
  /** When this string changes the panel body is rebuilt. */
  key?: () => string;
  build: (body: HTMLElement) => Updater[];
}

const BOOST_ICONS: Record<BoostId, string> = { doubleHaul: '💰', strongArms: '💪', goldenTide: '✨' };

const FISHERMAN_ICONS = ['🧒', '🎣', '🧑', '🧔', '👨‍✈️', '🦸', '🤿', '🧭', '👑', '💡', '✨', '🎯', '🦀', '🌊', '🧙', '⚔️', '🌍', '⚓', '🏴‍☠️', '🪸', '💪', '🛡️', '⭐', '🐙', '🔮'];

export class PanelManager {
  current: PanelId | null = null;
  private root: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private updaters: Updater[] = [];
  private builtKey = '';
  private defs: Record<PanelId, PanelDef>;
  private buyAmount: 1 | 10 | 'max' = 1;
  private atlasLevel = 1;
  private shopTab: 'rubies' | 'bonuses' | 'style' = 'rubies';

  constructor(private container: HTMLElement, private host: PanelHost) {
    this.defs = this.createDefs();
  }

  openShop(tab: 'rubies' | 'bonuses' | 'style'): void {
    this.shopTab = tab;
    this.open('shop');
  }

  /** Not enough rubies: open the shop on the rubies tab and say how many are missing. */
  needRubies(cost: number): void {
    const missing = Math.ceil(cost - this.host.game.state.rubies);
    this.shopTab = 'rubies';
    this.open('shop');
    this.host.sfx('error');
    this.host.toast(`💎 You need ${missing} more rubies`);
  }

  open(id: PanelId): void {
    this.close(false);
    this.host.analytics.milestone('open', id);
    this.current = id;
    if (id === 'atlas') this.atlasLevel = Math.min(10, this.host.game.state.level);
    const def = this.defs[id];
    const body = h('div', { class: 'body' });
    const title = h('h2', null, def.title(), def.subtitle ? h('small', null, def.subtitle()) : null);
    const sheet = h(
      'div',
      { class: 'sheet', onpointerdown: (e: Event) => e.stopPropagation() },
      h('header', null, h('span', { class: 'ico' }, def.icon), title, pressButton({ class: 'close', 'aria-label': 'Close' }, () => this.close(), '✕')),
      body,
    );
    this.titleEl = title;
    this.root = h('div', { class: 'sheet-backdrop', onpointerdown: (e: Event) => { if (e.target === this.root) this.close(); } }, sheet);
    this.body = body;
    this.container.append(this.root);
    this.rebuild();
  }

  close(notify = true): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    this.body = null;
    this.current = null;
    this.updaters = [];
    if (notify) this.host.onClose();
  }

  /** Called every frame while open. */
  update(): void {
    if (!this.current || !this.body) return;
    const def = this.defs[this.current];
    const key = def.key?.() ?? '';
    if (key !== this.builtKey) this.rebuild();
    for (const u of this.updaters) u();
  }

  private rebuild(): void {
    if (!this.current || !this.body) return;
    const def = this.defs[this.current];
    const scroll = this.body.scrollTop;
    if (this.titleEl) this.titleEl.replaceChildren(def.title(), def.subtitle ? h('small', null, def.subtitle()) : '');
    this.body.replaceChildren();
    this.builtKey = def.key?.() ?? '';
    this.updaters = def.build(this.body);
    this.body.scrollTop = scroll;
    for (const u of this.updaters) u();
  }

  // ---------------------------------------------------------------------------

  private createDefs(): Record<PanelId, PanelDef> {
    const game = this.host.game;
    const s = () => game.state;
    const buy = (fn: () => boolean) => () => this.host.sfx(fn() ? 'buy' : 'error');

    const upgradeRow = (id: UpgradeId, icon: string, effect: (lvl: number) => string): [HTMLElement, Updater] => {
      const def = UPGRADES[id];
      const lvl = h('span', { class: 'lvl' });
      const eff = h('small');
      const price = h('span');
      const btn = pressButton({ class: 'btn gold small' }, buy(() => game.buyUpgrade(id)), coin(), price);
      const row = h('div', { class: 'row' }, h('div', { class: 'ico' }, icon), h('div', { class: 'info' }, h('b', null, def.name, ' ', lvl), h('small', null, def.description), eff), btn);
      return [
        row,
        () => {
          const l = s().upgrades[id];
          setText(lvl, `Lv ${l}`);
          const maxed = l >= def.maxLevel;
          setText(eff, maxed ? `${effect(l)} (max)` : `${effect(l)} → ${effect(l + 1)}`);
          setText(price, maxed ? 'MAX' : formatNumber(game.upgradeCost(id)));
          setDisabled(btn, !game.canBuyUpgrade(id));
        },
      ];
    };

    return {
      researchCenter: {
        icon: '🔬',
        title: () => 'Research Center',
        subtitle: () => `Level ${s().level} · ${themeFor(s().level).name}`,
        key: () => `${s().level}-${s().unlockedZone}-${s().bossesDefeated.join()}`,
        build: (body) => {
          const ups: Updater[] = [];
          const st = s();
          body.append(
            h('div', { class: 'summary' },
              h('span', null, 'Bosses ', h('b', null, `${st.bossesDefeated.filter(Boolean).length}/2`)),
              h('span', null, 'Fleet sells fish for ', h('b', null, formatNumber(zoneAverageGold(st.level, bestFishingZone(st.unlockedZone)))), ' ', coin()),
            ),
          );
          for (let z = 1; z <= ZONES_PER_LEVEL; z++) {
            const boss = isBossZone(z);
            const unlocked = z <= st.unlockedZone;
            const isNext = z === st.unlockedZone + 1;
            const bossIndex = z === 5 ? 0 : 1;
            const defeated = boss && st.bossesDefeated[bossIndex];
            const icon = !unlocked && !isNext ? '🔒' : boss ? (defeated ? '✅' : '🐋') : '🐟';
            const title = boss ? `Zone ${z} · ${bossSpecies(st.level, bossIndex).name}` : `Zone ${z}`;
            let detail: string;
            if (boss) detail = defeated ? 'Boss defeated' : 'Boss — 60 seconds to exhaust it';
            else {
              const ch = SPAWN_CHANCE[z];
              const parts = [`Fish ~${formatNumber(zoneAverageGold(st.level, z))}`];
              if (ch.rare) parts.push(`rare ${ch.rare}%`);
              if (ch.endangered) parts.push(`endangered ${ch.endangered}%`);
              if (ch.legendary) parts.push(`legendary ${ch.legendary}%`);
              detail = parts.join(' · ');
            }
            const info = h('div', { class: 'info' }, h('b', null, title), h('small', null, detail));
            const row = h('div', { class: `row${unlocked ? '' : ' locked'}${st.activeZone === z ? ' current' : ''}` }, h('div', { class: 'ico' }, icon), info);
            if (unlocked) {
              const go = pressButton({ class: 'btn blue small' }, () => { game.setActiveZone(z); this.host.sfx('click'); this.close(); }, 'Sail');
              ups.push(() => { setDisabled(go, s().activeZone === z); setText(go, s().activeZone === z ? 'Here' : 'Sail'); });
              row.append(go);
            } else if (isNext) {
              row.classList.remove('locked');
              const req = h('small');
              info.append(req);
              const price = h('span');
              const btn = pressButton({ class: 'btn gold small' }, buy(() => game.unlockNextZone()), boss ? 'Open' : coin(), price);
              ups.push(() => {
                const ns = game.nextZoneStatus();
                setText(price, boss ? '' : formatNumber(zoneUnlockPrice(s().level, z)));
                if (ns.kind === 'need-catches') setText(req, `🎣 Catch ${ns.have}/${ns.need} fish in zone ${z - 1}`);
                else if (ns.kind === 'need-boss') setText(req, '🐋 Defeat the boss first');
                else setText(req, isBossZone(z - 1) ? '✅ Boss defeated' : `✅ ${catchesToUnlockNext(z - 1)} fish caught`);
                setDisabled(btn, ns.kind !== 'ready');
              });
              row.append(btn);
            }
            body.append(row);
          }
          const next = themeFor(st.level + 1);
          const price = h('span');
          const btn = pressButton({ class: 'btn gold wide' }, buy(() => game.sailToNextLevel()), `Sail to Level ${st.level + 1} · `, coin(), price);
          const note = h('div', { class: 'note' });
          ups.push(() => {
            setText(price, formatNumber(game.nextLevelPrice));
            setDisabled(btn, !game.canSailToNextLevel());
            setText(note, game.levelComplete ? `Next: ${next.name}. Fish there are worth much more!` : 'Defeat both bosses of this level to sail on.');
          });
          body.append(h('div', { style: 'margin-top:10px' }, btn), note);
          return ups;
        },
      },

      fishingWorkshop: {
        icon: '🎣',
        title: () => 'Fishing Workshop',
        subtitle: () => 'Better rods, stronger taps',
        build: (body) => {
          const dmg = h('b');
          const [r1, u1] = upgradeRow('skill', '💪', (l) => formatNumber(Math.pow(1.2, l)) + ' dmg');
          const [r2, u2] = upgradeRow('speed', '⚡', (l) => `${(1 + l * 0.5).toFixed(1)} hits/tap`);
          body.append(
            h('div', { class: 'summary' }, h('span', null, 'Damage per tap ', dmg)),
            r1, r2,
            h('div', { class: 'note' }, 'Harpoon & net: coming in a next update'),
          );
          return [() => setText(dmg, formatNumber(tapDamage(s().upgrades))), u1, u2];
        },
      },

      boatWorkshop: {
        icon: '⚓',
        title: () => 'Boat Workshop',
        subtitle: () => 'Upgrade your ship',
        build: (body) => {
          const auto = h('b');
          const speed = h('b');
          const nextLook = h('small', { class: 'note', style: 'margin:0' });
          const [r0, u0] = upgradeRow('engine', '🚤', (l) => `${Math.round(boatSpeedMult(l) * 100)}% speed`);
          const [r1, u1] = upgradeRow('autoGear', '⚙️', (l) => (l === 0 ? 'off' : `${formatNumber(autoDps({ ...s().upgrades, autoGear: l }))}/s`));
          const [r2, u2] = upgradeRow('radar', '📡', (l) => `goldfish ×${radarMultiplier(l).toFixed(2)}`);
          body.append(h('div', { class: 'summary' }, h('span', null, 'Speed ', speed), h('span', null, 'Auto reel ', auto), nextLook), r0, r1, r2);
          const looks = ['an outboard motor', 'twin motors', 'a turbo'];
          return [() => {
            const e = s().upgrades.engine;
            setText(speed, `×${boatSpeedMult(e).toFixed(2)}`);
            setText(auto, `${formatNumber(autoDps(s().upgrades))} dmg/s`);
            const next = ENGINE_VISUAL_TIERS.findIndex((t) => e < t);
            setText(nextLook, next >= 0 ? `🔧 Engine Lv ${ENGINE_VISUAL_TIERS[next]}: your boat gets ${looks[next]}` : '🔥 Fully tuned turbo boat!');
          }, u0, u1, u2];
        },
      },

      fishermenSchool: {
        icon: '🎓',
        title: () => "Fishermen's School",
        subtitle: () => `${s().companyName} — your fishermen fish even offline`,
        key: () => `${s().fishermen.findIndex((n) => n === 0)}-${this.buyAmount}`,
        build: (body) => {
          const ups: Updater[] = [];
          const fps = h('b');
          const value = h('b');
          const income = h('b');
          const boats = h('b');
          body.append(
            h('div', { class: 'summary' },
              h('span', null, '⛵ Boats ', boats),
              h('span', null, 'Fleet ', fps),
              h('span', null, 'Fish value ', value, ' ', coin()),
              h('span', null, 'Income ', income, ' ', coin(), '/s'),
            ),
          );
          ups.push(() => {
            const st = s();
            setText(fps, `${formatNumber(fleetFishPerSecond(st.fishermen))} fish/s`);
            setText(value, formatNumber(zoneAverageGold(st.level, bestFishingZone(st.unlockedZone))));
            setText(income, formatNumber(game.incomePerSecond));
            setText(boats, String(Math.min(MAX_FLEET_BOATS, st.fishermen.reduce((a, n) => a + boatsForTier(n), 0))));
          });
          const seg = h('div', { class: 'seg' });
          for (const amt of [1, 10, 'max'] as const) {
            seg.append(pressButton({ class: this.buyAmount === amt ? 'on' : '' }, () => { this.buyAmount = amt; this.rebuild(); }, amt === 'max' ? 'Max' : `×${amt}`));
          }
          body.append(seg, h('p', { class: 'note', style: 'margin:-4px 0 8px' }, 'Every fisherman sails his own boat. Hire 10, 25, 50, 100 and 200 for extra boats.'));
          for (let tier = 0; tier < FISHERMAN_NAMES.length; tier++) {
            if (!game.isFishermanUnlocked(tier)) {
              body.append(h('div', { class: 'row locked' }, h('div', { class: 'ico' }, '❔'), h('div', { class: 'info' }, h('b', null, FISHERMAN_NAMES[tier]), h('small', null, `Sails a ${BOAT_CLASS_NAMES[boatClassFor(tier)].toLowerCase()} · hire a ${FISHERMAN_NAMES[tier - 1]} to unlock`))));
              break;
            }
            const owned = h('span', { class: 'lvl' });
            const prod = h('small');
            const milestone = h('small');
            const label = h('span');
            const price = h('span');
            const btn = pressButton({ class: 'btn gold small' }, () => {
              const n = this.amountFor(tier);
              this.host.sfx(n > 0 && game.hireFisherman(tier, n) ? 'buy' : 'error');
            }, h('span', null, label, ' ', coin(), price));
            body.append(h('div', { class: 'row' },
              h('div', { class: 'ico' }, FISHERMAN_ICONS[tier]),
              h('div', { class: 'info' }, h('b', null, FISHERMAN_NAMES[tier], ' ', owned), h('small', null, `⛵ ${BOAT_CLASS_NAMES[boatClassFor(tier)]}`), prod, milestone),
              btn,
            ));
            ups.push(() => {
              const st = s();
              const n = st.fishermen[tier];
              setText(owned, `×${n}`);
              const p = fishermanProduction(tier, Math.max(1, n));
              setText(prod, n > 0 ? `${formatNumber(fishermanProduction(tier, n))} fish/s` : `${formatNumber(p)} fish/s each`);
              const next = nextFishermanMilestone(n);
              setText(milestone, next ? `Production ×2 at ${next}${fishermanMilestoneMult(n) > 1 ? ` (now ×${fishermanMilestoneMult(n)})` : ''}` : `All bonuses ×${fishermanMilestoneMult(n)}`);
              const amount = Math.max(1, this.amountFor(tier));
              setText(label, `Hire ×${amount}`);
              setText(price, formatNumber(fishermanBulkCost(tier, n, amount)));
              setDisabled(btn, st.gold < fishermanBulkCost(tier, n, amount));
            });
          }
          return ups;
        },
      },

      aquarium: {
        icon: '🐠',
        title: () => 'Aquarium Museum',
        subtitle: () => 'Trade trophy fish for bonuses',
        build: (body) => {
          const ups: Updater[] = [];
          const t = h('b');
          body.append(
            h('div', { class: 'summary' }, h('span', null, '🏆 Trophies ', t), h('span', null, 'From endangered (10%), legendary and boss fish')),
          );
          for (const def of Object.values(EXHIBITS)) {
            const lvl = h('span', { class: 'lvl' });
            const price = h('span');
            const btn = pressButton({ class: 'btn gold small' }, () => this.host.sfx(game.buyExhibit(def.id) ? 'buy' : 'error'), '🏆 ', price);
            body.append(h('div', { class: 'row' }, h('div', { class: 'ico' }, def.icon),
              h('div', { class: 'info' }, h('b', null, def.name, ' ', lvl), h('small', null, def.permanent ? def.description : `${def.description} · temporary`)), btn));
            ups.push(() => {
              const cost = game.exhibitCost(def.id);
              setText(price, String(cost));
              setText(lvl, def.id === 'hallOfFame' || def.id === 'crewTraining' ? `Lv ${s().exhibits[def.id]}` : '');
              setDisabled(btn, s().trophies < cost);
            });
          }
          ups.push(() => setText(t, String(s().trophies)));
          return ups;
        },
      },

      lighthouse: {
        icon: '🗼',
        title: () => 'Lighthouse',
        subtitle: () => `New Voyage · voyages made: ${s().voyages}`,
        key: () => `${s().voyages}`,
        build: (body) => {
          const ups: Updater[] = [];
          const have = h('b');
          const bonus = h('b');
          const gain = h('b');
          const best = h('b');
          body.append(h('div', { class: 'summary' },
            h('span', null, '🐚 Pearls ', have),
            h('span', null, 'Income bonus ', bonus),
            h('span', null, 'Best level ', best),
          ));
          const voyageBtn = pressButton({ class: 'btn gold wide' }, () => this.host.confirmVoyage(), '⛵ Start a New Voyage · +', gain, ' 🐚');
          const voyageNote = h('p', { class: 'note' });
          body.append(
            h('div', { class: 'voyage-card' },
              h('b', null, 'Start a New Voyage'),
              h('small', null, `Sail back to level 1 with a fresh crew. You keep pearls, rubies, the Atlas and your pearl upgrades. Every pearl ever earned gives +${PEARL_INCOME_BONUS * 100}% gold forever, so each voyage goes faster and further.`),
              voyageBtn,
              voyageNote,
            ),
            h('h3', { class: 'section-title' }, 'Pearl upgrades (permanent)'),
          );
          ups.push(() => {
            const st = s();
            setText(have, formatNumber(st.pearls));
            setText(bonus, `×${formatNumber(game.pearlBonus)}`);
            setText(best, String(Math.max(st.bestLevel, st.level)));
            setText(gain, formatNumber(game.pearlsForVoyage));
            setDisabled(voyageBtn, !game.canStartVoyage());
            setText(voyageNote, st.level < PRESTIGE_MIN_LEVEL
              ? `Reach level ${PRESTIGE_MIN_LEVEL} to start a voyage.`
              : `The further you sail (level and zone), the more pearls you get. Tip: sail on until progress gets slow, then start over.`);
          });
          for (const def of Object.values(PEARL_UPGRADES)) {
            const lvl = h('span', { class: 'lvl' });
            const price = h('span');
            const btn = pressButton({ class: 'btn small pearl' }, () => this.host.sfx(game.buyPearlUpgrade(def.id) ? 'buy' : 'error'), '🐚 ', price);
            body.append(h('div', { class: 'row' }, h('div', { class: 'ico' }, def.icon), h('div', { class: 'info' }, h('b', null, def.name, ' ', lvl), h('small', null, def.description)), btn));
            ups.push(() => {
              const l = s().pearlUpgrades[def.id];
              const maxed = l >= def.maxLevel;
              setText(lvl, `Lv ${l}/${def.maxLevel}`);
              setText(price, maxed ? 'MAX' : formatNumber(game.pearlUpgradeCost(def.id)));
              setDisabled(btn, maxed || s().pearls < game.pearlUpgradeCost(def.id));
            });
          }
          return ups;
        },
      },

      atlas: {
        icon: '📖',
        title: () => 'Marine Atlas',
        subtitle: () => 'Every fish you have caught',
        key: () => `${this.atlasLevel}-${Object.keys(s().atlas).length}-${s().atlasSets.length}`,
        build: (body) => {
          const st = s();
          const seg = h('div', { class: 'seg' });
          const maxTab = Math.min(10, Math.max(st.level, st.bestLevel));
          for (let l = 1; l <= maxTab; l++) {
            seg.append(pressButton({ class: this.atlasLevel === l ? 'on' : '' }, () => { this.atlasLevel = l; this.rebuild(); }, String(l)));
          }
          if (maxTab > 1) body.append(seg);
          const species = ALL_SPECIES.filter((sp) => sp.level === this.atlasLevel);
          const caught = species.filter((sp) => st.atlas[sp.id]).length;
          body.append(h('div', { class: 'summary' }, h('span', null, themeFor(this.atlasLevel).name), h('span', null, 'Discovered ', h('b', null, `${caught}/${species.length}`))));
          const setNames: Record<string, string> = { common: 'Common fish', rare: 'Rare fish', endangered: 'Endangered fish', legendary: 'Legendary fish', special: 'Bosses & golden koi' };
          const sets = h('div', { class: 'atlas-sets' });
          for (const set of game.atlasSets(this.atlasLevel)) {
            const done = set.have === set.total;
            const action = set.claimed
              ? h('span', { class: 'owned' }, '✓ +2%')
              : pressButton({ class: `btn gold small${done ? ' pulse' : ''}`, disabled: !done }, () => {
                if (game.claimAtlasSet(this.atlasLevel, set.group)) {
                  this.host.sfx('buy');
                  this.host.reward(`📖 Set complete! +${set.rubies} rubies · +2% gold forever`);
                }
              }, `${set.rubies} `, ruby());
            sets.append(h('div', { class: 'set-row' },
              h('i', { class: `tag rar-${set.group === 'special' ? 'mythical' : set.group}` }),
              h('span', null, setNames[set.group]),
              h('div', { class: 'progress' }, h('div', { class: 'fill', style: `width:${(set.have / set.total) * 100}%` })),
              h('small', null, `${set.have}/${set.total}`),
              action,
            ));
          }
          body.append(sets, h('p', { class: 'note', style: 'margin:0 0 8px' }, `Complete a set: rubies + 2% more gold forever. Atlas bonus now ×${game.atlasBonus.toFixed(2)}`));
          const grid = h('div', { class: 'atlas-grid' });
          for (const sp of species) {
            const n = st.atlas[sp.id] ?? 0;
            grid.append(
              h('div', { class: `atlas-card rar-${sp.rarity}${n ? '' : ' missing'}` },
                h('i', { class: `tag rar-${sp.rarity}` }),
                n ? h('img', { src: this.host.preview(sp), alt: sp.name }) : h('div', { class: 'unknown' }, '?'),
                h('div', { class: 'name' }, n ? sp.name : '???'),
                h('div', { class: 'count' }, n ? `${sp.rarity} · ×${n}` : sp.rarity),
              ),
            );
          }
          body.append(grid);
          return [];
        },
      },

      shop: {
        icon: '💎',
        title: () => 'Ruby Shop',
        subtitle: () => 'Bonuses, time warps and style for your company',
        key: () => `${this.shopTab}-${JSON.stringify(s().premium)}-${s().cosmetics.skins.join()}-${s().cosmetics.boatSkin}-${s().cosmetics.decor.join()}`,
        build: (body) => {
          const ups: Updater[] = [];
          const ads = this.host.ads;
          const r = h('b');
          body.append(h('div', { class: 'summary' }, h('span', null, 'You have ', r, ' ', ruby()), h('span', null, `Ads left today: `, h('b', { 'data-ads': '1' }))));
          ups.push(() => {
            setText(r, formatNumber(s().rubies));
            const el = body.querySelector('[data-ads]') as HTMLElement | null;
            if (el) setText(el, s().premium.captainsPass ? 'no ads needed' : `${game.adsLeftToday}/${AD_DAILY_LIMIT}`);
          });
          const seg = h('div', { class: 'seg' });
          for (const [id, label] of [['rubies', '💎 Rubies'], ['bonuses', '⭐ Bonuses'], ['style', '🎨 Style']] as const) {
            seg.append(pressButton({ class: this.shopTab === id ? 'on' : '' }, () => { this.shopTab = id; this.rebuild(); }, label));
          }
          body.append(seg);
          const rubyBtn = (cost: number, onBuy: () => boolean, label?: string) => {
            const b = pressButton({ class: 'btn gold small' }, () => {
              if (s().rubies < cost) return this.needRubies(cost);
              this.host.sfx(onBuy() ? 'buy' : 'error');
            }, label ?? '', label ? ' ' : '', String(cost), ' ', ruby());
            ups.push(() => b.classList.toggle('short', s().rubies < cost));
            return b;
          };

          if (this.shopTab === 'rubies') {
            const billing = this.host.billing;
            const buy = (id: string, label: string, price: string) => () => {
              void billing.buy(id, label, price).then((r) => {
                if (r === null) return;
                this.host.sfx('buy');
                this.host.reward(r > 0 ? `💎 +${formatNumber(r)} rubies!` : '🎫 Thank you!');
                this.rebuild();
              });
            };
            // starter pack: one-time offer after the first boss
            if (game.starterOfferActive) {
              const timer = h('span', { class: 'offer-timer' });
              ups.push(() => setText(timer, `⏳ ${formatDuration((s().offers.starterUntil - game.now()) / 1000)} left`));
              body.append(h('div', { class: 'offer-card' },
                h('div', { class: 'offer-badge' }, 'ONE-TIME OFFER'),
                h('b', null, '🎁 Captain\'s Starter Pack'),
                h('ul', null,
                  h('li', null, `💎 ${STARTER_PACK.rubies} rubies`),
                  h('li', null, `⛵ Ocean Blue boat`),
                  h('li', null, `💰 Double Haul for ${STARTER_PACK.boostHours} hours`),
                ),
                h('small', null, 'Worth over 3× a normal ruby pack.'),
                timer,
                pressButton({ class: 'btn gold wide pulse' }, buy(STARTER_PACK.id, "Captain's Starter Pack", STARTER_PACK.price), `Get it for ${STARTER_PACK.price}`),
              ));
            }
            const first = !s().offers.purchased;
            if (first) body.append(h('div', { class: 'first-buy' }, '✨ First purchase: DOUBLE rubies on any pack!'));
            const grid = h('div', { class: 'pack-grid' });
            RUBY_PACKS.forEach((p, i) => {
              grid.append(pressButton({ class: `pack${p.tag ? ' tagged' : ''}` }, buy(p.id, `${p.rubies} rubies`, p.price),
                p.tag ? h('span', { class: 'pack-tag' }, p.tag) : null,
                h('div', { class: 'pack-gems' }, '💎'.repeat(Math.min(3, i + 1))),
                h('b', null, first ? h('s', null, String(p.rubies)) : null, first ? ' ' : '', formatNumber(p.rubies * (first ? 2 : 1))),
                h('span', { class: 'pack-price' }, p.price),
              ));
            });
            const adBtn = pressButton({ class: 'btn blue small' }, () => {
              void ads.watch('free-rubies', () => { game.addRubies(AD_RUBY_REWARD); game.recordRubyAd(); this.host.sfx('buy'); });
            }, `${ads.icon} Watch`);
            const adNote = h('small');
            ups.push(() => {
              const left = game.rubyAdsLeftToday;
              setDisabled(adBtn, !ads.available || left <= 0);
              setText(adNote, left > 0 ? `Watch a short video: +${AD_RUBY_REWARD} rubies (${left}/${RUBY_ADS_PER_DAY} left today)` : 'Come back tomorrow for more free rubies');
            });
            const pass = s().premium.captainsPass;
            body.append(
              grid,
              h('div', { class: 'row' }, h('div', { class: 'ico' }, '📺'), h('div', { class: 'info' }, h('b', null, 'Free rubies'), adNote), adBtn),
              h('div', { class: 'voyage-card' },
                h('b', null, "🎫 Captain's Pass"),
                h('small', null, `Every ad reward without watching ads, plus +${CAPTAINS_PASS_DAILY_RUBIES} rubies with each daily reward.`),
                pass ? h('span', { class: 'owned' }, '✓ Active') : pressButton({ class: 'btn blue wide' }, buy('captains_pass', "Captain's Pass", '€4.99'), 'Get it for €4.99'),
              ),
              h('p', { class: 'note' }, billing.testMode ? 'Test mode: purchases charge nothing. Google Play Billing goes live in the Android app.' : ''),
            );
          } else if (this.shopTab === 'bonuses') {
            body.append(h('h3', { class: 'section-title' }, 'Forever (also after a New Voyage)'));
            for (const def of Object.values(PERMANENTS)) {
              const owned = s().premium[def.id];
              body.append(h('div', { class: 'row' }, h('div', { class: 'ico' }, def.icon), h('div', { class: 'info' }, h('b', null, def.name), h('small', null, def.description)),
                owned ? h('span', { class: 'owned' }, '✓ Owned') : rubyBtn(def.rubies, () => game.buyPermanent(def.id))));
            }
            if (s().premium.manager) {
              const t = pressButton({ class: 'btn small' }, () => { s().settings.autoHire = !s().settings.autoHire; }, '');
              ups.push(() => { setText(t, s().settings.autoHire ? 'On' : 'Off'); t.classList.toggle('red', !s().settings.autoHire); });
              body.append(h('div', { class: 'row' }, h('div', { class: 'ico' }, '🧑‍💼'), h('div', { class: 'info' }, h('b', null, 'Manager auto-hire'), h('small', null, 'Turn the Harbour Manager on or off')), t));
            }
            body.append(h('h3', { class: 'section-title' }, 'Time warp: instant gold'));
            TIME_WARPS.forEach((w, i) => {
              const gold = h('small');
              ups.push(() => setText(gold, `+${formatNumber(game.timeWarpGold(w.hours))} gold right now`));
              body.append(h('div', { class: 'row' }, h('div', { class: 'ico' }, '⏩'), h('div', { class: 'info' }, h('b', null, `${w.hours} hour${w.hours > 1 ? 's' : ''} of fishing`), gold),
                rubyBtn(w.rubies, () => {
                  const g = game.timeWarp(i);
                  if (g > 0) this.host.reward(`⏩ +${formatNumber(g)} gold`);
                  return g > 0;
                })));
            });
          } else {
            body.append(h('h3', { class: 'section-title' }, 'Your boat'));
            for (const skin of Object.values(BOAT_SKINS)) {
              const owned = s().cosmetics.skins.includes(skin.id);
              const active = s().cosmetics.boatSkin === skin.id;
              const swatch = h('div', { class: 'ico', style: `background: linear-gradient(135deg, #${skin.hull.toString(16).padStart(6, '0')} 50%, #${skin.trim.toString(16).padStart(6, '0')} 50%)` });
              const action = active ? h('span', { class: 'owned' }, '✓ Sailing')
                : owned ? pressButton({ class: 'btn blue small' }, () => { game.buySkin(skin.id); this.host.sfx('click'); }, 'Use')
                : rubyBtn(skin.rubies, () => game.buySkin(skin.id));
              body.append(h('div', { class: 'row' }, swatch, h('div', { class: 'info' }, h('b', null, skin.name), h('small', null, skin.glow ? 'Glows in the dark' : owned ? 'Owned' : 'Boat paint')), action));
            }
            body.append(h('h3', { class: 'section-title' }, 'Island decorations'));
            for (const d of Object.values(DECOR)) {
              const owned = s().cosmetics.decor.includes(d.id);
              body.append(h('div', { class: 'row' }, h('div', { class: 'ico' }, d.icon), h('div', { class: 'info' }, h('b', null, d.name), h('small', null, 'Shows on your island')),
                owned ? h('span', { class: 'owned' }, '✓ Placed') : rubyBtn(d.rubies, () => game.buyDecor(d.id))));
            }
          }
          return ups;
        },
      },

      missions: {
        icon: '📜',
        title: () => 'Missions',
        subtitle: () => `Completed: ${s().stats.missionsDone}`,
        key: () => { ensureMissions(game); return s().missions.map((m) => m.id).join(); },
        build: (body) => {
          const ups: Updater[] = [];
          ensureMissions(game);
          for (const m of s().missions) {
            const fill = h('div', { class: 'fill' });
            const count = h('small');
            const claim = pressButton({ class: 'btn gold small' }, () => {
              const r = claimMission(game, m.id);
              if (r) {
                this.host.analytics.milestone('mission_claim', s().stats.missionsDone);
                this.host.sfx('buy');
                this.host.reward(`+${formatNumber(r.gold)} gold · +${r.rubies} rubies`);
              } else this.host.sfx('error');
            }, 'Claim');
            const skip = pressButton({ class: 'btn small ghost' }, () => { this.host.sfx(skipMission(game, m.id) ? 'click' : 'error'); }, '↻');
            const double = pressButton({ class: 'btn blue small' }, () => {
              void this.host.ads.watch('mission-double', () => {
                const r = claimMission(game, m.id);
                if (!r) return;
                game.addGold(r.gold);
                s().rubies += r.rubies;
                this.host.sfx('buy');
                this.host.reward(`×2! +${formatNumber(r.gold * 2)} gold · +${r.rubies * 2} rubies`);
              });
            }, `${this.host.ads.icon} ×2`);
            body.append(h('div', { class: 'row' },
              h('div', { class: 'ico' }, '🎯'),
              h('div', { class: 'info' },
                h('b', null, missionLabel(m)),
                h('div', { class: 'progress' }, fill),
                count,
              ),
              h('div', { class: 'buy' }, claim, double, skip),
            ));
            ups.push(() => {
              const p = missionProgress(game, m);
              const done = missionDone(game, m);
              fill.style.width = `${(p / m.target) * 100}%`;
              const rub = missionRubyReward(game, m);
              const reward = rub > 0 ? `${formatNumber(game.rewardGold(m.rewardMinutes))} gold + ${rub} 💎` : `${formatNumber(game.rewardGold(m.rewardMinutes))} gold`;
              setText(count, done ? `Done! Reward: ${reward}` : `${formatNumber(p)} / ${formatNumber(m.target)} · ${reward}`);
              const cd = skipCooldown(game);
              setDisabled(skip, cd > 0);
              setText(skip, cd > 0 ? `↻ ${Math.ceil(cd / 60)}m` : '↻');
              setDisabled(claim, !done);
              claim.classList.toggle('pulse', done);
              skip.style.display = done ? 'none' : '';
              double.style.display = done && this.host.ads.available ? '' : 'none';
            });
          }
          const rubyNote = h('p', { class: 'note' });
          ups.push(() => {
            const left = missionRubiesLeftToday(game);
            setText(rubyNote, `${left > 0 ? `${left} more missions pay rubies today.` : 'Ruby rewards are back tomorrow — missions still pay gold.'} You can swap one mission every 10 minutes.`);
          });
          body.append(rubyNote);
          return ups;
        },
      },

      daily: {
        icon: '🎁',
        title: () => 'Daily Reward',
        subtitle: () => `Streak: ${dailyStreak(game)} ${dailyStreak(game) === 1 ? 'day' : 'days'}`,
        key: () => `${s().daily.lastClaimDay}`,
        build: (body) => {
          const idx = nextDailyIndex(game);
          const claimable = canClaimDaily(game);
          const grid = h('div', { class: 'daily-grid' });
          DAILY_REWARDS.forEach((r, i) => {
            const label = r.kind === 'gold' ? `${r.minutes} min of gold` : r.kind === 'rubies' ? `${r.amount} rubies` : `${BOOSTS[r.boost].name} ${r.minutes}m`;
            const icon = r.kind === 'gold' ? '🪙' : r.kind === 'rubies' ? '💎' : BOOST_ICONS[r.boost];
            const state = i < idx || (!claimable && i === idx) ? 'claimed' : i === idx ? 'today' : '';
            grid.append(h('div', { class: `daily-card ${state}${i === 6 ? ' big' : ''}` }, h('small', null, `Day ${i + 1}`), h('div', { class: 'dico' }, state === 'claimed' ? '✅' : icon), h('span', null, label)));
          });
          const btn = pressButton({ class: 'btn gold wide' + (claimable ? ' pulse' : '') }, () => {
            const r = claimDaily(game);
            if (!r) return this.host.sfx('error');
            this.host.analytics.milestone('daily_claim', `day${s().daily.streak}`);
            this.host.sfx('buy');
            this.host.reward(r.kind === 'gold' ? 'Gold collected!' : r.kind === 'rubies' ? `+${r.amount} rubies` : `${BOOSTS[r.boost].name} active!`);
          }, claimable ? 'Collect today\'s reward' : 'Come back tomorrow');
          setDisabled(btn, !claimable);
          body.append(grid, h('div', { style: 'margin-top:12px' }, btn), h('p', { class: 'note' }, 'Come back every day — day 7 gives 25 rubies. Missing a day restarts at day 1.'));
          return [];
        },
      },

      boosts: {
        icon: '⚡',
        title: () => 'Boosts',
        subtitle: () => 'Speed things up for a while',
        build: (body) => {
          const ups: Updater[] = [];
          for (const def of Object.values(BOOSTS)) {
            const left = h('small', { class: 'lvl' });
            const buyBtn = pressButton({ class: 'btn gold small' }, () => {
              if (s().rubies < def.rubyCost) return this.needRubies(def.rubyCost);
              this.host.sfx(game.buyBoost(def.id) ? 'buy' : 'error');
            }, `${def.rubyCost} `, ruby());
            const buttons = h('div', { class: 'buy' }, buyBtn);
            if (def.ad) buttons.append(pressButton({ class: 'btn blue small' }, () => { game.activateBoost(def.id, def.minutes); this.host.sfx('buy'); }, '📺 Free'));
            body.append(h('div', { class: 'row' },
              h('div', { class: 'ico' }, BOOST_ICONS[def.id]),
              h('div', { class: 'info' }, h('b', null, def.name), h('small', null, `${def.description} · ${def.minutes} min`), left),
              buttons,
            ));
            ups.push(() => {
              const sec = game.boostSecondsLeft(def.id);
              setText(left, sec > 0 ? `Active: ${formatDuration(sec)} left` : '');
              buyBtn.classList.toggle('short', s().rubies < def.rubyCost);
            });
          }
          body.append(h('p', { class: 'note' }, 'Boost time stacks (up to 4 hours) and keeps running while you are away. 📺 = watch an ad (test mode).'));
          return ups;
        },
      },

      settings: {
        icon: '⚙️',
        title: () => 'Settings',
        build: (body) => {
          const toggle = (label: string, key: 'sound' | 'haptics') => {
            const btn = pressButton({ class: 'btn small' }, () => { s().settings[key] = !s().settings[key]; }, '');
            return [
              h('div', { class: 'row' }, h('div', { class: 'info' }, h('b', null, label)), btn),
              () => { setText(btn, s().settings[key] ? 'On' : 'Off'); btn.classList.toggle('red', !s().settings[key]); },
            ] as const;
          };
          const [r1, u1] = toggle('Sound', 'sound');
          const [r2, u2] = toggle('Vibration', 'haptics');
          const st = s().stats;
          const name = h('input', { id: 'company-name', class: 'text-input', maxlength: 24, value: s().companyName, oninput: (e: Event) => { s().companyName = (e.target as HTMLInputElement).value.trim() || 'Whale Hunter Co.'; } });
          body.append(
            h('div', { class: 'row' }, h('div', { class: 'ico' }, '🏢'), h('div', { class: 'info' }, h('b', null, 'Company name'), name)),
            r1, r2,
            h('div', { class: 'summary' },
              h('span', null, 'Fish caught ', h('b', null, formatNumber(st.fishCaught))),
              h('span', null, 'Goldfish ', h('b', null, formatNumber(st.goldfishCaught))),
              h('span', null, 'Bosses ', h('b', null, String(st.bossesDefeated))),
              h('span', null, 'Total gold ', h('b', null, formatNumber(st.totalGold))),
            ),
            this.playtestStats(),
            pressButton({ class: 'btn red wide' }, () => this.host.confirmReset(), 'Reset progress'),
            h('p', { class: 'note' }, 'Whale Hunter v0.1 — prototype'),
          );
          return [u1, u2];
        },
      },
    };
  }

  /** Playtest stats: funnel milestones and counts, for testers to screenshot. */
  private playtestStats(): HTMLElement {
    const d = this.host.playtest.data;
    const count = (prefix: string) => Object.entries(d.counts).filter(([k]) => k.startsWith(prefix)).reduce((a, [, n]) => a + n, 0);
    const box = h('details', { class: 'playtest' },
      h('summary', null, '📊 Playtest stats'),
      h('div', { class: 'summary' },
        h('span', null, 'Sessions ', h('b', null, String(d.sessions))),
        h('span', null, 'Session minutes ', h('b', null, d.sessionMinutes.slice(-5).join(', ') || '-')),
        h('span', null, 'Bosses won/tried ', h('b', null, `${count('boss_win')}/${count('boss_start')}`)),
        h('span', null, 'Ads watched ', h('b', null, String(count('ad_watched')))),
      ),
      h('ol', { class: 'milestones' }, ...d.milestones.slice(-40).map((m) => h('li', null, h('b', null, `${m.minute} min`), ` ${m.event}`, m.session > 1 ? ` (session ${m.session})` : ''))),
      pressButton({ class: 'btn ghost small' }, () => { this.host.playtest.reset(); this.rebuild(); }, 'Clear stats'),
    );
    return box;
  }

  private amountFor(tier: number): number {
    const st = this.host.game.state;
    if (this.buyAmount === 'max') return fishermanMaxAffordable(tier, st.fishermen[tier], st.gold);
    return this.buyAmount;
  }
}
