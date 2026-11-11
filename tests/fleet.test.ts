import { describe, expect, it } from 'vitest';
import { ISLAND_RADIUS } from '../src/game/fishing';
import { boatClassFor, boatsForTier, Fleet, MAX_FLEET_BOATS } from '../src/game/fleet';
import { Game } from '../src/game/game';
import { newGame } from '../src/game/state';

describe('fishing company fleet', () => {
  it('gives every hired tier a boat and extra boats at milestones', () => {
    expect(boatsForTier(0)).toBe(0);
    expect(boatsForTier(1)).toBe(1);
    expect(boatsForTier(25)).toBe(3);
    expect(boatsForTier(500)).toBe(6);
    expect(boatClassFor(0)).toBe('rowboat');
    expect(boatClassFor(18)).toBe('galleon');
    expect(boatClassFor(24)).toBe('mystic');
  });

  it('caps the number of boats but keeps one per tier', () => {
    const s = newGame();
    s.fishermen = s.fishermen.map(() => 300);
    const fleet = new Fleet(new Game(s));
    const counts = fleet.desiredCounts();
    expect(counts.reduce((a, b) => a + b, 0)).toBe(MAX_FLEET_BOATS);
    expect(counts.every((n) => n >= 1)).toBe(true);
  });

  it('sails out, fishes, comes back and unloads without crossing the island', () => {
    const s = newGame();
    s.fishermen[0] = 30;
    s.fishermen[5] = 3;
    s.unlockedZone = 4;
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const fleet = new Fleet(new Game(s), () => ({ x: -30, z: -20 }), rnd);
    let unloads = 0;
    let catches = 0;
    fleet.on((e) => {
      if (e.type === 'fleet-unload') {
        unloads++;
        expect(e.gold).toBeGreaterThan(0);
      }
      if (e.type === 'fleet-catch') catches++;
    });
    fleet.update(0);
    for (const b of fleet.boats) { b.state = 'docked'; b.x = b.homeX; b.z = b.homeZ; b.timer = 0; }
    let minR = Infinity;
    for (let i = 0; i < 20 * 300; i++) {
      fleet.update(0.05);
      for (const b of fleet.boats) minR = Math.min(minR, Math.hypot(b.x, b.z));
    }
    expect(unloads).toBeGreaterThan(0);
    expect(catches).toBeGreaterThan(0);
    expect(minR).toBeGreaterThan(ISLAND_RADIUS);
  });
});
