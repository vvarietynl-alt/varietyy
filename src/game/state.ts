import { type BoostId, STARTING_RUBIES, type UpgradeId } from '../data/balance';
import { FISHERMAN_COUNT } from './economy';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'whale-hunter-save';

export interface GameStats {
  totalGold: number;
  fishCaught: number;
  goldfishCaught: number;
  bossesDefeated: number;
  taps: number;
  playSeconds: number;
  rareCaught: number;
  fishermenHired: number;
  upgradesBought: number;
  chestsOpened: number;
  zonesUnlocked: number;
  missionsDone: number;
}

export type StatKey = keyof GameStats;

export interface Mission {
  id: number;
  stat: StatKey;
  target: number;
  /** stat value when the mission started; progress = stat - base */
  base: number;
  rewardRubies: number;
  rewardMinutes: number;
}

export interface GameState {
  version: number;
  gold: number;
  rubies: number;
  trophies: number;
  /** Current level (1-based). */
  level: number;
  /** Highest unlocked zone of the current level (1–10). */
  unlockedZone: number;
  /** Zone the boat is fishing in. */
  activeZone: number;
  /** Fish caught per zone in the current level. */
  zoneCatches: Record<number, number>;
  /** Bosses beaten in the current level: [zone 5, zone 10]. */
  bossesDefeated: [boolean, boolean];
  upgrades: Record<UpgradeId, number>;
  /** Number hired of each fisherman tier. */
  fishermen: number[];
  /** Marine Atlas: species id → number caught. */
  atlas: Record<string, number>;
  stats: GameStats;
  /** Epoch ms of the last save; used for offline earnings. */
  lastSeen: number;
  tutorialStep: number;
  settings: { sound: boolean; haptics: boolean };
  /** Boost expiry times (epoch ms). */
  boosts: Record<BoostId, number>;
  missions: Mission[];
  daily: { lastClaimDay: string | null; streak: number };
}

export function newGame(now = Date.now()): GameState {
  return {
    version: SAVE_VERSION,
    gold: 0,
    rubies: STARTING_RUBIES,
    trophies: 0,
    level: 1,
    unlockedZone: 1,
    activeZone: 1,
    zoneCatches: {},
    bossesDefeated: [false, false],
    upgrades: { skill: 0, speed: 0, autoGear: 0, radar: 0 },
    fishermen: new Array(FISHERMAN_COUNT).fill(0),
    atlas: {},
    stats: {
      totalGold: 0, fishCaught: 0, goldfishCaught: 0, bossesDefeated: 0, taps: 0, playSeconds: 0,
      rareCaught: 0, fishermenHired: 0, upgradesBought: 0, chestsOpened: 0, zonesUnlocked: 0, missionsDone: 0,
    },
    lastSeen: now,
    tutorialStep: 0,
    settings: { sound: true, haptics: true },
    boosts: { doubleHaul: 0, strongArms: 0, goldenTide: 0 },
    missions: [],
    daily: { lastClaimDay: null, streak: 0 },
  };
}

/** Parse a save, filling in anything missing so old saves keep working. */
export function loadState(raw: string | null, now = Date.now()): GameState {
  const fresh = newGame(now);
  if (!raw) return fresh;
  try {
    const data = JSON.parse(raw) as Partial<GameState>;
    const s: GameState = {
      ...fresh,
      ...data,
      upgrades: { ...fresh.upgrades, ...(data.upgrades ?? {}) },
      stats: { ...fresh.stats, ...(data.stats ?? {}) },
      settings: { ...fresh.settings, ...(data.settings ?? {}) },
      boosts: { ...fresh.boosts, ...(data.boosts ?? {}) },
      missions: Array.isArray(data.missions) ? data.missions : [],
      daily: { ...fresh.daily, ...(data.daily ?? {}) },
      atlas: { ...(data.atlas ?? {}) },
      zoneCatches: { ...(data.zoneCatches ?? {}) },
      version: SAVE_VERSION,
    };
    const f = Array.isArray(data.fishermen) ? data.fishermen : [];
    s.fishermen = fresh.fishermen.map((_, i) => (Number.isFinite(f[i]) ? f[i] : 0));
    if (!Number.isFinite(s.gold) || s.gold < 0) s.gold = 0;
    return s;
  } catch {
    return fresh;
  }
}

export function serializeState(s: GameState): string {
  return JSON.stringify(s);
}
