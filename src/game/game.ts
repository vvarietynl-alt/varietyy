import {
  ATLAS_SET_BONUS,
  ATLAS_SET_RUBIES,
  type AtlasGroup,
  AD_DAILY_LIMIT,
  BOAT_SKINS,
  type BoatSkinId,
  DECOR,
  type DecorId,
  PERMANENTS,
  type PermanentId,
  TIME_WARPS,
  BOSS_FIGHT_SECONDS,
  CRIT_CHANCE,
  OFFLINE_CAP_HOURS,
  MAX_PRICE,
  PEARL_LEVEL_GROWTH,
  PEARL_INCOME_BONUS,
  PEARL_SCALE,
  PEARL_UPGRADES,
  type PearlUpgradeId,
  PRESTIGE_MIN_LEVEL,
  BOOST_MAX_HOURS,
  BOOSTS,
  type BoostId,
  LUCKY_CATCH_CHANCE,
  LUCKY_CATCH_MULT,
  catchesToUnlockNext,
  type CatchableRarity,
  isBossZone,
  OFFLINE_MIN_SECONDS,
  OFFLINE_TRIPLE_RUBY_COST,
  UPGRADES,
  type UpgradeId,
  ZONES_PER_LEVEL,
} from '../data/balance';
import { ALL_SPECIES, bossSpecies, goldfishSpecies, speciesFor, type FishSpecies } from '../data/fish';
import {
  bestFishingZone,
  bossGold,
  fishermanBulkCost,
  fishGold,
  fleetIncomePerSecond,
  goldfishGold,
  nextLevelPrice,
  offlineEarnings,
  upgradeCost,
  zoneAverageGold,
  zoneUnlockPrice,
} from './economy';
import { dayKey } from './missions';
import { type GameState, newGame } from './state';

export type GameEvent =
  | { type: 'catch'; species: FishSpecies; gold: number; firstTime: boolean; trophy: boolean; lucky: boolean }
  | { type: 'chest'; reward: ChestReward }
  | { type: 'boost'; boost: BoostId; minutes: number }
  | { type: 'voyage'; pearls: number }
  | { type: 'atlas-set'; key: string; rubies: number }
  | { type: 'goldfish'; species: FishSpecies; gold: number }
  | { type: 'boss-defeated'; species: FishSpecies; gold: number; levelComplete: boolean }
  | { type: 'zone-unlocked'; zone: number }
  | { type: 'level-changed'; level: number }
  | { type: 'zone-changed'; zone: number }
  | { type: 'purchase' }
  | { type: 'toast'; text: string };

export type Listener = (e: GameEvent) => void;

export type ChestReward =
  | { kind: 'gold'; amount: number }
  | { kind: 'rubies'; amount: number }
  | { kind: 'boost'; boost: BoostId; minutes: number };

export type UnlockStatus =
  | { kind: 'maxed' }
  | { kind: 'need-catches'; have: number; need: number; price: number }
  | { kind: 'need-boss'; bossIndex: number; price: number }
  | { kind: 'need-gold'; price: number }
  | { kind: 'ready'; price: number };

/** Trophy chance per catch (GDD: small for endangered, always for legendary). */
const TROPHY_CHANCE: Partial<Record<CatchableRarity, number>> = { endangered: 0.1, legendary: 1 };

export class Game {
  state: GameState;
  private listeners = new Set<Listener>();
  /** Gold multiplier from a running sea event (set by the FishingWorld). */
  eventGoldMult = 1;

  /** Clock for boosts (injectable for tests). */
  now: () => number = Date.now;

  constructor(state: GameState = newGame(), private rnd: () => number = Math.random) {
    this.state = state;
  }

  // --- Boosts -------------------------------------------------------------------

  boostSecondsLeft(id: BoostId): number {
    return Math.max(0, (this.state.boosts[id] - this.now()) / 1000);
  }

  isBoostActive(id: BoostId): boolean {
    return this.boostSecondsLeft(id) > 0;
  }

  /** Add boost time (stacks up to BOOST_MAX_HOURS). */
  activateBoost(id: BoostId, minutes: number): void {
    const start = Math.max(this.now(), this.state.boosts[id]);
    const max = this.now() + BOOST_MAX_HOURS * 3600e3;
    this.state.boosts[id] = Math.min(max, start + minutes * 60e3);
    this.emit({ type: 'boost', boost: id, minutes });
  }

  buyBoost(id: BoostId): boolean {
    const def = BOOSTS[id];
    if (this.state.rubies < def.rubyCost) return false;
    this.state.rubies -= def.rubyCost;
    this.activateBoost(id, def.minutes);
    return true;
  }

  /** Gold multiplier for fish: Double Haul boost and the permanent pearl bonus. */
  get incomeMult(): number {
    return (this.isBoostActive('doubleHaul') ? 2 : 1) * this.pearlBonus * (this.state.premium.goldenHull ? 2 : 1) * this.atlasBonus;
  }

  /** Permanent bonus from completed Atlas sets. */
  get atlasBonus(): number {
    return 1 + this.state.atlasSets.length * ATLAS_SET_BONUS;
  }

  /** Progress of the five Atlas sets of a hand-made level (1–10). */
  atlasSets(level: number): { group: AtlasGroup; key: string; have: number; total: number; claimed: boolean; rubies: number }[] {
    const groups: AtlasGroup[] = ['common', 'rare', 'endangered', 'legendary', 'special'];
    return groups.map((group) => {
      const list = ALL_SPECIES.filter((sp) => sp.level === level && (group === 'special' ? sp.rarity === 'mythical' || sp.rarity === 'goldfish' : sp.rarity === group));
      const key = `L${level}-${group}`;
      return {
        group,
        key,
        have: list.filter((sp) => this.state.atlas[sp.id]).length,
        total: list.length,
        claimed: this.state.atlasSets.includes(key),
        rubies: ATLAS_SET_RUBIES[group],
      };
    });
  }

  claimableAtlasSets(): number {
    let n = 0;
    for (let l = 1; l <= 10; l++) for (const set of this.atlasSets(l)) if (!set.claimed && set.have === set.total) n++;
    return n;
  }

  claimAtlasSet(level: number, group: AtlasGroup): boolean {
    const set = this.atlasSets(level).find((o) => o.group === group);
    if (!set || set.claimed || set.have < set.total) return false;
    this.state.atlasSets.push(set.key);
    this.state.rubies += set.rubies;
    this.emit({ type: 'atlas-set', key: set.key, rubies: set.rubies });
    return true;
  }

  /** Permanent income multiplier from all pearls ever earned. */
  get pearlBonus(): number {
    return 1 + this.state.pearlsEarned * PEARL_INCOME_BONUS;
  }

  get tapDamageMult(): number {
    return (this.isBoostActive('strongArms') ? 2 : 1) * Math.pow(1.5, this.state.pearlUpgrades.masterAngler) * (this.state.premium.bigHooks ? 2 : 1);
  }

  get critChance(): number {
    return CRIT_CHANCE + this.state.pearlUpgrades.luckyCharm * 0.01;
  }

  get luckyChance(): number {
    return LUCKY_CATCH_CHANCE + this.state.pearlUpgrades.luckyCharm * 0.01;
  }

  get bossSeconds(): number {
    return BOSS_FIGHT_SECONDS + this.state.pearlUpgrades.longBreath * 5;
  }

  get offlineCapHours(): number {
    return OFFLINE_CAP_HOURS + this.state.pearlUpgrades.deepPockets * 2 + (this.state.premium.nightShift ? 12 : 0);
  }

  // --- Rewarded ads (counting only; showing them is done by the Ads service) -------------

  get adsLeftToday(): number {
    const a = this.state.ads;
    return a.day === dayKey(this.now()) ? Math.max(0, AD_DAILY_LIMIT - a.count) : AD_DAILY_LIMIT;
  }

  recordAdWatched(): void {
    const today = dayKey(this.now());
    const a = this.state.ads;
    if (a.day !== today) {
      a.day = today;
      a.count = 0;
    }
    a.count++;
  }

  // --- Ruby shop ---------------------------------------------------------------------------

  spendRubies(n: number): boolean {
    if (this.state.rubies < n) return false;
    this.state.rubies -= n;
    return true;
  }

  buyPermanent(id: PermanentId): boolean {
    if (this.state.premium[id] || !this.spendRubies(PERMANENTS[id].rubies)) return false;
    this.state.premium[id] = true;
    this.emit({ type: 'purchase' });
    return true;
  }

  /** Gold for `hours` of income (at least the playing-income estimate). */
  timeWarpGold(hours: number): number {
    return Math.max(this.incomePerSecond, this.incomeEstimate) * hours * 3600;
  }

  timeWarp(index: number): number {
    const w = TIME_WARPS[index];
    if (!w || !this.spendRubies(w.rubies)) return 0;
    const gold = this.timeWarpGold(w.hours);
    this.addGold(gold);
    this.emit({ type: 'purchase' });
    return gold;
  }

  buySkin(id: BoatSkinId): boolean {
    const c = this.state.cosmetics;
    if (!c.skins.includes(id)) {
      if (!this.spendRubies(BOAT_SKINS[id].rubies)) return false;
      c.skins.push(id);
    }
    c.boatSkin = id;
    this.emit({ type: 'purchase' });
    return true;
  }

  buyDecor(id: DecorId): boolean {
    const c = this.state.cosmetics;
    if (c.decor.includes(id) || !this.spendRubies(DECOR[id].rubies)) return false;
    c.decor.push(id);
    this.emit({ type: 'purchase' });
    return true;
  }

  /** Harbour Manager: hire the cheapest available fisherman when it costs ≤ 20% of your gold. */
  managerStep(): boolean {
    const s = this.state;
    if (!s.premium.manager || !s.settings.autoHire) return false;
    let best = -1;
    let bestCost = Infinity;
    for (let t = 0; t < s.fishermen.length; t++) {
      if (!this.isFishermanUnlocked(t)) break;
      const c = fishermanBulkCost(t, s.fishermen[t], 1);
      if (c < bestCost) {
        bestCost = c;
        best = t;
      }
    }
    // a new kind of fisherman is worth more: open the next tier when it costs ≤ 50% of your gold
    const next = s.fishermen.findIndex((n) => n === 0);
    if (next > 0 && this.isFishermanUnlocked(next) && fishermanBulkCost(next, 0, 1) <= s.gold * 0.5) {
      return this.hireFisherman(next, 1);
    }
    if (best < 0 || bestCost > s.gold * 0.2) return false;
    return this.hireFisherman(best, 1);
  }

  // --- New Voyage (prestige) ------------------------------------------------------------

  /** Pearls a new voyage would give right now. */
  get pearlsForVoyage(): number {
    const s = this.state;
    if (s.level < PRESTIGE_MIN_LEVEL) return 0;
    const progress = s.level + (s.unlockedZone - 1) / 10;
    const raw = PEARL_SCALE * Math.pow(PEARL_LEVEL_GROWTH, progress - PRESTIGE_MIN_LEVEL) * (1 + s.pearlUpgrades.pearlDiver * 0.1);
    return Math.max(0, Math.floor(raw));
  }

  canStartVoyage(): boolean {
    return this.state.level >= PRESTIGE_MIN_LEVEL && this.pearlsForVoyage >= 1;
  }

  /** Gold every voyage starts with (Head Start). */
  get headStartGold(): number {
    const l = this.state.pearlUpgrades.headStart;
    return l > 0 ? 500 * Math.pow(10, l) : 0;
  }

  /**
   * Start over from level 1 for pearls. Keeps: pearls & pearl upgrades,
   * rubies, trophies, atlas, lifetime stats, missions, daily streak, boosts.
   */
  startVoyage(): number {
    if (!this.canStartVoyage()) return 0;
    const s = this.state;
    const pearls = this.pearlsForVoyage;
    s.pearls += pearls;
    s.pearlsEarned += pearls;
    s.voyages++;
    s.bestLevel = Math.max(s.bestLevel, s.level);
    s.level = 1;
    s.unlockedZone = 1;
    s.activeZone = 1;
    s.zoneCatches = {};
    s.bossesDefeated = [false, false];
    s.upgrades = { skill: 0, speed: 0, autoGear: 0, radar: 0, engine: 0 };
    s.fishermen = s.fishermen.map(() => 0);
    s.gold = this.headStartGold;
    s.runGold = 0;
    this.emit({ type: 'voyage', pearls });
    return pearls;
  }

  pearlUpgradeCost(id: PearlUpgradeId): number {
    const def = PEARL_UPGRADES[id];
    return Math.ceil(def.baseCost * Math.pow(def.costGrowth, this.state.pearlUpgrades[id]));
  }

  buyPearlUpgrade(id: PearlUpgradeId): boolean {
    const s = this.state;
    if (s.pearlUpgrades[id] >= PEARL_UPGRADES[id].maxLevel) return false;
    const cost = this.pearlUpgradeCost(id);
    if (s.pearls < cost) return false;
    s.pearls -= cost;
    s.pearlUpgrades[id]++;
    this.emit({ type: 'purchase' });
    return true;
  }

  get goldfishMult(): number {
    return (this.isBoostActive('goldenTide') ? 3 : 1) * (this.state.premium.goldenRadar ? 2 : 1);
  }

  /**
   * Rough gold per second of a playing player (fleet, or about one fish every
   * 6 seconds early on). Used to size rewards so they stay meaningful.
   */
  get incomeEstimate(): number {
    const s = this.state;
    return Math.max(this.incomePerSecond, (zoneAverageGold(s.level, bestFishingZone(s.unlockedZone)) * this.incomeMult) / 6);
  }

  rewardGold(minutes: number): number {
    return this.incomeEstimate * 60 * minutes;
  }

  /** Floating treasure chest / message in a bottle. */
  openChest(): ChestReward {
    const roll = this.rnd();
    let reward: ChestReward;
    if (roll < 0.12) reward = { kind: 'rubies', amount: 2 + Math.floor(this.rnd() * 4) };
    else if (roll < 0.22) reward = { kind: 'boost', boost: 'doubleHaul', minutes: 5 };
    else reward = { kind: 'gold', amount: this.rewardGold(1 + this.rnd() * 2) };
    this.grant(reward);
    this.state.stats.chestsOpened++;
    this.emit({ type: 'chest', reward });
    return reward;
  }

  grant(reward: ChestReward): void {
    if (reward.kind === 'gold') this.addGold(reward.amount);
    else if (reward.kind === 'rubies') this.state.rubies += reward.amount;
    else this.activateBoost(reward.boost, reward.minutes);
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: GameEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  // --- Derived values -----------------------------------------------------

  get incomePerSecond(): number {
    const s = this.state;
    return fleetIncomePerSecond(s.level, s.unlockedZone, s.fishermen, this.incomeMult * Math.pow(1.25, s.pearlUpgrades.biggerNets));
  }

  addGold(amount: number): void {
    this.state.gold += amount;
    this.state.stats.totalGold += amount;
    this.state.runGold += amount;
  }

  /** Advance idle production. */
  tick(dt: number): void {
    this.addGold(this.incomePerSecond * dt);
    this.state.stats.playSeconds += dt;
  }

  // --- Catching -------------------------------------------------------------

  pickSpecies(rarity: CatchableRarity): FishSpecies {
    const list = speciesFor(this.state.level, rarity);
    return list[Math.floor(this.rnd() * list.length)];
  }

  recordCatch(species: FishSpecies, zone: number): void {
    const s = this.state;
    const rarity = species.rarity as CatchableRarity;
    const lucky = this.rnd() < this.luckyChance;
    const gold = fishGold(s.level, zone, rarity) * this.incomeMult * this.eventGoldMult * (lucky ? LUCKY_CATCH_MULT : 1);
    if (rarity !== 'common') s.stats.rareCaught++;
    const firstTime = !s.atlas[species.id];
    s.atlas[species.id] = (s.atlas[species.id] ?? 0) + 1;
    s.zoneCatches[zone] = (s.zoneCatches[zone] ?? 0) + 1;
    s.stats.fishCaught++;
    const trophy = this.rnd() < (TROPHY_CHANCE[rarity] ?? 0);
    if (trophy) s.trophies++;
    this.addGold(gold);
    this.emit({ type: 'catch', species, gold, firstTime, trophy, lucky });
  }

  collectGoldfish(): number {
    const s = this.state;
    const gold = goldfishGold(s.level, s.activeZone, this.incomePerSecond) * this.incomeMult;
    const species = goldfishSpecies(s.level);
    s.atlas[species.id] = (s.atlas[species.id] ?? 0) + 1;
    s.stats.goldfishCaught++;
    this.addGold(gold);
    this.emit({ type: 'goldfish', species, gold });
    return gold;
  }

  defeatBoss(bossIndex: number): void {
    const s = this.state;
    if (s.bossesDefeated[bossIndex]) return;
    s.bossesDefeated[bossIndex] = true;
    s.stats.bossesDefeated++;
    s.trophies += 1;
    const species = bossSpecies(s.level, bossIndex);
    s.atlas[species.id] = (s.atlas[species.id] ?? 0) + 1;
    const gold = bossGold(s.level, bossIndex);
    this.addGold(gold);
    this.emit({ type: 'boss-defeated', species, gold, levelComplete: s.bossesDefeated[0] && s.bossesDefeated[1] });
  }

  // --- Zones ------------------------------------------------------------------

  nextZoneStatus(): UnlockStatus {
    const s = this.state;
    const current = s.unlockedZone;
    if (current >= ZONES_PER_LEVEL) return { kind: 'maxed' };
    const next = current + 1;
    const price = zoneUnlockPrice(s.level, next);
    if (isBossZone(current)) {
      const bossIndex = current === 5 ? 0 : 1;
      if (!s.bossesDefeated[bossIndex]) return { kind: 'need-boss', bossIndex, price };
    } else {
      const need = catchesToUnlockNext(current);
      const have = s.zoneCatches[current] ?? 0;
      if (have < need) return { kind: 'need-catches', have, need, price };
    }
    if (s.gold < price) return { kind: 'need-gold', price };
    return { kind: 'ready', price };
  }

  unlockNextZone(): boolean {
    const st = this.nextZoneStatus();
    if (st.kind !== 'ready') return false;
    this.state.gold -= st.price;
    this.state.unlockedZone++;
    this.state.stats.zonesUnlocked++;
    this.emit({ type: 'zone-unlocked', zone: this.state.unlockedZone });
    this.setActiveZone(this.state.unlockedZone);
    return true;
  }

  setActiveZone(zone: number): void {
    const z = Math.max(1, Math.min(this.state.unlockedZone, zone));
    if (z === this.state.activeZone) return;
    this.state.activeZone = z;
    this.emit({ type: 'zone-changed', zone: z });
  }

  get levelComplete(): boolean {
    return this.state.bossesDefeated[0] && this.state.bossesDefeated[1];
  }

  get nextLevelPrice(): number {
    return nextLevelPrice(this.state.level);
  }

  canSailToNextLevel(): boolean {
    return this.levelComplete && this.nextLevelPrice < MAX_PRICE && this.state.gold >= this.nextLevelPrice;
  }

  sailToNextLevel(): boolean {
    if (!this.canSailToNextLevel()) return false;
    const s = this.state;
    s.gold -= this.nextLevelPrice;
    s.level++;
    s.bestLevel = Math.max(s.bestLevel, s.level);
    s.unlockedZone = 1;
    s.activeZone = 1;
    s.zoneCatches = {};
    s.bossesDefeated = [false, false];
    this.emit({ type: 'level-changed', level: s.level });
    return true;
  }

  // --- Shops -----------------------------------------------------------------

  upgradeCost(id: UpgradeId): number {
    return upgradeCost(id, this.state.upgrades[id]);
  }

  canBuyUpgrade(id: UpgradeId): boolean {
    const lvl = this.state.upgrades[id];
    return lvl < UPGRADES[id].maxLevel && this.state.gold >= this.upgradeCost(id);
  }

  buyUpgrade(id: UpgradeId): boolean {
    if (!this.canBuyUpgrade(id)) return false;
    this.state.gold -= this.upgradeCost(id);
    this.state.upgrades[id]++;
    this.state.stats.upgradesBought++;
    this.emit({ type: 'purchase' });
    return true;
  }

  /** A fisherman tier becomes visible once the previous one has been hired. */
  isFishermanUnlocked(tier: number): boolean {
    return tier === 0 || this.state.fishermen[tier - 1] > 0;
  }

  hireFisherman(tier: number, count = 1): boolean {
    if (!this.isFishermanUnlocked(tier) || count <= 0) return false;
    const cost = fishermanBulkCost(tier, this.state.fishermen[tier], count);
    if (this.state.gold < cost) return false;
    this.state.gold -= cost;
    this.state.fishermen[tier] += count;
    this.state.stats.fishermenHired += count;
    this.emit({ type: 'purchase' });
    return true;
  }

  // --- Offline & rubies ---------------------------------------------------------

  /** Offline gold since `lastSeen` (not yet granted). */
  pendingOffline(now = Date.now()): { gold: number; seconds: number; countedSeconds: number } | null {
    const seconds = (now - this.state.lastSeen) / 1000;
    if (seconds < OFFLINE_MIN_SECONDS) return null;
    const { gold, countedSeconds } = offlineEarnings(this.incomePerSecond, seconds, this.offlineCapHours);
    if (gold <= 0) return null;
    return { gold, seconds, countedSeconds };
  }

  /** 'triple' costs rubies; 'double' is the reward of a watched ad. */
  claimOffline(gold: number, mode: 'normal' | 'double' | 'triple' = 'normal'): boolean {
    if (mode === 'triple') {
      if (this.state.rubies < OFFLINE_TRIPLE_RUBY_COST) return false;
      this.state.rubies -= OFFLINE_TRIPLE_RUBY_COST;
      gold *= 3;
    } else if (mode === 'double') gold *= 2;
    this.addGold(gold);
    return true;
  }

  addRubies(n: number): void {
    this.state.rubies += n;
  }
}
