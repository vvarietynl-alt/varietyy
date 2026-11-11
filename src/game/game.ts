import {
  catchesToUnlockNext,
  type CatchableRarity,
  isBossZone,
  LEVEL_COUNT,
  OFFLINE_MIN_SECONDS,
  OFFLINE_TRIPLE_RUBY_COST,
  UPGRADES,
  type UpgradeId,
  ZONES_PER_LEVEL,
} from '../data/balance';
import { bossSpecies, goldfishSpecies, speciesFor, type FishSpecies } from '../data/fish';
import {
  bossGold,
  fishermanBulkCost,
  fishGold,
  fleetIncomePerSecond,
  goldfishGold,
  nextLevelPrice,
  offlineEarnings,
  upgradeCost,
  zoneUnlockPrice,
} from './economy';
import { type GameState, newGame } from './state';

export type GameEvent =
  | { type: 'catch'; species: FishSpecies; gold: number; firstTime: boolean; trophy: boolean }
  | { type: 'goldfish'; species: FishSpecies; gold: number }
  | { type: 'boss-defeated'; species: FishSpecies; gold: number; levelComplete: boolean }
  | { type: 'zone-unlocked'; zone: number }
  | { type: 'level-changed'; level: number }
  | { type: 'zone-changed'; zone: number }
  | { type: 'purchase' }
  | { type: 'toast'; text: string };

export type Listener = (e: GameEvent) => void;

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
  /** Temporary income multiplier (boosts); 1 = none. */
  incomeMult = 1;

  constructor(state: GameState = newGame(), private rnd: () => number = Math.random) {
    this.state = state;
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
    return fleetIncomePerSecond(s.level, s.unlockedZone, s.fishermen, this.incomeMult);
  }

  addGold(amount: number): void {
    this.state.gold += amount;
    this.state.stats.totalGold += amount;
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
    const gold = fishGold(s.level, zone, rarity);
    const firstTime = !s.atlas[species.id];
    s.atlas[species.id] = (s.atlas[species.id] ?? 0) + 1;
    s.zoneCatches[zone] = (s.zoneCatches[zone] ?? 0) + 1;
    s.stats.fishCaught++;
    const trophy = this.rnd() < (TROPHY_CHANCE[rarity] ?? 0);
    if (trophy) s.trophies++;
    this.addGold(gold);
    this.emit({ type: 'catch', species, gold, firstTime, trophy });
  }

  collectGoldfish(): number {
    const s = this.state;
    const gold = goldfishGold(s.level, s.activeZone, this.incomePerSecond);
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
    return this.levelComplete && this.state.level < LEVEL_COUNT && this.state.gold >= this.nextLevelPrice;
  }

  sailToNextLevel(): boolean {
    if (!this.canSailToNextLevel()) return false;
    const s = this.state;
    s.gold -= this.nextLevelPrice;
    s.level++;
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
    this.emit({ type: 'purchase' });
    return true;
  }

  // --- Offline & rubies ---------------------------------------------------------

  /** Offline gold since `lastSeen` (not yet granted). */
  pendingOffline(now = Date.now()): { gold: number; seconds: number; countedSeconds: number } | null {
    const seconds = (now - this.state.lastSeen) / 1000;
    if (seconds < OFFLINE_MIN_SECONDS) return null;
    const { gold, countedSeconds } = offlineEarnings(this.incomePerSecond, seconds);
    if (gold <= 0) return null;
    return { gold, seconds, countedSeconds };
  }

  claimOffline(gold: number, triple: boolean): boolean {
    if (triple) {
      if (this.state.rubies < OFFLINE_TRIPLE_RUBY_COST) return false;
      this.state.rubies -= OFFLINE_TRIPLE_RUBY_COST;
      gold *= 3;
    }
    this.addGold(gold);
    return true;
  }

  addRubies(n: number): void {
    this.state.rubies += n;
  }
}
