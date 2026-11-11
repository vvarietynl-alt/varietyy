/**
 * Balance simulation: a greedy "reasonable player" plays the whole game with
 * constant active play and buys whatever gives the best return.
 *
 *   npm run sim            → summary per level
 *   npm run sim -- --zones → also print every zone
 *
 * Use it after changing src/data/balance.ts to see the effect on play time.
 */
import {
  BOSS_FIGHT_SECONDS,
  BOSS_MINIGAME_HIT_PCT,
  BOSS_MINIGAME_SECONDS,
  isBossZone,
  LEVEL_COUNT,
  SIM_TAPS_PER_SECOND,
  UPGRADES,
  type UpgradeId,
} from '../src/data/balance';
import {
  autoDps,
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
const TRAVEL_SECONDS = 2.5; // boat sailing to the next fish
const MINIGAME_HITS = 6; // green hits per mini-game for an average player

const game = new Game(undefined, () => 0.5);
const s = game.state;
let t = 0;
let levelStart = 0;
let zoneStart = 0;
let activeGold = 0;
let fleetGold = 0;

function averageHp(level: number, zone: number): number {
  // spawn-weighted HP is close to common×1.25 in the outer zones; keep it simple
  return fishHp(level, zone, 'common') * (zone >= 6 ? 1.25 : zone >= 2 ? 1.1 : 1);
}

function activeIncome(): number {
  const zone = bestFishingZone(s.unlockedZone);
  const dps = tapDamage(s.upgrades) * SIM_TAPS_PER_SECOND + autoDps(s.upgrades);
  const secondsPerFish = TRAVEL_SECONDS + averageHp(s.level, zone) / dps;
  const fishIncome = zoneAverageGold(s.level, zone) / secondsPerFish;
  const goldfish = (goldfishPerMinute(zone, s.upgrades.radar) / 60) * 0.7 * goldfishGold(s.level, zone, game.incomePerSecond);
  return fishIncome + goldfish;
}

function canBeatBoss(bossIndex: number): boolean {
  const hp = bossHp(s.level, bossIndex);
  const tapSeconds = BOSS_FIGHT_SECONDS - 2 * BOSS_MINIGAME_SECONDS;
  const dmg = (tapDamage(s.upgrades) * SIM_TAPS_PER_SECOND + autoDps(s.upgrades)) * tapSeconds + 2 * MINIGAME_HITS * BOSS_MINIGAME_HIT_PCT * hp;
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
  const fishValue = zoneAverageGold(s.level, bestFishingZone(s.unlockedZone));
  for (let tier = 0; tier < FISHERMAN_COUNT; tier++) {
    if (!game.isFishermanUnlocked(tier)) break;
    const owned = s.fishermen[tier];
    const cost = fishermanCost(tier, owned);
    const gain = (fishermanProduction(tier, owned + 1) - fishermanProduction(tier, owned)) * fishValue;
    opts.push({ cost, gain, buy: () => game.hireFisherman(tier, 1), label: `F${tier}` });
  }
  return opts;
}

console.log('level | time      | cumulative | fleet share | fishermen owned (top tier) | skill/speed/auto');
const MAX_SECONDS = 2000 * 3600;
while (t < MAX_SECONDS) {
  // 1. progress if possible
  const st = game.nextZoneStatus();
  if (st.kind === 'ready') {
    game.unlockNextZone();
    if (printZones) console.log(`   zone ${s.unlockedZone - 1} → ${s.unlockedZone} after ${formatDuration(t - zoneStart)}`);
    zoneStart = t;
    continue;
  }
  const atBoss = isBossZone(s.unlockedZone);
  const bossIndex = s.unlockedZone === 5 ? 0 : 1;
  if (atBoss && !s.bossesDefeated[bossIndex] && canBeatBoss(bossIndex)) {
    t += BOSS_FIGHT_SECONDS;
    game.defeatBoss(bossIndex);
    continue;
  }
  if (game.levelComplete) {
    if (s.level >= LEVEL_COUNT || s.level >= Number(process.env.SIM_STOP_LEVEL ?? 99)) {
      console.log(`${String(s.level).padStart(5)} | ${formatDuration(t - levelStart).padEnd(9)} | ${formatDuration(t)}`);
      break;
    }
    if (game.canSailToNextLevel()) {
      const top = s.fishermen.reduce((m, n, i) => (n > 0 ? i : m), -1);
      console.log(
        `${String(s.level).padStart(5)} | ${formatDuration(t - levelStart).padEnd(9)} | ${formatDuration(t).padEnd(10)} | ${((fleetGold / (fleetGold + activeGold)) * 100).toFixed(0).padStart(10)}% | ${String(s.fishermen.reduce((a, b) => a + b, 0)).padStart(5)} (tier ${top + 1}: ${s.fishermen[top] ?? 0})`.padEnd(70) +
          ` | ${s.upgrades.skill}/${s.upgrades.speed}/${s.upgrades.autoGear}`,
      );
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
    const dps = tapDamage(s.upgrades) * SIM_TAPS_PER_SECOND + autoDps(s.upgrades);
    const secs = missing * (TRAVEL_SECONDS + averageHp(s.level, zone) / dps);
    const a = activeIncome() * secs;
    const f = game.incomePerSecond * secs;
    game.addGold(a + f);
    activeGold += a;
    fleetGold += f;
    t += secs;
    s.zoneCatches[zone] = st.need;
    continue;
  }

  // 3. buy the best option (gold per second gained per gold spent)
  const stuck = atBoss && !s.bossesDefeated[bossIndex];
  const income = activeIncome() + game.incomePerSecond;
  // score = time to save up + time to earn the cost back
  const score = (o: Option) => Math.max(0, (o.cost - s.gold) / income) + o.cost / o.gain;
  const opts = options(stuck).filter((o) => o.gain > 0).sort((a, b) => score(a) - score(b));
  const best = opts[0];
  if (best && best.cost <= s.gold) {
    best.buy();
    continue;
  }

  // 4. play for a bit
  const dt = 1;
  const a = activeIncome() * dt;
  const f = game.incomePerSecond * dt;
  game.addGold(a + f);
  activeGold += a;
  fleetGold += f;
  t += dt;
}

if (t >= MAX_SECONDS) console.log(`!! stuck at level ${s.level} zone ${s.unlockedZone} (${game.nextZoneStatus().kind})`);
console.log(`\nTotal active play: ${formatDuration(t)} (${(t / 3600).toFixed(1)} h). Gold earned: ${formatNumber(s.stats.totalGold)}`);
