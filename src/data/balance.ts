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

/** Hand-made seas. After these the game continues endlessly with tougher versions (see levelBaseGold etc.). */
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
/**
 * Price curve inside every level (by fishing-zone ordinal; ordinal 0 of
 * level N is the price to enter it). The first zones of a level are cheap so
 * a new sea opens up quickly, the last ones cost more. Playtest: without it
 * the first zone of a new level took ~10 minutes and zone 2 of the game 4.5.
 */
export const ZONE_PRICE_CURVE = [1, 0.3, 0.45, 0.65, 1, 1.25, 1.5, 1.8];
/** Extra discount for the very first zones of the game. */
export const FIRST_LEVEL_ZONE_DISCOUNT = [1, 0.5, 0.7, 0.85, 1, 1, 1, 1];
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
export type UpgradeId = 'skill' | 'speed' | 'autoGear' | 'radar' | 'engine';

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  skill: {
    id: 'skill',
    name: "Angler's Skill",
    building: 'fishingWorkshop',
    description: 'Damage of every tap ×1.2',
    maxLevel: 1000,
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
    maxLevel: 1000,
    baseCost: 150,
    // FIX: sheet grew price ×1.2 per level, so level 100 cost 6.9e9 — maxed out
    // by level 4 of 10. Now grows with the rest of the economy.
    costGrowth: 1.48,
  },
  engine: {
    id: 'engine',
    name: 'Engine',
    building: 'boatWorkshop',
    description: 'Your boat sails 8% faster',
    maxLevel: 25,
    baseCost: 300,
    costGrowth: 1.6,
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
export const ENGINE_SPEED_PER_LEVEL = 0.08;
/** Engine level at which the boat model gets an outboard motor, twin motors and a turbo. */
export const ENGINE_VISUAL_TIERS = [1, 10, 25];

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
/** After the last milestone, production keeps doubling every this many hires (endless play). */
export const FISHERMAN_MILESTONE_STEP = 100;

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

// ---------------------------------------------------------------------------
// Endless play
// ---------------------------------------------------------------------------
// After level 10 the seas repeat as tougher versions ("Sunny Shallows II" …).
// Per extra level: fish worth ×4, fish HP ×1.75, zone prices ×16 and a price
// factor ×1.25 (so a level needs ~5× more income than the one before) —
// sooner or later a New Voyage with pearls is the way forward.
// Growth is kept modest so numbers stay below the JavaScript limit (1e308)
// until about level 200. Simulated: each voyage reaches ~10 levels further
// than the last, voyages slowly get longer (3 h → 20 h); see
// `npm run sim -- --voyages 14`.
export const ENDLESS_GOLD_GROWTH = 4;
export const ENDLESS_HP_GROWTH = 1.75;
export const ENDLESS_PRICE_GROWTH = 16;
export const ENDLESS_PRICE_MULT_GROWTH = 1.25;

export function levelBaseGold(level: number): number {
  if (level <= LEVEL_COUNT) return LEVEL_BASE_GOLD[level - 1];
  return LEVEL_BASE_GOLD[LEVEL_COUNT - 1] * Math.pow(ENDLESS_GOLD_GROWTH, level - LEVEL_COUNT);
}

export function levelBaseHp(level: number): number {
  if (level <= LEVEL_COUNT) return LEVEL_BASE_HP[level - 1];
  return LEVEL_BASE_HP[LEVEL_COUNT - 1] * Math.pow(ENDLESS_HP_GROWTH, level - LEVEL_COUNT);
}

/** Sheet zone price for a level and fishing-zone ordinal, extrapolated after level 10. */
export function zoneBasePrice(level: number, ordinal: number): number {
  const curve = ZONE_PRICE_CURVE[ordinal] * (level === 1 ? FIRST_LEVEL_ZONE_DISCOUNT[ordinal] : 1);
  if (level <= LEVEL_COUNT) return ZONE_PRICES[level - 1][ordinal] * curve;
  return ZONE_PRICES[LEVEL_COUNT - 1][ordinal] * curve * Math.pow(ENDLESS_PRICE_GROWTH, level - LEVEL_COUNT);
}

/** Safety limit: beyond this the numbers would overflow. */
export const MAX_PRICE = 1e290;

export function levelPriceMult(level: number): number {
  if (level <= LEVEL_COUNT) return LEVEL_PRICE_MULT[level - 1];
  return LEVEL_PRICE_MULT[LEVEL_COUNT - 1] * Math.pow(ENDLESS_PRICE_MULT_GROWTH, level - LEVEL_COUNT);
}

// ---------------------------------------------------------------------------
// New Voyage (prestige) and pearls
// ---------------------------------------------------------------------------
/** Level you must have reached before starting a new voyage. */
export const PRESTIGE_MIN_LEVEL = 3;
/**
 * Pearls for a voyage depend on how far you sailed (level + zone/10):
 * PEARL_SCALE × PEARL_LEVEL_GROWTH ^ (progress − PRESTIGE_MIN_LEVEL).
 * The growth per level must beat how much harder each level gets, otherwise
 * voyages stop getting further (checked with `npm run sim -- --voyages 12`).
 */
export const PEARL_SCALE = 10;
export const PEARL_LEVEL_GROWTH = 3;
/** Every pearl ever earned: +2% gold from all fish, permanently. */
export const PEARL_INCOME_BONUS = 0.02;

export type PearlUpgradeId = 'masterAngler' | 'biggerNets' | 'headStart' | 'longBreath' | 'luckyCharm' | 'deepPockets' | 'pearlDiver';
export interface PearlUpgradeDef {
  id: PearlUpgradeId;
  name: string;
  description: string;
  icon: string;
  maxLevel: number;
  baseCost: number;
  costGrowth: number;
}
export const PEARL_UPGRADES: Record<PearlUpgradeId, PearlUpgradeDef> = {
  masterAngler: { id: 'masterAngler', name: 'Master Angler', description: 'Tap damage ×1.5', icon: '🎣', maxLevel: 500, baseCost: 5, costGrowth: 2.2 },
  biggerNets: { id: 'biggerNets', name: 'Bigger Nets', description: 'Fleet catches ×1.25', icon: '🕸️', maxLevel: 500, baseCost: 5, costGrowth: 2.2 },
  headStart: { id: 'headStart', name: 'Head Start', description: 'Start every voyage with more gold', icon: '💼', maxLevel: 10, baseCost: 10, costGrowth: 2.5 },
  longBreath: { id: 'longBreath', name: 'Long Breath', description: '+5 s for boss fights', icon: '⏱️', maxLevel: 6, baseCost: 15, costGrowth: 2.2 },
  luckyCharm: { id: 'luckyCharm', name: 'Lucky Charm', description: '+1% lucky catch and critical hit chance', icon: '🍀', maxLevel: 10, baseCost: 10, costGrowth: 1.8 },
  deepPockets: { id: 'deepPockets', name: 'Deep Pockets', description: '+2 h offline earnings', icon: '🌙', maxLevel: 12, baseCost: 8, costGrowth: 1.7 },
  pearlDiver: { id: 'pearlDiver', name: 'Pearl Diver', description: '+10% pearls from every voyage', icon: '🐚', maxLevel: 25, baseCost: 20, costGrowth: 1.9 },
};

// ---------------------------------------------------------------------------
// Rewarded ads, ruby shop, cosmetics
// ---------------------------------------------------------------------------
/** Rewarded ads a player can watch per day (keeps them special). */
export const AD_DAILY_LIMIT = 12;
/** Extra boss time from an ad or rubies when the boss is almost down. */
export const BOSS_CONTINUE_SECONDS = 15;
export const BOSS_CONTINUE_RUBIES = 5;
/** Offer a continue only when the boss has at most this much stamina left. */
export const BOSS_CONTINUE_MAX_HP = 0.35;
/** Seconds a "double it" offer stays on screen. */
export const DOUBLE_OFFER_SECONDS = 6;

export type PermanentId = 'goldenHull' | 'bigHooks' | 'goldenRadar' | 'nightShift' | 'manager';
export interface PermanentDef { id: PermanentId; name: string; description: string; icon: string; rubies: number }
/** One-time ruby purchases that last forever (they also survive a New Voyage). */
export const PERMANENTS: Record<PermanentId, PermanentDef> = {
  goldenHull: { id: 'goldenHull', name: 'Golden Hull', description: '2× gold from every fish, forever', icon: '🏆', rubies: 500 },
  bigHooks: { id: 'bigHooks', name: 'Big Hooks', description: '2× tap damage, forever', icon: '🪝', rubies: 300 },
  goldenRadar: { id: 'goldenRadar', name: 'Golden Radar', description: '2× more golden koi, forever', icon: '📡', rubies: 200 },
  nightShift: { id: 'nightShift', name: 'Night Shift', description: '+12 h offline earnings, forever', icon: '🌙', rubies: 250 },
  manager: { id: 'manager', name: 'Harbour Manager', description: 'Hires fishermen for you automatically', icon: '🧑‍💼', rubies: 400 },
};

/** Instant gold: hours of fleet income. */
export const TIME_WARPS = [
  { hours: 1, rubies: 20 },
  { hours: 4, rubies: 60 },
  { hours: 24, rubies: 250 },
];

/** Captain's Pass (real-money purchase later): rewards without ads + daily rubies. */
export const CAPTAINS_PASS_DAILY_RUBIES = 10;

export type BoatSkinId = 'classic' | 'ocean' | 'pirate' | 'neon' | 'golden';
export interface BoatSkin { id: BoatSkinId; name: string; hull: number; trim: number; roof: number; glow?: number; rubies: number }
export const BOAT_SKINS: Record<BoatSkinId, BoatSkin> = {
  classic: { id: 'classic', name: 'Classic', hull: 0xd8392f, trim: 0xfaf6ee, roof: 0xd8392f, rubies: 0 },
  ocean: { id: 'ocean', name: 'Ocean Blue', hull: 0x2e6fd8, trim: 0xf2f7ff, roof: 0x1f4fa8, rubies: 50 },
  pirate: { id: 'pirate', name: 'Pirate Black', hull: 0x2a2a2a, trim: 0x8b1e1e, roof: 0x111111, rubies: 150 },
  neon: { id: 'neon', name: 'Neon Night', hull: 0x3b1f6b, trim: 0x2de2e6, roof: 0xff3d9a, glow: 0x2de2e6, rubies: 200 },
  golden: { id: 'golden', name: 'Golden Yacht', hull: 0xffc928, trim: 0xfff6d6, roof: 0xc98a00, glow: 0xffb000, rubies: 300 },
};

export type DecorId = 'flowers' | 'lanterns' | 'fountain' | 'statue' | 'flags';
export interface DecorDef { id: DecorId; name: string; icon: string; rubies: number }
export const DECOR: Record<DecorId, DecorDef> = {
  flowers: { id: 'flowers', name: 'Flower garden', icon: '🌺', rubies: 40 },
  flags: { id: 'flags', name: 'Company flags', icon: '🚩', rubies: 60 },
  lanterns: { id: 'lanterns', name: 'Harbour lanterns', icon: '🏮', rubies: 80 },
  fountain: { id: 'fountain', name: 'Fountain', icon: '⛲', rubies: 120 },
  statue: { id: 'statue', name: 'Golden whale statue', icon: '🐋', rubies: 250 },
};

// ---------------------------------------------------------------------------
// Sea events and Atlas sets
// ---------------------------------------------------------------------------
export type SeaEventKind = 'school' | 'goldenHour';
export interface SeaEventDef { kind: SeaEventKind; name: string; description: string; seconds: number; icon: string }
export const SEA_EVENTS: Record<SeaEventKind, SeaEventDef> = {
  school: { kind: 'school', name: 'Fish Frenzy', description: '×2 gold', seconds: 30, icon: '🐟' },
  goldenHour: { kind: 'goldenHour', name: 'Golden Hour', description: 'koi everywhere', seconds: 20, icon: '🌅' },
};
/** First event after this many seconds of play, then every 4–7 minutes. */
export const SEA_EVENT_FIRST = 150;
export const SEA_EVENT_INTERVAL = [240, 420] as const;
export const SCHOOL_FISH = 13;
export const SCHOOL_GOLD_MULT = 2;
export const GOLDEN_HOUR_GOLDFISH_PER_MINUTE = 9;

/** Completing a group of species in the Atlas: rubies + permanent income bonus. */
export type AtlasGroup = 'common' | 'rare' | 'endangered' | 'legendary' | 'special';
export const ATLAS_SET_RUBIES: Record<AtlasGroup, number> = { common: 5, rare: 10, endangered: 15, legendary: 25, special: 20 };
export const ATLAS_SET_BONUS = 0.02;
