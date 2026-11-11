import { describe, expect, it } from 'vitest';
import { PRESTIGE_MIN_LEVEL } from '../src/data/balance';
import { speciesFor, themeFor } from '../src/data/fish';
import { fishermanMilestoneMult, fishGold, fishHp, nextFishermanMilestone, nextLevelPrice, zoneUnlockPrice } from '../src/game/economy';
import { Game } from '../src/game/game';
import { newGame } from '../src/game/state';

describe('endless levels', () => {
  it('keeps getting richer and harder after level 10', () => {
    for (let l = 10; l < 200; l++) {
      expect(fishGold(l + 1, 1, 'common')).toBeGreaterThan(fishGold(l, 1, 'common'));
      expect(fishHp(l + 1, 1, 'common')).toBeGreaterThan(fishHp(l, 1, 'common'));
      expect(zoneUnlockPrice(l + 1, 9)).toBeGreaterThan(zoneUnlockPrice(l, 9));
      expect(Number.isFinite(nextLevelPrice(l))).toBe(true);
    }
  });

  it('reuses the seas with a numeral and their fish', () => {
    expect(themeFor(1).name).toBe('Sunny Shallows');
    expect(themeFor(11).name).toBe('Sunny Shallows II');
    expect(themeFor(25).name).toBe(`${themeFor(5).name} III`);
    expect(speciesFor(13, 'common')).toEqual(speciesFor(3, 'common'));
  });

  it('lets a player sail past level 10', () => {
    const g = new Game(newGame(), () => 0.5);
    g.state.level = 10;
    g.defeatBoss(0);
    g.defeatBoss(1);
    g.addGold(g.nextLevelPrice);
    expect(g.sailToNextLevel()).toBe(true);
    expect(g.state.level).toBe(11);
    expect(g.state.bestLevel).toBe(11);
  });

  it('keeps doubling fishermen production every 100 hires after 200', () => {
    expect(fishermanMilestoneMult(200)).toBe(16);
    expect(fishermanMilestoneMult(300)).toBe(32);
    expect(fishermanMilestoneMult(1000)).toBe(16 * 256);
    expect(nextFishermanMilestone(250)).toBe(300);
  });
});

describe('new voyage (prestige)', () => {
  it('is only possible from level 3', () => {
    const g = new Game(newGame(), () => 0.5);
    g.state.level = PRESTIGE_MIN_LEVEL - 1;
    expect(g.canStartVoyage()).toBe(false);
    g.state.level = PRESTIGE_MIN_LEVEL;
    expect(g.canStartVoyage()).toBe(true);
  });

  it('gives more pearls the further you sailed', () => {
    const g = new Game(newGame(), () => 0.5);
    g.state.level = 3;
    const a = g.pearlsForVoyage;
    g.state.level = 6;
    const b = g.pearlsForVoyage;
    g.state.unlockedZone = 8;
    expect(b).toBeGreaterThan(a);
    expect(g.pearlsForVoyage).toBeGreaterThan(b);
  });

  it('resets the voyage but keeps pearls, rubies and the atlas', () => {
    const g = new Game(newGame(), () => 0.5);
    const s = g.state;
    s.level = 5;
    s.unlockedZone = 6;
    s.gold = 1e12;
    s.fishermen[3] = 40;
    s.upgrades.skill = 30;
    s.rubies = 77;
    s.atlas['L1-common-0'] = 9;
    const pearls = g.startVoyage();
    expect(pearls).toBeGreaterThan(0);
    expect(s.level).toBe(1);
    expect(s.unlockedZone).toBe(1);
    expect(s.gold).toBe(0);
    expect(s.fishermen.every((n) => n === 0)).toBe(true);
    expect(s.upgrades.skill).toBe(0);
    expect(s.rubies).toBe(77);
    expect(s.atlas['L1-common-0']).toBe(9);
    expect(s.pearls).toBe(pearls);
    expect(s.bestLevel).toBe(5);
    expect(g.pearlBonus).toBeCloseTo(1 + pearls * 0.02, 6);
  });

  it('pearl bonus and upgrades make the next voyage stronger', () => {
    const g = new Game(newGame(), () => 0.5);
    g.state.pearls = 1000;
    g.state.pearlsEarned = 100;
    const sp = g.pickSpecies('common');
    g.recordCatch(sp, 1);
    expect(g.state.gold).toBeCloseTo(50 * 3, 6); // ×(1 + 100 × 2%)
    const dmg = g.tapDamageMult;
    expect(g.buyPearlUpgrade('masterAngler')).toBe(true);
    expect(g.tapDamageMult).toBeCloseTo(dmg * 1.5, 6);
    expect(g.buyPearlUpgrade('longBreath')).toBe(true);
    expect(g.bossSeconds).toBe(65);
    expect(g.buyPearlUpgrade('headStart')).toBe(true);
    g.state.level = 4;
    g.startVoyage();
    expect(g.state.gold).toBe(5000);
  });
});
