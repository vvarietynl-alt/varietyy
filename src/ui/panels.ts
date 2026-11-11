import {
  catchesToUnlockNext,
  FISHERMAN_NAMES,
  isBossZone,
  LEVEL_COUNT,
  OFFLINE_CAP_HOURS,
  SPAWN_CHANCE,
  UPGRADES,
  type UpgradeId,
  ZONES_PER_LEVEL,
  AD_RUBY_REWARD,
  BOOSTS,
  type BoostId,
  DAILY_REWARDS,
} from '../data/balance';
import { ALL_SPECIES, bossSpecies, LEVEL_THEMES, type FishSpecies } from '../data/fish';
import {
  autoDps,
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
import { canClaimDaily, claimDaily, claimMission, dailyStreak, ensureMissions, missionDone, missionLabel, missionProgress, nextDailyIndex, skipMission } from '../game/missions';
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

  constructor(private container: HTMLElement, private host: PanelHost) {
    this.defs = this.createDefs();
  }

  open(id: PanelId): void {
    this.close(false);
    this.current = id;
    if (id === 'atlas') this.atlasLevel = this.host.game.state.level;
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
        subtitle: () => `Level ${s().level} · ${LEVEL_THEMES[s().level - 1].name}`,
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
          if (st.level < LEVEL_COUNT) {
            const next = LEVEL_THEMES[st.level];
            const price = h('span');
            const btn = pressButton({ class: 'btn gold wide' }, buy(() => game.sailToNextLevel()), `Sail to Level ${st.level + 1} · `, coin(), price);
            const note = h('div', { class: 'note' });
            ups.push(() => {
              setText(price, formatNumber(game.nextLevelPrice));
              setDisabled(btn, !game.canSailToNextLevel());
              setText(note, game.levelComplete ? `Next: ${next.name}. Fish there are worth much more!` : 'Defeat both bosses of this level to sail on.');
            });
            body.append(h('div', { style: 'margin-top:10px' }, btn), note);
          } else {
            body.append(h('div', { class: 'note' }, game.levelComplete ? '🏆 You conquered every sea!' : 'This is the last sea. Defeat both bosses!'));
          }
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
          const [r1, u1] = upgradeRow('autoGear', '⚙️', (l) => (l === 0 ? 'off' : `${formatNumber(autoDps({ ...s().upgrades, autoGear: l }))}/s`));
          const [r2, u2] = upgradeRow('radar', '📡', (l) => `goldfish ×${radarMultiplier(l).toFixed(2)}`);
          body.append(h('div', { class: 'summary' }, h('span', null, 'Auto reel ', auto)), r1, r2);
          return [() => setText(auto, `${formatNumber(autoDps(s().upgrades))} dmg/s`), u1, u2];
        },
      },

      fishermenSchool: {
        icon: '🎓',
        title: () => "Fishermen's School",
        subtitle: () => 'Grow your fishing company — they fish even offline',
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
          const t = h('b');
          body.append(
            h('div', { class: 'summary' }, h('span', null, 'Trophies ', t)),
            h('p', { class: 'note' }, 'Trophies drop from endangered (10%), legendary (always) and mythical fish. The museum opens in a next update with these bonuses:'),
            ...['More income for a while', 'Faster fishermen for a while', 'More fishing skill for a while', 'Permanent income bonus', 'Permanent fishermen speed'].map((b) =>
              h('div', { class: 'row locked' }, h('div', { class: 'ico' }, '🏆'), h('div', { class: 'info' }, h('b', null, b))),
            ),
          );
          return [() => setText(t, String(s().trophies))];
        },
      },

      lighthouse: {
        icon: '🗼',
        title: () => 'Lighthouse',
        subtitle: () => 'Light the way to new seas',
        build: (body) => {
          body.append(h('p', { class: 'note' }, 'The lighthouse will reveal hidden areas of each sea. Coming in a next update.'));
          return [];
        },
      },

      atlas: {
        icon: '📖',
        title: () => 'Marine Atlas',
        subtitle: () => 'Every fish you have caught',
        key: () => `${this.atlasLevel}-${Object.keys(s().atlas).length}`,
        build: (body) => {
          const st = s();
          const seg = h('div', { class: 'seg' });
          for (let l = 1; l <= st.level; l++) {
            seg.append(pressButton({ class: this.atlasLevel === l ? 'on' : '' }, () => { this.atlasLevel = l; this.rebuild(); }, String(l)));
          }
          if (st.level > 1) body.append(seg);
          const species = ALL_SPECIES.filter((sp) => sp.level === this.atlasLevel);
          const caught = species.filter((sp) => st.atlas[sp.id]).length;
          body.append(h('div', { class: 'summary' }, h('span', null, LEVEL_THEMES[this.atlasLevel - 1].name), h('span', null, 'Discovered ', h('b', null, `${caught}/${species.length}`))));
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
        title: () => 'Rubies',
        subtitle: () => 'Speed up your progress',
        build: (body) => {
          const r = h('b');
          body.append(
            h('div', { class: 'summary' }, h('span', null, 'You have ', r, ' ', ruby())),
            h('div', { class: 'row' }, h('div', { class: 'ico' }, '📺'), h('div', { class: 'info' }, h('b', null, 'Watch an ad'), h('small', null, `+${AD_RUBY_REWARD} rubies (test mode — no real ad yet)`)),
              pressButton({ class: 'btn blue small' }, () => { game.addRubies(AD_RUBY_REWARD); this.host.sfx('buy'); }, 'Watch')),
            ...[['A handful', 80, '€1.99'], ['A chest', 500, '€9.99'], ['A treasure', 1200, '€19.99']].map(([name, n, price]) =>
              h('div', { class: 'row locked' }, h('div', { class: 'ico' }, '💎'), h('div', { class: 'info' }, h('b', null, `${name} of rubies`), h('small', null, `${n} rubies`)), h('button', { class: 'btn small', disabled: true }, String(price))),
            ),
            h('p', { class: 'note' }, `Use rubies to triple offline earnings (up to ${OFFLINE_CAP_HOURS} h). Purchases go live with Google Play Billing.`),
          );
          return [() => setText(r, String(s().rubies))];
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
                this.host.sfx('buy');
                this.host.reward(`+${formatNumber(r.gold)} gold · +${r.rubies} rubies`);
              } else this.host.sfx('error');
            }, 'Claim');
            const skip = pressButton({ class: 'btn small', style: 'background:var(--panel-2);color:var(--ink);box-shadow:0 3px 0 var(--line)' }, () => { skipMission(game, m.id); this.host.sfx('click'); }, '↻');
            body.append(h('div', { class: 'row' },
              h('div', { class: 'ico' }, '🎯'),
              h('div', { class: 'info' },
                h('b', null, missionLabel(m)),
                h('div', { class: 'progress' }, fill),
                count,
              ),
              h('div', { class: 'buy' }, claim, skip),
            ));
            ups.push(() => {
              const p = missionProgress(game, m);
              const done = missionDone(game, m);
              fill.style.width = `${(p / m.target) * 100}%`;
              setText(count, done ? `Done! Reward: ${formatNumber(game.rewardGold(m.rewardMinutes))} gold + ${m.rewardRubies} 💎` : `${formatNumber(p)} / ${formatNumber(m.target)} · reward ${m.rewardRubies} 💎 + gold`);
              setDisabled(claim, !done);
              claim.classList.toggle('pulse', done);
              skip.style.display = done ? 'none' : '';
            });
          }
          body.append(h('p', { class: 'note' }, 'New missions appear as soon as you claim one. Tap ↻ to swap a mission.'));
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
            const buyBtn = pressButton({ class: 'btn gold small' }, () => this.host.sfx(game.buyBoost(def.id) ? 'buy' : 'error'), `${def.rubyCost} `, ruby());
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
              setDisabled(buyBtn, s().rubies < def.rubyCost);
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
          body.append(
            r1, r2,
            h('div', { class: 'summary' },
              h('span', null, 'Fish caught ', h('b', null, formatNumber(st.fishCaught))),
              h('span', null, 'Goldfish ', h('b', null, formatNumber(st.goldfishCaught))),
              h('span', null, 'Bosses ', h('b', null, String(st.bossesDefeated))),
              h('span', null, 'Total gold ', h('b', null, formatNumber(st.totalGold))),
            ),
            pressButton({ class: 'btn red wide' }, () => this.host.confirmReset(), 'Reset progress'),
            h('p', { class: 'note' }, 'Whale Hunter v0.1 — prototype'),
          );
          return [u1, u2];
        },
      },
    };
  }

  private amountFor(tier: number): number {
    const st = this.host.game.state;
    if (this.buyAmount === 'max') return fishermanMaxAffordable(tier, st.fishermen[tier], st.gold);
    return this.buyAmount;
  }
}
