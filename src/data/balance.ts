/**
 * Whale Hunter — balance data.
 *
 * Every tunable number in the game lives in this file. Values are taken from
 * the "Whale Hunter Balance" sheet where they work, and corrected where the
 * sheet breaks the economy (see comments marked FIX).
 *
 * Economy model (Egg Inc style):
 *   - Fishermen are the "chickens": they produce fish per second.
 *   - Fish are the "eggs": the fleet sells every fish for the average value of
 *     the best zone the player has unlocked.
 *   - The player's own boat is the active part: tapping fish, bosses,
 *     goldfish and rare catches for the Marine Atlas.
 */

export const LEVEL_COUNT = 10;
export const ZONES_PER_LEVEL = 10;
/** Zones (1-based) that contain a boss instead of a fish school. */
export const BOSS_ZONES = [5, 10] as const;

export type Rarity = 'common' | 'rare' | 'endangered' | 'legendary' | 'mythical' | 'goldfish';
export const CATCHABLE_RARITIES = ['common', 'rare', 'endangered', 'legendary'] as const;
export type CatchableRarity = (typeof CATCHABLE_RARITIES)[number];

export function isBossZone(zone: number): boolean {
  return zone === 5 || zone === 10;
}

/** Index of a fishing zone among the 8 non-boss zones (zone 1 → 0 … zone 9 → 7). */
export function fishingZoneOrdinal(zone: number): number {
  if (isBossZone(zone)) throw new Error(`zone ${zone} is a boss zone`);
  return zone < 5 ? zone - 1 : zone - 2;
}

// ---------------------------------------------------------------------------
// Fish spawn chances (sheet tab "Percentage"), in percent per zone.
// FIX: legendary was 0.01% (1 in 10,000 fish). With ~140 fish caught in zones
// 6–9 per level, players would see 0.014 legendaries per level while there are
// 5 to collect. Raised to 1–2%, taken out of "rare".
// ---------------------------------------------------------------------------
export const SPAWN_CHANCE: Record<number, Record<CatchableRarity, number>> = {
  1: { common: 100, rare: 0, endangered: 0, legendary: 0 },
  2: { common: 80, rare: 20, endangered: 0, legendary: 0 },
  3: { common: 70, rare: 25, endangered: 5, legendary: 0 },
  4: { common: 60, rare: 35, endangered: 5, legendary: 0 },
  6: { common: 50, rare: 39, endangered: 10, legendary: 1 },
  7: { common: 40, rare: 49, endangered: 10, legendary: 1 },
  8: { common: 35, rare: 48.5, endangered: 15, legendary: 1.5 },
  9: { common: 25, rare: 58, endangered: 15, legendary: 2 },
};

/** Goldfish appearances per minute per zone (sheet tab "Percentage"). */
export const GOLDFISH_PER_MINUTE: Record<number, number> = {
  1: 0, 2: 0.3, 3: 0.4, 4: 0.5, 5: 0, 6: 0.65, 7: 0.8, 8: 0.95, 9: 1.1, 10: 0,
};
/** Seconds a goldfish stays on the surface (GDD). */
export const GOLDFISH_LIFETIME = 8;

// ---------------------------------------------------------------------------
// Fish value. Sheet: gold per fish in zone 1 of each level, then ×1.33 per
// zone. Rarity multipliers are new (the sheet's per-rarity gold columns were
// left empty).
// ---------------------------------------------------------------------------
export const LEVEL_BASE_GOLD = [50, 1000, 15000, 2.5e5, 4.1e6, 7.0e7, 1.1e9, 1.8e10, 1.3e11, 9.4e11];
export const ZONE_GOLD_GROWTH = 1.33;
export const RARITY_GOLD_MULT: Record<CatchableRarity, number> = {
  common: 1,
  rare: 1.6,
  endangered: 4,
  legendary: 20,
};

// ---------------------------------------------------------------------------
// Fish stamina (HP). Sheet tab "Fish HP": common HP in zone 1 per level,
// a per-zone curve taken from level 1, and fixed rarity ratios
// (rare 1.33×, endangered 1.67×, legendary 2.33× — constant in the sheet).
// FIX: in the sheet HP dropped again in the outer zones of levels 2–4; the
// level-1 curve used here always rises outward.
// ---------------------------------------------------------------------------
export const LEVEL_BASE_HP = [15, 54, 104, 194, 378, 709, 1275, 2297, 4132, 7438];
/** HP multiplier for fishing zones 1,2,3,4,6,7,8,9 (ordinal 0–7). */
export const ZONE_HP_MULT = [1, 2, 2.71, 3.24, 3.59, 3.85, 4.03, 4.17];
export const RARITY_HP_MULT: Record<CatchableRarity, number> = {
  common: 1,
  rare: 1.33,
  endangered: 1.67,
  legendary: 2.33,
};

// ---------------------------------------------------------------------------
// Zone unlock prices (sheet tab "Zones Price"), for zones 1,2,3,4,6,7,8,9.
// The zone-1 price of level N is the price to sail on to level N.
// Boss zones are free but require the previous zone.
// ---------------------------------------------------------------------------
export const ZONE_PRICES: number[][] = [
  [16, 30, 55, 103, 192, 358, 667, 1242],
  [2400, 4469, 8321, 15494, 28849, 53717, 1.0e5, 1.86e5],
  [3.36e5, 6.26e5, 1.16e6, 2.17e6, 4.04e6, 7.52e6, 1.4e7, 2.61e7],
  [5.4e7, 1.01e8, 1.87e8, 3.49e8, 6.49e8, 1.21e9, 2.25e9, 4.19e9],
  [8.2e9, 1.53e10, 2.84e10, 5.29e10, 9.86e10, 1.84e11, 3.42e11, 6.36e11],
  [1.34e12, 2.5e12, 4.66e12, 8.68e12, 1.62e13, 3.01e13, 5.6e13, 1.04e14],
  [2.11e14, 3.93e14, 7.32e14, 1.36e15, 2.54e15, 4.73e15, 8.8e15, 1.64e16],
  [3.31e16, 6.17e16, 1.15e17, 2.14e17, 3.98e17, 7.41e17, 1.38e18, 2.57e18],
  [2.39e18, 4.45e18, 8.29e18, 1.54e19, 2.88e19, 5.35e19, 9.97e19, 1.86e20],
  [1.65e20, 3.47e20, 7.3e20, 1.53e21, 3.22e21, 6.76e21, 1.42e22, 2.98e22],
];
/**
 * Price factor per level on top of the sheet prices. The sheet priced zones
 * at a few fish each because it ignored fishermen income; with a fleet
 * earning in the background zones need to cost more to still be a goal.
 * Tuned with `npm run sim` to ≈25 min for level 1 growing to ≈3.5 h for
 * level 10 (≈15 h of active play in total, plus offline time).
 */
export const LEVEL_PRICE_MULT = [90, 636, 933, 2843, 3976, 4387, 8340, 14020, 10084, 3177];
/** Fish the player must catch in a zone before the next zone can be bought. */
export function catchesToUnlockNext(zone: number): number {
  return 6 + fishingZoneOrdinal(zone) * 2;
}

// ---------------------------------------------------------------------------
// Upgrades (sheet tab "Characteristics of Clicks").
// The sheet's column headers were shifted; mapping used here:
//   "Research Centre dmg/price"  → Angler's skill (damage per tap)
//   "Fishing Workshop clicks"    → Angler's speed (hits per tap)
//   "Boat workshop dmg/price"    → Automatic gear (auto damage per second)
// ---------------------------------------------------------------------------
export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  building: 'fishingWorkshop' | 'boatWorkshop';
  description: string;
  maxLevel: number;
  baseCost: number;
  costGrowth: number;
}
export type UpgradeId = 'skill' | 'speed' | 'autoGear' | 'radar';

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  skill: {
    id: 'skill',
    name: "Angler's Skill",
    building: 'fishingWorkshop',
    description: 'Damage of every tap ×1.2',
    maxLevel: 100,
    baseCost: 100, // sheet: 100 ×1.5
    costGrowth: 1.5,
  },
  speed: {
    id: 'speed',
    name: "Angler's Speed",
    building: 'fishingWorkshop',
    description: '+0.5 hits per tap',
    maxLevel: 60,
    baseCost: 1000,
    // FIX: sheet doubled the price per level for a linear +0.5 bonus, which
    // made it worthless after ~level 20 and unaffordable after level 65.
    costGrowth: 1.62,
  },
  autoGear: {
    id: 'autoGear',
    name: 'Automatic Gear',
    building: 'boatWorkshop',
    description: 'Boat reels in fish by itself',
    maxLevel: 100,
    baseCost: 150,
    // FIX: sheet grew price ×1.2 per level, so level 100 cost 6.9e9 — maxed out
    // by level 4 of 10. Now grows with the rest of the economy.
    costGrowth: 1.48,
  },
  radar: {
    id: 'radar',
    name: 'Radar',
    building: 'boatWorkshop',
    description: 'Goldfish appear more often (+15%)',
    maxLevel: 20,
    baseCost: 500,
    costGrowth: 2.4,
  },
};

export const SKILL_GROWTH = 1.2;
export const SPEED_PER_LEVEL = 0.5;
export const AUTO_GEAR_BASE_DPS = 1.2;
export const AUTO_GEAR_GROWTH = 1.215;
export const RADAR_PER_LEVEL = 0.15;

// ---------------------------------------------------------------------------
// Fishermen (Fishermen's School). Names from the GDD (25).
// FIX: the sheet had 50 fishermen where each tier cost ×3 but earned only ×2,
// so payback time grew ×1.5 per tier (Ocean God: 68 years) and the last two
// cost more than the whole game earns. Here each tier costs ×7.5 and produces
// ×2.4, while fish value grows ~×15 per level — payback stays in a playable
// range when a tier is bought at the level it is meant for (the last tier
// arrives around level 9). Hiring another of the same fisherman costs ×1.12
// (sheet: ×1.07, which let income snowball too fast).
// ---------------------------------------------------------------------------
export const FISHERMAN_NAMES = [
  'Apprentice Fisherman',
  'Goldfish Catcher',
  'Advanced Fisherman',
  'Rod Master',
  'Ship Captain',
  'Water Hero',
  'Deep Sea Explorer',
  'Legendary Navigator',
  'Ocean King',
  'Sea Innovator',
  'Miracle Fish Catcher',
  'Expert Angler',
  'Captain Crab',
  'Lord of the Waves',
  'Water Magician',
  'Ocean Conqueror',
  'Atlantic Traveller',
  'Sea Captain',
  'Pirate Master',
  'Coral Reef Master',
  'Brave Man of Water Fights',
  'Defender of the Sea',
  'Star Fisherman',
  'Lord of the Deep',
  'Ocean Wizard',
];
export const FISHERMAN_BASE_COST = 500;
export const FISHERMAN_TIER_COST_GROWTH = 7.5;
/** Fish per second of one fisherman of tier 0. */
export const FISHERMAN_BASE_PROD = 0.06;
export const FISHERMAN_TIER_PROD_GROWTH = 2.4;
export const FISHERMAN_HIRE_COST_GROWTH = 1.12;
/** Production doubles when you own this many of one fisherman. */
export const FISHERMAN_MILESTONES = [25, 50, 100, 200];

// ---------------------------------------------------------------------------
// Bosses (mythical fish). GDD: 60 s fight, mini-game at 80% and 40%,
// 10 s mini-game, 2% max HP per green hit, slider speeds up per hit.
// Boss HP was missing from the sheet; it is expressed in "taps" of a common
// fish of that level so it scales with the rest of the curve.
// ---------------------------------------------------------------------------
export const BOSS_FIGHT_SECONDS = 60;
export const BOSS_MINIGAME_SECONDS = 10;
export const BOSS_MINIGAME_THRESHOLDS = [0.8, 0.4];
export const BOSS_MINIGAME_HIT_PCT = 0.02;
export const BOSS_MINIGAME_SPEED_START = 0.9; // slider sweeps per second
export const BOSS_MINIGAME_SPEED_STEP = 0.18;
export const BOSS_MINIGAME_GREEN_SIZE = 0.2; // fraction of the bar
/** Boss HP = common fish HP of the zone in front of it × this. */
export const BOSS_HP_MULT = [16, 26];
/** Boss reward = zone-1 fish value of the level × this. Sheet: ≈15× and 22×. */
export const BOSS_GOLD_MULT = [40, 80];

// ---------------------------------------------------------------------------
// Goldfish reward. Sheet left it empty.
// ---------------------------------------------------------------------------
export const GOLDFISH_FISH_VALUE_MULT = 25;
export const GOLDFISH_FLEET_SECONDS = 30;

// ---------------------------------------------------------------------------
// Offline earnings. GDD: 80% the first week, 50% until a month, then 10%.
// Added a cap (idle-game standard; Egg Inc does the same) so returning after
// a week does not replace actually playing. Raise it to Infinity to get the
// pure GDD behaviour.
// ---------------------------------------------------------------------------
export const OFFLINE_CAP_HOURS = 12;
export const OFFLINE_EFFICIENCY = [
  { untilDays: 7, efficiency: 0.8 },
  { untilDays: 30, efficiency: 0.5 },
  { untilDays: Infinity, efficiency: 0.1 },
];
export const OFFLINE_TRIPLE_RUBY_COST = 10;
export const OFFLINE_MIN_SECONDS = 60;

// ---------------------------------------------------------------------------
// Rubies.
// ---------------------------------------------------------------------------
export const STARTING_RUBIES = 25;
export const AD_RUBY_REWARD = 5;

/** Assumed human tap rate, used by the simulation script. */
export const SIM_TAPS_PER_SECOND = 5;

// ---------------------------------------------------------------------------
// Engagement: combo/frenzy, crits, lucky catches, treasure, boosts,
// missions and daily rewards.
// ---------------------------------------------------------------------------

/** Taps closer together than this keep the combo going. */
export const COMBO_WINDOW = 0.55;
/** Combo needed to start a frenzy. */
export const COMBO_FOR_FRENZY = 30;
export const FRENZY_SECONDS = 8;
export const FRENZY_DAMAGE_MULT = 2;
export const FRENZY_GOLDFISH_MULT = 2;

export const CRIT_CHANCE = 0.08;
export const CRIT_MULT = 3;
export const LUCKY_CATCH_CHANCE = 0.05;
export const LUCKY_CATCH_MULT = 3;

/** Seconds between floating treasure (random in this range). */
export const TREASURE_INTERVAL = [75, 150] as const;
export const TREASURE_LIFETIME = 14;

export type BoostId = 'doubleHaul' | 'strongArms' | 'goldenTide';
export interface BoostDef {
  id: BoostId;
  name: string;
  description: string;
  minutes: number;
  rubyCost: number;
  /** Can be earned by watching an ad. */
  ad: boolean;
}
export const BOOSTS: Record<BoostId, BoostDef> = {
  doubleHaul: { id: 'doubleHaul', name: 'Double Haul', description: '2× gold from every fish, fleet included', minutes: 15, rubyCost: 10, ad: true },
  strongArms: { id: 'strongArms', name: 'Strong Arms', description: '2× tap damage', minutes: 10, rubyCost: 6, ad: false },
  goldenTide: { id: 'goldenTide', name: 'Golden Tide', description: '3× more golden koi', minutes: 10, rubyCost: 6, ad: false },
};
/** Boost time can stack up to this many hours. */
export const BOOST_MAX_HOURS = 4;

/** Missions shown at the same time. */
export const MISSION_SLOTS = 3;
/** Mission targets grow by this fraction per completed mission. */
export const MISSION_GROWTH = 0.08;

/** Daily reward cycle (7 days). Gold is given as minutes of income. */
export type DailyReward =
  | { kind: 'gold'; minutes: number }
  | { kind: 'rubies'; amount: number }
  | { kind: 'boost'; boost: BoostId; minutes: number };
export const DAILY_REWARDS: DailyReward[] = [
  { kind: 'gold', minutes: 5 },
  { kind: 'rubies', amount: 5 },
  { kind: 'boost', boost: 'doubleHaul', minutes: 30 },
  { kind: 'gold', minutes: 30 },
  { kind: 'rubies', amount: 10 },
  { kind: 'boost', boost: 'goldenTide', minutes: 30 },
  { kind: 'rubies', amount: 25 },
];
