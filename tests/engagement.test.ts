import { describe, expect, it } from 'vitest';
import { COMBO_FOR_FRENZY, DAILY_REWARDS, MISSION_SLOTS } from '../src/data/balance';
import { FishingWorld } from '../src/game/fishing';
import { Game } from '../src/game/game';
import { canClaimDaily, claimDaily, claimMission, dailyStreak, ensureMissions, missionDone, nextDailyIndex } from '../src/game/missions';
import { newGame } from '../src/game/state';

const DAY = 86400e3;

function gameAt(t: number): Game {
  const g = new Game(newGame(), () => 0.5);
  g.now = () => t;
  return g;
}

describe('boosts', () => {
  it('double haul doubles fish gold and stacks up to 4 hours', () => {
    let t = 1_000_000;
    const g = gameAt(t);
    g.now = () => t;
    const sp = g.pickSpecies('common');
    g.activateBoost('doubleHaul', 10);
    g.recordCatch(sp, 1);
    expect(g.state.gold).toBe(100);
    for (let i = 0; i < 40; i++) g.activateBoost('doubleHaul', 10);
    expect(g.boostSecondsLeft('doubleHaul')).toBe(4 * 3600);
    t += 5 * 3600e3;
    expect(g.isBoostActive('doubleHaul')).toBe(false);
  });

  it('costs rubies', () => {
    const g = gameAt(0);
    g.state.rubies = 5;
    expect(g.buyBoost('doubleHaul')).toBe(false);
    g.state.rubies = 10;
    expect(g.buyBoost('doubleHaul')).toBe(true);
    expect(g.state.rubies).toBe(0);
  });
});

describe('missions', () => {
  it('keeps three missions and pays out when done', () => {
    const g = gameAt(0);
    ensureMissions(g, () => 0); // first template: catch fish
    expect(g.state.missions).toHaveLength(MISSION_SLOTS);
    const m = g.state.missions[0];
    expect(m.stat).toBe('fishCaught');
    expect(missionDone(g, m)).toBe(false);
    g.state.stats.fishCaught += m.target;
    expect(missionDone(g, m)).toBe(true);
    const rubies = g.state.rubies;
    const r = claimMission(g, m.id, () => 0.9);
    expect(r).not.toBeNull();
    expect(g.state.rubies).toBe(rubies + m.rewardRubies);
    expect(g.state.gold).toBeGreaterThan(0);
    expect(g.state.missions).toHaveLength(MISSION_SLOTS);
    expect(g.state.stats.missionsDone).toBe(1);
  });

  it('never offers the same mission twice at once', () => {
    const g = gameAt(0);
    ensureMissions(g);
    const stats = g.state.missions.map((m) => m.stat);
    expect(new Set(stats).size).toBe(stats.length);
  });
});

describe('daily reward', () => {
  it('builds a streak over consecutive days and resets after a gap', () => {
    let t = new Date(2026, 10, 11, 12).getTime();
    const g = gameAt(t);
    g.now = () => t;
    expect(canClaimDaily(g)).toBe(true);
    expect(nextDailyIndex(g)).toBe(0);
    claimDaily(g);
    expect(canClaimDaily(g)).toBe(false);
    expect(claimDaily(g)).toBeNull();
    t += DAY;
    expect(nextDailyIndex(g)).toBe(1);
    const rubies = g.state.rubies;
    claimDaily(g); // day 2: rubies
    expect(g.state.rubies).toBe(rubies + (DAILY_REWARDS[1] as { amount: number }).amount);
    expect(dailyStreak(g)).toBe(2);
    t += 3 * DAY;
    expect(dailyStreak(g)).toBe(0);
    expect(nextDailyIndex(g)).toBe(0);
  });
});

describe('combo and frenzy', () => {
  it('starts a frenzy after fast taps on a hooked fish', () => {
    const g = new Game(newGame(), () => 0.5);
    const w = new FishingWorld(g, () => 0.5);
    let frenzy = false;
    w.on((e) => { if (e.type === 'frenzy-start') frenzy = true; });
    // hook a fish next to the boat with lots of HP
    const f = w.fish[0];
    f.state = 'hooked';
    f.hp = f.maxHp = 1e9;
    w.targetId = f.id;
    for (let i = 0; i < COMBO_FOR_FRENZY; i++) {
      w.tap();
      w.update(0.1);
      f.state = 'hooked';
      w.targetId = f.id;
    }
    expect(frenzy).toBe(true);
    expect(w.frenzy).toBeGreaterThan(0);
  });
});
