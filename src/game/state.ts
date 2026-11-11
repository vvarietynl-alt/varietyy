import { type BoatSkinId, type BoostId, type DecorId, type PearlUpgradeId, type PermanentId, STARTING_RUBIES, type UpgradeId } from '../data/balance';
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
  settings: { sound: boolean; haptics: boolean; autoHire: boolean };
  /** Boost expiry times (epoch ms). */
  boosts: Record<BoostId, number>;
  missions: Mission[];
  daily: { lastClaimDay: string | null; streak: number };
  /** Pearls available to spend in the pearl shop. */
  pearls: number;
  /** Every pearl ever earned; each gives a permanent income bonus. */
  pearlsEarned: number;
  pearlUpgrades: Record<PearlUpgradeId, number>;
  /** Gold earned in the current voyage (decides the pearl reward). */
  runGold: number;
  voyages: number;
  bestLevel: number;
  /** One-time ruby purchases (survive voyages). */
  premium: Record<PermanentId, boolean> & { captainsPass: boolean };
  companyName: string;
  cosmetics: { boatSkin: BoatSkinId; skins: BoatSkinId[]; decor: DecorId[] };
  /** Rewarded ads watched today. */
  ads: { day: string; count: number };
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
    settings: { sound: true, haptics: true, autoHire: true },
    boosts: { doubleHaul: 0, strongArms: 0, goldenTide: 0 },
    missions: [],
    daily: { lastClaimDay: null, streak: 0 },
    pearls: 0,
    pearlsEarned: 0,
    pearlUpgrades: { masterAngler: 0, biggerNets: 0, headStart: 0, longBreath: 0, luckyCharm: 0, deepPockets: 0, pearlDiver: 0 },
    runGold: 0,
    voyages: 0,
    bestLevel: 1,
    premium: { goldenHull: false, bigHooks: false, goldenRadar: false, nightShift: false, manager: false, captainsPass: false },
    companyName: 'Whale Hunter Co.',
    cosmetics: { boatSkin: 'classic', skins: ['classic'], decor: [] },
    ads: { day: '', count: 0 },
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
      pearlUpgrades: { ...fresh.pearlUpgrades, ...(data.pearlUpgrades ?? {}) },
      premium: { ...fresh.premium, ...(data.premium ?? {}) },
      cosmetics: { ...fresh.cosmetics, ...(data.cosmetics ?? {}) },
      ads: { ...fresh.ads, ...(data.ads ?? {}) },
      atlas: { ...(data.atlas ?? {}) },
      zoneCatches: { ...(data.zoneCatches ?? {}) },
      version: SAVE_VERSION,
    };
    const f = Array.isArray(data.fishermen) ? data.fishermen : [];
    s.fishermen = fresh.fishermen.map((_, i) => (Number.isFinite(f[i]) ? f[i] : 0));
    if (!Number.isFinite(s.gold) || s.gold < 0) s.gold = 0;
    if (data.runGold === undefined) s.runGold = s.stats.totalGold;
    if (data.bestLevel === undefined) s.bestLevel = s.level;
    return s;
  } catch {
    return fresh;
  }
}

export function serializeState(s: GameState): string {
  return JSON.stringify(s);
}
