import {
  AUTO_GEAR_BASE_DPS,
  AUTO_GEAR_GROWTH,
  BOSS_GOLD_MULT,
  BOSS_HP_MULT,
  CATCHABLE_RARITIES,
  type CatchableRarity,
  FISHERMAN_BASE_COST,
  FISHERMAN_BASE_PROD,
  FISHERMAN_HIRE_COST_GROWTH,
  FISHERMAN_MILESTONE_STEP,
  FISHERMAN_MILESTONES,
  levelBaseGold,
  levelBaseHp,
  levelPriceMult,
  zoneBasePrice,
  FISHERMAN_NAMES,
  FISHERMAN_TIER_COST_GROWTH,
  FISHERMAN_TIER_PROD_GROWTH,
  fishingZoneOrdinal,
  GOLDFISH_FISH_VALUE_MULT,
  GOLDFISH_FLEET_SECONDS,
  GOLDFISH_PER_MINUTE,
  isBossZone,
  OFFLINE_CAP_HOURS,
  OFFLINE_EFFICIENCY,
  RADAR_PER_LEVEL,
  ENGINE_SPEED_PER_LEVEL,
  ENGINE_VISUAL_TIERS,
  RARITY_GOLD_MULT,
  RARITY_HP_MULT,
  SKILL_GROWTH,
  SPAWN_CHANCE,
  SPEED_PER_LEVEL,
  UPGRADES,
  type UpgradeId,
  ZONE_GOLD_GROWTH,
  ZONE_HP_MULT,
} from '../data/balance';

// --- Fish -------------------------------------------------------------------

export function fishGold(level: number, zone: number, rarity: CatchableRarity): number {
  const ord = fishingZoneOrdinal(zone);
  return levelBaseGold(level) * Math.pow(ZONE_GOLD_GROWTH, ord) * RARITY_GOLD_MULT[rarity];
}

export function fishHp(level: number, zone: number, rarity: CatchableRarity): number {
  const ord = fishingZoneOrdinal(zone);
  return levelBaseHp(level) * ZONE_HP_MULT[ord] * RARITY_HP_MULT[rarity];
}

/** Expected gold of one random fish in a zone (spawn-weighted). */
export function zoneAverageGold(level: number, zone: number): number {
  const chances = SPAWN_CHANCE[zone];
  let total = 0;
  for (const r of CATCHABLE_RARITIES) total += (chances[r] / 100) * fishGold(level, zone, r);
  return total;
}

/** Highest non-boss zone that is unlocked. */
export function bestFishingZone(unlockedZone: number): number {
  for (let z = unlockedZone; z >= 1; z--) if (!isBossZone(z)) return z;
  return 1;
}

export function rollRarity(zone: number, rnd: () => number = Math.random): CatchableRarity {
  const chances = SPAWN_CHANCE[zone];
  let roll = rnd() * 100;
  for (const r of CATCHABLE_RARITIES) {
    roll -= chances[r];
    if (roll < 0) return r;
  }
  return 'common';
}

export function goldfishPerMinute(zone: number, radarLevel: number): number {
  return (GOLDFISH_PER_MINUTE[zone] ?? 0) * radarMultiplier(radarLevel);
}

// --- Player upgrades -------------------------------------------------------

export type UpgradeLevels = Record<UpgradeId, number>;

export function upgradeCost(id: UpgradeId, currentLevel: number): number {
  const def = UPGRADES[id];
  return def.baseCost * Math.pow(def.costGrowth, currentLevel);
}

export function tapDamage(u: UpgradeLevels): number {
  return Math.pow(SKILL_GROWTH, u.skill) * (1 + u.speed * SPEED_PER_LEVEL);
}

export function autoDps(u: UpgradeLevels): number {
  if (u.autoGear <= 0) return 0;
  return AUTO_GEAR_BASE_DPS * Math.pow(AUTO_GEAR_GROWTH, u.autoGear - 1);
}

/** Boat speed multiplier from the Engine upgrade. */
export function boatSpeedMult(engineLevel: number): number {
  return 1 + engineLevel * ENGINE_SPEED_PER_LEVEL;
}

/** 0 = no motor, 1 = outboard motor, 2 = twin motors, 3 = turbo. */
export function engineVisualTier(engineLevel: number): number {
  return ENGINE_VISUAL_TIERS.filter((t) => engineLevel >= t).length;
}

export function radarMultiplier(radarLevel: number): number {
  return 1 + radarLevel * RADAR_PER_LEVEL;
}

// --- Fishermen (the fleet) -----------------------------------------------------

export const FISHERMAN_COUNT = FISHERMAN_NAMES.length;

export function fishermanCost(tier: number, owned: number): number {
  return (
    FISHERMAN_BASE_COST *
    Math.pow(FISHERMAN_TIER_COST_GROWTH, tier) *
    Math.pow(FISHERMAN_HIRE_COST_GROWTH, owned)
  );
}

/** Cost of hiring `n` more of a fisherman (geometric series). */
export function fishermanBulkCost(tier: number, owned: number, n: number): number {
  if (n <= 0) return 0;
  const g = FISHERMAN_HIRE_COST_GROWTH;
  return (fishermanCost(tier, owned) * (Math.pow(g, n) - 1)) / (g - 1);
}

/** How many of a fisherman can be bought with `gold` (capped at `max`). */
export function fishermanMaxAffordable(tier: number, owned: number, gold: number, max = 1000): number {
  const first = fishermanCost(tier, owned);
  if (gold < first) return 0;
  const g = FISHERMAN_HIRE_COST_GROWTH;
  const n = Math.floor(Math.log((gold * (g - 1)) / first + 1) / Math.log(g));
  return Math.max(0, Math.min(max, n));
}

function milestonesReached(owned: number): number {
  const last = FISHERMAN_MILESTONES[FISHERMAN_MILESTONES.length - 1];
  const fixed = FISHERMAN_MILESTONES.filter((m) => owned >= m).length;
  return fixed + (owned >= last ? Math.floor((owned - last) / FISHERMAN_MILESTONE_STEP) : 0);
}

export function fishermanMilestoneMult(owned: number): number {
  return Math.pow(2, milestonesReached(owned));
}

export function nextFishermanMilestone(owned: number): number {
  const next = FISHERMAN_MILESTONES.find((m) => m > owned);
  if (next !== undefined) return next;
  const last = FISHERMAN_MILESTONES[FISHERMAN_MILESTONES.length - 1];
  return last + (Math.floor((owned - last) / FISHERMAN_MILESTONE_STEP) + 1) * FISHERMAN_MILESTONE_STEP;
}

/** Fish per second produced by all fishermen of one tier. */
export function fishermanProduction(tier: number, owned: number): number {
  if (owned <= 0) return 0;
  return (
    FISHERMAN_BASE_PROD *
    Math.pow(FISHERMAN_TIER_PROD_GROWTH, tier) *
    owned *
    fishermanMilestoneMult(owned)
  );
}

export function fleetFishPerSecond(fishermen: number[]): number {
  let total = 0;
  for (let t = 0; t < fishermen.length; t++) total += fishermanProduction(t, fishermen[t]);
  return total;
}

export function fleetIncomePerSecond(level: number, unlockedZone: number, fishermen: number[], incomeMult = 1): number {
  return fleetFishPerSecond(fishermen) * zoneAverageGold(level, bestFishingZone(unlockedZone)) * incomeMult;
}

// --- Zones & levels ----------------------------------------------------------

export function zoneUnlockPrice(level: number, zone: number): number {
  if (isBossZone(zone)) return 0;
  return zoneBasePrice(level, fishingZoneOrdinal(zone)) * levelPriceMult(level);
}

export function nextLevelPrice(level: number): number {
  return zoneBasePrice(level + 1, 0) * levelPriceMult(level + 1);
}

// --- Bosses -----------------------------------------------------------------

export function bossHp(level: number, bossIndex: number): number {
  const zoneInFront = bossIndex === 0 ? 4 : 9;
  return levelBaseHp(level) * ZONE_HP_MULT[fishingZoneOrdinal(zoneInFront)] * BOSS_HP_MULT[bossIndex];
}

export function bossGold(level: number, bossIndex: number): number {
  return levelBaseGold(level) * BOSS_GOLD_MULT[bossIndex];
}

// --- Goldfish ---------------------------------------------------------------

export function goldfishGold(level: number, zone: number, fleetIncome: number): number {
  const z = isBossZone(zone) ? zone - 1 : zone;
  return Math.max(GOLDFISH_FISH_VALUE_MULT * zoneAverageGold(level, z), GOLDFISH_FLEET_SECONDS * fleetIncome);
}

// --- Offline ----------------------------------------------------------------

/**
 * Gold earned while away. Efficiency follows the GDD curve (80% first week,
 * 50% until a month, 10% after) and the counted time is capped.
 */
export function offlineEarnings(incomePerSecond: number, secondsAway: number, capHours = OFFLINE_CAP_HOURS): { gold: number; countedSeconds: number } {
  const counted = Math.max(0, Math.min(secondsAway, capHours * 3600));
  let remaining = counted;
  let gold = 0;
  let start = 0;
  for (const band of OFFLINE_EFFICIENCY) {
    const end = band.untilDays * 86400;
    const span = Math.min(remaining, end - start);
    if (span <= 0) break;
    gold += span * incomePerSecond * band.efficiency;
    remaining -= span;
    start = end;
  }
  return { gold, countedSeconds: counted };
}
