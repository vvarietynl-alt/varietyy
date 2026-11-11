import { describe, expect, it } from 'vitest';
import { BOSS_FIGHT_SECONDS, CATCHABLE_RARITIES, catchesToUnlockNext, LEVEL_COUNT, SPAWN_CHANCE } from '../src/data/balance';
import { ALL_SPECIES } from '../src/data/fish';
import { BossFight } from '../src/game/bossFight';
import {
  bestFishingZone,
  fishermanBulkCost,
  fishermanCost,
  fishermanMaxAffordable,
  fishermanProduction,
  fishGold,
  fishHp,
  offlineEarnings,
  rollRarity,
  zoneUnlockPrice,
} from '../src/game/economy';
import { formatNumber } from '../src/game/format';
import { Game } from '../src/game/game';
import { loadState, newGame, serializeState } from '../src/game/state';

describe('balance data', () => {
  it('spawn chances add up to 100% in every fishing zone', () => {
    for (const [zone, chances] of Object.entries(SPAWN_CHANCE)) {
      const sum = CATCHABLE_RARITIES.reduce((a, r) => a + chances[r], 0);
      expect(sum, `zone ${zone}`).toBeCloseTo(100, 5);
    }
  });

  it('has 30 species per level (GDD)', () => {
    for (let l = 1; l <= LEVEL_COUNT; l++) {
      const list = ALL_SPECIES.filter((s) => s.level === l);
      expect(list).toHaveLength(30);
      expect(list.filter((s) => s.rarity === 'common')).toHaveLength(10);
      expect(list.filter((s) => s.rarity === 'rare')).toHaveLength(7);
      expect(list.filter((s) => s.rarity === 'endangered')).toHaveLength(5);
      expect(list.filter((s) => s.rarity === 'legendary')).toHaveLength(5);
      expect(list.filter((s) => s.rarity === 'mythical')).toHaveLength(2);
      expect(list.filter((s) => s.rarity === 'goldfish')).toHaveLength(1);
    }
    expect(new Set(ALL_SPECIES.map((s) => s.id)).size).toBe(ALL_SPECIES.length);
  });

  it('uses the sheet anchors for fish value and HP', () => {
    expect(fishGold(1, 1, 'common')).toBe(50);
    expect(fishHp(1, 1, 'common')).toBe(15);
    expect(fishHp(1, 1, 'rare')).toBeCloseTo(20, 0);
    expect(fishHp(1, 1, 'legendary')).toBeCloseTo(35, 0);
    expect(fishGold(2, 1, 'common')).toBe(1000);
  });

  it('makes fish worth more and tougher further out', () => {
    for (let l = 1; l <= LEVEL_COUNT; l++) {
      let prevGold = 0;
      let prevHp = 0;
      for (const z of [1, 2, 3, 4, 6, 7, 8, 9]) {
        expect(fishGold(l, z, 'common')).toBeGreaterThan(prevGold);
        expect(fishHp(l, z, 'common')).toBeGreaterThan(prevHp);
        prevGold = fishGold(l, z, 'common');
        prevHp = fishHp(l, z, 'common');
      }
    }
  });

  it('zone prices rise within a level', () => {
    // A new level deliberately starts cheaper than the end of the previous one.
    for (let l = 1; l <= LEVEL_COUNT; l++) {
      let prev = 0;
      for (const z of [2, 3, 4, 6, 7, 8, 9]) {
        const p = zoneUnlockPrice(l, z);
        expect(p).toBeGreaterThan(prev);
        prev = p;
      }
    }
    expect(zoneUnlockPrice(1, 5)).toBe(0);
  });

  it('rolls rarities according to the table', () => {
    let seq = 0;
    const rnd = () => (seq++ % 1000) / 1000;
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const r = rollRarity(9, rnd);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    expect(counts.common).toBe(250);
    expect(counts.legendary).toBe(20);
  });
});

describe('fishermen', () => {
  it('bulk cost equals the sum of single hires', () => {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += fishermanCost(3, 7 + i);
    expect(fishermanBulkCost(3, 7, 10)).toBeCloseTo(sum, 6);
  });

  it('max affordable never overspends', () => {
    for (const gold of [0, 499, 500, 1e4, 1e7]) {
      const n = fishermanMaxAffordable(0, 3, gold);
      expect(fishermanBulkCost(0, 3, n)).toBeLessThanOrEqual(gold + 1e-6);
      expect(fishermanBulkCost(0, 3, n + 1)).toBeGreaterThan(gold);
    }
  });

  it('doubles production at milestones', () => {
    const before = fishermanProduction(0, 24) / 24;
    const after = fishermanProduction(0, 25) / 25;
    expect(after / before).toBeCloseTo(2, 6);
  });

  it('every next tier pays back more slowly in fish (needs a better zone to be worth it)', () => {
    let prev = 0;
    for (let t = 0; t < 25; t++) {
      const payback = fishermanCost(t, 0) / fishermanProduction(t, 1);
      expect(payback).toBeGreaterThan(prev);
      prev = payback;
    }
  });
});

describe('offline earnings', () => {
  it('pays 80% and caps the counted time', () => {
    expect(offlineEarnings(10, 3600).gold).toBeCloseTo(10 * 3600 * 0.8);
    const week = offlineEarnings(10, 7 * 86400);
    expect(week.countedSeconds).toBe(12 * 3600);
  });

  it('follows the GDD curve without a cap', () => {
    const r = offlineEarnings(1, 40 * 86400, Infinity);
    const expected = 7 * 86400 * 0.8 + 23 * 86400 * 0.5 + 10 * 86400 * 0.1;
    expect(r.gold).toBeCloseTo(expected, 3);
  });
});

describe('boss fight', () => {
  it('starts the mini-game at 80% and 40% and lasts 60 seconds', () => {
    const fight = new BossFight(1000, () => 0.5);
    fight.tap(150);
    expect(fight.phase).toBe('tap');
    fight.tap(60);
    expect(fight.phase).toBe('minigame');
    // a tap outside the green does nothing
    fight.slider = 0;
    expect(fight.miniTap()).toBe(false);
    fight.slider = fight.greenStart + fight.greenSize / 2;
    expect(fight.miniTap()).toBe(true);
    expect(fight.hp).toBeCloseTo(1000 - 210 - 20, 6);
    fight.update(10.01);
    expect(fight.phase).toBe('tap');
    fight.tap(400);
    expect(fight.phase).toBe('minigame');
    fight.update(BOSS_FIGHT_SECONDS);
    expect(fight.phase).toBe('lost');
  });

  it('can be won', () => {
    const fight = new BossFight(100);
    fight.tap(100);
    expect(fight.phase).toBe('won');
  });
});

describe('game rules', () => {
  it('needs catches and gold to unlock the next zone', () => {
    const g = new Game(newGame(), () => 0.5);
    expect(g.nextZoneStatus().kind).toBe('need-catches');
    g.state.zoneCatches[1] = catchesToUnlockNext(1);
    expect(g.nextZoneStatus().kind).toBe('need-gold');
    g.addGold(zoneUnlockPrice(1, 2));
    expect(g.unlockNextZone()).toBe(true);
    expect(g.state.unlockedZone).toBe(2);
    expect(g.state.activeZone).toBe(2);
    expect(g.state.gold).toBe(0);
  });

  it('gates zone 6 behind the first boss and the next level behind both', () => {
    const g = new Game(newGame(), () => 0.5);
    g.state.unlockedZone = 4;
    g.state.zoneCatches[4] = 99;
    expect(g.unlockNextZone()).toBe(true); // boss zone is free
    g.addGold(1e9);
    expect(g.nextZoneStatus().kind).toBe('need-boss');
    g.defeatBoss(0);
    expect(g.unlockNextZone()).toBe(true);
    expect(g.canSailToNextLevel()).toBe(false);
    g.defeatBoss(1);
    g.addGold(g.nextLevelPrice);
    expect(g.sailToNextLevel()).toBe(true);
    expect(g.state.level).toBe(2);
    expect(g.state.unlockedZone).toBe(1);
    expect(g.state.bossesDefeated).toEqual([false, false]);
  });

  it('records catches in the atlas and pays gold', () => {
    const g = new Game(newGame(), () => 0.5);
    const sp = g.pickSpecies('common');
    g.recordCatch(sp, 1);
    expect(g.state.atlas[sp.id]).toBe(1);
    expect(g.state.gold).toBe(50);
  });

  it('only lets you hire a fisherman after the previous one', () => {
    const g = new Game(newGame());
    g.addGold(1e9);
    expect(g.hireFisherman(1)).toBe(false);
    expect(g.hireFisherman(0, 3)).toBe(true);
    expect(g.hireFisherman(1)).toBe(true);
    expect(g.incomePerSecond).toBeGreaterThan(0);
  });

  it('triples offline gold for rubies', () => {
    const g = new Game(newGame());
    const rubies = g.state.rubies;
    expect(g.claimOffline(100, 'triple')).toBe(true);
    expect(g.state.gold).toBe(300);
    expect(g.state.rubies).toBe(rubies - 10);
  });

  it('picks the best fishing zone for the fleet', () => {
    expect(bestFishingZone(5)).toBe(4);
    expect(bestFishingZone(10)).toBe(9);
    expect(bestFishingZone(7)).toBe(7);
  });
});

describe('save games', () => {
  it('round-trips and survives broken data', () => {
    const s = newGame();
    s.gold = 1234;
    s.fishermen[2] = 5;
    const back = loadState(serializeState(s));
    expect(back.gold).toBe(1234);
    expect(back.fishermen[2]).toBe(5);
    expect(loadState('not json').gold).toBe(0);
    const partial = loadState(JSON.stringify({ gold: 5, upgrades: { skill: 3 } }));
    expect(partial.upgrades).toEqual({ skill: 3, speed: 0, autoGear: 0, radar: 0, engine: 0 });
    expect(partial.fishermen).toHaveLength(25);
  });
});

describe('number format', () => {
  it('formats idle-sized numbers', () => {
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1500)).toBe('1.50K');
    expect(formatNumber(2.47e27)).toBe('2.47Oc');
    expect(formatNumber(4.5)).toBe('4.5');
  });
});
