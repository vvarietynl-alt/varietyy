import { describe, expect, it } from 'vitest';
import { FTUE_FREE_FISHERMAN_AT_CATCH, MISSION_RUBY_MISSIONS_PER_DAY, RUBY_ADS_PER_DAY } from '../src/data/balance';
import { FishingWorld } from '../src/game/fishing';
import { Game } from '../src/game/game';
import { claimMission, ensureMissions, skipMission } from '../src/game/missions';
import { newGame } from '../src/game/state';

const NOON = new Date(2026, 10, 11, 12).getTime();

describe('ruby economy', () => {
  it('only the first missions of the day pay rubies; swaps have a cooldown', () => {
    let t = NOON;
    const g = new Game(newGame(), () => 0.5);
    g.now = () => t;
    ensureMissions(g, () => 0);
    let rubies = 0;
    for (let i = 0; i < MISSION_RUBY_MISSIONS_PER_DAY + 3; i++) {
      const m = g.state.missions[0];
      g.state.stats[m.stat] += m.target;
      rubies += claimMission(g, m.id, () => 0)!.rubies;
    }
    expect(g.state.missionRubies.count).toBe(MISSION_RUBY_MISSIONS_PER_DAY);
    expect(rubies).toBeLessThanOrEqual(MISSION_RUBY_MISSIONS_PER_DAY * 2);
    const id = g.state.missions[1].id;
    expect(skipMission(g, id)).toBe(true);
    expect(skipMission(g, g.state.missions[0].id)).toBe(false);
    t += 11 * 60e3;
    expect(skipMission(g, g.state.missions[0].id)).toBe(true);
  });

  it('chests rarely hold rubies', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const g = new Game(newGame(), rnd);
    const start = g.state.rubies;
    for (let i = 0; i < 1000; i++) g.openChest();
    const perChest = (g.state.rubies - start) / 1000;
    expect(perChest).toBeLessThan(0.15);
  });

  it('free-ruby ads are limited per day', () => {
    const g = new Game(newGame());
    g.now = () => NOON;
    for (let i = 0; i < 5; i++) if (g.rubyAdsLeftToday > 0) g.recordRubyAd();
    expect(g.rubyAdsLeftToday).toBe(0);
    expect(g.state.rubyAds.count).toBe(RUBY_ADS_PER_DAY);
  });
});

describe('purchases', () => {
  it('the first ruby pack gives double', () => {
    const g = new Game(newGame());
    const r0 = g.state.rubies;
    expect(g.grantPurchase('rubies_80')).toBe(160);
    expect(g.grantPurchase('rubies_80')).toBe(80);
    expect(g.state.rubies).toBe(r0 + 240);
  });

  it('the starter pack appears after the first boss and can be bought once', () => {
    const g = new Game(newGame(), () => 0.5);
    g.now = () => NOON;
    expect(g.starterOfferActive).toBe(false);
    g.defeatBoss(0);
    expect(g.starterOfferActive).toBe(true);
    expect(g.grantPurchase('starter_pack')).toBe(250);
    expect(g.state.cosmetics.boatSkin).toBe('ocean');
    expect(g.isBoostActive('doubleHaul')).toBe(true);
    expect(g.starterOfferActive).toBe(false);
    expect(g.grantPurchase('starter_pack')).toBe(0);
  });
});

describe('aquarium museum', () => {
  it('trades trophies for bonuses', () => {
    const g = new Game(newGame());
    g.state.trophies = 20;
    expect(g.buyExhibit('hallOfFame')).toBe(true);
    expect(g.state.trophies).toBe(15);
    expect(g.incomeMult).toBeCloseTo(1.05, 6);
    expect(g.exhibitCost('hallOfFame')).toBe(8);
    expect(g.buyExhibit('feedingShow')).toBe(true);
    expect(g.isBoostActive('doubleHaul')).toBe(true);
  });
});

describe('first minutes', () => {
  it('gives the first fisherman for free', () => {
    const g = new Game(newGame(), () => 0.5);
    let gift = false;
    g.on((e) => { if (e.type === 'gift-fisherman') gift = true; });
    const sp = g.pickSpecies('common');
    for (let i = 0; i < FTUE_FREE_FISHERMAN_AT_CATCH; i++) g.recordCatch(sp, 1);
    expect(gift).toBe(true);
    expect(g.state.fishermen[0]).toBe(1);
    expect(g.incomePerSecond).toBeGreaterThan(0);
  });

  it('makes the third catch a rare fish', () => {
    const g = new Game(newGame(), () => 0.5);
    g.state.stats.fishCaught = 2;
    const w = new FishingWorld(g, () => 0.5);
    w.update(0.1);
    expect(w.target?.rarity).toBe('rare');
  });
});
