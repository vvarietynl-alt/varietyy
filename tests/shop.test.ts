import { describe, expect, it } from 'vitest';
import { AD_DAILY_LIMIT, BOSS_CONTINUE_SECONDS } from '../src/data/balance';
import { BossFight } from '../src/game/bossFight';
import { FishingWorld } from '../src/game/fishing';
import { Game } from '../src/game/game';
import { newGame } from '../src/game/state';
import { Ads } from '../src/services/ads';

function rich(): Game {
  const g = new Game(newGame(), () => 0.5);
  g.state.rubies = 10_000;
  return g;
}

describe('ruby shop', () => {
  it('permanent bonuses work and are bought once', () => {
    const g = rich();
    const sp = g.pickSpecies('common');
    expect(g.buyPermanent('goldenHull')).toBe(true);
    expect(g.buyPermanent('goldenHull')).toBe(false);
    g.recordCatch(sp, 1);
    expect(g.state.gold).toBe(100);
    g.buyPermanent('bigHooks');
    expect(g.tapDamageMult).toBe(2);
    g.buyPermanent('nightShift');
    expect(g.offlineCapHours).toBe(24);
  });

  it('permanent bonuses survive a new voyage', () => {
    const g = rich();
    g.buyPermanent('goldenHull');
    g.state.level = 5;
    g.startVoyage();
    expect(g.state.premium.goldenHull).toBe(true);
  });

  it('time warp gives hours of income for rubies', () => {
    const g = rich();
    g.state.fishermen[0] = 10;
    const expected = g.timeWarpGold(1);
    expect(g.timeWarp(0)).toBeCloseTo(expected, 6);
    expect(g.state.rubies).toBe(10_000 - 20);
  });

  it('skins and decorations', () => {
    const g = rich();
    expect(g.buySkin('golden')).toBe(true);
    expect(g.state.cosmetics.boatSkin).toBe('golden');
    const r = g.state.rubies;
    expect(g.buySkin('classic')).toBe(true); // owned: free to switch back
    expect(g.state.rubies).toBe(r);
    expect(g.buyDecor('statue')).toBe(true);
    expect(g.buyDecor('statue')).toBe(false);
  });

  it('the harbour manager hires fishermen', () => {
    const g = rich();
    g.addGold(1e6);
    expect(g.managerStep()).toBe(false); // not bought
    g.buyPermanent('manager');
    let hires = 0;
    while (g.managerStep() && hires < 200) hires++;
    expect(hires).toBeGreaterThan(5);
    expect(g.state.fishermen[0]).toBeGreaterThan(0);
  });
});

describe('rewarded ads', () => {
  it('respects the daily limit and grants rewards', async () => {
    const g = new Game(newGame());
    g.now = () => new Date(2026, 10, 11, 12).getTime();
    const ads = new Ads(g, { showRewarded: async () => true });
    let rewards = 0;
    for (let i = 0; i < AD_DAILY_LIMIT + 3; i++) await ads.watch('free-rubies', () => rewards++);
    expect(rewards).toBe(AD_DAILY_LIMIT);
    expect(ads.available).toBe(false);
    g.now = () => new Date(2026, 10, 12, 12).getTime();
    expect(ads.available).toBe(true);
  });

  it("gives no reward for a skipped ad, and the Captain's Pass needs no ad", async () => {
    const g = new Game(newGame());
    const ads = new Ads(g, { showRewarded: async () => false });
    let rewards = 0;
    await ads.watch('free-rubies', () => rewards++);
    expect(rewards).toBe(0);
    g.state.premium.captainsPass = true;
    await ads.watch('free-rubies', () => rewards++);
    expect(rewards).toBe(1);
  });

  it('doubles offline gold', () => {
    const g = new Game(newGame());
    g.claimOffline(100, 'double');
    expect(g.state.gold).toBe(200);
  });
});

describe('boss continue', () => {
  it('offers extra time when the boss is almost down', () => {
    const g = new Game(newGame(), () => 0.5);
    g.state.activeZone = 5;
    g.state.unlockedZone = 5;
    const w = new FishingWorld(g, () => 0.5);
    let offered = false;
    w.on((e) => { if (e.type === 'boss-continue-offer') offered = true; });
    const boss = w.boss!;
    w.boat.x = boss.x;
    w.boat.z = boss.z;
    w.update(0.1); // starts the fight
    const fight = w.fight as BossFight;
    fight.hp = fight.maxHp * 0.2;
    fight.timeLeft = 0.05;
    w.update(0.1);
    expect(offered).toBe(true);
    expect(w.continueOffer).toBe(true);
    w.acceptContinue();
    expect(w.fight?.timeLeft).toBe(BOSS_CONTINUE_SECONDS);
    expect(w.fight?.phase).toBe('tap');
  });
});

describe('engine upgrade', () => {
  it('makes the boat faster and changes its look at milestones', async () => {
    const { boatSpeedMult, engineVisualTier } = await import('../src/game/economy');
    expect(boatSpeedMult(0)).toBe(1);
    expect(boatSpeedMult(25)).toBeCloseTo(3, 6);
    expect([0, 1, 9, 10, 24, 25].map(engineVisualTier)).toEqual([0, 1, 1, 2, 2, 3]);
    const g = new Game(newGame());
    g.addGold(1e6);
    expect(g.buyUpgrade('engine')).toBe(true);
    expect(g.state.upgrades.engine).toBe(1);
    // the boat covers more distance per second
    const w1 = new FishingWorld(new Game(newGame(), () => 0.5), () => 0.5);
    const fast = new Game(newGame(), () => 0.5);
    fast.state.upgrades.engine = 25;
    const w2 = new FishingWorld(fast, () => 0.5);
    // start both boats away from the fish so they have to sail
    for (const w of [w1, w2]) { w.boat.x = 0; w.boat.z = 45; }
    const start1 = { ...w1.boat };
    const start2 = { ...w2.boat };
    w1.update(0.5);
    w2.update(0.5);
    const d1 = Math.hypot(w1.boat.x - start1.x, w1.boat.z - start1.z);
    const d2 = Math.hypot(w2.boat.x - start2.x, w2.boat.z - start2.z);
    expect(d2).toBeGreaterThan(d1 * 1.5);
  });
});
