import { DAILY_REWARDS, type DailyReward, MISSION_GROWTH, MISSION_SLOTS, ZONES_PER_LEVEL } from '../data/balance';
import { formatNumber } from './format';
import type { Game } from './game';
import type { Mission, StatKey } from './state';

/**
 * Missions: always three goals on screen. Progress is measured as the change
 * of a stat since the mission started, so nothing else has to report to it.
 */

interface MissionTemplate {
  stat: StatKey;
  base: number;
  label: (n: number) => string;
  /** Only offer when this returns true. */
  available?: (g: Game) => boolean;
  /** Target in gold instead of a count. */
  gold?: boolean;
}

const TEMPLATES: MissionTemplate[] = [
  { stat: 'fishCaught', base: 15, label: (n) => `Catch ${n} fish` },
  { stat: 'rareCaught', base: 3, label: (n) => `Catch ${n} rare or better fish`, available: (g) => g.state.unlockedZone >= 2 },
  { stat: 'goldfishCaught', base: 2, label: (n) => `Catch ${n} golden koi`, available: (g) => g.state.unlockedZone >= 2 },
  { stat: 'fishermenHired', base: 5, label: (n) => `Hire ${n} fishermen` },
  { stat: 'upgradesBought', base: 3, label: (n) => `Buy ${n} upgrades` },
  { stat: 'taps', base: 300, label: (n) => `Tap ${n} times` },
  { stat: 'chestsOpened', base: 1, label: (n) => `Open ${n} treasure ${n === 1 ? 'chest' : 'chests'}` },
  { stat: 'totalGold', base: 0, gold: true, label: (n) => `Earn ${formatNumber(n)} gold` },
  { stat: 'zonesUnlocked', base: 1, label: () => 'Unlock a new zone', available: (g) => g.state.unlockedZone < ZONES_PER_LEVEL },
  { stat: 'bossesDefeated', base: 1, label: () => 'Defeat a boss', available: (g) => !g.levelComplete && g.state.unlockedZone >= 4 },
];

let nextId = Date.now();

export function missionLabel(m: Mission): string {
  const t = TEMPLATES.find((o) => o.stat === m.stat)!;
  return t.label(m.target);
}

export function missionProgress(g: Game, m: Mission): number {
  return Math.max(0, Math.min(m.target, g.state.stats[m.stat] - m.base));
}

export function missionDone(g: Game, m: Mission): boolean {
  return missionProgress(g, m) >= m.target;
}

export function claimableMissions(g: Game): number {
  return g.state.missions.filter((m) => missionDone(g, m)).length;
}

function createMission(g: Game, rnd: () => number): Mission {
  const s = g.state;
  const taken = new Set(s.missions.map((m) => m.stat));
  const options = TEMPLATES.filter((t) => !taken.has(t.stat) && (t.available?.(g) ?? true));
  const t = options[Math.floor(rnd() * options.length)] ?? TEMPLATES[0];
  const scale = 1 + s.stats.missionsDone * MISSION_GROWTH;
  let target: number;
  if (t.gold) {
    const raw = g.rewardGold(6 + rnd() * 6);
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(10, raw))));
    target = Math.ceil(raw / mag) * mag;
  } else if (t.base === 1) {
    target = t.stat === 'chestsOpened' ? Math.min(3, 1 + Math.floor(s.stats.missionsDone / 8)) : 1;
  } else {
    target = Math.max(1, Math.round(t.base * scale * (0.8 + rnd() * 0.5)));
  }
  return {
    id: nextId++,
    stat: t.stat,
    target,
    base: s.stats[t.stat],
    rewardRubies: rnd() < 0.4 ? 2 : 1,
    rewardMinutes: 4 + Math.round(rnd() * 4),
  };
}

/** Keep MISSION_SLOTS missions available. */
export function ensureMissions(g: Game, rnd: () => number = Math.random): void {
  while (g.state.missions.length < MISSION_SLOTS) g.state.missions.push(createMission(g, rnd));
}

export function claimMission(g: Game, id: number, rnd: () => number = Math.random): { gold: number; rubies: number } | null {
  const s = g.state;
  const m = s.missions.find((o) => o.id === id);
  if (!m || !missionDone(g, m)) return null;
  const gold = g.rewardGold(m.rewardMinutes);
  g.addGold(gold);
  s.rubies += m.rewardRubies;
  s.stats.missionsDone++;
  s.missions = s.missions.filter((o) => o !== m);
  ensureMissions(g, rnd);
  return { gold, rubies: m.rewardRubies };
}

/** Swap a mission for a new one (free, once it has been visible a while it is just a choice). */
export function skipMission(g: Game, id: number, rnd: () => number = Math.random): void {
  g.state.missions = g.state.missions.filter((o) => o.id !== id);
  ensureMissions(g, rnd);
}

// --- Daily reward ------------------------------------------------------------------------

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function canClaimDaily(g: Game): boolean {
  return g.state.daily.lastClaimDay !== dayKey(g.now());
}

/** Day of the 7-day cycle the next claim gives (0-based). */
export function nextDailyIndex(g: Game): number {
  const d = g.state.daily;
  const yesterday = dayKey(g.now() - 86400e3);
  const continues = d.lastClaimDay === yesterday || d.lastClaimDay === dayKey(g.now());
  const streak = continues ? d.streak : 0;
  return canClaimDaily(g) ? streak % DAILY_REWARDS.length : (streak - 1 + DAILY_REWARDS.length) % DAILY_REWARDS.length;
}

/** Current streak in days (resets when a day is missed). */
export function dailyStreak(g: Game): number {
  const d = g.state.daily;
  const today = dayKey(g.now());
  const yesterday = dayKey(g.now() - 86400e3);
  return d.lastClaimDay === today || d.lastClaimDay === yesterday ? d.streak : 0;
}

export function claimDaily(g: Game): DailyReward | null {
  if (!canClaimDaily(g)) return null;
  const idx = nextDailyIndex(g);
  const reward = DAILY_REWARDS[idx];
  const d = g.state.daily;
  d.streak = dailyStreak(g) + 1;
  d.lastClaimDay = dayKey(g.now());
  if (reward.kind === 'gold') g.addGold(g.rewardGold(reward.minutes));
  else if (reward.kind === 'rubies') g.state.rubies += reward.amount;
  else g.activateBoost(reward.boost, reward.minutes);
  return reward;
}
