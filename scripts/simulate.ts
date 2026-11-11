/**
 * Balance simulation: a greedy "reasonable player" plays the whole game with
 * constant active play and buys whatever gives the best return.
 *
 *   npm run sim                 → summary per level (first voyage, levels 1–10)
 *   npm run sim -- --zones      → also print every zone
 *   npm run sim -- --voyages 8  → endless play: voyages with prestige in between
 *
 * Use it after changing src/data/balance.ts to see the effect on play time.
 */
import {
  BOSS_MINIGAME_HIT_PCT,
  PEARL_UPGRADES,
  type PearlUpgradeId,
  BOSS_MINIGAME_SECONDS,
  isBossZone,
  LEVEL_COUNT,
  SIM_TAPS_PER_SECOND,
  UPGRADES,
  type UpgradeId,
} from '../src/data/balance';
import {
  autoDps,
  boatSpeedMult,
  bestFishingZone,
  bossHp,
  fishermanCost,
  fishermanProduction,
  FISHERMAN_COUNT,
  fishHp,
  goldfishGold,
  goldfishPerMinute,
  tapDamage,
  zoneAverageGold,
} from '../src/game/economy';
import { formatDuration, formatNumber } from '../src/game/format';
import { Game } from '../src/game/game';

const printZones = process.argv.includes('--zones');
const TRAVEL_SECONDS = 2.5; // boat sailing to the next fish (divided by the engine speed)
const MINIGAME_HITS = 6; // green hits per mini-game for an average player

const game = new Game(undefined, () => 0.5);
const s = game.state;
let t = 0;
let levelStart = 0;
let zoneStart = 0;
let activeGold = 0;
let fleetGold = 0;
/** Longest wait between two zone unlocks in the current level ("is it getting boring?"). */
let longestWait = 0;

function averageHp(level: number, zone: number): number {
  // spawn-weighted HP is close to common×1.25 in the outer zones; keep it simple
  return fishHp(level, zone, 'common') * (zone >= 6 ? 1.25 : zone >= 2 ? 1.1 : 1);
}

/**
 * Extra income a real player gets on top of fishing and the fleet, measured
 * in "income estimate" seconds per second (see Game.incomeEstimate):
 * treasure chests (~2 min of income every ~112 s) and missions (~3 min of
 * income roughly every 3 minutes). Sea events add ~5% to fish gold.
 */
const CHEST_BONUS = 120 / 112.5;
const MISSION_BONUS = 1.0;
const EVENT_FISH_BONUS = 1.055;
const LUCKY_FISH_BONUS = 1.1; // 5% chance of ×3
const CRIT_DAMAGE_BONUS = 1.16; // 8% chance of ×3

function bonusIncome(): number {
  return game.incomeEstimate * (CHEST_BONUS + MISSION_BONUS);
}

function activeIncome(): number {
  const zone = bestFishingZone(s.unlockedZone);
  const dps = playerDps();
  const secondsPerFish = TRAVEL_SECONDS / boatSpeedMult(s.upgrades.engine) + averageHp(s.level, zone) / dps;
  const fishIncome = (zoneAverageGold(s.level, zone) * game.incomeMult * EVENT_FISH_BONUS * LUCKY_FISH_BONUS) / secondsPerFish;
  const goldfish = (goldfishPerMinute(zone, s.upgrades.radar) / 60) * 0.7 * goldfishGold(s.level, zone, game.incomePerSecond);
  return fishIncome + goldfish + bonusIncome();
}

function playerDps(): number {
  return tapDamage(s.upgrades) * game.tapDamageMult * CRIT_DAMAGE_BONUS * SIM_TAPS_PER_SECOND + autoDps(s.upgrades);
}

function canBeatBoss(bossIndex: number): boolean {
  const hp = bossHp(s.level, bossIndex);
  const tapSeconds = game.bossSeconds - 2 * BOSS_MINIGAME_SECONDS;
  const dmg = playerDps() * tapSeconds + 2 * MINIGAME_HITS * BOSS_MINIGAME_HIT_PCT * hp;
  return dmg >= hp;
}

type Option = { cost: number; gain: number; buy: () => void; label: string };

function options(stuckOnBoss: boolean): Option[] {
  const opts: Option[] = [];
  const baseActive = activeIncome();
  for (const id of Object.keys(UPGRADES) as UpgradeId[]) {
    if (s.upgrades[id] >= UPGRADES[id].maxLevel) continue;
    const cost = game.upgradeCost(id);
    s.upgrades[id]++;
    let gain = activeIncome() - baseActive;
    s.upgrades[id]--;
    if (stuckOnBoss && (id === 'skill' || id === 'speed' || id === 'autoGear')) gain *= 50;
    opts.push({ cost, gain, buy: () => game.buyUpgrade(id), label: id });
  }
  const fishValue = zoneAverageGold(s.level, bestFishingZone(s.unlockedZone)) * game.incomeMult * Math.pow(1.25, s.pearlUpgrades.biggerNets);
  for (let tier = 0; tier < FISHERMAN_COUNT; tier++) {
    if (!game.isFishermanUnlocked(tier)) break;
    const owned = s.fishermen[tier];
    const cost = fishermanCost(tier, owned);
    const gain = (fishermanProduction(tier, owned + 1) - fishermanProduction(tier, owned)) * fishValue;
    opts.push({ cost, gain, buy: () => game.hireFisherman(tier, 1), label: `F${tier}` });
  }
  return opts;
}

const voyagesArg = process.argv.indexOf('--voyages');
const VOYAGES = voyagesArg > 0 ? Number(process.argv[voyagesArg + 1] ?? 5) : 0;
const MAX_SECONDS = 2000 * 3600;

/** Play one voyage. In endless mode it stops when progress gets slow. */
function playVoyage(endless: boolean): void {
  let lastLevelTime = 0;
  const voyageStart = t;
  if (!endless) console.log('level | time      | cumulative | fleet share | fishermen owned (top tier) | skill/speed/auto | longest wait for a new zone');
  while (t < MAX_SECONDS) {
    if (endless) {
      const inLevel = t - levelStart;
      const slow = inLevel > Math.max(1800, 2.5 * lastLevelTime);
      if ((slow && game.canStartVoyage()) || t - voyageStart > 40 * 3600) return;
    }
    // 1. progress if possible
    const st = game.nextZoneStatus();
    if (st.kind === 'ready') {
      game.unlockNextZone();
      longestWait = Math.max(longestWait, t - zoneStart);
      if (printZones) console.log(`   zone ${s.unlockedZone - 1} → ${s.unlockedZone} after ${formatDuration(t - zoneStart)}`);
      zoneStart = t;
      continue;
    }
    const atBoss = isBossZone(s.unlockedZone);
    const bossIndex = s.unlockedZone === 5 ? 0 : 1;
    if (atBoss && !s.bossesDefeated[bossIndex] && canBeatBoss(bossIndex)) {
      t += game.bossSeconds;
      game.defeatBoss(bossIndex);
      longestWait = Math.max(longestWait, t - zoneStart);
      zoneStart = t;
      continue;
    }
    if (game.levelComplete) {
      if (!endless && (s.level >= LEVEL_COUNT || s.level >= Number(process.env.SIM_STOP_LEVEL ?? 99))) {
        console.log(`${String(s.level).padStart(5)} | ${formatDuration(t - levelStart).padEnd(9)} | ${formatDuration(t).padEnd(10)} | longest wait ${formatDuration(Math.max(longestWait, t - zoneStart))}`);
        return;
      }
      if (game.canSailToNextLevel()) {
        const top = s.fishermen.reduce((m, n, i) => (n > 0 ? i : m), -1);
        if (!endless) {
          console.log(
            `${String(s.level).padStart(5)} | ${formatDuration(t - levelStart).padEnd(9)} | ${formatDuration(t).padEnd(10)} | ${((fleetGold / (fleetGold + activeGold)) * 100).toFixed(0).padStart(10)}% | ${String(s.fishermen.reduce((a, b) => a + b, 0)).padStart(5)} (tier ${top + 1}: ${s.fishermen[top] ?? 0})`.padEnd(70) +
              ` | ${s.upgrades.skill}/${s.upgrades.speed}/${s.upgrades.autoGear} | longest wait ${formatDuration(Math.max(longestWait, t - zoneStart))}` +
              ` | taps/fish z1 ${(fishHp(s.level, 1, 'common') / (tapDamage(s.upgrades) * game.tapDamageMult)).toFixed(1)} z9 ${(fishHp(s.level, 9, 'common') / (tapDamage(s.upgrades) * game.tapDamageMult)).toFixed(1)}`,
          );
        }
        longestWait = 0;
        lastLevelTime = t - levelStart;
        game.sailToNextLevel();
        levelStart = t;
        zoneStart = t;
        activeGold = fleetGold = 0;
        continue;
      }
    }

    // 2. catches needed in the current zone happen through active play
    if (st.kind === 'need-catches') {
      const missing = st.need - st.have;
      const zone = s.unlockedZone;
      const secs = missing * (TRAVEL_SECONDS / boatSpeedMult(s.upgrades.engine) + averageHp(s.level, zone) / playerDps());
      const a = activeIncome() * secs;
      const f = game.incomePerSecond * secs;
      game.addGold(a + f);
      activeGold += a;
      fleetGold += f;
      t += secs;
      s.zoneCatches[zone] = st.need;
      continue;
    }

    // 3. stuck at a boss: a real player buys damage first
    const stuck = atBoss && !s.bossesDefeated[bossIndex];
    if (stuck) {
      const dmgIds = (['skill', 'autoGear', 'speed'] as UpgradeId[]).filter((id) => s.upgrades[id] < UPGRADES[id].maxLevel && game.upgradeCost(id) <= s.gold * 0.5);
      if (dmgIds.length) {
        dmgIds.sort((a, b) => game.upgradeCost(a) - game.upgradeCost(b));
        game.buyUpgrade(dmgIds[0]);
        continue;
      }
    }
    // buy the best option (gold per second gained per gold spent)
    const income = activeIncome() + game.incomePerSecond;
    // score = time to save up + time to earn the cost back
    const score = (o: Option) => Math.max(0, (o.cost - s.gold) / income) + o.cost / o.gain;
    const opts = options(stuck).filter((o) => o.gain > 0).sort((a, b) => score(a) - score(b));
    const best = opts[0];
    if (best && best.cost <= s.gold) {
      best.buy();
      continue;
    }

    // 4. play for a bit (bigger steps when waiting long)
    const dt = best ? Math.min(60, Math.max(1, (best.cost - s.gold) / income / 20)) : 1;
    const a = activeIncome() * dt;
    const f = game.incomePerSecond * dt;
    game.addGold(a + f);
    activeGold += a;
    fleetGold += f;
    t += dt;
  }
}

if (VOYAGES > 0) {
  console.log('voyage | time     | reached level | pearls +     | pearl bonus | pearl upgrades (angler/nets/diver)');
  for (let v = 1; v <= VOYAGES; v++) {
    const start = t;
    levelStart = zoneStart = t;
    playVoyage(true);
    const reached = s.level;
    const st = game.nextZoneStatus();
    const atBoss = isBossZone(s.unlockedZone) && !s.bossesDefeated[s.unlockedZone === 5 ? 0 : 1];
    const blocker = atBoss ? `boss (dps ${formatNumber(playerDps())} vs hp ${formatNumber(bossHp(s.level, s.unlockedZone === 5 ? 0 : 1))})` : st.kind === 'maxed' ? 'next level price' : `zone ${s.unlockedZone + 1}: ${st.kind}`;
    if (process.argv.includes('--why')) console.log(`        stopped at zone ${s.unlockedZone}: ${blocker}`);
    const pearls = game.startVoyage();
    // spend pearls: always buy the cheapest pearl upgrade we can afford
    for (;;) {
      const ids = (Object.keys(PEARL_UPGRADES) as PearlUpgradeId[]).filter((id) => s.pearlUpgrades[id] < PEARL_UPGRADES[id].maxLevel);
      ids.sort((a, b) => game.pearlUpgradeCost(a) - game.pearlUpgradeCost(b));
      if (!ids.length || !game.buyPearlUpgrade(ids[0])) break;
    }
    const pu = s.pearlUpgrades;
    console.log(
      `${String(v).padStart(6)} | ${formatDuration(t - start).padEnd(8)} | ${String(reached).padStart(13)} | ${formatNumber(pearls).padStart(12)} | ${('×' + formatNumber(game.pearlBonus)).padStart(11)} | ${pu.masterAngler}/${pu.biggerNets}/${pu.pearlDiver}`,
    );
  }
  console.log(`\nTotal: ${(t / 3600).toFixed(1)} h of active play over ${VOYAGES} voyages.`);
} else {
  playVoyage(false);
  if (t >= MAX_SECONDS) console.log(`!! stuck at level ${s.level} zone ${s.unlockedZone} (${game.nextZoneStatus().kind})`);
  console.log(`\nTotal active play: ${formatDuration(t)} (${(t / 3600).toFixed(1)} h). Gold earned: ${formatNumber(s.stats.totalGold)}`);
}
